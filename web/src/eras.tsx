// Era tree in the spirit of Civilization: one era is unrolled as a scroll (core, then area levels), the rest are collapsed into spines.
// On a phone the eras run top to bottom. The expanded era and expanded levels are remembered and restored on return.
import { Check, ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StarSheet, type FreeZone, type Sel } from './starsheet';
import { Emblem, LANES, LaneEmblem, LaneIcon, laneOfArea, type LaneId } from './icons';
import { areaLabel } from './i18n';
import { epochOf, gradeDone, gradeTopics, isUnlocked, levelKey, progress, uiZoom, useStore } from './store';
import type { AdjacentLevel, Grade, Pack, State, Topic } from './types';
import './eras.css';

type NodeStatus = 'locked' | 'open' | 'progress' | 'gap' | 'done';

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } },
};

function topicStatus(t: Topic, g: Grade, pack: Pack, state: State | null): NodeStatus {
  const s = state?.topics[t.key]?.status;
  if (s === 'learned') return 'done';
  if (!isUnlocked(pack, g.id, state)) return 'locked';
  return s === 'gap' ? 'gap' : s === 'in_progress' ? 'progress' : 'open';
}

// Prerequisites match the server lock: everything in a grade (topics, levels, level check, evolution) waits for the previous grade's exam.
function buildPrereq(pack: Pack) {
  const pre = new Map<string, string[]>();
  const grades = [...pack.grades].sort((a, b) => a.order - b.order);
  grades.forEach((g, i) => {
    if (!i || grades[i - 1].gate === 'none') return; // an era without an evolution locks nothing
    const gate = [`exam:${grades[i - 1].id}`];
    for (const t of gradeTopics(g)) pre.set(t.key, gate);
    for (const lv of g.adjacent) pre.set(`level:${levelKey(lv)}`, gate);
    pre.set(`exam:${g.id}`, gate);
  });
  return pre;
}

function Ring({ n, done, size = 34 }: { n: number; done: boolean; size?: number }) {
  const r = size / 2 - 3; const c = size / 2; const gap = 0.3;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring-svg" aria-hidden="true">
      <circle cx={c} cy={c} r={r} className="ring-bg" />
      {Array.from({ length: n }, (_, i) => {
        const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / n + gap / 2, a1 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / n - gap / 2;
        return <path key={i} d={`M ${c + Math.cos(a0) * r} ${c + Math.sin(a0) * r} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${c + Math.cos(a1) * r} ${c + Math.sin(a1) * r}`} className={`ring-seg ${done ? 'on' : ''}`} />;
      })}
      {done ? <Check size={size * 0.45} x={c - size * 0.225} y={c - size * 0.225} className="ring-check" /> : null}
    </svg>
  );
}

type HoverFn = (id: string | null, e?: React.MouseEvent) => void;

function TechCard({ t, status, onPath, onHover, onClick, refCb }: { t: Topic; status: NodeStatus; onPath: boolean; onHover: HoverFn; onClick: () => void; refCb: (el: HTMLElement | null) => void }) {
  const { t: tx, ui, lang, track } = useStore();
  const mats = t.materials.filter((m) => !m.track || m.track === track || !t.materials.some((x) => x.track === track));
  const doN = mats.filter((m) => m.kind === 'do').length + (t.own_texts?.filter((o) => o.kind === 'do').length ?? 0);
  const minutes = t.minutes_by_track?.[track] ?? t.minutes_total;
  const lane: LaneId = t.area ? laneOfArea(t.area) : 'core';
  return (
    <div ref={refCb} className={`tech ${status} ${onPath ? 'on-path' : ''} `} onMouseEnter={(e) => onHover(t.key, e)} onMouseMove={(e) => onHover(t.key, e)} onMouseLeave={() => onHover(null)} onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <Ring n={t.criteria[lang].length} done={status === 'done'} />
      <div className="tech-body">
        <div className="tech-title">{tx(t.title)}</div>
        <div className="tech-meta"><LaneIcon id={lane} size={13} /> {ui('tech.meta', { n: minutes, d: doN })}{status === 'gap' ? ui('tech.gap') : status === 'progress' ? ui('tech.progress') : ''}</div>
      </div>
      {status === 'locked' && <Lock size={14} className="tech-lock" />}
    </div>
  );
}

export function Tree() {
  const { pack, state, t, ui, lang, session } = useStore();
  const [sel, setSelRaw] = useState<Sel | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set(JSON.parse(ls.get('hub.tree.open') ?? '[]') as string[]));
  const [focus, setFocus] = useState<string | null>(() => ls.get('hub.tree.focus'));
  const [lanes, setLanes] = useState<Set<LaneId>>(new Set()); // empty = all lanes
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const nodeEls = useRef(new Map<string, HTMLElement>());
  const rowRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => { // wheel over empty sky scrolls the expanded era's strip
    const el = wrapRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const t = e.target as Element | null;
      // empty space only: the tree container itself, the era row between columns, or the wrapper background; we leave any element on top alone
      const empty = t === el || t?.classList.contains('eras') || t?.classList.contains('eras-row');
      if (!empty) return;
      const body = el.querySelector<HTMLElement>('.era.focus .scroll-body'); if (!body) return;
      body.scrollTop += e.deltaY; e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const setSel = (v: Sel | null) => {
    setSelRaw(v);
    if (!v) { try { localStorage.removeItem('hub.tree.sel'); } catch { /* private window */ } return; }
    ls.set('hub.tree.sel', v.kind === 'topic' ? v.topic.key : v.kind === 'level' ? `level:${levelKey(v.level)}` : `${v.kind}:${v.grade.id}`);
  };
  const [free, setFree] = useState<FreeZone>(null);
  useEffect(() => { const mq = window.matchMedia('(max-width: 900px)'); const f = () => setMobile(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  useEffect(() => { ls.set('hub.tree.open', JSON.stringify([...open])); }, [open]);
  useEffect(() => { if (focus) ls.set('hub.tree.focus', focus); }, [focus]);
  useEffect(() => { // free zone to the right of the tree: the star sheet goes there
    const measure = () => {
      const r = rowRef.current?.getBoundingClientRect();
      if (!r || mobile) { setFree(null); return; }
      const w = window.innerWidth - r.right - 16;
      setFree((cur) => (cur && cur.left === r.right + 16 && cur.width === w ? cur : { left: r.right + 16, width: w }));
    };
    measure();
    const ro = rowRef.current ? new ResizeObserver(measure) : null; if (rowRef.current && ro) ro.observe(rowRef.current);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, [mobile, focus, sel]);
  const prereq = useMemo(() => (pack ? buildPrereq(pack) : new Map<string, string[]>()), [pack]);
  const grades = useMemo(() => (pack ? [...pack.grades].sort((a, b) => a.order - b.order) : []), [pack]);
  const byKey = useMemo(() => new Map(grades.flatMap((g) => gradeTopics(g).map((tp) => [tp.key, { tp, g }] as const))), [grades]);

  // Path: all unmet prerequisites of the node and their hours.
  const path = useMemo(() => {
    if (!hover || !pack) return null;
    const seen = new Set<string>(); const stack = [hover.id];
    while (stack.length) { const id = stack.pop()!; if (seen.has(id)) continue; seen.add(id); for (const p of prereq.get(id) ?? []) stack.push(p); }
    let minutes = 0, topics = 0, gates = 0;
    for (const id of seen) {
      const hit = byKey.get(id);
      if (hit) { if (state?.topics[id]?.status !== 'learned') { minutes += hit.tp.minutes_total; topics++; } }
      else if (id.startsWith('exam:') ? !state?.exams[id.slice(5)]?.passed : !state?.exams[id.slice(6)]?.passed) gates++;
    }
    return { ids: seen, topics, gates, hours: Math.round(minutes / 6) / 10 };
  }, [hover, pack, prereq, byKey, state]);

  useEffect(() => { // restore the last selection if it exists in the package
    if (!pack || sel) return;
    const k = ls.get('hub.tree.sel'); if (!k) return;
    const gs = [...pack.grades];
    if (k.startsWith('exam:') || k.startsWith('era:')) { const g = gs.find((x) => x.id === k.slice(k.indexOf(':') + 1)); if (g) setSelRaw({ kind: k.startsWith('exam:') ? 'exam' : 'era', grade: g }); return; }
    if (k.startsWith('level:')) { for (const g of gs) for (const lv of g.adjacent) if (levelKey(lv) === k.slice(6)) { setSelRaw({ kind: 'level', level: lv, grade: g }); return; } return; }
    for (const g of gs) { const tp = gradeTopics(g).find((x) => x.key === k); if (tp) { setSelRaw({ kind: 'topic', topic: tp, grade: g }); return; } }
  }, [pack]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pack || !state) return null;
  const reg = (id: string) => (el: HTMLElement | null) => { if (el) nodeEls.current.set(id, el); else nodeEls.current.delete(id); };
  const onHover: HoverFn = (id, e) => setHover(id && e ? { id, x: e.clientX, y: e.clientY } : null);
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const curGrade = grades.find((g) => !gradeDone(g, state)) ?? grades[grades.length - 1];
  const focusId = focus && grades.some((g) => g.id === focus) ? focus : curGrade.id;
  const status = (g: Grade) => (gradeDone(g, state) ? 'done' : isUnlocked(pack, g.id, state) ? 'open' : 'locked');

  // Evolution of an era without an exam: always open and softly pulsing; inside, the workplace journal and words about the first step.
  const freeGate = (g: Grade) => {
    const p = progress(gradeTopics(g), state); const left = p.total - p.learned;
    return (
      <div ref={reg(`exam:${g.id}`)} className={`gate free ${left === 0 ? 'done' : 'open'}`} onClick={() => setSel({ kind: 'exam', grade: g })} role="button" tabIndex={0}>
        <div className="gate-head"><Check size={16} /> {ui('gate.free.head')}</div>
        <div className="gate-text">{ui('gate.free.text')}</div>
        <div className="gate-foot">{left === 0 ? ui('gate.free.done') : ui('gate.free.left', { n: left })}</div>
      </div>
    );
  };
  const gate = (g: Grade) => {
    if (g.gate === 'none') return freeGate(g);
    const st = status(g); const on = path?.ids.has(`exam:${g.id}`);
    return (
      <div ref={reg(`exam:${g.id}`)} className={`gate ${st} ${on ? 'on-path' : ''}`} onClick={() => setSel({ kind: 'exam', grade: g })} onMouseEnter={(e) => onHover(`exam:${g.id}`, e)} onMouseMove={(e) => onHover(`exam:${g.id}`, e)} onMouseLeave={() => onHover(null)} role="button" tabIndex={0}>
        <div className="gate-head">{st === 'done' ? <Check size={16} /> : <Lock size={16} />} {ui('gate.head', { e: epochOf(g) })}</div>
        <div className="gate-text">{t(g.exam)}</div>
        <div className="gate-foot">{st === 'done' ? ui('gate.done') : st === 'open' ? ui('gate.open') : ui('gate.locked')}</div>
      </div>
    );
  };

  const card = (tp: Topic, g: Grade) => <TechCard key={tp.key} t={tp} status={topicStatus(tp, g, pack, state)} onPath={!!path?.ids.has(tp.key)} onHover={onHover} onClick={() => setSel({ kind: 'topic', topic: tp, grade: g })} refCb={reg(tp.key)} />;

  // Area level: a seal card with the lane emblem and a row of dots per topic; collapsed by default, expansion is remembered.
  const levelCard = (lv: AdjacentLevel, g: Grade) => {
    const k = levelKey(lv); const id = `level:${k}`; const p = progress(lv.topics, state); const passed = !!state.exams[k]?.passed;
    const unlocked = isUnlocked(pack, g.id, state); const isOpen = open.has(k);
    const st = passed ? 'done' : unlocked ? 'open' : 'locked';
    return (
      <div key={k} className={`level-card ${st} ${path?.ids.has(id) ? 'on-path' : ''} ${isOpen ? 'is-open' : ''}`}>
        <div ref={reg(id)} className="level-head" onClick={() => toggle(k)} onMouseEnter={(e) => onHover(id, e)} onMouseMove={(e) => onHover(id, e)} onMouseLeave={() => onHover(null)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && toggle(k)}>
          <LaneEmblem id={laneOfArea(lv.area)} size={42} />
          <div className="level-text">
            <div className="level-id">{areaLabel(lv.area, lang)} · {lv.level} <span className="level-name">{t(lv.area_title)}</span></div>
            <div className="level-dots">{lv.topics.map((tp) => <i key={tp.key} className={`dot ${topicStatus(tp, g, pack, state)}`} title={t(tp.title)} />)}</div>
          </div>
          <div className="level-side">
            <span className="level-hours">{p.learned}/{p.total} · {ui('hours.n', { n: lv.hours })}</span>
            <button className={`btn tiny ${passed ? 'ok' : ''}`} onClick={(e) => { e.stopPropagation(); setSel({ kind: 'level', level: lv, grade: g }); }}>{passed ? <><Check size={12} /> {ui('level.passed')}</> : ui('level.btn')}</button>
          </div>
          <span className="level-chevron">{isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>
        </div>
        {isOpen && <div className="level-topics">{lv.topics.map((tp) => card(tp, g))}</div>}
      </div>
    );
  };

  const header = (g: Grade, size: 'full' | 'spine') => {
    const p = progress(gradeTopics(g), state); const st = status(g);
    return (
      <div className={`era-head ${size} ${st} ${g.id === curGrade.id ? 'current' : ''}`} onClick={size === 'spine' ? () => { setFocus(g.id); setSel({ kind: 'era', grade: g }); } : () => setSel({ kind: 'era', grade: g })}>
        <Emblem grade={g.id} size={size === 'full' ? (mobile ? 64 : 84) : 52} />
        <div className="era-text">
          <div className="era-epoch">{ui('era.label', { e: epochOf(g) })}</div>
          <div className="era-title">{t(g.title)}</div>
          <div className="era-meta">{ui('era.meta', { h: g.hours.total, l: p.learned, t: p.total })}</div>
          <div className="era-bar"><i style={{ width: `${p.pct}%` }} /></div>
        </div>
      </div>
    );
  };

  // Spine of a collapsed era: emblem, progress, technology dots, mini-evolution.
  const spine = (g: Grade) => (
    <section key={g.id} id={`era-${g.id}`} className={`era spine ${status(g)}`}>
      {header(g, 'spine')}
      <div className={`gate mini ${status(g)} ${g.gate === 'none' ? 'free' : ''}`} onClick={() => setSel({ kind: 'exam', grade: g })} title={t(g.exam)}>{status(g) === 'done' || g.gate === 'none' ? <Check size={14} /> : <Lock size={14} />}</div>
      <div className="dots" onClick={() => { setFocus(g.id); setSel({ kind: 'era', grade: g }); }}>
        {gradeTopics(g).map((tp) => <i key={tp.key} className={`dot ${topicStatus(tp, g, pack, state)}`} title={t(tp.title)} />)}
      </div>
    </section>
  );

  // Expanded era: a scroll with the core, then area levels, filtered by lane.
  const scroll = (g: Grade) => {
    const lanesHere = LANES.filter((l) => l.id === 'core' ? g.core.length > 0 : g.adjacent.some((lv) => laneOfArea(lv.area) === l.id));
    const picked = new Set([...lanes].filter((id) => lanesHere.some((l) => l.id === id)));
    const show = (id: LaneId) => picked.size === 0 || picked.has(id);
    const levels = g.adjacent.filter((lv) => show(laneOfArea(lv.area)));
    const togglePick = (id: LaneId) => setLanes((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const laneStats = (l: LaneId) => { const ts = l === 'core' ? g.core : g.adjacent.filter((lv) => laneOfArea(lv.area) === l).flatMap((lv) => lv.topics); return progress(ts, state); };
    return (
      <section key={g.id} id={`era-${g.id}`} className={`era focus ${status(g)}`}>
        {header(g, 'full')}
        {gate(g)}
        <div className="era-lanes">
          {lanesHere.map((l) => { const p = laneStats(l.id); const on = picked.has(l.id); return (
            <button key={l.id} className={`lane-pick ${on ? 'active' : ''} ${p.pct === 100 ? 'done' : ''}`} onClick={() => togglePick(l.id)} title={ui('lane.pick.t', { l: ui(l.title), a: p.learned, b: p.total })}>
              <LaneEmblem id={l.id} size={mobile ? 48 : 72} />
              <span className="lane-pick-title">{ui(l.title)}</span>
              <span className="lane-pick-meta">{p.learned}/{p.total}</span>
            </button>); })}
        </div>
        <div className="scroll-body">
          {show('core') && <div className="lane-block"><div className="lane-title"><LaneIcon id="core" /> {ui('lane.core')} <span className="muted">{progress(g.core, state).learned}/{g.core.length}</span></div>{g.core.map((tp) => card(tp, g))}</div>}
          {levels.map((lv) => levelCard(lv, g))}
        </div>
      </section>
    );
  };

  const goTopic = (tp: Topic, g: Grade) => {
    setFocus(g.id);
    if (tp.area && tp.level) setOpen((s0) => new Set(s0).add(`${tp.area}/${tp.level}`));
    setSel({ kind: 'topic', topic: tp, grade: g });
    setTimeout(() => nodeEls.current.get(tp.key)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };
  const working = grades.flatMap((g) => gradeTopics(g).filter((tp) => state.topics[tp.key]?.status === 'in_progress').map((tp) => ({ tp, g })));
  const hoverNode = hover ? (byKey.get(hover.id)?.tp ?? null) : null;
  return (
    <div className={`eras-wrap v2 ${mobile ? 'mobile' : ''}`} ref={wrapRef}>
      <div className="eras-bar">
        <span className="spacer" />
        {working.length > 0 && <div className="working"><span className="muted small">{ui('working')}</span>{working.map(({ tp, g }) => <button key={tp.key} className="chip working-chip" onClick={() => goTopic(tp, g)}><LaneIcon id={tp.area ? laneOfArea(tp.area) : 'core'} size={12} /> {t(tp.title)}</button>)}</div>}
        {session && !session.agent.found && session.mentorMode !== 'replay' && <span className="chip warn">{ui('agent.missing')}</span>}
      </div>
      <div className="eras">
        {mobile ? grades.map((g) => (g.id === focusId ? scroll(g) : (
          <section key={g.id} id={`era-${g.id}`} className={`era collapsed ${status(g)}`} onClick={() => setFocus(g.id)}>
            {header(g, 'spine')}
            <div className="dots">{gradeTopics(g).map((tp) => <i key={tp.key} className={`dot ${topicStatus(tp, g, pack, state)}`} />)}</div>
          </section>
        ))) : (
          <div className="eras-row" ref={rowRef}>
            {grades.map((g) => (g.id === focusId ? scroll(g) : spine(g)))}
          </div>
        )}
      </div>
      {hover && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 14, window.innerWidth - 360), top: hover.y + 14 }}>
          {hoverNode ? <><b>{t(hoverNode.title)}</b><div className="small">{t(hoverNode.goal)}</div></> : <b>{hover.id.startsWith('exam:') ? ui('tip.exam', { e: epochOf(grades.find((g) => g.id === hover.id.slice(5)) ?? grades[0]) }) : ui('tip.level', { k: areaLabel(hover.id.slice(6), lang) })}</b>}
          {path && <div className="small muted">{path.topics === 0 && path.gates === 0 ? ui('tip.taken') : path.topics === 0 ? ui('tip.gates', { g: path.gates }) : ui('tip.path', { t: path.topics, g: path.gates, h: path.hours })}</div>}
        </div>
      )}
      {sel && <StarSheet sel={sel} free={free} onClose={() => setSel(null)} onOpenExam={(g) => setSel({ kind: 'exam', grade: g })} onOpenTopic={goTopic} />}
    </div>
  );
}
