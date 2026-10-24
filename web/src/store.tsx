import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, askAgent, initSession, openTerminal, type ChatCall } from './api';
import { type Key, tr } from './i18n';
import { GRADE_EPOCH } from './icons';
import { isGradeUnlocked } from '../../shared/pack';
import type { AdjacentLevel, AgentCall, AgentContext, Grade, Lang, Pack, ProbeResult, Session, State, Text, Topic, TopicState } from './types';

type AgentMsg = { role: 'user' | 'agent' | 'error'; text: string };
type AgentPanel = { open: boolean; context?: AgentContext; msgs: AgentMsg[]; sessionId?: string; chatId?: string; key?: string; template?: ChatCall['template']; busy: boolean };
export type SkySettings = { period: number; angle: number; flash: number; concurrent: number; flashes: boolean; enabled: boolean };
export const SKY_DEFAULTS: SkySettings = { period: 600, angle: 45, flash: 4, concurrent: 6, flashes: true, enabled: true };
export type ChatRow = { id: string; topic_key: string; template: string; title: string; lang: string; session_id: string; created_at: string; updated_at: string; messages: { id: number; role: string; text: string; at: string }[] };
const TEMPLATE_KEY: Record<ChatCall['template'], Key | ''> = { explain: 'tpl.explain', task: 'tpl.task', exam: 'tpl.exam', free: '' };
// A saved answer can be reopened instead of calling the agent: it is in the interface language (or was saved before chats kept one),
// has agent text and was not cut by "Stop" or an error (the chat then ends with an error row).
export const hasAnswer = (c: ChatRow, lang: Lang) => (c.lang === lang || !c.lang) && c.messages.some((m) => m.role === 'agent' && m.text) && c.messages.at(-1)?.role !== 'error';

export const ls = {
  get: (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } },
};

function useHub() {
  const [pack, setPack] = useState<Pack | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  // One language for the UI and package texts: English by default, chosen on first launch, stored in the browser.
  const [lang, setLangState] = useState<Lang>(() => (ls.get('hub.lang', 'en') === 'ru' ? 'ru' : 'en'));
  const [setup, setSetupState] = useState<boolean>(() => ls.get('hub.setup', '') === '1');
  const [track, setTrackState] = useState<string>(ls.get('hub.track', 'python'));
  const [sky, setSkyState] = useState<SkySettings>(() => { try { return { ...SKY_DEFAULTS, ...JSON.parse(ls.get('hub.sky', '{}')) }; } catch { return SKY_DEFAULTS; } });
  const setSky = useCallback((patch: Partial<SkySettings>) => setSkyState((cur) => { const next = { ...cur, ...patch }; ls.set('hub.sky', JSON.stringify(next)); return next; }), []);
  const [agent, setAgent] = useState<AgentPanel>({ open: false, msgs: [], busy: false });
  const abortRef = useRef<AbortController | null>(null);
  // Probes of era I (terminal, Node, git, agent) and the "check the call" result: they live on the server, here is a copy for the journal.
  const [probes, setProbes] = useState<ProbeResult[] | null>(null);
  const [agentCall, setAgentCall] = useState<AgentCall | null>(null);

  const reload = useCallback(async () => setState(await api<State>('GET', '/api/state')), []);
  const refreshSession = useCallback(async () => setSession(await initSession()), []);
  const refreshProbes = useCallback(async () => {
    const r = await api<{ probes: ProbeResult[]; agentCall: AgentCall | null }>('GET', '/api/probes');
    setProbes(r.probes); if (r.agentCall) setAgentCall(r.agentCall);
    await reload();
  }, [reload]);
  const checkAgentCall = useCallback(async () => {
    const r = await api<Omit<AgentCall, 'at'>>('POST', '/api/agents/check');
    const call = { ...r, at: new Date().toISOString() };
    setAgentCall(call);
    return call;
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const s = await initSession();
        setSession(s);
        if (!ls.get('hub.lang', '')) setLangState(s.lang); // not chosen yet: the hub default (STUDY_HUB_LANG) until the first-run choice
        setPack(await api<Pack>('GET', '/api/pack'));
        await reload();
        // probes after the first render: they can light stars, so the state is re-read after them
        api<{ probes: ProbeResult[]; agentCall: AgentCall | null }>('GET', '/api/probes').then(async (r) => { setProbes(r.probes); if (r.agentCall) setAgentCall(r.agentCall); await reload(); }).catch(() => {});
      } catch (e) { setError(String(e)); }
    })();
  }, [reload]);

  const ui = useCallback((k: Key, vars?: Record<string, string | number>) => tr(lang, k, vars), [lang]);
  useEffect(() => { document.documentElement.lang = lang; document.title = tr(lang, 'app.name'); }, [lang]);
  const setLang = (l: Lang) => { ls.set('hub.lang', l); setLangState(l); };
  // After first launch the tree opens on the first era: its stars are already lit by probes, the evolution is open.
  const finishSetup = () => {
    ls.set('hub.setup', '1');
    ls.set('hub.lang', lang); // the language shown on the first run is the choice, even without pressing its button
    const first = pack ? [...pack.grades].sort((a, b) => a.order - b.order)[0] : null;
    if (first) { ls.set('hub.tree.focus', first.id); try { localStorage.removeItem('hub.tree.sel'); } catch { /* private window */ } }
    setSetupState(true);
    void refreshProbes().catch(() => {});
  };
  const reopenSetup = () => setSetupState(false);
  const setTrack = (t: string) => { ls.set('hub.track', t); setTrackState(t); };
  const t = useCallback((x?: Text) => (x ? x[lang] || x.en || x.ru : ''), [lang]);

  const setTopic = useCallback(async (key: string, patch: Partial<TopicState>) => {
    const blank: TopicState = { status: 'not_started', learnedAt: null, note: '', hours: null };
    setState((s) => s && { ...s, topics: { ...s.topics, [key]: { ...blank, ...s.topics[key], ...patch } } });
    await api('PUT', '/api/topic', { key, ...patch }).catch((e) => setError(String(e)));
  }, []);

  const saveRow = useCallback(async (list: 'journal' | 'radar' | 'adr', row: Record<string, unknown>, id?: number) => {
    await api(id ? 'PUT' : 'POST', `/api/list/${list}${id ? `/${id}` : ''}`, row);
    await reload();
  }, [reload]);
  const deleteRow = useCallback(async (list: 'journal' | 'radar' | 'adr', id: number) => {
    await api('DELETE', `/api/list/${list}/${id}`);
    await reload();
  }, [reload]);

  // Mentor conversations are stored on the server per topic. Repeating "Explain" opens the saved answer, the agent is not called;
  // a new call only via the "Redo" button (force). Closing the panel does not interrupt the stream.
  const [chats, setChats] = useState<Record<string, ChatRow[]>>({});
  const loadChats = useCallback(async (key: string) => {
    const r = await api<{ chats: ChatRow[] }>('GET', `/api/chats?key=${encodeURIComponent(key)}`);
    setChats((c) => ({ ...c, [key]: r.chats }));
    return r.chats;
  }, []);
  const openChat = useCallback((ch: ChatRow, context?: AgentContext) => {
    setAgent({ open: true, busy: false, context, sessionId: ch.session_id || undefined, chatId: ch.id, key: ch.topic_key, template: ch.template as ChatCall['template'],
      msgs: ch.messages.map((m) => ({ role: m.role as AgentMsg['role'], text: m.text })) });
  }, []);
  const ask = useCallback(async (template: ChatCall['template'], context?: AgentContext, question?: string, followUp = false, opts: { key?: string; force?: boolean } = {}) => {
    const key = followUp ? agent.key ?? '' : opts.key ?? '';
    if (!followUp && !opts.force && !question && key) {
      const list = chats[key] ?? (await loadChats(key).catch(() => []));
      const saved = list.find((c) => c.template === template && hasAnswer(c, lang));
      if (saved) { openChat(saved, context); return; }
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const sessionId = followUp ? agent.sessionId : undefined;
    const chatId = followUp ? agent.chatId : undefined;
    const label = TEMPLATE_KEY[template] ? tr(lang, TEMPLATE_KEY[template] as Key) : '';
    const userText = [label, question].filter(Boolean).join(': ') || '…';
    setAgent((a) => ({
      open: true, busy: true, context: followUp ? a.context : context, sessionId, chatId, key, template,
      msgs: [...(followUp ? a.msgs : []), { role: 'user', text: followUp ? userText : `${context?.title ? `«${context.title}» — ` : ''}${userText}` }, { role: 'agent', text: '' }],
    }));
    const push = (fn: (last: AgentMsg) => AgentMsg) => setAgent((a) => ({ ...a, msgs: [...a.msgs.slice(0, -1), fn(a.msgs[a.msgs.length - 1])] }));
    try {
      await askAgent({ template, question, context: followUp ? undefined : context, sessionId, key, chatId, lang }, (e) => {
        if (e.type === 'chat') setAgent((a) => ({ ...a, chatId: e.id }));
        else if (e.type === 'session') setAgent((a) => ({ ...a, sessionId: e.id }));
        else if (e.type === 'delta') push((m) => ({ ...m, text: m.text + e.text }));
        else if (e.type === 'error') setAgent((a) => ({ ...a, msgs: [...a.msgs, { role: 'error', text: e.message }] }));
      }, ac.signal);
    } catch (e) {
      if (!ac.signal.aborted) setAgent((a) => ({ ...a, msgs: [...a.msgs, { role: 'error', text: String(e) }] }));
    }
    setAgent((a) => ({ ...a, busy: false }));
    if (key) void loadChats(key);
  }, [agent.sessionId, agent.chatId, agent.key, chats, loadChats, openChat, lang]);
  const toTerminal = useCallback(async (template: ChatCall['template'], context?: AgentContext, question?: string) => {
    await openTerminal({ template, context, question, lang }).catch((e) => setError(String(e)));
  }, [lang]);
  const resumeInTerminal = useCallback(async () => {
    if (agent.sessionId) await openTerminal({ template: 'free', sessionId: agent.sessionId, lang }).catch((e) => setError(String(e)));
  }, [agent.sessionId, lang]);
  // Closing the panel only hides it: the agent keeps working, the answer is saved on the server. Stopping is a separate button:
  // the server kills the agent process and keeps the answer so far.
  const closeAgent = useCallback(() => setAgent((a) => ({ ...a, open: false })), []);
  const stopAgent = useCallback(() => {
    if (agent.chatId) void api('POST', `/api/chat/${agent.chatId}/stop`).catch(() => {}); // 409: already finished
    abortRef.current?.abort();
    setAgent((a) => ({ ...a, busy: false }));
  }, [agent.chatId]);

  return { pack, state, session, refreshSession, error, setError, reload, lang, setLang, ui, t, setup, finishSetup, reopenSetup, track, setTrack, setTopic, saveRow, deleteRow, agent, ask, toTerminal, resumeInTerminal, closeAgent, stopAgent, chats, loadChats, openChat, sky, setSky, probes, refreshProbes, agentCall, checkAgentCall };
}

const Ctx = createContext<ReturnType<typeof useHub> | null>(null);
export function HubProvider({ children }: { children: ReactNode }) {
  const hub = useHub();
  return <Ctx.Provider value={hub}>{children}</Ctx.Provider>;
}
export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('HubProvider missing');
  return v;
}

// ---- package and progress helpers ----
export const levelKey = (lv: { area: string; level: string }) => `${lv.area}/${lv.level}`;
export const gradeTopics = (g: Grade): Topic[] => [...g.core, ...g.adjacent.flatMap((a) => a.topics)];

// The server's lock rule (shared/pack.ts) on the progress the interface holds.
export const isUnlocked = (pack: Pack, gradeId: string, state: State | null): boolean => isGradeUnlocked(pack, gradeId, state?.exams ?? {});
// Era is closed: the evolution is passed, or, for an era without one, all topics are studied (probes or checkboxes).
export function gradeDone(g: Grade, state: State | null): boolean {
  if (g.gate === 'none') { const ts = gradeTopics(g); return ts.length > 0 && ts.every((t) => state?.topics[t.key]?.status === 'learned'); }
  return !!state?.exams[g.id]?.passed;
}
export const epochOf = (g: Grade) => GRADE_EPOCH[g.order] ?? String(g.order + 1);

export function progress(topics: Topic[], st: State | null) {
  const learned = topics.filter((t) => st?.topics[t.key]?.status === 'learned').length;
  const minutes = topics.reduce((s, t) => s + t.minutes_total, 0);
  return { total: topics.length, learned, pct: topics.length ? Math.round((learned / topics.length) * 100) : 0, hours: Math.round(minutes / 6) / 10 };
}

export function useCurrentGrade() {
  const { pack, state } = useStore();
  return useMemo(() => pack?.grades.find((g) => !gradeDone(g, state)) ?? pack?.grades[pack.grades.length - 1], [pack, state]);
}

export function topicContext(t: Topic, lang: Lang, note?: string, gradeId?: string): AgentContext {
  const tx = (x: Text) => x[lang] || x.en || x.ru;
  return { title: tx(t.title), summary: tx(t.goal), grade: gradeId, criteria: t.criteria[lang], note, links: t.materials.slice(0, 8).map((m) => ({ title: m.title, url: m.url })) };
}

export function allTopics(pack: Pack): { topic: Topic; grade: Grade; level?: AdjacentLevel }[] {
  return pack.grades.flatMap((g) => [...g.core.map((topic) => ({ topic, grade: g })), ...g.adjacent.flatMap((level) => level.topics.map((topic) => ({ topic, grade: g, level })))]);
}

// UI scale factor (CSS zoom on .app): divide screen pixels by it to get UI coordinates.
export function uiZoom(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--z'));
  return Number.isFinite(v) && v > 0 ? v : 1;
}
