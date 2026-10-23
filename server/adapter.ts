// Adapter for the coding agent (presets in agents.json, local overrides in data/agents.local.json).
// check: one call without reading files, answer follows a JSON schema. session: the agent reads the folder, tool events are passed out.
// chat: streamed answer for the mentor panel. The prompt goes through stdin, not through the shell. The agent's answer is data, not commands.
// Each CLI's output is parsed by its own format handler (claude / codex / gemini); the same events come out of all of them.
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { Config } from './config.ts';

export type SpawnFn = (cmd: string, args: string[], options: SpawnOptions) => ChildProcess;
export const hooks: { spawn?: SpawnFn } = {}; // tests replace process spawning

export type CheckRequest = { mode: 'check'; step: string; system: string; user: string; schema: unknown; prompt_version: string; timeout_ms?: number };
export type SessionRequest = { mode: 'session'; step: string; system: string; user: string; schema: unknown; prompt_version: string; workspace: string; resume?: string; timeout_ms?: number };
// chat: the whole prompt is in user (system and schema are not used), the answer streams out as text deltas.
// topic: only with resume, where user is the bare question; it keeps recordings of equal follow-ups on different topics apart.
export type ChatAgentRequest = { mode: 'chat'; step: string; user: string; prompt_version: string; workspace: string; resume?: string; topic?: string; timeout_ms?: number };
export type AgentRequest = CheckRequest | SessionRequest | ChatAgentRequest;
export type AgentError = 'not_found' | 'timeout' | 'exit_code' | 'bad_output' | 'limit' | 'auth' | 'stopped' | 'no_recording' | 'mode_not_supported';
export type Tool = { name: string; target: string };
export type AgentResult =
  | { ok: true; json: unknown; text: string; agent: string; ms: number; session_id: string; usage?: unknown; total_cost_usd?: number; tools: Tool[] }
  | { ok: false; error: AgentError; detail: string; tools: Tool[] };
export type Ctl = { child?: ChildProcess; stopped: boolean };

export type ModeName = 'check' | 'session' | 'chat';
export type Format = 'claude' | 'codex' | 'gemini';
export type Mode = {
  args: string[];
  output?: 'json' | 'jsonl';                         // json: one object on stdout; jsonl: events line by line (default)
  system?: string | null;                            // CLI flag or "inline": text at the start of the prompt
  schema?: string | { flag: string; file: true } | null; // flag with a string, flag with a file, or "inline": schema in the prompt
  resume?: string | null;
};
// A CLI parameter the user picks (model, effort): args with {value} substituted, choices = hints, free = custom value.
export type PresetOption = { args: string[]; choices?: string[]; free?: boolean };
export type Preset = {
  title?: string; cmd: string; format?: Format; install?: string; scope?: string; version_args?: string[];
  options?: Record<string, PresetOption> | null;
  modes: Partial<Record<ModeName, Mode | null>>;
  terminal?: { prompt_flag?: string; resume?: string } | null;
};
export type OptionValues = Record<string, string>;
// agents.local.json: default = selected preset, options[preset][name] = selected parameter values.
type Presets = { default?: string; presets?: Record<string, Preset>; options?: Record<string, OptionValues> };

function readJson<T>(p: string): T | null {
  try { return JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, '')) as T; } catch { return null; }
}
// The local file overrides preset fields; arrays and null replace the value entirely.
function merge(base: any, over: any): any {
  const isObj = (v: any) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(base) || !isObj(over)) return over;
  const out: any = { ...base };
  for (const k of Object.keys(over)) out[k] = k in base ? merge(base[k], over[k]) : over[k];
  return out;
}

function loadPresets(config: Config): { all: Record<string, Preset>; def: string; values: Record<string, OptionValues> } {
  const base = readJson<Presets>(join(config.root, 'agents.json')) ?? {};
  const local = readJson<Presets>(join(config.dataDir, 'agents.local.json'));
  const all: Record<string, Preset> = {};
  for (const name of new Set([...Object.keys(base.presets ?? {}), ...Object.keys(local?.presets ?? {})])) {
    all[name] = merge(base.presets?.[name] ?? {}, local?.presets?.[name] ?? {});
  }
  return { all, def: process.env.STUDY_HUB_PRESET ?? local?.default ?? base.default ?? 'claude', values: local?.options ?? {} };
}

// Parameter value: one word without spaces or quotes, because it is substituted into a CLI argument (inside -c key="value" for Codex).
const VALUE_RE = /^[\w.@:+/-]{1,80}$/;
export function validOptions(preset: Preset, values: OptionValues): OptionValues {
  const out: OptionValues = {};
  for (const [name, opt] of Object.entries(preset.options ?? {})) {
    const v = String(values[name] ?? '').trim();
    if (!v) continue;
    if (!VALUE_RE.test(v)) throw new Error(`bad option value: ${name}`);
    if (!opt.free && !(opt.choices ?? []).includes(v)) throw new Error(`bad option value: ${name}`);
    out[name] = v;
  }
  return out;
}
// CLI arguments from the selected parameters: {value} is substituted into each args element.
export function optionArgs(preset: Preset | null, values: OptionValues): string[] {
  if (!preset) return [];
  const args: string[] = [];
  for (const [name, v] of Object.entries(validOptions(preset, values))) for (const a of preset.options![name]!.args) args.push(a.replace('{value}', v));
  return args;
}
export function presetOptionArgs(config: Config, name: string): string[] {
  const { all, values } = loadPresets(config);
  try { return optionArgs(all[name] ?? null, values[name] ?? {}); } catch { return []; }
}

export function resolvePreset(config: Config, forced?: string): { name: string; preset: Preset | null } {
  const { all, def } = loadPresets(config);
  const name = forced ?? def;
  const p = all[name];
  return { name, preset: p && typeof p.cmd === 'string' ? p : null };
}

export function presetNames(config: Config): string[] { return Object.keys(loadPresets(config).all); }

function writeLocal(config: Config, patch: (local: Presets) => Presets) {
  mkdirSync(config.dataDir, { recursive: true });
  const file = join(config.dataDir, 'agents.local.json');
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(patch(readJson<Presets>(file) ?? {}), null, 2) + '\n', 'utf8');
  renameSync(tmp, file);
}
// The default agent choice is written to data/agents.local.json; the other fields of the file are kept.
export function setDefaultPreset(config: Config, name: string) {
  if (!presetNames(config).includes(name)) throw new Error('unknown preset');
  writeLocal(config, (local) => ({ ...local, default: name }));
}
// Selected parameters (model, effort) of one preset; validated against agents.json before writing.
export function setPresetOptions(config: Config, name: string, values: OptionValues) {
  const { all } = loadPresets(config);
  const preset = all[name];
  if (!preset) throw new Error('unknown preset');
  const clean = validOptions(preset, values);
  writeLocal(config, (local) => ({ ...local, options: { ...(local.options ?? {}), [name]: clean } }));
}

// Agent executable: searched in PATH (.exe on Windows; .cmd does not run without a shell, hence the separate branch).
export function resolveCmd(cmd: string): { file: string; viaCmd: boolean } {
  if (process.platform !== 'win32' || /[\\/]/.test(cmd) || /\.exe$/i.test(cmd)) return { file: cmd, viaCmd: false };
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    if (existsSync(join(dir, `${cmd}.exe`))) return { file: join(dir, `${cmd}.exe`), viaCmd: false };
  }
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir && existsSync(join(dir, `${cmd}.cmd`))) return { file: join(dir, `${cmd}.cmd`), viaCmd: true };
  }
  return { file: cmd, viaCmd: false };
}

const LIMIT_RE = /rate.?limit|usage limit|limit reached|out of (extra )?usage|overloaded|too many requests|\b429\b|quota/i;
export const looksLikeLimit = (s: string) => LIMIT_RE.test(s);
// Not logged in or key rejected: each CLI prints this differently, the common denominator is below. Gemini returns exit code 41.
const AUTH_RE = /not (logged|signed) in|please (run|use) .*login|login required|authentication (failed|error)|error authenticating|unauthorized|invalid api key|ineligible|\b401\b/i;
export const looksLikeAuth = (s: string) => AUTH_RE.test(s);

// macOS/Linux: an agent runs in its own process group, so Stop and the hub's exit reach the processes it started
// (shell commands, MCP servers), which would otherwise outlive it and hold its output open. Only real processes:
// with the spawn hook (tests) the pid is fake, and a group kill must never reach a real process.
// A group is kept until the agent's output closes, not until the agent exits: a helper it left behind holding the output
// keeps the call open, and Stop or the timeout must still reach it.
const groups = new Set<ChildProcess>();
const GRACE_MS = 2000; // after SIGTERM, a group still alive gets SIGKILL
const signalGroup = (pid: number, sig: NodeJS.Signals | 0) => { try { process.kill(-pid, sig); return true; } catch { return false; } };
// The hub is exiting: the groups do not get the terminal's Ctrl+C. SIGTERM first; what is left at exit gets SIGKILL.
export function killAll(sig: 'SIGTERM' | 'SIGKILL' = 'SIGTERM') { for (const c of groups) signalGroup(c.pid!, sig); return groups.size; }

export function killTree(child: ChildProcess | undefined) {
  if (!child || child.pid === undefined) return;
  if (groups.has(child)) {
    const pid = child.pid;
    if (signalGroup(pid, 'SIGTERM')) setTimeout(() => { if (signalGroup(pid, 0)) signalGroup(pid, 'SIGKILL'); }, GRACE_MS).unref();
    return;
  }
  if (child.exitCode !== null) return;
  const kill = () => { try { child.kill(); } catch { /* ignore */ } };
  // Windows: taskkill /T finds the tree through the parent, so the parent (cmd.exe for a .cmd shim) is killed only after it.
  // Through the spawn hook: in tests the pid is fake and must not reach a real process.
  if (process.platform === 'win32') {
    try { (hooks.spawn ?? nodeSpawn)('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('close', kill).on('error', kill); return; } catch { /* no taskkill */ }
  }
  kill();
}

// What stays in the log about a tool: domain for a URL, path for a file, command for the shell. Never page or file text.
export function toolTarget(name: string, input: any): string {
  if (!input || typeof input !== 'object') return '';
  const keys: Record<string, string[]> = {
    Read: ['file_path', 'path'], Grep: ['pattern', 'path'], Glob: ['pattern', 'path'], WebFetch: ['url'], WebSearch: ['query'],
    read_file: ['file_path', 'absolute_path', 'path'], grep_search: ['pattern'], glob: ['pattern'], list_directory: ['dir_path', 'path'],
    run_shell_command: ['command'], web_fetch: ['url', 'prompt'], google_web_search: ['query'],
  };
  for (const k of keys[name] ?? ['file_path', 'path', 'pattern', 'url', 'query', 'command']) if (input[k]) return String(input[k]);
  return '';
}

export type LogLine = { at: string; mode: string; step: string; preset: string; source: string; duration_ms: number; ok: boolean; error?: string; retry: boolean; usage?: unknown; total_cost_usd?: number; tools?: Tool[] };
// One line per call, append only. No answer or prompt text here.
export function appendLog(config: Config, line: LogLine) {
  const dir = join(config.dataDir, 'logs');
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'mentor.jsonl'), JSON.stringify(line) + '\n', 'utf8');
}

// JSON from the answer text: as is, without a ```json fence, or the first object between the first { and the last }.
export function parseJsonText(text: string): unknown {
  const t = text.trim();
  const tries = [t, t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')];
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  for (const s of tries) { try { return JSON.parse(s); } catch { /* next attempt */ } }
  return null;
}

// Events common to all formats.
export type RunEvent = { type: 'session'; id: string } | { type: 'delta'; text: string } | { type: 'tool'; tool: Tool };
type Ctx = { text: string; sawDelta: boolean; session: string; tools: Tool[]; usage?: unknown; cost?: number; error: string; json: unknown; gotResult: boolean; seen: Set<string>; emit: (e: RunEvent) => void };
type Handler = { line: (m: any, ctx: Ctx) => void; whole?: (m: any, ctx: Ctx) => void };

function pushTool(ctx: Ctx, name: string, target: string, key?: string) {
  if (key) { if (ctx.seen.has(key)) return; ctx.seen.add(key); }
  const t = { name, target };
  ctx.tools.push(t);
  ctx.emit({ type: 'tool', tool: t });
}
function addText(ctx: Ctx, text: string, delta: boolean) {
  if (!text) return;
  if (delta) ctx.sawDelta = true; else if (ctx.sawDelta) return; // the full text after deltas is not duplicated
  ctx.text += text;
  ctx.emit({ type: 'delta', text });
}

// Claude Code: --output-format json (one result object) or stream-json (system/assistant/stream_event/result line by line).
const claude: Handler = {
  line(m, ctx) {
    if (m?.type === 'system' && m.session_id) ctx.session = String(m.session_id);
    else if (m?.type === 'stream_event' && m.event?.type === 'content_block_delta' && m.event.delta?.type === 'text_delta') addText(ctx, String(m.event.delta.text ?? ''), true);
    else if (m?.type === 'assistant') {
      for (const c of m.message?.content ?? []) {
        if (c?.type === 'tool_use' && c.name !== 'StructuredOutput') pushTool(ctx, String(c.name ?? ''), toolTarget(String(c.name ?? ''), c.input)); // StructuredOutput is an internal CLI call
        else if (c?.type === 'text' && !ctx.sawDelta) addText(ctx, String(c.text ?? ''), false);
      }
    } else if (m?.type === 'result') claude.whole!(m, ctx);
  },
  whole(m, ctx) {
    if (m?.type !== 'result') return;
    ctx.gotResult = true;
    if (m.session_id) ctx.session = String(m.session_id);
    if (m.is_error) ctx.error = String(m.result ?? 'agent error');
    if (typeof m.result === 'string' && !ctx.text) ctx.text = m.result;
    ctx.json = m.structured_output ?? (typeof m.result === 'string' ? parseJsonText(m.result) : null);
    if (m.usage !== undefined) ctx.usage = m.usage;
    if (typeof m.total_cost_usd === 'number') ctx.cost = m.total_cost_usd;
  },
};

// Codex CLI: `codex exec --json`: thread.started, item.started/completed (agent_message, command_execution, file_change, mcp_tool_call, web_search), turn.completed (usage), turn.failed, error.
const codex: Handler = {
  line(m, ctx) {
    const t = m?.type;
    if (t === 'thread.started' && m.thread_id) ctx.session = String(m.thread_id);
    else if (t === 'item.started' || t === 'item.completed' || t === 'item.updated') {
      const it = m.item ?? {};
      const key = String(it.id ?? '');
      if (it.type === 'agent_message') { if (t === 'item.completed') { ctx.gotResult = true; ctx.text = ''; ctx.sawDelta = false; addText(ctx, String(it.text ?? ''), false); } }
      else if (it.type === 'command_execution') pushTool(ctx, 'shell', String(it.command ?? ''), key);
      else if (it.type === 'file_change') pushTool(ctx, 'file_change', (it.changes ?? []).map((c: any) => c.path).join(', '), key);
      else if (it.type === 'mcp_tool_call') pushTool(ctx, `${it.server ?? 'mcp'}/${it.tool ?? ''}`, '', key);
      else if (it.type === 'web_search') pushTool(ctx, 'web_search', String(it.query ?? ''), key);
      else if (it.type === 'error') ctx.error = String(it.message ?? 'agent error');
    } else if (t === 'turn.completed') ctx.usage = m.usage;
    else if (t === 'turn.failed') ctx.error = String(m.error?.message ?? 'turn failed');
    else if (t === 'error') ctx.error = String(m.message ?? 'agent error');
  },
};

// Gemini CLI: --output-format json ({session_id, response, stats, error}) or stream-json (init, message, tool_use, tool_result, result).
const gemini: Handler = {
  line(m, ctx) {
    const t = m?.type;
    if (t === 'init' && m.session_id) ctx.session = String(m.session_id);
    else if (t === 'message' && m.role === 'assistant') addText(ctx, String(m.content ?? ''), m.delta === true);
    else if (t === 'tool_use') pushTool(ctx, String(m.tool_name ?? ''), toolTarget(String(m.tool_name ?? ''), m.parameters), m.tool_id ? String(m.tool_id) : undefined);
    else if (t === 'result') {
      ctx.gotResult = true;
      if (m.stats !== undefined) ctx.usage = m.stats;
      if (m.status === 'error' || m.error) ctx.error = String(m.error?.message ?? 'agent error');
    }
  },
  whole(m, ctx) {
    ctx.gotResult = true;
    if (m?.session_id) ctx.session = String(m.session_id);
    if (typeof m?.response === 'string') { ctx.text = m.response; ctx.emit({ type: 'delta', text: m.response }); }
    if (m?.stats !== undefined) ctx.usage = m.stats;
    if (m?.error) ctx.error = String(m.error.message ?? m.error.type ?? 'agent error');
  },
};
const HANDLERS: Record<Format, Handler> = { claude, codex, gemini };

const DEFAULT_TIMEOUT: Record<ModeName, number> = { check: 120_000, session: 180_000, chat: 600_000 };
const INLINE_SCHEMA = (schema: unknown) => `\n\n# Output format\nReply with exactly one JSON object and nothing else: no prose, no code fences. The object must match this JSON Schema:\n${JSON.stringify(schema)}`;

export type RunInput = { mode: ModeName; system?: string; user: string; schema?: unknown; resume?: string; cwd: string; timeout_ms?: number };
export type RunResult =
  | { ok: true; text: string; json: unknown; session_id: string; usage?: unknown; total_cost_usd?: number; tools: Tool[]; name: string; args: string[] }
  | { ok: false; error: AgentError; detail: string; tools: Tool[]; name: string; args: string[] };

// Run a CLI by preset and mode. One code path for check, exam and panel; the differences are only in agents.json and the format handler.
export function runAgent(config: Config, input: RunInput, opts: { ctl?: Ctl; onEvent?: (e: RunEvent) => void; preset?: string } = {}): Promise<RunResult> {
  const { name, preset } = resolvePreset(config, opts.preset);
  const ctl = opts.ctl ?? { stopped: false };
  const ctx: Ctx = { text: '', sawDelta: false, session: '', tools: [], error: '', json: null, gotResult: false, seen: new Set(), emit: (e) => { opts.onEvent?.(e); } };
  const fail = (error: AgentError, detail: string, args: string[] = []): RunResult => ({ ok: false, error, detail: detail.slice(0, 300), tools: ctx.tools, name, args });
  const mode = preset?.modes?.[input.mode];
  if (!preset || !mode) return Promise.resolve(fail('mode_not_supported', `preset ${name}, mode ${input.mode}`));
  const handler = HANDLERS[preset.format ?? 'claude'] ?? claude;
  mkdirSync(input.cwd, { recursive: true });

  // Prompt: the system part and the schema go as flags if the CLI supports them, otherwise into the text.
  let user = input.user;
  const extra: string[] = [];
  if (input.system) {
    if (mode.system === 'inline') user = `${input.system}\n\n---\n\n${user}`;
    else if (mode.system) extra.push(mode.system, input.system);
  }
  if (input.schema !== undefined && input.schema !== null && mode.schema) {
    if (mode.schema === 'inline') user += INLINE_SCHEMA(input.schema);
    else if (typeof mode.schema === 'string') extra.push(mode.schema, JSON.stringify(input.schema));
    else {
      const dir = join(config.dataDir, 'tmp');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `schema-${createHash('sha256').update(JSON.stringify(input.schema)).digest('hex').slice(0, 16)}.json`);
      if (!existsSync(file)) writeFileSync(file, JSON.stringify(input.schema), 'utf8');
      extra.push(mode.schema.flag, file);
    }
  }
  if (input.resume && mode.resume) extra.push(mode.resume, input.resume);
  extra.push(...presetOptionArgs(config, name)); // model, effort: the user's choice from agents.local.json
  // A trailing "-" in the base arguments means "prompt from stdin" (Codex); flags are inserted before it.
  const base = [...mode.args];
  const args = base[base.length - 1] === '-' ? [...base.slice(0, -1), ...extra, '-'] : [...base, ...extra];
  const timeout = input.timeout_ms ?? DEFAULT_TIMEOUT[input.mode];

  return new Promise<RunResult>((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (r: RunResult) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };
    if (ctl.stopped) return finish(fail('stopped', '', args));
    const { file, viaCmd } = resolveCmd(preset.cmd);
    const spawn = hooks.spawn ?? nodeSpawn;
    const group = !hooks.spawn && process.platform !== 'win32';
    let child: ChildProcess;
    try {
      child = viaCmd
        ? spawn('cmd.exe', ['/d', '/s', '/c', `"${[file, ...args.map(winQuote)].join(' ')}"`], { cwd: input.cwd, shell: false, windowsHide: true, windowsVerbatimArguments: true })
        : spawn(file, args, { cwd: input.cwd, shell: false, windowsHide: true, detached: group });
    } catch (e) {
      return finish(fail('not_found', (e as Error).message, args));
    }
    if (group) { groups.add(child); child.on('close', () => groups.delete(child)).on('error', () => groups.delete(child)); }
    ctl.child = child;
    timer = setTimeout(() => { finish(fail('timeout', `${timeout} ms`, args)); killTree(child); }, timeout);
    child.on('error', (e) => finish(fail('not_found', e.message, args)));
    let stdout = '';
    let stderr = '';
    let buf = '';
    const onLine = (line: string) => {
      if (!line.trim()) return;
      let m: any;
      try { m = JSON.parse(line); } catch { return; }
      try { handler.line(m, ctx); } catch { /* foreign line */ }
    };
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
      if (mode.output === 'json') return;
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
    child.stdin?.on('error', () => {});
    child.stdin?.end(user);
    child.on('close', (code) => {
      if (ctl.stopped) return finish(fail('stopped', '', args));
      if (mode.output === 'json') { const m = parseJsonText(stdout); if (m && handler.whole) handler.whole(m, ctx); }
      else onLine(buf);
      const errText = `${stderr}\n${ctx.error}`;
      if (looksLikeLimit(errText)) return finish(fail('limit', errText.trim(), args));
      if (looksLikeAuth(errText) || (preset.format === 'gemini' && code === 41)) return finish(fail('auth', errText.trim(), args));
      if (ctx.error) return finish(fail('exit_code', ctx.error, args));
      if (code !== 0 && !ctx.gotResult && !ctx.text) return finish(fail('exit_code', `exit ${code}: ${stderr.trim()}`, args));
      if (!ctx.gotResult && !ctx.text) return finish(fail('bad_output', stderr.trim() || 'no result', args));
      const json = ctx.json ?? (input.schema !== undefined ? parseJsonText(ctx.text) : null);
      finish({ ok: true, text: ctx.text, json, session_id: ctx.session, tools: ctx.tools, name, args, ...(ctx.usage !== undefined ? { usage: ctx.usage } : {}), ...(ctx.cost !== undefined ? { total_cost_usd: ctx.cost } : {}) });
    });
  });
}

export function shortTarget(target: string): string {
  try {
    const u = new URL(target);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.hostname;
  } catch { /* not a URL */ }
  return target;
}

export type CallOpts = { ctl?: Ctl; onTool?: (t: Tool) => void; onDelta?: (text: string) => void; preset?: string; retry?: boolean };
// Topic check, exam and panel chat: a wrapper over runAgent with a call log. Check and exam answers are expected to follow the schema.
export async function callAgent(config: Config, request: AgentRequest, opts: CallOpts = {}): Promise<AgentResult> {
  const started = Date.now();
  const cwd = request.mode === 'check' ? join(config.dataDir, 'tmp') : request.workspace;
  const r = await runAgent(config, request.mode === 'chat'
    ? { mode: 'chat', user: request.user, resume: request.resume, cwd, timeout_ms: request.timeout_ms }
    : { mode: request.mode, system: request.system, user: request.user, schema: request.schema, cwd, timeout_ms: request.timeout_ms, ...(request.mode === 'session' ? { resume: request.resume } : {}) },
    { ctl: opts.ctl, preset: opts.preset, onEvent: (e) => { if (e.type === 'tool') opts.onTool?.(e.tool); else if (e.type === 'delta') opts.onDelta?.(e.text); } });
  const result: AgentResult = r.ok
    ? { ok: true, json: r.json, text: r.text, agent: r.name, ms: Date.now() - started, session_id: r.session_id, tools: r.tools, ...(r.usage !== undefined ? { usage: r.usage } : {}), ...(r.total_cost_usd !== undefined ? { total_cost_usd: r.total_cost_usd } : {}) }
    : { ok: false, error: r.error, detail: r.detail, tools: r.tools };
  appendLog(config, {
    at: new Date().toISOString(), mode: request.mode, step: request.step, preset: r.name, source: 'live', duration_ms: Date.now() - started,
    ok: result.ok, ...(result.ok ? {} : { error: result.error }), retry: opts.retry ?? false,
    ...(result.ok && result.usage !== undefined ? { usage: result.usage } : {}), ...(result.ok && result.total_cost_usd !== undefined ? { total_cost_usd: result.total_cost_usd } : {}),
    // Tools only for an exam: in the panel a search query or a command can repeat the learner's question.
    ...(request.mode === 'session' ? { tools: r.tools.map((t) => ({ name: t.name, target: shortTarget(t.target) })) } : {}),
  });
  return result;
}

function winQuote(a: string) {
  if (a === '') return '""';
  if (!/[\s"]/.test(a)) return a;
  return `"${a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

export type OptionStatus = { choices: string[]; free: boolean; value: string };
export type AgentHealth = { preset: string; title: string; found: boolean; version: string; install: string; scope: string; modes: ModeName[]; options: Record<string, OptionStatus> };

// Preset parameters with current values, for onboarding and the settings menu.
function optionStatus(config: Config, name: string, preset: Preset | null): Record<string, OptionStatus> {
  const values = loadPresets(config).values[name] ?? {};
  const out: Record<string, OptionStatus> = {};
  for (const [k, o] of Object.entries(preset?.options ?? {})) out[k] = { choices: o.choices ?? [], free: o.free === true, value: String(values[k] ?? '') };
  return out;
}

// Check that the agent is installed: `cmd --version` with a short timeout. No login, no model call, no network.
export function agentHealth(config: Config, forced?: string): Promise<AgentHealth> {
  const { name, preset } = resolvePreset(config, forced);
  const info = (found: boolean, version: string): AgentHealth => ({
    preset: name, title: preset?.title ?? name, found, version, install: preset?.install ?? '', scope: preset?.scope ?? '',
    modes: (['check', 'session', 'chat'] as ModeName[]).filter((m) => preset?.modes?.[m]), options: optionStatus(config, name, preset),
  });
  if (!preset) return Promise.resolve(info(false, ''));
  return new Promise((resolve) => {
    const { file, viaCmd } = resolveCmd(preset.cmd);
    const vargs = preset.version_args ?? ['--version'];
    let out = '';
    let child: ChildProcess;
    try {
      child = viaCmd ? nodeSpawn('cmd.exe', ['/d', '/s', '/c', `"${[file, ...vargs].join(' ')}"`], { windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'ignore'] })
        : nodeSpawn(file, vargs, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { return resolve(info(false, '')); }
    const t = setTimeout(() => { killTree(child); resolve(info(false, '')); }, 15_000);
    child.stdout?.on('data', (c) => { out += c; });
    child.on('error', () => { clearTimeout(t); resolve(info(false, '')); });
    child.on('close', (code) => { clearTimeout(t); resolve(info(code === 0, out.trim().split('\n')[0] ?? '')); });
  });
}

// Status of all presets for onboarding: what is installed and what is selected. Only `--version`, from the whitelist in agents.json.
export async function agentsStatus(config: Config): Promise<{ default: string; agents: AgentHealth[] }> {
  const { def } = loadPresets(config);
  const agents = await Promise.all(presetNames(config).map((n) => agentHealth(config, n)));
  return { default: def, agents };
}
