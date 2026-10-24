// Codex CLI and Gemini CLI through the same requests as Claude Code. Flags and output shapes were checked against vendor docs
// and the installed Gemini bundle on 22.10.2026; Codex CLI 0.162.1 was run live on 24.10.2026, Gemini was not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callAgent, hooks, presetNames, resolvePreset, setDefaultPreset, setPresetOptions } from '../server/adapter.ts';
import { makeConfig } from '../server/config.ts';

function fakeSpawn(script: { stdout?: string; stderr?: string; code?: number }) {
  const calls: { cmd: string; args: string[]; stdin: string }[] = [];
  hooks.spawn = (cmd, args) => {
    const child: any = new EventEmitter();
    child.pid = 4243; child.exitCode = null;
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const inp = new PassThrough(); let stdin = '';
    inp.on('data', (c) => { stdin += c; });
    child.stdin = inp;
    child.kill = () => { child.exitCode = 1; child.emit('close', 1); };
    calls.push({ cmd, args, stdin });
    setTimeout(() => {
      calls[calls.length - 1].stdin = stdin;
      child.stdout.end(script.stdout ?? '');
      child.stderr.end(script.stderr ?? '');
      setTimeout(() => { child.exitCode = script.code ?? 0; child.emit('close', script.code ?? 0); }, 5);
    }, 5);
    return child;
  };
  return calls;
}

const dir = mkdtempSync(join(tmpdir(), 'hub-vendors-'));
const config = makeConfig({ dataDir: dir });
test.after(() => { hooks.spawn = undefined; rmSync(dir, { recursive: true, force: true }); });
const checkReq = { mode: 'check' as const, step: 'questions', system: 'sys', user: 'hello', schema: { type: 'object' }, prompt_version: 'p@1' };
const sessionReq = { mode: 'session' as const, step: 'exam', system: 'sys', user: 'u', schema: {}, prompt_version: 'x@1', workspace: dir };
const jsonl = (lines: unknown[]) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
// On Windows an npm CLI (.cmd) is launched via cmd.exe as a single string; we compare the arguments as a string.
const argline = (c: { cmd: string; args: string[] }) => (c.cmd === 'cmd.exe' ? c.args[c.args.length - 1] : c.args.join(' '));

test('codex check: exec --json, read-only sandbox, prompt from stdin after "-", system inline, schema via file', async () => {
  const calls = fakeSpawn({ stdout: jsonl([
    { type: 'thread.started', thread_id: 'th-1' },
    { type: 'turn.started' },
    { type: 'item.completed', item: { id: 'i1', type: 'agent_message', text: '```json\n{"a":1}\n```' } },
    { type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 3 } },
  ]) });
  const r = await callAgent(config, checkReq, { preset: 'codex' });
  assert.equal(r.ok, true);
  if (r.ok) { assert.deepEqual(r.json, { a: 1 }); assert.equal(r.session_id, 'th-1'); assert.equal(r.agent, 'codex'); assert.deepEqual(r.usage, { input_tokens: 10, output_tokens: 3 }); }
  const [c] = calls;
  const a = argline(c);
  assert.match(a, /(^|\s|")exec\s/);
  assert.match(a, /\s-"?$/, 'prompt comes from stdin');
  assert.match(a, /--sandbox read-only/);
  const file = /--output-schema "?([^"\s]+)/.exec(a)?.[1] ?? '';
  assert.ok(file && existsSync(file), 'schema is written to a file');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { type: 'object' });
  assert.ok(c.stdin.startsWith('sys\n\n---\n\nhello'), 'system prompt goes inline before the user prompt');
  assert.ok(!a.includes('hello'), 'prompt never goes through argv');
});

// MCP servers from ~/.codex/config.toml and ChatGPT apps run outside the read-only sandbox (one can run any JavaScript).
test('codex: every mode skips the user config and the apps, so only the sandboxed built-in tools are offered', async () => {
  const chatReq = { mode: 'chat' as const, step: 'chat-explain', user: 'u', prompt_version: 'chat@1', workspace: dir };
  for (const req of [checkReq, sessionReq, chatReq]) {
    const calls = fakeSpawn({ stdout: jsonl([{ type: 'item.completed', item: { id: 'm', type: 'agent_message', text: '{}' } }]) });
    await callAgent(config, req, { preset: 'codex' });
    const a = argline(calls[0]);
    assert.match(a, /\s--ignore-user-config\s/, `${req.mode}: user config skipped`);
    assert.match(a, /\s--disable apps\s/, `${req.mode}: apps disabled`);
  }
});

// `codex exec [flags] resume <thread> -`: a panel follow-up continues the thread instead of arriving without the topic.
test('codex chat: a follow-up resumes the thread, "resume <id>" goes before the stdin "-"', async () => {
  const calls = fakeSpawn({ stdout: jsonl([{ type: 'thread.started', thread_id: 'th-9' }, { type: 'item.completed', item: { id: 'm', type: 'agent_message', text: 'ok' } }]) });
  const r = await callAgent(config, { mode: 'chat', step: 'chat-free', user: 'and then?', prompt_version: 'chat@1', workspace: dir, resume: 'th-9' }, { preset: 'codex' });
  assert.equal(r.ok, true);
  assert.match(argline(calls[0]), /\sresume th-9 -"?$/);
  assert.equal(calls[0].stdin, 'and then?');
});

// Codex often says what it is about to do before the answer: the panel shows both messages, so they must not run together.
test('codex: messages of one turn stream apart; the result text is the last message', async () => {
  fakeSpawn({ stdout: jsonl([
    { type: 'item.completed', item: { id: 'm1', type: 'agent_message', text: 'I will read the notes.' } },
    { type: 'item.completed', item: { id: 'm2', type: 'agent_message', text: '{"a":1}' } },
  ]) });
  let streamed = '';
  const r = await callAgent(config, checkReq, { preset: 'codex', onDelta: (t) => { streamed += t; } });
  assert.equal(streamed, 'I will read the notes.\n\n{"a":1}');
  assert.equal(r.ok, true); if (r.ok) { assert.equal(r.text, '{"a":1}'); assert.deepEqual(r.json, { a: 1 }); }
});

// Codex has no file tools: in the exam it reads with shell commands inside its read-only sandbox, which the prompt's "Run nothing" forbids.
test('codex session: the preset adds its own note to the system part, after the prompt', async () => {
  const calls = fakeSpawn({ stdout: jsonl([{ type: 'item.completed', item: { id: 'm', type: 'agent_message', text: '{}' } }]) });
  await callAgent(config, sessionReq, { preset: 'codex' });
  assert.match(calls[0].stdin, /^sys\n\n[^\n]*read-only shell commands[^\n]*\n\n---\n\nu/, 'the note follows the system text');
  const check = fakeSpawn({ stdout: jsonl([{ type: 'item.completed', item: { id: 'm', type: 'agent_message', text: '{}' } }]) });
  await callAgent(config, checkReq, { preset: 'codex' });
  assert.ok(check[0].stdin.startsWith('sys\n\n---\n\nhello'), 'modes without a note are unchanged');
});

test('codex session: shell commands become tool events once per item; turn.failed is an error', async () => {
  fakeSpawn({ stdout: jsonl([
    { type: 'thread.started', thread_id: 'th-2' },
    { type: 'item.started', item: { id: 'c1', type: 'command_execution', command: 'rg -n schema README.md', status: 'in_progress' } },
    { type: 'item.completed', item: { id: 'c1', type: 'command_execution', command: 'rg -n schema README.md', exit_code: 0, status: 'completed' } },
    { type: 'item.completed', item: { id: 'm1', type: 'agent_message', text: '{"verdict":"pass"}' } },
    { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } },
  ]) });
  const seen: string[] = [];
  const r = await callAgent(config, sessionReq, { preset: 'codex', onTool: (t) => seen.push(`${t.name}:${t.target}`) });
  assert.equal(r.ok, true);
  if (r.ok) { assert.deepEqual(r.json, { verdict: 'pass' }); assert.equal(r.tools.length, 1); }
  assert.deepEqual(seen, ['shell:rg -n schema README.md']);
  fakeSpawn({ stdout: jsonl([{ type: 'turn.failed', error: { message: 'model refused' } }]), code: 1 });
  const r2 = await callAgent(config, checkReq, { preset: 'codex' });
  assert.equal(r2.ok, false); if (!r2.ok) { assert.equal(r2.error, 'exit_code'); assert.match(r2.detail, /model refused/); }
});

test('gemini check: -p "" with json output in plan mode, schema inline, response parsed from fenced JSON', async () => {
  const calls = fakeSpawn({ stdout: JSON.stringify({ session_id: 'g-1', response: 'Here:\n```json\n{"a":1}\n```', stats: { models: {} } }) });
  const r = await callAgent(config, checkReq, { preset: 'gemini' });
  assert.equal(r.ok, true);
  if (r.ok) { assert.deepEqual(r.json, { a: 1 }); assert.equal(r.session_id, 'g-1'); }
  const [c] = calls;
  const a = argline(c);
  assert.match(a, /--approval-mode plan/);
  assert.match(a, /--output-format json/);
  assert.match(a, /--skip-trust/);
  assert.ok(c.stdin.includes('"type":"object"'), 'schema goes inline into the prompt');
  assert.ok(c.stdin.startsWith('sys'));
});

test('gemini session: stream-json tool_use events map to tools, assistant deltas form the answer', async () => {
  fakeSpawn({ stdout: jsonl([
    { type: 'init', session_id: 'g-2', model: 'auto' },
    { type: 'message', role: 'user', content: 'u' },
    { type: 'tool_use', tool_name: 'glob', tool_id: 't1', parameters: { pattern: '**/*.md' } },
    { type: 'tool_use', tool_name: 'read_file', tool_id: 't2', parameters: { file_path: 'README.md' } },
    { type: 'message', role: 'assistant', content: '{"verdict":', delta: true },
    { type: 'message', role: 'assistant', content: '"pass"}', delta: true },
    { type: 'result', status: 'success', stats: { tokens: 5 } },
  ]) });
  const seen: string[] = [];
  const r = await callAgent(config, sessionReq, { preset: 'gemini', onTool: (t) => seen.push(`${t.name}:${t.target}`) });
  assert.equal(r.ok, true);
  if (r.ok) { assert.deepEqual(r.json, { verdict: 'pass' }); assert.equal(r.session_id, 'g-2'); assert.deepEqual(r.usage, { tokens: 5 }); }
  assert.deepEqual(seen, ['glob:**/*.md', 'read_file:README.md']);
});

test('auth errors are reported as auth, so the caller does not retry', async () => {
  fakeSpawn({ stdout: '', stderr: 'Error authenticating: IneligibleTierError: This client is no longer supported', code: 41 });
  const r = await callAgent(config, checkReq, { preset: 'gemini' });
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error, 'auth');
  fakeSpawn({ stdout: '', stderr: 'Not logged in. Run codex login first.', code: 1 });
  const r2 = await callAgent(config, checkReq, { preset: 'codex' });
  assert.equal(r2.ok, false); if (!r2.ok) assert.equal(r2.error, 'auth');
});

test('unknown preset is mode_not_supported; the default preset is saved in data/agents.local.json', async () => {
  const r = await callAgent(config, checkReq, { preset: 'nope' });
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error, 'mode_not_supported');
  assert.deepEqual(presetNames(config).sort(), ['claude', 'codex', 'gemini']);
  setDefaultPreset(config, 'gemini');
  assert.equal(JSON.parse(readFileSync(join(dir, 'agents.local.json'), 'utf8')).default, 'gemini');
  const saved = process.env.STUDY_HUB_PRESET; delete process.env.STUDY_HUB_PRESET;
  assert.equal(resolvePreset(config).name, 'gemini');
  if (saved !== undefined) process.env.STUDY_HUB_PRESET = saved;
  assert.throws(() => setDefaultPreset(config, 'nope'));
});

test('model and effort from agents.local.json become CLI flags: claude --model/--effort, codex -m and -c model_reasoning_effort', async () => {
  setPresetOptions(config, 'claude', { model: 'opus', effort: 'high' });
  setPresetOptions(config, 'codex', { model: 'gpt-6.1-sol', effort: 'xhigh' });
  const saved = JSON.parse(readFileSync(join(dir, 'agents.local.json'), 'utf8'));
  assert.deepEqual(saved.options, { claude: { model: 'opus', effort: 'high' }, codex: { model: 'gpt-6.1-sol', effort: 'xhigh' } });

  let calls = fakeSpawn({ stdout: JSON.stringify({ type: 'result', result: '{"a":1}', session_id: 's' }) });
  await callAgent(config, checkReq, { preset: 'claude' });
  let a = argline(calls[0]!);
  assert.match(a, /--model opus/);
  assert.match(a, /--effort high/);

  calls = fakeSpawn({ stdout: jsonl([{ type: 'item.completed', item: { id: 'm', type: 'agent_message', text: '{"a":1}' } }]) });
  await callAgent(config, checkReq, { preset: 'codex' });
  a = argline(calls[0]!);
  assert.match(a, /-m gpt-6\.1-sol/);
  assert.match(a, /model_reasoning_effort=\\?"xhigh\\?"/);
  assert.match(a, /\s-"?$/, 'the stdin marker stays last');

  // empty value = flag not passed; a value outside the list or containing a space is rejected
  setPresetOptions(config, 'claude', { model: '', effort: '' });
  calls = fakeSpawn({ stdout: JSON.stringify({ type: 'result', result: '{"a":1}', session_id: 's' }) });
  await callAgent(config, checkReq, { preset: 'claude' });
  assert.ok(!argline(calls[0]!).includes('--model'));
  assert.throws(() => setPresetOptions(config, 'claude', { effort: 'ultra' }), /bad option/);
  assert.throws(() => setPresetOptions(config, 'claude', { model: 'opus --dangerously' }), /bad option/);
  assert.throws(() => setPresetOptions(config, 'nope', {}), /unknown/);
});
