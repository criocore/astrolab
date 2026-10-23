// Mentor chat in the panel goes through the same pipeline as checks and exams: one call log, recordings in record mode,
// recordings only in replay (demo never starts a CLI), a stop that reaches the agent process. Fake processes, no live CLI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeConfig, ROOT, type MentorMode } from '../server/config.ts';
import { createApp } from '../server/app.ts';
import { hooks as adapterHooks } from '../server/adapter.ts';
import { hooks as probeHooks } from '../server/probes.ts';

// Fake agent process: prints the given stream-json lines; with hang, waits for kill() after printing them.
// taskkill (Windows stop) is faked too and recorded apart: the fake pid must never reach a real process.
function fakeSpawn(lines: unknown[], opts: { hang?: boolean; stderr?: string } = {}) {
  const calls: { args: string[] }[] = [];
  const taskkills: string[][] = [];
  adapterHooks.spawn = (cmd, args) => {
    const child: any = new EventEmitter();
    if (cmd === 'taskkill') { taskkills.push(args); setTimeout(() => child.emit('close', 0), 1); return child; }
    child.pid = 4242; child.exitCode = null;
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.kill = () => { child.exitCode = 1; child.stdout.end(); child.emit('close', 1); };
    calls.push({ args });
    setTimeout(() => {
      for (const l of lines) child.stdout.write(JSON.stringify(l) + '\n');
      if (opts.hang) return;
      child.stdout.end(); child.stderr.end(opts.stderr ?? '');
      setTimeout(() => { child.exitCode = 0; child.emit('close', 0); }, 5);
    }, 5);
    return child;
  };
  return Object.assign(calls, { taskkills });
}
const delta = (text: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
const result = (text: string, session = 's-1') => ({ type: 'result', result: text, session_id: session, total_cost_usd: 0.01 });

probeHooks.versionOf = async () => ({ found: false, version: '' });
process.env.STUDY_HUB_PACK = join(ROOT, 'packs', 'ai-engineer.json');
const root = mkdtempSync(join(tmpdir(), 'hub-chat-'));
const fixturesDir = join(root, 'fx');
const apps: { db: { close(): void } }[] = [];
test.after(() => { adapterHooks.spawn = undefined; probeHooks.versionOf = undefined; for (const a of apps) try { a.db.close(); } catch { /* closed by a test */ } rmSync(root, { recursive: true, force: true }); });

let port = 4400;
async function hub(mentorMode: MentorMode) {
  const p = port++;
  const config = makeConfig({ dataDir: join(root, `data-${p}`), fixturesDir, mentorMode, port: p });
  const h = createApp(config);
  apps.push(h);
  const req = (method: string, path: string, body?: unknown) =>
    h.app.request(path, { method, headers: { host: `127.0.0.1:${p}`, 'content-type': 'application/json', 'x-hub-token': h.token }, body: body === undefined ? undefined : JSON.stringify(body) });
  await req('GET', '/api/probes'); // startup probes write to the database: let them finish before the test closes it
  return { ...h, config, req };
}
// SSE body → list of events.
const events = (text: string) => text.split('\n\n').map((c) => c.replace(/^data:\s*/, '').trim()).filter(Boolean).map((d) => JSON.parse(d));
const ask = { template: 'explain', key: 'G0/how-llm-works', context: { title: 'How an LLM works' }, lang: 'en' };

test('a preset without a chat mode answers with an error in the chat; the server keeps serving', async () => {
  const h = await hub('live');
  process.env.STUDY_HUB_PRESET = 'nope';
  try {
    const ev = events(await (await h.req('POST', '/api/agent/ask', ask)).text());
    assert.deepEqual(ev.map((e) => e.type), ['chat', 'error', 'done']);
    assert.match(ev[1].message, /nope/);
    const chat = await (await h.req('GET', `/api/chat/${ev[0].id}`)).json() as any;
    assert.ok(chat.messages.some((m: any) => m.role === 'error'), 'the error is kept with the conversation');
  } finally { delete process.env.STUDY_HUB_PRESET; }
  assert.equal((await h.req('GET', '/api/state')).status, 200);
});

test('live: the answer streams, lands in the database with the session id, and the call is logged without its text', async () => {
  const h = await hub('live');
  const calls = fakeSpawn([{ type: 'system', session_id: 's-1' }, delta('Tokens are '), delta('pieces.'), result('Tokens are pieces.')]);
  const ev = events(await (await h.req('POST', '/api/agent/ask', ask)).text());
  assert.equal(calls.length, 1);
  assert.equal(ev.filter((e) => e.type === 'delta').map((e) => e.text).join(''), 'Tokens are pieces.');
  assert.equal(ev.at(-1).type, 'done');
  const chat = await (await h.req('GET', `/api/chat/${ev[0].id}`)).json() as any;
  assert.equal(chat.session_id, 's-1');
  assert.equal(chat.messages.at(-1).role, 'agent'); assert.equal(chat.messages.at(-1).text, 'Tokens are pieces.');
  const log = readFileSync(join(h.config.dataDir, 'logs', 'mentor.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const line = log.find((l) => l.mode === 'chat');
  assert.ok(line, 'the chat call is in mentor.jsonl');
  assert.equal(line.step, 'chat-explain'); assert.equal(line.ok, true); assert.equal(line.total_cost_usd, 0.01);
  assert.ok(!JSON.stringify(log).includes('pieces'), 'no answer text in the log');
  assert.ok(!('tools' in line), 'tool targets of a chat (search queries, commands) can repeat the question: not logged');
});

test('record, then replay: the demo answers from the recording and never starts the agent', async () => {
  const rec = await hub('record');
  fakeSpawn([delta('Recorded answer.'), result('Recorded answer.', 's-rec')]);
  const first = events(await (await rec.req('POST', '/api/agent/ask', ask)).text());
  assert.equal(first.filter((e) => e.type === 'delta').map((e) => e.text).join(''), 'Recorded answer.');
  const [file] = readdirSync(join(fixturesDir, 'mentor'));
  const saved = JSON.parse(readFileSync(join(fixturesDir, 'mentor', file), 'utf8'));
  assert.equal(saved.step, 'chat-explain');
  assert.ok(!('workspace' in saved.request) && !JSON.stringify(saved).includes(rec.config.dataDir), 'a recording carries no path of the recording machine');

  const demo = await hub('replay');
  const calls = fakeSpawn([delta('live!'), result('live!')]);
  const ev = events(await (await demo.req('POST', '/api/agent/ask', ask)).text());
  assert.equal(calls.length, 0, 'replay does not start a CLI');
  assert.equal(ev.filter((e) => e.type === 'delta').map((e) => e.text).join(''), 'Recorded answer.');
  assert.ok(!ev.some((e) => e.type === 'session'), 'the recorded session id belongs to the recording machine: no resume from the demo');
  assert.ok(!existsSync(join(demo.config.dataDir, 'logs', 'mentor.jsonl')), 'nothing live to log');

  const other = events(await (await demo.req('POST', '/api/agent/ask', { ...ask, template: 'task' })).text());
  assert.equal(calls.length, 0);
  assert.deepEqual(other.map((e) => e.type), ['chat', 'error', 'done']);
  assert.match(other[1].message, /no recorded answer/, 'no recording is said in words, not as a hash');
});

test('stop: the agent process is killed, the partial answer is kept, a second stop is refused', async () => {
  const h = await hub('live');
  fakeSpawn([delta('Half an ans')], { hang: true });
  const res = await h.req('POST', '/api/agent/ask', ask);
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let text = '';
  while (!text.includes('"delta"')) { const { value, done } = await reader.read(); if (done) assert.fail(`stream ended before any delta: ${text}`); text += value; }
  const chatId = events(text)[0].id;
  assert.equal((await h.req('POST', `/api/chat/${chatId}/stop`)).status, 200);
  for (;;) { const { value, done } = await reader.read(); if (done) break; text += value; }
  const ev = events(text);
  assert.equal(ev.at(-1).type, 'done');
  assert.ok(!ev.some((e) => e.type === 'error'), 'a stop is not an error');
  const chat = await (await h.req('GET', `/api/chat/${chatId}`)).json() as any;
  assert.deepEqual(chat.messages.slice(-2).map((m: any) => [m.role, m.text]), [['agent', 'Half an ans'], ['error', 'stopped']],
    'the partial answer is kept and marked, so it is not taken for a finished one');
  assert.equal((await h.req('POST', `/api/chat/${chatId}/stop`)).status, 409);
});

test('stop on Windows goes through taskkill of the spawn hook, not a real taskkill of the fake pid', { timeout: 5000 }, async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: 'win32' });
  try {
    const h = await hub('live');
    const calls = fakeSpawn([delta('Half')], { hang: true });
    const { reader, chatId } = await untilDelta(await h.req('POST', '/api/agent/ask', ask));
    assert.equal((await h.req('POST', `/api/chat/${chatId}/stop`)).status, 200);
    for (;;) { const { done } = await reader.read(); if (done) break; }
    assert.deepEqual(calls.taskkills, [['/pid', '4242', '/T', '/F']]);
  } finally { Object.defineProperty(process, 'platform', platform); }
});

test('two questions running in one chat (two tabs): stop reaches both agents', { timeout: 5000 }, async () => {
  const h = await hub('live');
  fakeSpawn([delta('Part')], { hang: true });
  const a = await untilDelta(await h.req('POST', '/api/agent/ask', ask));
  const b = await untilDelta(await h.req('POST', '/api/agent/ask', { ...ask, template: 'free', question: 'and?', chatId: a.chatId }));
  assert.equal(b.chatId, a.chatId);
  assert.equal((await h.req('POST', `/api/chat/${a.chatId}/stop`)).status, 200);
  for (const r of [a.reader, b.reader]) for (;;) { const { done } = await r.read(); if (done) break; }
  assert.equal((await h.req('POST', `/api/chat/${a.chatId}/stop`)).status, 409, 'nothing is left running');
});

test('a failure after part of the answer (limit) is saved after that part, so the cut answer is not reopened as finished', async () => {
  const h = await hub('live');
  fakeSpawn([delta('Half an ans')], { stderr: 'Claude AI usage limit reached' });
  const ev = events(await (await h.req('POST', '/api/agent/ask', ask)).text());
  assert.ok(ev.some((e) => e.type === 'error'));
  const chat = await (await h.req('GET', `/api/chat/${ev[0].id}`)).json() as any;
  assert.deepEqual(chat.messages.slice(-2).map((m: any) => m.role), ['agent', 'error']);
  assert.equal(chat.messages.at(-2).text, 'Half an ans');
});

test('"check call" in replay uses the recordings too: no recording → no_recording, no CLI started', async () => {
  const demo = await hub('replay');
  const calls = fakeSpawn([result('{"ok": true}')]);
  const r = await (await demo.req('POST', '/api/agents/check')).json() as any;
  assert.equal(calls.length, 0);
  assert.equal(r.ok, false); assert.equal(r.error, 'no_recording');
});

// Reads the answer stream until the first delta and returns the chat id with the reader.
async function untilDelta(res: Response) {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let text = '';
  while (!text.includes('"delta"')) { const { value, done } = await reader.read(); if (done) assert.fail(`stream ended before any delta: ${text}`); text += value; }
  return { reader, chatId: events(text)[0].id as string, text };
}

test('closing the panel (the client leaves the stream) does not stop the agent', async () => {
  const h = await hub('live');
  fakeSpawn([delta('Still writing')], { hang: true });
  const { reader, chatId } = await untilDelta(await h.req('POST', '/api/agent/ask', ask));
  await reader.cancel();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal((await h.req('POST', `/api/chat/${chatId}/stop`)).status, 200, 'the agent was still running');
});

test('a database failure while saving the answer still ends the stream and does not crash the server', async () => {
  const h = await hub('live');
  fakeSpawn([delta('Almost')], { hang: true });
  const { reader, chatId, text: head } = await untilDelta(await h.req('POST', '/api/agent/ask', ask));
  h.db.close(); // every later write throws
  assert.equal((await h.req('POST', `/api/chat/${chatId}/stop`)).status, 200);
  let text = head;
  for (;;) { const { value, done } = await reader.read(); if (done) break; text += value; }
  assert.equal(events(text).at(-1).type, 'done');
});

test('a failure without its own panel sentence reaches the client as a code, which the interface translates', async () => {
  const h = await hub('live');
  adapterHooks.spawn = () => {
    const child: any = new EventEmitter();
    child.pid = 4242; child.exitCode = null;
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.kill = () => {};
    setTimeout(() => { child.stdout.end(); child.stderr.end('boom'); setTimeout(() => { child.exitCode = 1; child.emit('close', 1); }, 5); }, 5);
    return child;
  };
  const ev = events(await (await h.req('POST', '/api/agent/ask', ask)).text());
  const err = ev.find((e) => e.type === 'error');
  assert.equal(err?.message, 'exit_code', 'a code, not the raw detail ("exit 1: boom")');
});

test('deleting a chat while it answers stops the agent and leaves nothing of the chat in the database', { timeout: 5000 }, async () => {
  const h = await hub('live');
  fakeSpawn([delta('Going on')], { hang: true });
  const { reader, chatId } = await untilDelta(await h.req('POST', '/api/agent/ask', ask));
  assert.equal((await h.req('DELETE', `/api/chat/${chatId}`)).status, 200);
  let text = '';
  for (;;) { const { value, done } = await reader.read(); if (done) break; text += value; }
  assert.equal(events(text).at(-1).type, 'done');
  const rows = (h.db as any).prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id = ?').get(chatId).n;
  assert.equal(rows, 0, 'no orphan messages');
  assert.equal((await h.req('POST', `/api/chat/${chatId}/stop`)).status, 409, 'the agent is no longer running');
});

async function followUps(withKey: boolean, tag: string) {
  const rec = await hub('record');
  const dir = join(fixturesDir, 'mentor');
  const before = existsSync(dir) ? readdirSync(dir).length : 0;
  for (const [key, title] of [['G0/how-llm-works', `Follow-up topic one ${tag}`], ['G0/tokens', `Follow-up topic two ${tag}`]]) {
    fakeSpawn([delta(`About ${title}.`), result(`About ${title}.`, `s-${key}`)]);
    const first = events(await (await rec.req('POST', '/api/agent/ask', { ...ask, key, context: { title } })).text());
    const calls = fakeSpawn([delta(`Example for ${title}.`), result(`Example for ${title}.`, `s-${key}`)]);
    await (await rec.req('POST', '/api/agent/ask', { template: 'free', question: `Give an example ${tag}`, ...(withKey ? { key } : {}), chatId: first[0].id, lang: 'en' })).text();
    assert.ok(calls[0].args.includes('--resume'), 'the follow-up resumes the conversation');
  }
  assert.equal(readdirSync(dir).length - before, 4, 'two topics, each with its own explanation and its own follow-up');
}
test('record mode: the same follow-up question on two topics makes two recordings', () => followUps(true, 'a'));
test('record mode: the topic of a follow-up comes from its chat, also when the request has no key', () => followUps(false, 'b'));
