// API routes in memory (no network): protection against foreign pages, export/import with format version, manual topic status,
// exam without a gate, hung exams after a restart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeConfig, ROOT } from '../server/config.ts';
import { createApp } from '../server/app.ts';
import { attemptsOf, DB_VERSION, EXPORT_FORMAT, insertAttempt, insertCheck, insertExam, openDb } from '../server/db.ts';
import { hooks } from '../server/probes.ts';

hooks.versionOf = async () => ({ found: false, version: '' });
const dir = mkdtempSync(join(tmpdir(), 'hub-api-'));
process.env.STUDY_HUB_PACK = join(ROOT, 'packs', 'ai-engineer.json');
const config = makeConfig({ dataDir: dir, fixturesDir: join(dir, 'fx'), mentorMode: 'replay', port: 4399 });
// an exam row "running" from a "previous run": createApp must move it to stopped
const pre = openDb(join(dir, 'hub.db'));
insertExam(pre, { id: 'ex-stale', pack: 'ai-engineer', kind: 'grade', target: 'G0', folder: dir, lang: 'en', status: 'running', verdict: null, passed: false, source: 'live', duration_ms: 0, session_id: '', error: '', at: '2026-10-22T00:00:00.000Z' });
pre.close();
const { app, token, db, stale } = createApp(config);
test.after(() => { hooks.versionOf = undefined; db.close(); rmSync(dir, { recursive: true, force: true }); });

const HOST = { host: '127.0.0.1:4399' };
const json = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method, headers: { ...HOST, 'content-type': 'application/json', 'x-hub-token': token, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

test('exams left running by a previous start are marked stopped at startup', async () => {
  assert.equal(stale, 1);
  const r = await (await json('GET', '/api/exams')).json() as any;
  const ex = r.exams.find((e: any) => e.id === 'ex-stale');
  assert.equal(ex.status, 'stopped'); assert.match(ex.error, /restarted/);
  assert.equal((db.prepare('PRAGMA user_version').get() as any).user_version, DB_VERSION);
});

test('a foreign page cannot read or write: bad host, bad origin, missing token', async () => {
  assert.equal((await app.request('/api/state', { headers: { host: 'evil.example:4399' } })).status, 403);
  assert.equal((await app.request('/api/state', { headers: HOST })).status, 200, 'GET without a token is fine from the right host');
  const noToken = await app.request('/api/topic', { method: 'PUT', headers: { ...HOST, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(noToken.status, 403);
  const badOrigin = await json('PUT', '/api/topic', { key: 'S0/editor', note: 'x' }, { origin: 'https://evil.example' });
  assert.equal(badOrigin.status, 403);
  const ok = await json('PUT', '/api/topic', { key: 'S0/editor', note: 'x' }, { origin: 'http://127.0.0.1:4399' });
  assert.equal(ok.status, 200);
});

test('manual status is accepted only for manual-probe topics; other topics keep their status', async () => {
  assert.equal((await json('PUT', '/api/topic', { key: 'S0/editor', status: 'learned' })).status, 200);
  assert.equal((await json('PUT', '/api/topic', { key: 'G0/how-llm-works', status: 'learned' })).status, 200);
  const st = await (await json('GET', '/api/state')).json() as any;
  assert.equal(st.topics['S0/editor'].status, 'learned');
  assert.equal(st.topics['G0/how-llm-works']?.status ?? 'not_started', 'not_started', 'mentor-checked topics ignore a hand-set status');
  assert.equal((await json('PUT', '/api/topic', { key: 'nope/none', note: '' })).status, 404);
});

test('probes run without a model: hub and node light up, git and agent are reported missing here', async () => {
  const r = await (await json('GET', '/api/probes')).json() as any;
  const by = Object.fromEntries(r.probes.map((p: any) => [p.probe, p.ok]));
  assert.equal(by.hub, true); assert.equal(by.node, true); assert.equal(by.git, false);
  assert.equal(r.agentCall, null);
});

test('exam on the gate-less era is refused; a locked grade is refused', async () => {
  const a = await json('POST', '/api/exam', { kind: 'grade', target: 'S0', folder: dir, lang: 'en' });
  assert.equal(a.status, 400); assert.equal(((await a.json()) as any).error, 'no_gate');
  const b = await json('POST', '/api/exam', { kind: 'grade', target: 'G1', folder: dir, lang: 'en' });
  assert.equal(b.status, 409); assert.equal(((await b.json()) as any).error, 'locked');
});

test('export carries the format version; import refuses a newer format and a foreign pack, accepts its own', async () => {
  const ex = await (await json('GET', '/api/export')).json() as any;
  assert.equal(ex.format, EXPORT_FORMAT); assert.equal(ex.app, 'astrolab'); assert.equal(ex.pack, 'ai-engineer');
  assert.equal(ex.state.topics['S0/editor'].status, 'learned');
  const newer = await json('POST', '/api/import', { ...ex, format: EXPORT_FORMAT + 1 });
  assert.equal(newer.status, 400); assert.equal(((await newer.json()) as any).error, 'format_unsupported');
  const foreign = await json('POST', '/api/import', { ...ex, pack: 'other-pack' });
  assert.equal(foreign.status, 400); assert.equal(((await foreign.json()) as any).error, 'pack_mismatch');
  await json('PUT', '/api/topic', { key: 'S0/editor', status: 'not_started' });
  assert.equal((await json('POST', '/api/import', ex)).status, 200);
  const st = await (await json('GET', '/api/state')).json() as any;
  assert.equal(st.topics['S0/editor'].status, 'learned', 'import restored the exported state');
  assert.equal((await json('POST', '/api/import', 'not json {', { 'content-type': 'text/plain' })).status, 400);
});

test('import replaces the answers of its own pack only', async () => {
  const check = (id: string, pack: string) => {
    insertCheck(db, { id, pack, topic_key: 'G0/how-llm-works', lang: 'en', questions: [{ id: 'q1', text: 'q', covers: ['1'] }], source: 'live', prompt_version: 'p@1', created_at: '2026-10-24T00:00:00.000Z' });
    insertAttempt(db, { id: `at-${id}`, check_id: id, question_id: 'q1', answer: 'a', verdict: 'pass', quote: 'a', gap: '', material_id: '', feedback: '', source: 'live', duration_ms: 0, at: '2026-10-24T00:00:00.000Z' });
  };
  check('ck-own', 'ai-engineer');
  check('ck-other', 'other-pack'); // the same data folder used with STUDY_HUB_PACK pointing to another pack
  const ex = await (await json('GET', '/api/export')).json() as any;
  assert.equal((await json('POST', '/api/import', ex)).status, 200);
  assert.equal(attemptsOf(db, 'ck-other').length, 1, 'the other pack keeps its answers');
  assert.equal(attemptsOf(db, 'ck-own').length, 1, 'the imported pack gets its answers from the file');
});

test('agents: status lists presets, default switch validates names and option values', async () => {
  const s = await (await json('GET', '/api/agents')).json() as any;
  assert.deepEqual(s.agents.map((a: any) => a.preset).sort(), ['claude', 'codex', 'gemini']);
  assert.equal((await json('PUT', '/api/agents/default', { name: 'nope' })).status, 404);
  assert.equal((await json('PUT', '/api/agents/default', { name: 'claude', options: { effort: 'ultra' } })).status, 400);
  const ok = await json('PUT', '/api/agents/default', { name: 'gemini', options: { model: 'gemini-2.5-pro' } });
  assert.equal(ok.status, 200); assert.equal(((await ok.json()) as any).agent.preset, 'gemini');
});
