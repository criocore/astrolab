import { useMemo, useState } from 'react';
import { TopicRow } from './components';
import { areaLabel, type Key } from './i18n';
import { allTopics, epochOf, useStore } from './store';

const today = () => new Date().toISOString().slice(0, 10);

// ---------- Chronicle: entries by day and notes from topics ----------
export function Journal() {
  const { state, saveRow, deleteRow, pack, t, ui } = useStore();
  const notes = pack ? allTopics(pack).filter(({ topic }) => state?.topics[topic.key]?.note).map((x) => ({ ...x, note: state!.topics[x.topic.key].note, at: state!.topics[x.topic.key].updatedAt ?? '' })) : [];
  const [row, setRow] = useState({ date: today(), minutes: 60, text: '', topic_key: '' });
  if (!state || !pack) return null;
  const byDay = state.journal.reduce<Record<string, typeof state.journal>>((m, j) => ((m[j.date] ??= []).push(j), m), {});
  const titleOf = (key: string | null) => (key ? t(allTopics(pack).find((x) => x.topic.key === key)?.topic.title) : '');
  return (
    <div>
      <form className="card row" onSubmit={async (e) => { e.preventDefault(); if (row.text.trim()) { await saveRow('journal', { ...row, topic_key: row.topic_key || null }); setRow({ ...row, text: '' }); } }}>
        <input type="date" value={row.date} onChange={(e) => setRow({ ...row, date: e.target.value })} />
        <input type="number" min={0} step={15} value={row.minutes} onChange={(e) => setRow({ ...row, minutes: Number(e.target.value) })} title={ui('j.minutes.t')} />
        <span className="muted">{ui('j.min')}</span>
        <select value={row.topic_key} onChange={(e) => setRow({ ...row, topic_key: e.target.value })}>
          <option value="">{ui('j.notopic')}</option>
          {allTopics(pack).map(({ topic, grade }) => <option key={topic.key} value={topic.key}>{ui('era.label', { e: epochOf(grade) })} · {t(topic.title)}</option>)}
        </select>
        <input className="grow" value={row.text} onChange={(e) => setRow({ ...row, text: e.target.value })} placeholder={ui('j.text.ph')} />
        <button className="btn">{ui('j.add')}</button>
      </form>
      {!!notes.length && (
        <section className="card">
          <h3>{ui('j.notes')} <span className="muted">{notes.length}</span></h3>
          {notes.map(({ topic, grade, note, at }) => (
            <div key={topic.key} className="journal-row">
              <span className="chip">{ui('era.label', { e: epochOf(grade) })}</span> <b>{t(topic.title)}</b> <span className="grow pre">{note}</span> <span className="muted small">{at.slice(0, 10)}</span>
            </div>
          ))}
        </section>
      )}
      {Object.entries(byDay).map(([d, rows]) => (
        <section key={d} className="card">
          <h3>{d} <span className="muted">{ui('hours.n', { n: (rows.reduce((s, r) => s + r.minutes, 0) / 60).toFixed(1) })}</span></h3>
          {rows.map((r) => (
            <div key={r.id} className="journal-row">
              <span className="chip muted">{r.minutes} {ui('j.min')}</span> {r.topic_key && <span className="chip">{titleOf(r.topic_key)}</span>} <span className="grow">{r.text}</span>
              <button className="btn ghost" onClick={() => deleteRow('journal', r.id)}>✕</button>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

// ---------- Pilotage: radar and ADR ----------
const RINGS: [string, Key][] = [['adopt', 'ring.adopt'], ['trial', 'ring.trial'], ['assess', 'ring.assess'], ['hold', 'ring.hold']];
const ADR_STATUS: [string, Key][] = [['proposed', 'adr.proposed'], ['accepted', 'adr.accepted'], ['superseded', 'adr.superseded']];
export function RadarAdr() {
  const { state, saveRow, deleteRow, ui } = useStore();
  const [r, setR] = useState({ name: '', ring: 'assess', note: '' });
  const [a, setA] = useState({ title: '', status: 'proposed', context: '', options: '', decision: '' });
  if (!state) return null;
  return (
    <div>
      <h2>{ui('radar.title')}</h2>
      <form className="card row" onSubmit={async (e) => { e.preventDefault(); if (r.name.trim()) { await saveRow('radar', { ...r, date: today() }); setR({ ...r, name: '', note: '' }); } }}>
        <input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder={ui('radar.tech.ph')} />
        <select value={r.ring} onChange={(e) => setR({ ...r, ring: e.target.value })}>{RINGS.map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}</select>
        <input className="grow" value={r.note} onChange={(e) => setR({ ...r, note: e.target.value })} placeholder={ui('radar.why.ph')} />
        <button className="btn">{ui('add')}</button>
      </form>
      <div className="rings">
        {RINGS.map(([k, v]) => (
          <section key={k} className="card">
            <h3>{ui(v)}</h3>
            {state.radar.filter((x) => x.ring === k).map((x) => (
              <div key={x.id} className="journal-row">
                <b>{x.name}</b> <span className="muted small grow">{x.note}</span>
                <select value={x.ring} onChange={(e) => saveRow('radar', { ...x, ring: e.target.value }, x.id)}>{RINGS.map(([kk, vv]) => <option key={kk} value={kk}>{ui(vv)}</option>)}</select>
                <button className="btn ghost" onClick={() => deleteRow('radar', x.id)}>✕</button>
              </div>
            ))}
          </section>
        ))}
      </div>
      <h2>{ui('adr.title')}</h2>
      <form className="card adr-form" onSubmit={async (e) => { e.preventDefault(); if (a.title.trim()) { await saveRow('adr', { ...a, date: today() }); setA({ title: '', status: 'proposed', context: '', options: '', decision: '' }); } }}>
        <input value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} placeholder={ui('adr.title.ph')} />
        <textarea rows={2} value={a.context} onChange={(e) => setA({ ...a, context: e.target.value })} placeholder={ui('adr.ctx.ph')} />
        <textarea rows={3} value={a.options} onChange={(e) => setA({ ...a, options: e.target.value })} placeholder={ui('adr.opt.ph')} />
        <textarea rows={2} value={a.decision} onChange={(e) => setA({ ...a, decision: e.target.value })} placeholder={ui('adr.dec.ph')} />
        <button className="btn">{ui('adr.save')}</button>
      </form>
      {state.adr.map((x) => (
        <section key={x.id} className="card">
          <div className="row">
            <h3 className="grow">{x.title}</h3>
            <select value={x.status} onChange={(e) => saveRow('adr', { ...x, status: e.target.value }, x.id)}>
              {ADR_STATUS.map(([k, v]) => <option key={k} value={k}>{ui(v)}</option>)}
            </select>
            <button className="btn ghost" onClick={() => deleteRow('adr', x.id)}>✕</button>
          </div>
          <p className="muted small">{x.date}</p>
          {x.context && <p><b>{ui('adr.ctx')}</b> {x.context}</p>}
          {x.options && <p className="pre"><b>{ui('adr.opts')}</b> {x.options}</p>}
          {x.decision && <p><b>{ui('adr.dec')}</b> {x.decision}</p>}
        </section>
      ))}
    </div>
  );
}

// ---------- Search across the whole program ----------
export function SearchResults({ q }: { q: string }) {
  const { pack, lang, t, ui } = useStore();
  const hits = useMemo(() => {
    if (!pack) return [];
    const s = q.toLowerCase();
    return allTopics(pack).filter(({ topic }) =>
      `${topic.title.ru} ${topic.title.en} ${topic.goal[lang]} ${topic.criteria[lang].join(' ')} ${topic.materials.map((m) => m.title).join(' ')}`.toLowerCase().includes(s)).slice(0, 100);
  }, [pack, q, lang]);
  return (
    <section className="card">
      <h2>{ui('search.title', { q })} <span className="muted">{hits.length}{hits.length === 100 ? '+' : ''}</span></h2>
      {hits.map((h) => (
        <div key={h.topic.key}>
          <div className="muted small">{ui('era.label', { e: epochOf(h.grade) })}{h.level ? ` · ${areaLabel(h.level.area, lang)} ${t(h.level.area_title)} ${h.level.level}` : ` · ${ui('search.core')}`}</div>
          <TopicRow topic={h.topic} gradeId={h.grade.id} />
        </div>
      ))}
    </section>
  );
}
