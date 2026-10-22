import type { AgentContext, ExamEvent, Session } from './types';

let token = '';

export async function initSession() {
  const s = (await (await fetch('/api/session')).json()) as Session;
  token = s.token;
  return s;
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-hub-token': token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!r.ok) throw new Error(data?.error ?? `${method} ${path}: ${r.status} ${text.slice(0, 200)}`);
  return data as T;
}

// SSE stream: the server answers a POST (chat) or GET (exam) with `data: {...}` events.
async function readSse(r: Response, onEvent: (e: any) => void) {
  if (!r.ok || !r.body) throw new Error(`stream: ${r.status}`);
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (data) onEvent(JSON.parse(data));
    }
  }
}

export type ChatEvent = { type: 'chat'; id: string } | { type: 'session'; id: string } | { type: 'delta'; text: string } | { type: 'done'; cost?: number } | { type: 'error'; message: string };
export type ChatCall = { template: 'explain' | 'task' | 'exam' | 'free'; question?: string; context?: AgentContext; sessionId?: string; key?: string; chatId?: string; lang?: 'ru' | 'en' };

export async function askAgent(call: ChatCall, onEvent: (e: ChatEvent) => void, signal: AbortSignal) {
  const r = await fetch('/api/agent/ask', { method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-hub-token': token }, body: JSON.stringify(call) });
  await readSse(r, onEvent);
}
export const openTerminal = (call: ChatCall) => api('POST', '/api/agent/terminal', call);

export async function examEvents(id: string, onEvent: (e: ExamEvent) => void, signal: AbortSignal) {
  const r = await fetch(`/api/exam/${id}/events`, { signal, headers: { 'x-hub-token': token } });
  await readSse(r, onEvent);
}
