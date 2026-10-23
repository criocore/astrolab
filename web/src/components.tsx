import { Check, Circle, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Markdown } from './markdown';
import { api, examEvents } from './api';
import { explainError, type Key, tr, type Lang } from './i18n';
import { gradeTopics, isUnlocked, topicContext, useStore } from './store';
import type { AgentContext, AttemptResult, CheckHistory, ExamRow, Grade, Material, Question, Topic } from './types';

export function Bar({ pct, label }: { pct: number; label?: string }) {
  return (
    <div className="bar" title={label ?? `${pct}%`}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
      {label && <span className="bar-label">{label}</span>}
    </div>
  );
}

const STATUS_KEY: Record<string, Key | ''> = { not_started: '', in_progress: 'status.in_progress', gap: 'status.gap', learned: 'status.learned' };

export function AgentButtons({ context, exam, topicKey }: { context: AgentContext; exam?: boolean; topicKey?: string }) {
  const { ask, toTerminal, session, chats, loadChats, openChat, ui } = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const off = session ? !session.agent.found : false;
  const key = topicKey ?? (exam ? `exam:${context.grade}` : '');
  useEffect(() => { if (key && !chats[key]) void loadChats(key).catch(() => {}); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = (tpl: string) => (chats[key] ?? []).find((c) => c.template === tpl && c.messages.some((m) => m.role === 'agent' && m.text));
  const mark = (tpl: string) => (saved(tpl) ? ' ✓' : '');
  const opts = { key };
  const others = (chats[key] ?? []).filter((c) => c.template === 'free' && c.messages.some((m) => m.role === 'agent' && m.text));
  return (
    <span className="agent-btns">
      {exam ? <button className="btn ghost" disabled={off && !saved('exam')} onClick={() => ask('exam', context, undefined, false, opts)} title={saved('exam') ? ui('agent.saved.t') : ui('agent.panel.t')}>{ui('agent.prep')}{mark('exam')}</button> : (
        <>
          <button className="btn ghost" disabled={off && !saved('explain')} onClick={() => ask('explain', context, undefined, false, opts)} title={saved('explain') ? ui('agent.saved.t') : ui('agent.panel.t')}>{ui('agent.explain')}{mark('explain')}</button>
          <button className="btn ghost" disabled={off && !saved('task')} onClick={() => ask('task', context, undefined, false, opts)} title={saved('task') ? ui('agent.saved.t') : ''}>{ui('agent.task')}{mark('task')}</button>
        </>
      )}
      <button className="btn ghost" disabled={off} onClick={() => setOpen((v) => !v)}>{ui('agent.ask')}</button>
      {others.length > 0 && <button className="btn ghost" onClick={() => openChat(others[0], context)} title={ui('agent.chats.t')}>{ui('agent.chats', { n: others.length })}</button>}
      <button className="btn ghost" disabled={off} onClick={() => toTerminal(exam ? 'exam' : 'explain', context, q || undefined)} title={ui('agent.terminal.t')}>{ui('agent.terminal')}</button>
      {open && (
        <form className="ask-inline" onSubmit={(e) => { e.preventDefault(); if (q.trim()) { ask('free', context, q.trim(), false, opts); setQ(''); setOpen(false); } }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={ui('agent.q.ph')} />
          <button className="btn">{ui('agent.send')}</button>
        </form>
      )}
    </span>
  );
}

function MaterialRow({ m, lang }: { m: Material; lang: Lang }) {
  const { ui } = useStore();
  const date = m.date ?? (m.classic ? ui('mat.classic') : ui('mat.checked', { d: m.checked_at }));
  return (
    <li className={m.repeat_of ? 'material repeat' : 'material'}>
      <span className={`chip kind-${m.kind}`}>{m.kind === 'do' ? ui('kind.do') : ui('kind.understand')}</span>
      <a href={m.url} target="_blank" rel="noreferrer">{m.title}</a>
      <span className="chip muted">{m.type}</span>
      <span className="chip muted">{ui('min.n', { n: m.minutes })}</span>
      {m.track && <span className="chip">{m.track}</span>}
      {m.access !== 'free' && <span className="chip warn">{m.access}</span>}
      <span className="muted small"> · {date} · {m.terms}</span>
      <div className="small closes">{m.closes[lang] || m.closes.en || m.closes.ru}</div>
      {m.repeat_of && <div className="small muted">{ui('mat.repeat', { t: m.repeat_of.title[lang] || m.repeat_of.title.en || m.repeat_of.title.ru })}</div>}
    </li>
  );
}

export function TopicRow({ topic, gradeId, defaultOpen = false }: { topic: Topic; gradeId: string; defaultOpen?: boolean }) {
  const { pack, state, setTopic, lang, t, ui, track } = useStore();
  const st = state?.topics[topic.key];
  const [open, setOpen] = useState(defaultOpen);
  const [note, setNote] = useState(st?.note ?? '');
  const [showText, setShowText] = useState<string | null>(null);
  if (!pack) return null;
  const unlocked = isUnlocked(pack, gradeId, state);
  const hasTrack = topic.materials.some((x) => x.track === track);
  const mats = topic.materials.filter((m) => !m.track || !hasTrack || m.track === track);
  const minutes = topic.minutes_by_track?.[track] ?? topic.minutes_total;
  const status = st?.status ?? 'not_started';
  const statusKey = STATUS_KEY[status];
  return (
    <div className={`item status-${status}`}>
      <div className="item-row">
        <button className="twisty" onClick={() => setOpen((v) => !v)} aria-label={ui('topic.more')}>{open ? '▾' : '▸'}</button>
        <span className="item-title link" onClick={() => setOpen((v) => !v)}>{t(topic.title)}</span>
        {statusKey && <span className={`chip st-${status}`}>{ui(statusKey)}</span>}
        {status === 'not_started' && !topic.probe && <button className="btn tiny" onClick={() => setTopic(topic.key, { status: 'in_progress' })}>{ui('topic.take')}</button>}
        <span className="chip muted" title={ui('topic.minutes.t')}>{ui('min.n', { n: minutes })}</span>
        {st?.hours != null && <span className="chip muted" title={ui('topic.hours.t')}>{ui('hours.n', { n: st.hours })}</span>}
        {st?.note ? <span className="chip note-dot" title={st.note}>✎</span> : null}
      </div>
      {open && (
        <div className="item-body">
          <p className="summary">{t(topic.goal)}</p>
          <ol className="criteria">{topic.criteria[lang].map((c, i) => <li key={i}>{c}</li>)}</ol>
          <ul className="materials">{mats.map((m) => <MaterialRow key={m.id} m={m} lang={lang} />)}</ul>
          {topic.own_texts?.map((o) => (
            <div key={o.id} className="own-text">
              <span className={`chip kind-${o.kind}`}>{o.kind === 'do' ? ui('kind.do') : ui('kind.understand')}</span>
              <b className="link" onClick={() => setShowText(showText === o.id ? null : o.id)}>{t(o.title)}</b> <span className="chip muted">{ui('min.n', { n: o.minutes })}</span> <span className="muted small">{ui('own.text', { terms: o.terms })}</span>
              {showText === o.id && <div className="own-body"><Markdown text={t(o.body)} /></div>}
            </div>
          ))}
          {topic.refs?.map((r) => (
            <div key={r.id} className="small">↪ {t(r.closes)} <span className="muted">({ui('ref.topic', { k: r.topic })}{r.title ? `: ${t(r.title)}` : ''})</span></div>
          ))}
          <div className="row">
            <textarea className="note grow" rows={2} placeholder={ui('note.ph')} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (st?.note ?? '') && setTopic(topic.key, { note })} />
            <label className="hours" title={ui('topic.hours.t')}>{ui('hours.label')} <input type="number" min={0} step={0.5} value={st?.hours ?? ''} placeholder={ui('hours.label')} onChange={(e) => setTopic(topic.key, { hours: e.target.value === '' ? null : Number(e.target.value) })} /></label>
          </div>
          <AgentButtons context={topicContext(topic, lang, st?.note, gradeId)} topicKey={topic.key} />
          {topic.probe ? <ProbeLine topic={topic} /> : unlocked ? <CheckFlow topic={topic} /> : <p className="muted small">{ui('topic.locked')}</p>}
        </div>
      )}
    </div>
  );
}

// Topic of an era without an evolution: instead of a mentor check, a hub probe row or a "read" checkbox.
function ProbeLine({ topic }: { topic: Topic }) {
  const { ui, state, setTopic, probes, refreshProbes } = useStore();
  const learned = state?.topics[topic.key]?.status === 'learned';
  const [busy, setBusy] = useState(false);
  if (topic.probe === 'manual') {
    return (
      <label className="probe-line manual">
        <input type="checkbox" checked={learned} onChange={(e) => setTopic(topic.key, { status: e.target.checked ? 'learned' : 'not_started' })} /> {ui('probe.manual.tick')}
      </label>
    );
  }
  const r = probes?.find((p) => p.topic === topic.key);
  const ok = r ? r.ok : learned;
  return (
    <div className={`probe-line ${ok ? 'ok' : ''}`}>
      {ok ? <Check size={14} /> : <Circle size={14} />} <span>{ok ? ui('probe.ok') : ui('probe.missing')}</span>{r?.detail && <span className="muted small">· {r.detail}</span>}
      <span className="muted small">· {ui('probe.hub.note')}</span>
      {!ok && <button className="btn tiny" disabled={busy} onClick={async () => { setBusy(true); await refreshProbes().catch(() => {}); setBusy(false); }}><RefreshCw size={12} /> {ui('probe.recheck')}</button>}
    </div>
  );
}

// Workplace journal: opens instead of the evolution for an era without an exam. Words about the first step, probe rows, "check the call".
export function WorkstationLog({ grade, onOpenTopic }: { grade: Grade; onOpenTopic?: (tp: Topic, g: Grade) => void }) {
  const { ui, t, lang, state, session, probes, refreshProbes, agentCall, checkAgentCall } = useStore();
  const [busy, setBusy] = useState<'probes' | 'call' | null>(null);
  const topics = gradeTopics(grade);
  const lit = (tp: Topic) => state?.topics[tp.key]?.status === 'learned';
  const left = topics.filter((tp) => !lit(tp));
  const callLine = agentCall ? (agentCall.ok ? `${ui('probe.call.ok', { ms: agentCall.ms })} · ${ui('probe.call.via', { d: agentCall.at.slice(0, 16).replace('T', ' ') })}` : ui('probe.call.err', { e: explainError(agentCall.error ?? '', lang) })) : ui('probe.agent.unknown');
  return (
    <section className="card workstation">
      <div className="first-step">
        <h3>{ui('first.title')}</h3>
        <Markdown text={ui('first.body')} />
      </div>
      <div className="ss-kicker">{ui('probe.title')}</div>
      <ul className="probe-log">
        {topics.map((tp) => { const r = probes?.find((p) => p.topic === tp.key); const ok = lit(tp); return (
          <li key={tp.key} className={`probe-line ${ok ? 'ok' : ''}`}>
            {ok ? <Check size={14} /> : <Circle size={14} />}
            <span className="link" onClick={() => onOpenTopic?.(tp, grade)}>{t(tp.title)}</span>
            <span className="muted small">{ok ? ui('probe.ok') : ui('probe.missing')}{r?.detail ? ` · ${r.detail}` : ''}</span>
          </li>); })}
        <li className={`probe-line ${agentCall?.ok ? 'ok' : ''}`}>
          {agentCall?.ok ? <Check size={14} /> : <Circle size={14} />}
          <span>{ui('probe.agent.answers')}</span>
          <span className="muted small">{callLine}</span>
        </li>
      </ul>
      <div className="row">
        <button className="btn ghost" disabled={busy !== null} onClick={async () => { setBusy('probes'); await refreshProbes().catch(() => {}); setBusy(null); }}><RefreshCw size={12} /> {ui('probe.recheck')}</button>
        <button className="btn" disabled={busy !== null || !session?.agent.found} title={ui('probe.call.note')} onClick={async () => { setBusy('call'); await checkAgentCall().catch(() => {}); setBusy(null); }}>{busy === 'call' ? ui('panel.thinking') : ui('probe.call')}</button>
        <span className="muted small">{ui('probe.call.note')}</span>
      </div>
      {left.length > 0 && <div className="small muted">{ui('probe.left')}: {left.map((tp) => <span key={tp.key} className="chip link" onClick={() => onOpenTopic?.(tp, grade)}>{t(tp.title)}</span>)}</div>}
    </section>
  );
}

// Topic check by the mentor: questions → answers → verdict with a quote.
function CheckFlow({ topic }: { topic: Topic }) {
  const { lang, ui, reload, session, setError } = useStore();
  const [check, setCheck] = useState<{ id: string; questions: Question[]; source: string } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, AttemptResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<CheckHistory[] | null>(null);
  const off = session ? !session.agent.found && session.mentorMode !== 'replay' : false;

  const start = async () => {
    setBusy('check'); setResults({}); setAnswers({});
    try {
      const r = await api<{ check_id: string; questions: Question[]; source: string }>('POST', '/api/topic/check', { key: topic.key, lang });
      setCheck({ id: r.check_id, questions: r.questions, source: r.source });
      await reload();
    } catch (e) { setError(explainError(String(e), lang)); }
    setBusy(null);
  };
  const submit = async (q: Question) => {
    if (!check || !answers[q.id]?.trim()) return;
    setBusy(q.id);
    try {
      const r = await api<AttemptResult>('POST', `/api/check/${check.id}/attempt`, { question_id: q.id, answer: answers[q.id] });
      setResults((x) => ({ ...x, [q.id]: r }));
      await reload();
    } catch (e) { setError(explainError(String(e), lang)); }
    setBusy(null);
  };
  const loadHistory = async () => setHistory((await api<{ checks: CheckHistory[] }>('GET', `/api/topic/history?key=${encodeURIComponent(topic.key)}`)).checks);

  return (
    <div className="check">
      <div className="row">
        <button className="btn" disabled={!!busy || off} onClick={start}>{check ? ui('check.new') : ui('check.start')}</button>
        <button className="btn ghost" onClick={loadHistory}>{ui('check.history')}</button>
        {busy === 'check' && <span className="muted">{ui('check.writing')}</span>}
        {off && <span className="muted small">{ui('check.off')}</span>}
      </div>
      {check && check.questions.map((q) => {
        const r = results[q.id];
        return (
          <div key={q.id} className={`question ${r ? `v-${r.verdict}` : ''}`}>
            <p><b>{q.text}</b></p>
            {!r || r.verdict === 'gap' ? (
              <>
                <textarea rows={3} value={answers[q.id] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} placeholder={ui('check.answer.ph')} maxLength={4000} />
                <button className="btn" disabled={busy !== null} onClick={() => submit(q)}>{busy === q.id ? ui('check.reading') : ui('check.send')}</button>
              </>
            ) : null}
            {r && (
              <div className="verdict">
                <span className={`chip v-${r.verdict}`}>{r.verdict === 'pass' ? ui('verdict.pass') : ui('verdict.gap')}</span> <q>{r.quote}</q>
                {r.gap && <p>{r.gap}</p>}
                {r.material && <p>{ui('check.close')} <a href={r.material.url} target="_blank" rel="noreferrer">{r.material.title}</a></p>}
                <div className="muted"><Markdown text={r.feedback} /></div>
                {r.status === 'learned' && <p className="ok">{ui('check.learned')}</p>}
              </div>
            )}
          </div>
        );
      })}
      {history && (
        <div className="history">
          {history.length === 0 && <p className="muted small">{ui('check.none')}</p>}
          {history.map((h) => (
            <div key={h.id} className="small">
              <b>{h.created_at.slice(0, 16).replace('T', ' ')}</b> · {ui('check.row', { n: h.questions.length })} · {ui('check.attempts', { a: h.attempts.length, p: h.attempts.filter((a) => a.verdict === 'pass').length })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Grade exam or level check against the artifact folder.
export function ExamCard({ kind, target, title, task, gradeId }: { kind: 'grade' | 'level'; target: string; title: string; task: string; gradeId: string }) {
  const { pack, state, lang, t, ui, reload, session, setError } = useStore();
  const ex = state?.exams[target];
  const [folder, setFolder] = useState(ex?.last?.folder ?? '');
  const [running, setRunning] = useState<string | null>(null);
  const [tools, setTools] = useState<string[]>([]);
  const [result, setResult] = useState<ExamRow | null>(ex?.last ?? null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  if (!pack) return null;
  const unlocked = isUnlocked(pack, gradeId, state);
  const off = session ? !session.agent.found && session.mentorMode !== 'replay' : false;
  const start = async () => {
    setTools([]); setResult(null);
    try {
      const r = await api<{ exam_id: string }>('POST', '/api/exam', { kind, target, folder, lang });
      setRunning(r.exam_id);
      const ac = new AbortController(); abortRef.current = ac;
      await examEvents(r.exam_id, (e) => {
        if (e.type === 'tool') setTools((x) => [...x, `${e.name} ${e.target}`].slice(-200));
        else if (e.type === 'done') setResult(e.exam);
        else if (e.type === 'error') setError(explainError(e.error, lang) + (e.detail ? `: ${e.detail}` : ''));
      }, ac.signal);
      await reload();
    } catch (e) { setError(explainError(String(e), lang)); }
    setRunning(null);
  };
  const stop = async () => { if (running) await api('POST', `/api/exam/${running}/stop`).catch(() => {}); };
  const critText = (id: string) => {
    const [key, n] = id.split('#');
    if (kind === 'grade') {
      const c = pack.grades.find((x) => x.id === key)?.checks?.[lang]?.[Number(n) - 1];
      if (c) return c;
    }
    const topic = pack.grades.flatMap((g) => [...g.core, ...g.adjacent.flatMap((a) => a.topics)]).find((x) => x.key === key);
    return topic ? `${t(topic.title)}: ${topic.criteria[lang][Number(n) - 1] ?? ''}` : id;
  };
  return (
    <section className={`card exam ${ex?.passed ? 'passed' : ''}`}>
      <h3>{kind === 'grade' ? ui('exam.title') : ui('level.check')} {title} {ex?.passed && <span className="chip st-learned">{ui('exam.passed')}</span>}</h3>
      <p>{task}</p>
      {!unlocked ? <p className="muted small">{ui('exam.locked')}</p> : (
        <div className="row">
          <input className="grow" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder={ui('exam.folder.ph')} />
          {running ? <button className="btn ghost" onClick={stop}>{ui('exam.stop')}</button> : <button className="btn" disabled={!folder.trim() || off} onClick={start}>{ui('exam.submit')}</button>}
        </div>
      )}
      <p className="muted small">{ui('exam.note')}</p>
      {running && <div className="tools small muted">{tools.length ? tools.map((x, i) => <div key={i}>{x}</div>) : ui('exam.opening')}</div>}
      {result?.verdict && (
        <div className="verdict">
          <p><span className={`chip v-${result.verdict.verdict}`}>{result.passed ? ui('exam.passed') : ui('exam.failed')}</span> <span className="muted small">{result.at.slice(0, 16).replace('T', ' ')} · {result.source === 'record' ? ui('src.record') : ui('src.live')}</span></p>
          <p>{result.verdict.feedback}</p>
          {!!result.verdict.next_steps?.length && <ul>{result.verdict.next_steps.map((s, i) => <li key={i}>{s}</li>)}</ul>}
          <table className="checks">
            <tbody>
              {result.verdict.checks.map((c) => (
                <tr key={c.id} className={`v-${c.verdict}`}>
                  <td><span className={`chip v-${c.verdict}`}>{c.verdict === 'pass' ? ui('chk.pass') : c.verdict === 'gap' ? ui('chk.gap') : ui('chk.unclear')}</span></td>
                  <td>{critText(c.id)}<div className="muted small">{c.note}</div>{c.evidence.path && <div className="small"><code>{c.evidence.path}</code> <q>{c.evidence.quote}</q></div>}{c.verified === false && <div className="small"><span className="chip v-gap">{ui('chk.unverified')}</span></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {kind === 'grade' && <AgentButtons exam context={{ title: ui('exam.ctx', { t: title }), grade: gradeId, exam: task }} />}
    </section>
  );
}

export function AgentPanel() {
  const { agent, ask, closeAgent, stopAgent, resumeInTerminal, session, ui } = useStore();
  const [q, setQ] = useState('');
  if (!agent.open) return null;
  const canRedo = !agent.busy && agent.template && agent.template !== 'free' && agent.context;
  return (
    <aside className="agent-panel">
      <header>
        <strong>{ui('panel.title', { p: session?.agent.title ?? session?.agent.preset ?? 'agent' })}</strong>
        {session && Object.values(session.agent.options ?? {}).some((o) => o.value) && <span className="muted small">{Object.values(session.agent.options).map((o) => o.value).filter(Boolean).join(' · ')}</span>}
        <span className="spacer" />
        {agent.busy ? <button className="btn ghost" onClick={stopAgent} title={ui('panel.stop.t')}>{ui('panel.stop')}</button>
          : canRedo ? <button className="btn ghost" onClick={() => ask(agent.template!, agent.context, undefined, false, { key: agent.key, force: true })} title={ui('panel.redo.t')}>{ui('panel.redo')}</button> : null}
        {agent.sessionId && <button className="btn ghost" onClick={resumeInTerminal} title={ui('panel.terminal.t')}>{ui('agent.terminal')}</button>}
        <button className="btn ghost" onClick={closeAgent} title={ui('panel.close.t')}>✕</button>
      </header>
      <div className="msgs">
        {agent.msgs.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.role === 'agent' && m.text ? <Markdown text={m.text} /> : (m.text || (agent.busy && i === agent.msgs.length - 1 ? ui('panel.thinking') : ''))}</div>)}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim() && !agent.busy) { ask('free', undefined, q.trim(), true); setQ(''); } }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={agent.busy ? ui('panel.busy.ph') : ui('panel.ask.ph')} disabled={agent.busy} />
        <button className="btn" disabled={agent.busy}>→</button>
      </form>
      <footer className="muted small">{ui('panel.foot')}</footer>
    </aside>
  );
}
