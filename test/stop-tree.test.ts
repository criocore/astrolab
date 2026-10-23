// Stop reaches everything the agent started (macOS/Linux): the agent runs in its own process group, Stop kills the group,
// and the hub kills the groups when it exits. Real processes: a node "agent" that starts `sleep 30` with inherited output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeConfig, ROOT } from '../server/config.ts';
import { callAgent, killTree, type Ctl } from '../server/adapter.ts';

const posix = process.platform !== 'win32';
const root = mkdtempSync(join(tmpdir(), 'hub-tree-'));
const pidFile = join(root, 'pids.json');
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const pids = () => JSON.parse(readFileSync(pidFile, 'utf8')) as { agent: number; helper: number };
test.after(() => { if (existsSync(pidFile)) for (const p of Object.values(pids())) try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } rmSync(root, { recursive: true, force: true }); });

// The "agent": starts a helper that keeps the agent's stdout, writes both pids, prints one stream line, then waits
// (or, with "exit", exits on its own and leaves the helper behind). With "stubborn" the helper ignores SIGTERM.
const agent = join(root, 'agent.cjs');
writeFileSync(agent, `const { spawn } = require('node:child_process');
const [how] = process.argv.slice(2);
const helper = how === 'stubborn'
  ? spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: 'inherit' })
  : spawn('sleep', ['30'], { stdio: 'inherit' });
setTimeout(() => {
  require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify({ agent: process.pid, helper: helper.pid }));
  process.stdout.write(JSON.stringify({ type: 'system', session_id: 's' }) + '\\n');
  if (how === 'exit') process.exit(0);
}, 200);
setInterval(() => {}, 1000);
`);
function dataDir(name: string, how = 'wait') {
  const dir = join(root, name);
  const preset = { cmd: process.execPath, format: 'claude', modes: { chat: { args: [agent, how], output: 'jsonl' } } };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'agents.local.json'), JSON.stringify({ default: 'tree', presets: { tree: preset } }));
  return dir;
}
async function until(cond: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (!cond()) { if (Date.now() > end) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 20)); }
}

test('Stop kills the agent and the processes it started, and the call ends at once', { skip: !posix && 'POSIX process groups', timeout: 10_000 }, async () => {
  const config = makeConfig({ dataDir: dataDir('stop') });
  const ctl: Ctl = { stopped: false };
  const call = callAgent(config, { mode: 'chat', step: 'chat-free', user: 'hi', prompt_version: 'chat@1', workspace: root, timeout_ms: 8000 }, { ctl });
  await until(() => existsSync(pidFile));
  const { agent: a, helper } = pids();
  const t0 = Date.now();
  ctl.stopped = true;
  killTree(ctl.child);
  const r = await call;
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error, 'stopped');
  assert.ok(Date.now() - t0 < 2000, `the call ended ${Date.now() - t0} ms after Stop`);
  await until(() => !alive(a) && !alive(helper), 2000).catch(() => {});
  assert.equal(alive(a), false, 'agent is gone');
  assert.equal(alive(helper), false, 'the process the agent started is gone');
  rmSync(pidFile);
});

async function stopCase(name: string, how: string, within: number) {
  const config = makeConfig({ dataDir: dataDir(name, how) });
  const ctl: Ctl = { stopped: false };
  const call = callAgent(config, { mode: 'chat', step: 'chat-free', user: 'hi', prompt_version: 'chat@1', workspace: root, timeout_ms: 15_000 }, { ctl });
  await until(() => existsSync(pidFile));
  const { agent: a, helper } = pids();
  if (how === 'exit') await until(() => !alive(a));
  const t0 = Date.now();
  ctl.stopped = true;
  killTree(ctl.child);
  const r = await call;
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error, 'stopped');
  assert.ok(Date.now() - t0 < within, `the call ended ${Date.now() - t0} ms after Stop`);
  await until(() => !alive(helper), 2000).catch(() => {});
  assert.equal(alive(helper), false, 'the process the agent started is gone');
  rmSync(pidFile);
}

test('the agent exited by itself, its helper still holds the output: Stop still reaches the helper', { skip: !posix && 'POSIX process groups', timeout: 20_000 }, () => stopCase('exited', 'exit', 2000));

test('a helper that ignores SIGTERM is killed after a short grace', { skip: !posix && 'POSIX process groups', timeout: 20_000 }, () => stopCase('stubborn', 'stubborn', 5000));

async function hubCase(name: string, how: string, port: number) {
  const dir = dataDir(name, how);
  const hub = spawn(process.execPath, ['--import', 'tsx', join(ROOT, 'server', 'index.ts')], {
    cwd: ROOT, env: { ...process.env, STUDY_HUB_DATA: dir, STUDY_HUB_PORT: String(port), MENTOR_MODE: 'live', STUDY_HUB_PACK: join(ROOT, 'packs', 'ai-engineer.json') }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    await new Promise<void>((ok, fail) => { hub.stdout!.on('data', (d) => { if (String(d).includes('Astrolabe:')) ok(); }); hub.on('exit', () => fail(new Error('hub exited'))); });
    const headers = { host: `127.0.0.1:${port}`, 'content-type': 'application/json' };
    const { token } = await (await fetch(`http://127.0.0.1:${port}/api/session`, { headers })).json() as { token: string };
    const ask = fetch(`http://127.0.0.1:${port}/api/agent/ask`, { method: 'POST', headers: { ...headers, 'x-hub-token': token }, body: JSON.stringify({ template: 'free', question: 'hi', lang: 'en' }) }).then((r) => r.text()).catch(() => '');
    await until(() => existsSync(pidFile), 10_000);
    const { agent: a, helper } = pids();
    hub.kill('SIGINT');
    await new Promise((r) => hub.once('exit', r));
    await ask;
    await until(() => !alive(a) && !alive(helper), 2000).catch(() => {});
    assert.equal(alive(a), false, 'agent is gone with the hub');
    assert.equal(alive(helper), false, 'the process the agent started is gone with the hub');
  } finally { if (hub.exitCode === null) hub.kill('SIGKILL'); }
  rmSync(pidFile);
}

test('Ctrl+C on the hub stops a running agent together with what it started', { skip: !posix && 'POSIX process groups', timeout: 20_000 }, () => hubCase('hub', 'wait', 4620));

test('Ctrl+C on the hub: a helper that ignores SIGTERM gets SIGKILL when the hub exits', { skip: !posix && 'POSIX process groups', timeout: 20_000 }, () => hubCase('hub-stubborn', 'stubborn', 4621));
