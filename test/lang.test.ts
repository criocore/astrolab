// One default language: a request without `lang` (topic check, exam, mentor panel) gets STUDY_HUB_LANG (config.lang),
// and a saved panel answer is reopened only in the language it was written in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeConfig, ROOT } from '../server/config.ts';
import { createApp } from '../server/app.ts';
import { DB_VERSION, openDb } from '../server/db.ts';
import { hooks } from '../server/recordings.ts';
import { hooks as probeHooks } from '../server/probes.ts';
import type { AgentRequest, AgentResult } from '../server/adapter.ts';
import { hasAnswer, type ChatRow } from '../web/src/store.tsx';

probeHooks.versionOf = async () => ({ found: false, version: '' });
process.env.STUDY_HUB_PACK = join(ROOT, 'packs', 'ai-engineer.json');
const root = mkdtempSync(join(tmpdir(), 'hub-lang-'));
const apps: { db: { close(): void } }[] = [];
test.after(() => { hooks.agent = undefined; probeHooks.versionOf = undefined; for (const a of apps) a.db.close(); rmSync(root, { recursive: true, force: true }); });

// Fake agent: remembers the requests and answers with a short text.
const requests: AgentRequest[] = [];
hooks.agent = async (_c, req, opts): Promise<AgentResult> => {
  requests.push(req);
  opts?.onDelta?.('ok');
  return { ok: true, json: null, text: 'ok', agent: 'fake', ms: 1, session_id: '', tools: [] };
};

let port = 4500;
async function hub(lang: 'ru' | 'en') {
  const p = port++;
  const h = createApp(makeConfig({ dataDir: join(root, `data-${p}`), fixturesDir: join(root, 'fx'), mentorMode: 'live', port: p, lang }));
  apps.push(h);
  const req = (method: string, path: string, body?: unknown) =>
    h.app.request(path, { method, headers: { host: `127.0.0.1:${p}`, 'content-type': 'application/json', 'x-hub-token': h.token }, body: body === undefined ? undefined : JSON.stringify(body) });
  await req('GET', '/api/probes');
  return req;
}
const cyrillic = (s: string) => /[а-яё]/i.test(s);
const lastUser = () => (requests.at(-1) as { user: string }).user;

test('topic check without lang: the questions are asked in STUDY_HUB_LANG', async () => {
  for (const lang of ['en', 'ru'] as const) {
    const req = await hub(lang);
    await req('POST', '/api/topic/check', { key: 'G0/how-llm-works' });
    assert.equal(requests.at(-1)!.step, 'questions');
    assert.equal(cyrillic(lastUser()), lang === 'ru', `config.lang = ${lang}`);
  }
});

test('exam without lang: the exam is held in STUDY_HUB_LANG', async () => {
  for (const lang of ['en', 'ru'] as const) {
    const req = await hub(lang);
    const r = await (await req('POST', '/api/exam', { kind: 'grade', target: 'G0', folder: root })).json() as any;
    assert.ok(r.exam_id, JSON.stringify(r));
    const exams = await (await req('GET', '/api/exams')).json() as any;
    assert.equal(exams.exams.find((e: any) => e.id === r.exam_id).lang, lang);
  }
});

test('mentor panel without lang: the prompt is in STUDY_HUB_LANG', async () => {
  for (const lang of ['en', 'ru'] as const) {
    const req = await hub(lang);
    await (await req('POST', '/api/agent/ask', { template: 'explain', key: 'G0/how-llm-works', context: { title: 'How an LLM works' } })).text();
    assert.equal(requests.at(-1)!.mode, 'chat');
    assert.equal(cyrillic(lastUser()), lang === 'ru', `config.lang = ${lang}`);
  }
});

test('a saved answer keeps its language and is reopened only in that language', async () => {
  const req = await hub('en');
  await (await req('POST', '/api/agent/ask', { template: 'explain', key: 'G0/how-llm-works', context: { title: 'How an LLM works' }, lang: 'en' })).text();
  const { chats } = await (await req('GET', '/api/chats?key=G0%2Fhow-llm-works')).json() as { chats: ChatRow[] };
  assert.equal(chats.length, 1);
  assert.equal(chats[0].lang, 'en');
  assert.equal(hasAnswer(chats[0], 'en'), true);
  assert.equal(hasAnswer(chats[0], 'ru'), false, 'the Russian interface asks again instead of opening the English answer');
  assert.equal(hasAnswer({ ...chats[0], lang: '' }, 'ru'), true, 'a chat saved before the language was kept opens in any language');
});

test('a database of version 1 is upgraded: its chats get an empty language and open in any language', () => {
  const file = join(root, 'v1.db');
  const db1 = openDb(file);
  db1.exec("ALTER TABLE chats DROP COLUMN lang; PRAGMA user_version = 1;"); // back to the version 1 schema
  db1.prepare("INSERT INTO chats (id, pack, topic_key, template, title, session_id, created_at, updated_at) VALUES ('ch-old', 'ai-engineer', 'k', 'explain', '', '', 't', 't')").run();
  db1.close();
  const db2 = openDb(file);
  try {
    assert.equal((db2.prepare('PRAGMA user_version').get() as any).user_version, DB_VERSION);
    assert.equal((db2.prepare("SELECT lang FROM chats WHERE id = 'ch-old'").get() as any).lang, '');
  } finally { db2.close(); }
});
