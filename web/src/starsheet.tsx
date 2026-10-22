// Star sheet: an atlas page about one topic. A glass panel in the center of the free zone to the right of the tree,
// takes half of the free space, the sky shows through it. On top, a mini-map of the era's constellation with the topic's star circled.
import { X } from 'lucide-react';
import { useMemo } from 'react';
import { ExamCard, TopicRow, WorkstationLog } from './components';
import { areaLabel, type Key } from './i18n';
import { Emblem, LANES, LaneIcon, laneOfArea } from './icons';
import { buildConstellations } from './sky';
import { epochOf, gradeDone, gradeTopics, isUnlocked, levelKey, progress, uiZoom, useStore } from './store';
import type { AdjacentLevel, Grade, Topic } from './types';

export type Sel = { kind: 'topic'; topic: Topic; grade: Grade } | { kind: 'exam'; grade: Grade } | { kind: 'level'; level: AdjacentLevel; grade: Grade } | { kind: 'era'; grade: Grade };
export type FreeZone = { left: number; width: number } | null;

const MAG: Record<string, Key> = { not_started: 'mag.not_started', in_progress: 'mag.in_progress', gap: 'mag.gap', learned: 'mag.learned' };

function MiniSky({ grade, topicKey }: { grade: Grade; topicKey?: string }) {
  const { pack, state } = useStore();
  const c = useMemo(() => (pack ? buildConstellations(pack).find((x) => x.grade.id === grade.id) : null), [pack, grade.id]);
  if (!c) return null;
  const xs = c.pts.map((p) => p.x), ys = c.pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 260, H = 150, pad = 16; const sx = (W - pad * 2) / Math.max(1, maxX - minX), sy = (H - pad * 2) / Math.max(1, maxY - minY); const s = Math.min(sx, sy);
  const ox = pad + ((W - pad * 2) - (maxX - minX) * s) / 2, oy = pad + ((H - pad * 2) - (maxY - minY) * s) / 2;
  const X = (x: number) => ox + (x - minX) * s, Y = (y: number) => oy + (y - minY) * s;
  const st = (k: string) => state?.topics[k]?.status ?? 'not_started';
  return (
    <svg className="mini-sky" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {c.segs.map(([a, b], i) => <line key={i} x1={X(c.pts[a].x)} y1={Y(c.pts[a].y)} x2={X(c.pts[b].x)} y2={Y(c.pts[b].y)} className={st(c.pts[a].topic.key) === 'learned' && st(c.pts[b].topic.key) === 'learned' ? 'ms-seg lit' : 'ms-seg'} />)}
      {c.pts.map((p) => { const k = p.topic.key; const s0 = st(k); const me = k === topicKey; return (
        <g key={k}>
          {me && <circle cx={X(p.x)} cy={Y(p.y)} r={9} className="ms-ring" />}
          <circle cx={X(p.x)} cy={Y(p.y)} r={s0 === 'learned' ? 3.4 : s0 === 'in_progress' ? 2.8 : p.main ? 2.1 : 1.6} className={`ms-star ${s0} ${me ? 'me' : ''}`} />
        </g>); })}
    </svg>
  );
}

export function StarSheet({ sel, free, onClose, onOpenExam, onOpenTopic }: { sel: Sel; free: FreeZone; onClose: () => void; onOpenExam?: (g: Grade) => void; onOpenTopic?: (tp: Topic, g: Grade) => void }) {
  const { t, ui, lang, state, pack } = useStore();
  const docked = free !== null && free.width >= 560 * uiZoom();
  // sheet width is one per era: independent of the topic, set by the free zone, but not narrower than 520 or wider than 680
  const z = uiZoom(); // free is measured in screen pixels, the style is set in UI units
  const width = docked ? Math.max(520 * z, Math.min(680 * z, free!.width * 0.5)) : 0;
  const style = docked ? { left: (free!.left + (free!.width - width) / 2) / z, width: width / z, maxHeight: window.innerHeight / z - 120 } : undefined;
  const topic = sel.kind === 'topic' ? sel.topic : null;
  const lane = topic ? (topic.area ? laneOfArea(topic.area) : 'core') : null;
  const laneTitle = lane ? ui(LANES.find((l) => l.id === lane)!.title) : '';
  const status = topic ? state?.topics[topic.key]?.status ?? 'not_started' : '';
  const epoch = epochOf(sel.grade);
  const levelTitle = (lv: AdjacentLevel) => `${areaLabel(lv.area, lang)} ${t(lv.area_title)} · ${lv.level}`;
  return (
    <aside className={`starsheet ${docked ? 'docked' : 'drawer-mode'}`} style={style}>
      <header className="ss-head">
        <div className="ss-title">
          <span className="ss-kicker">{sel.kind === 'exam' ? (sel.grade.gate === 'none' ? ui('gate.free.head') : ui('ss.gate')) : sel.kind === 'level' ? ui('ss.level') : sel.kind === 'era' ? ui('ss.era', { e: epoch }) : ui('ss.star', { e: epoch })}</span>
          <b>{sel.kind === 'topic' ? t(sel.topic.title) : sel.kind === 'exam' || sel.kind === 'era' ? t(sel.grade.title) : levelTitle(sel.level)}</b>
        </div>
        <button className="btn ghost" onClick={onClose} title={ui('close')}><X size={16} /></button>
      </header>
      <div className="ss-sky">
        <MiniSky grade={sel.grade} topicKey={topic?.key} />
        {topic && (
          <dl className="ss-coords">
            <div><dt>{ui('ss.mag')}</dt><dd>{ui(MAG[status] ?? 'mag.not_started')}</dd></div>
            <div><dt>{ui('ss.lane')}</dt><dd>{laneTitle}</dd></div>
            <div><dt>{ui('ss.minutes')}</dt><dd>{topic.minutes_total}</dd></div>
            <div><dt>{ui('ss.criteria')}</dt><dd>{topic.criteria[lang].length}</dd></div>
          </dl>
        )}
      </div>
      <div className="ss-body">
        {sel.kind === 'era' && pack && (() => {
          const g = sel.grade; const p = progress(gradeTopics(g), state); const unlocked = isUnlocked(pack, g.id, state); const passed = gradeDone(g, state);
          const lanes = LANES.filter((l) => l.id === 'core' ? g.core.length > 0 : g.adjacent.some((lv) => laneOfArea(lv.area) === l.id));
          return (
            <div className="era-card">
              <div className="era-card-top"><Emblem grade={g.id} size={96} /><div><div className="era-card-hours">{ui('era.hours', { t: g.hours.total, c: g.hours.core, a: g.hours.adjacent })}</div><div className="era-bar"><i style={{ width: `${p.pct}%` }} /></div><div className="muted small">{ui('era.progress', { l: p.learned, t: p.total })} · {passed ? ui('era.gate.passed') : unlocked ? ui('era.open') : ui('era.locked')}</div></div></div>
              <ul className="era-card-lanes">{lanes.map((l) => { const ts = l.id === 'core' ? g.core : g.adjacent.filter((lv) => laneOfArea(lv.area) === l.id).flatMap((lv) => lv.topics); const lp = progress(ts, state); return <li key={l.id}><LaneIcon id={l.id} size={14} /> {ui(l.title)} <span className="muted">{lp.learned}/{lp.total}</span></li>; })}</ul>
              <div className="era-card-gate"><div className="ss-kicker">{g.gate === 'none' ? ui('gate.free.head') : ui('ss.gate')}</div><p>{t(g.exam)}</p>{onOpenExam && <button className="btn gold" onClick={() => onOpenExam(g)}>{g.gate === 'none' ? ui('ss.open.log') : ui('ss.open.gate')}</button>}</div>
            </div>
          );
        })()}
        {sel.kind === 'topic' && <TopicRow key={sel.topic.key} topic={sel.topic} gradeId={sel.grade.id} defaultOpen />}
        {sel.kind === 'exam' && (sel.grade.gate === 'none'
          ? <WorkstationLog key={sel.grade.id} grade={sel.grade} onOpenTopic={onOpenTopic} />
          : <ExamCard key={sel.grade.id} kind="grade" target={sel.grade.id} title={t(sel.grade.title)} task={t(sel.grade.exam)} gradeId={sel.grade.id} />)}
        {sel.kind === 'level' && <ExamCard key={levelKey(sel.level)} kind="level" target={levelKey(sel.level)} title={levelTitle(sel.level)} task={t(sel.level.check)} gradeId={sel.grade.id} />}
      </div>
    </aside>
  );
}
