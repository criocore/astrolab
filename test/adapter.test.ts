import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callAgent, hooks, looksLikeLimit, toolTarget } from '../server/adapter.ts';
import { makeConfig } from '../server/config.ts';
import { requestHash } from '../server/recordings.ts';

// Fake process: returns preset stdout/stderr and exit code.
function fakeSpawn(script: { stdout?: string; stderr?: string; code?: number; hang?: boolean }) {
  const calls: { cmd: string; args: string[]; stdin: string }[] = [];
  hooks.spawn = (cmd, args) => {
    const child: any = new EventEmitter();
    child.pid = 4242; child.exitCode = null;
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const inp = new PassThrough(); let stdin = '';
    inp.on('data', (c) => { stdin += c; });
    child.stdin = inp;
    child.kill = () => { child.exitCode = 1; child.emit('close', 1); };
    calls.push({ cmd, args, stdin });
    setTimeout(() => {
      calls[calls.length - 1].stdin = stdin;
      if (script.hang) return;
      child.stdout.end(script.stdout ?? '');
      child.stderr.end(script.stderr ?? '');
      setTimeout(() => { child.exitCode = script.code ?? 0; child.emit('close', script.code ?? 0); }, 5);
    }, 5);
    return child;
  };
  return calls;
}

const dir = mkdtempSync(join(tmpdir(), 'hub-'));
const config = makeConfig({ dataDir: dir });
test.after(() => { hooks.spawn = undefined; rmSync(dir, { recursive: true, force: true }); });

const checkReq = { mode: 'check' as const, step: 'questions', system: 'sys', user: 'hello', schema: { type: 'object' }, prompt_version: 'p@1' };

test('check: structured output, system prompt and schema go to args, user prompt goes to stdin', async () => {
  const calls = fakeSpawn({ stdout: JSON.stringify({ type: 'result', result: '{"a":1}', structured_output: { a: 1 }, session_id: 's1', usage: { input_tokens: 5 } }) });
  const r = await callAgent(config, checkReq);
  assert.equal(r.ok, true);
  if (r.ok) { assert.deepEqual(r.json, { a: 1 }); assert.equal(r.session_id, 's1'); assert.deepEqual(r.usage, { input_tokens: 5 }); }
  const [c] = calls;
  assert.ok(c.args.includes('--system-prompt') && c.args[c.args.indexOf('--system-prompt') + 1] === 'sys');
  assert.ok(c.args.includes('--json-schema'));
  assert.equal(c.stdin, 'hello');
  assert.ok(!c.args.some((a) => a.includes('hello')), 'prompt never goes through argv');
});

test('check: non-zero exit without JSON is exit_code, limit text is limit', async () => {
  fakeSpawn({ stdout: '', stderr: 'boom', code: 2 });
  const r1 = await callAgent(config, checkReq);
  assert.equal(r1.ok, false); if (!r1.ok) assert.equal(r1.error, 'exit_code');
  fakeSpawn({ stdout: JSON.stringify({ type: 'result', is_error: true, result: "You've hit your usage limit" }), code: 1 });
  const r2 = await callAgent(config, checkReq);
  assert.equal(r2.ok, false); if (!r2.ok) assert.equal(r2.error, 'limit');
  assert.ok(looksLikeLimit('Rate limit exceeded') && !looksLikeLimit('all good'));
});

// #23: the limit and sign-in patterns are for failed calls; a CLI that logs its own retries or a failing helper still answered.
test('check: a finished answer with a warning on stderr is still an answer; a failed call with it is limit or auth', async () => {
  const ok = JSON.stringify({ type: 'result', result: '{"a":1}', structured_output: { a: 1 } });
  for (const stderr of ['Attempt 1 failed with status 429. Retrying with backoff...', 'MCP server "x": 401 Unauthorized']) {
    fakeSpawn({ stdout: ok, stderr });
    const r = await callAgent(config, checkReq);
    assert.equal(r.ok, true, stderr);
  }
  fakeSpawn({ stdout: '', stderr: 'Error: 429 rate limit exceeded', code: 1 });
  const r1 = await callAgent(config, checkReq);
  assert.equal(r1.ok, false); if (!r1.ok) assert.equal(r1.error, 'limit');
  fakeSpawn({ stdout: '', stderr: '401 Unauthorized: please log in', code: 1 });
  const r2 = await callAgent(config, checkReq);
  assert.equal(r2.ok, false); if (!r2.ok) assert.equal(r2.error, 'auth');
});

// A session id comes back from the client and goes into argv: one that looks like a flag never reaches the CLI.
test('resume: an id that is not a plain session id is refused before the CLI starts', async () => {
  const ok = JSON.stringify({ type: 'result', result: 'ok', session_id: 's1' });
  const chat = { mode: 'chat' as const, step: 'chat-free', user: 'u', prompt_version: 'chat@1', workspace: dir };
  for (const bad of ['--dangerously-bypass-approvals-and-sandbox', '-x', 'a b', '$(touch x)', 'a"b']) {
    const calls = fakeSpawn({ stdout: ok });
    const r = await callAgent(config, { ...chat, resume: bad });
    assert.equal(r.ok, false, bad); if (!r.ok) assert.equal(r.error, 'bad_request');
    assert.equal(calls.length, 0, 'no CLI started');
  }
  const calls = fakeSpawn({ stdout: ok });
  assert.equal((await callAgent(config, { ...chat, resume: '0199a1b2-c3d4-7e8f-9a0b-1c2d3e4f5a6b' })).ok, true);
  assert.ok(calls[0].args.includes('0199a1b2-c3d4-7e8f-9a0b-1c2d3e4f5a6b'));
});

test('check: timeout kills the process', async () => {
  fakeSpawn({ hang: true });
  const r = await callAgent(config, { ...checkReq, timeout_ms: 30 });
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error, 'timeout');
});

test('session: tool events stream out, result comes from the last line', async () => {
  const lines = [
    { type: 'system', subtype: 'init', session_id: 'sess-9' },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Glob', input: { pattern: '**/*.md' } }, { type: 'tool_use', name: 'Read', input: { file_path: 'README.md' } }] } },
    { type: 'result', structured_output: { verdict: 'pass' }, session_id: 'sess-9' },
  ].map((l) => JSON.stringify(l)).join('\n') + '\n';
  const calls = fakeSpawn({ stdout: lines });
  const seen: string[] = [];
  const r = await callAgent(config, { mode: 'session', step: 'exam', system: 'sys', user: 'u', schema: {}, prompt_version: 'x@1', workspace: dir }, { onTool: (t) => seen.push(`${t.name}:${t.target}`) });
  assert.equal(r.ok, true);
  if (r.ok) { assert.deepEqual(r.json, { verdict: 'pass' }); assert.equal(r.session_id, 'sess-9'); assert.equal(r.tools.length, 2); }
  assert.deepEqual(seen, ['Glob:**/*.md', 'Read:README.md']);
  assert.ok(calls[0].args.includes('--restricted'), 'session runs in restricted mode');
  assert.ok(calls[0].args.includes('--append-system-prompt'));
});

test('toolTarget and requestHash are stable and ignore machine-specific fields', () => {
  assert.equal(toolTarget('Read', { file_path: 'a.md' }), 'a.md');
  assert.equal(toolTarget('WebFetch', { url: 'https://x.y/z' }), 'https://x.y/z');
  const a = requestHash({ mode: 'session', step: 's', system: 'a', user: 'b', schema: {}, prompt_version: 'v', workspace: 'C:\\one', resume: 'r1', timeout_ms: 5 });
  const b = requestHash({ mode: 'session', step: 's', system: 'a', user: 'b', schema: {}, prompt_version: 'v', workspace: '/two' });
  assert.equal(a, b);
  assert.notEqual(a, requestHash({ mode: 'session', step: 's', system: 'a', user: 'c', schema: {}, prompt_version: 'v', workspace: '/two' }));
});
