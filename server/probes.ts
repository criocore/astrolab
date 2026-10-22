// Era I probes: the hub itself checks the workplace and lights the stars of topics with a probe field, without a model call.
// hub: the hub is running (so a terminal exists). node: process version >= 22.13. git: `git --version` in PATH.
// agent: the selected CLI is found (`--version`). manual: a checkbox set by hand via PUT /api/topic. No probe goes to the network.
import { spawn, type ChildProcess } from 'node:child_process';
import { type AgentHealth, agentHealth, callAgent, killTree, resolveCmd, resolvePreset } from './adapter.ts';
import type { Config } from './config.ts';
import { type Db, getTopic, setTopic } from './db.ts';
import type { LoadedPack, Topic } from './pack.ts';

export type ProbeName = 'hub' | 'node' | 'git' | 'agent' | 'manual';
export type ProbeResult = { topic: string; probe: ProbeName; ok: boolean; detail: string };
export const MIN_NODE = [22, 13];

export function probeTopics(lp: LoadedPack): Topic[] {
  return [...lp.topics.values()].filter((t) => t.probe);
}

export function nodeOk(version = process.versions.node): boolean {
  const [a, b] = version.split('.').map(Number);
  return a > MIN_NODE[0] || (a === MIN_NODE[0] && b >= MIN_NODE[1]);
}

// `cmd --version` with a short timeout; the first line of output or empty.
export function versionOf(cmd: string): Promise<{ found: boolean; version: string }> {
  return new Promise((resolve) => {
    const { file, viaCmd } = resolveCmd(cmd);
    let out = '';
    let child: ChildProcess;
    try {
      child = viaCmd ? spawn('cmd.exe', ['/d', '/s', '/c', `"${file} --version"`], { windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'ignore'] })
        : spawn(file, ['--version'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { return resolve({ found: false, version: '' }); }
    const t = setTimeout(() => { killTree(child); resolve({ found: false, version: '' }); }, 10_000);
    child.stdout?.on('data', (c) => { out += c; });
    child.on('error', () => { clearTimeout(t); resolve({ found: false, version: '' }); });
    child.on('close', (code) => { clearTimeout(t); resolve({ found: code === 0, version: out.trim().split('\n')[0] ?? '' }); });
  });
}

export const hooks: { versionOf?: typeof versionOf; nodeVersion?: string } = {}; // tests replace external commands

// Probe run: a result for each topic with a probe; passed probes mark the topic as learned (once, with the date of the first pass).
// Manual topics are not touched: the user sets their status.
export async function runProbes(config: Config, lp: LoadedPack, db: Db, agent?: AgentHealth): Promise<ProbeResult[]> {
  const ver = hooks.versionOf ?? versionOf;
  const out: ProbeResult[] = [];
  for (const t of probeTopics(lp)) {
    const probe = t.probe as ProbeName;
    let ok = false;
    let detail = '';
    if (probe === 'hub') { ok = true; detail = `node ${hooks.nodeVersion ?? process.versions.node}`; }
    else if (probe === 'node') { const v = hooks.nodeVersion ?? process.versions.node; ok = nodeOk(v); detail = `v${v}`; }
    else if (probe === 'git') { const r = await ver('git'); ok = r.found; detail = r.version; }
    else if (probe === 'agent') { const h = agent ?? await agentHealth(config); ok = h.found; detail = h.found ? `${h.title} · ${h.version}` : h.title; }
    else if (probe === 'manual') { ok = getTopic(db, lp.pack.id, t.key)?.status === 'learned'; }
    if (ok && probe !== 'manual' && getTopic(db, lp.pack.id, t.key)?.status !== 'learned') setTopic(db, lp.pack.id, t.key, { status: 'learned', learnedAt: new Date().toISOString() });
    out.push({ topic: t.key, probe, ok, detail });
  }
  return out;
}

// "Check call": one short agent call in check mode. The only probe that needs a model; only on an explicit button press.
export async function checkAgentCall(config: Config): Promise<{ ok: boolean; error?: string; detail?: string; ms: number; agent: string }> {
  const t0 = Date.now();
  const { name } = resolvePreset(config);
  const r = await callAgent(config, { // via callAgent, so the call lands in data/logs/mentor.jsonl like any other
    mode: 'check', step: 'probe-call', prompt_version: 'probe-call@1', timeout_ms: 90_000,
    system: 'You answer with one JSON object and nothing else.',
    user: 'Reply with {"ok": true}.',
    schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
  });
  const ms = Date.now() - t0;
  if (!r.ok) return { ok: false, error: r.error, detail: r.detail, ms, agent: name };
  const ok = !!(r.json as any)?.ok || /\bok\b/i.test(r.text);
  return ok ? { ok: true, ms, agent: name } : { ok: false, error: 'bad_output', detail: r.text.slice(0, 200), ms, agent: name };
}
