// #29: every recording in fixtures/mentor is still reached by the demo, the way the interface asks: a pack or prompt change that
// moves a request away from its recording fails here instead of turning a demo step into "no recording".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeConfig, ROOT } from '../server/config.ts';
import { createApp } from '../server/app.ts';
import { hooks as probeHooks } from '../server/probes.ts';
import type { Recording } from '../server/recordings.ts';

probeHooks.versionOf = async () => ({ found: false, version: '' });
const dir = mkdtempSync(join(tmpdir(), 'hub-demo-'));
process.env.STUDY_HUB_PACK = join(ROOT, 'packs', 'ai-engineer.json');
const config = makeConfig({ dataDir: dir, mentorMode: 'replay', port: 4398 }); // the repository's own fixtures
const { app, token, db } = createApp(config);
const pack = JSON.parse(readFileSync(process.env.STUDY_HUB_PACK, 'utf8'));

const req = (method: string, path: string, body?: unknown) =>
  app.request(path, { method, headers: { host: '127.0.0.1:4398', 'content-type': 'application/json', 'x-hub-token': token }, body: body === undefined ? undefined : JSON.stringify(body) });
// The startup probes write to the database: wait for a probe run before closing it.
test.after(async () => { await (await req('GET', '/api/probes')).json(); probeHooks.versionOf = undefined; db.close(); rmSync(dir, { recursive: true, force: true }); });
const recs = readdirSync(join(ROOT, 'fixtures', 'mentor')).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(ROOT, 'fixtures', 'mentor', f), 'utf8')) as Recording);
const langOf = (r: Recording) => (/[А-Яа-яЁё]/.test(String(r.request.user)) ? 'ru' : 'en');
const user = (r: Recording) => String(r.request.user);
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const topicOf = (key: string) => pack.grades.flatMap((g: any) => [...g.core, ...g.adjacent.flatMap((a: any) => a.topics)].map((t: any) => ({ t, g }))).find((x: any) => x.t.key === key);

test('the demo reaches every recording: questions, each recorded answer, exams, the panel and the call check', async () => {
  const known = new Set(['questions', 'verdict', 'exam-grade', 'chat-explain', 'probe-call']);
  assert.deepEqual(recs.filter((r) => !known.has(r.step)).map((r) => r.step), [], 'a new kind of recording needs its demo step here');

  const checks: Record<string, { id: string; key: string }> = {}; // lang -> the check whose questions were replayed
  for (const r of recs.filter((x) => x.step === 'questions')) {
    const key = /<topic id="([^"]+)">/.exec(user(r))![1];
    const res = await (await req('POST', '/api/topic/check', { key, lang: langOf(r) })).json() as any;
    assert.equal(res.source, 'record', `questions ${key} ${langOf(r)}: ${JSON.stringify(res)}`);
    checks[langOf(r)] = { id: res.check_id, key };
  }
  for (const r of recs.filter((x) => x.step === 'verdict')) {
    const qid = /<question id="([^"]+)">/.exec(user(r))![1];
    const answer = unesc(/<answer>([\s\S]*)<\/answer>/.exec(user(r))![1]);
    const check = checks[langOf(r)];
    assert.ok(check, `verdict ${r.hash.slice(0, 12)}: no replayed questions in ${langOf(r)}`);
    const res = await (await req('POST', `/api/check/${check.id}/attempt`, { question_id: qid, answer })).json() as any;
    assert.equal(res.source, 'record', `verdict ${r.hash.slice(0, 12)} (${langOf(r)}, ${qid}): ${JSON.stringify(res)}`);
  }
  for (const r of recs.filter((x) => x.step === 'exam-grade')) {
    const target = /target="([^"]+)"/.exec(user(r))![1];
    const start = await (await req('POST', '/api/exam', { kind: 'grade', target, folder: join(ROOT, 'fixtures', 'exam-g0-demo'), lang: langOf(r) })).json() as any;
    assert.ok(start.exam_id ?? start.id, `exam ${target} ${langOf(r)}: ${JSON.stringify(start)}`);
    const stream = await (await req('GET', `/api/exam/${start.exam_id ?? start.id}/events`)).text();
    assert.match(stream, /"type":"done"/, `exam ${target} ${langOf(r)}: ${stream.slice(-300)}`);
  }
  for (const r of recs.filter((x) => x.step === 'chat-explain')) {
    const key = 'G0/how-llm-works';
    const { t, g } = topicOf(key);
    const lang = langOf(r);
    const tx = (x: any) => x[lang] || x.en || x.ru;
    const context = { title: tx(t.title), summary: tx(t.goal), grade: g.id, criteria: t.criteria[lang], links: t.materials.slice(0, 8).map((m: any) => ({ title: m.title, url: m.url })) };
    const stream = await (await req('POST', '/api/agent/ask', { template: 'explain', context, key, lang })).text();
    assert.doesNotMatch(stream, /"type":"error"/, `panel explain ${lang}: ${stream.slice(-300)}`);
  }
  for (const r of recs.filter((x) => x.step === 'probe-call')) {
    const res = await (await req('POST', '/api/agents/check')).json() as any;
    assert.equal(res.source, 'record', `call check ${r.hash.slice(0, 12)}: ${JSON.stringify(res)}`);
    assert.equal(res.ok, true);
  }
});
