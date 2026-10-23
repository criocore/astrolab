// Recording and replay of agent answers. The key is the SHA-256 of the canonical request JSON without machine-dependent fields.
// live: CLI only. record: CLI + write to fixtures/mentor. replay: recordings only (demo and tests without a CLI).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './config.ts';
import { callAgent, type AgentRequest, type AgentResult, type CallOpts } from './adapter.ts';

export type Source = 'live' | 'record';
export type Recording = { hash: string; mode: string; step: string; prompt_version: string; request: Record<string, unknown>; response: AgentResult; recorded_at: string; duration_ms: number };
export type MentorResult = { result: AgentResult; source: Source; duration_ms: number; recorded_at?: string };

function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, canon(o[k])]));
  }
  return v;
}
// The request without machine-dependent fields: the recording key is made of it, and a recording keeps only it.
function portable(request: AgentRequest): Record<string, unknown> {
  const { timeout_ms: _t, ...rest } = request as any;
  if (rest.mode !== 'check') { delete rest.workspace; delete rest.resume; }
  return rest;
}
export function requestHash(request: AgentRequest): string {
  return createHash('sha256').update(JSON.stringify(canon(portable(request)))).digest('hex');
}

export const hooks: { agent?: typeof callAgent } = {}; // tests replace the agent

export async function mentorCall(config: Config, request: AgentRequest, opts: CallOpts = {}): Promise<MentorResult> {
  const started = Date.now();
  const hash = requestHash(request);
  const dir = join(config.fixturesDir, 'mentor');
  const file = join(dir, `${hash}.json`);
  const agent = hooks.agent ?? callAgent;
  if (config.mentorMode === 'replay') {
    if (!existsSync(file)) return { result: { ok: false, error: 'no_recording', detail: hash.slice(0, 12), tools: [] }, source: 'record', duration_ms: 0 };
    const rec = JSON.parse(readFileSync(file, 'utf8')) as Recording;
    for (const t of rec.response.tools ?? []) opts.onTool?.(t); // tool events are replayed from the recording
    if (rec.response.ok && rec.response.text) opts.onDelta?.(rec.response.text); // a chat answer is replayed as one delta
    return { result: rec.response, source: 'record', duration_ms: Date.now() - started, recorded_at: rec.recorded_at };
  }
  const result = await agent(config, request, opts);
  if (config.mentorMode === 'record' && result.ok) {
    const rec: Recording = { hash, mode: request.mode, step: request.step, prompt_version: request.prompt_version, request: portable(request), response: result, recorded_at: new Date().toISOString(), duration_ms: Date.now() - started };
    mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(rec, null, 1) + '\n', 'utf8');
    renameSync(tmp, file);
  }
  return { result, source: 'live', duration_ms: Date.now() - started };
}

export function loadPrompt(config: Config, name: string): { system: string; schema: unknown; version: string } {
  const system = readFileSync(join(config.promptsDir, `${name}.md`), 'utf8');
  const schema = JSON.parse(readFileSync(join(config.promptsDir, `${name}.schema.json`), 'utf8'));
  const version = /^prompt_version:\s*(\S+)/m.exec(system)?.[1] ?? name;
  return { system, schema, version };
}

// Text inside request tags cannot close or open a tag.
export const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
