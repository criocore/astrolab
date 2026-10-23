import { Settings, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { explainError } from './i18n';
import { AgentPanel } from './components';
import { HubProvider, useStore } from './store';
import { Journal, RadarAdr, SearchResults } from './views';
import { Tree } from './eras';
import { Sky } from './sky';
import { SkyPanel } from './skypanel';
import { AgentOptions, Onboarding, savedValues, type Status, type Values } from './onboarding';
import type { Lang } from './types';

// Agent and its parameters in the settings menu: same as in onboarding, but every change is saved immediately.
function AgentSettings() {
  const { ui, refreshSession, setError } = useStore();
  const [status, setStatus] = useState<Status | null>(null);
  const [name, setName] = useState('');
  const [values, setValues] = useState<Values>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api<Status>('GET', '/api/agents').then((s) => { setStatus(s); setName(s.default); setValues(savedValues(s.agents.find((a) => a.preset === s.default))); }).catch((e) => setError(String(e)));
  }, [setError]);
  const save = async (n: string, v: Values) => {
    try {
      await api('PUT', '/api/agents/default', { name: n, options: v });
      await refreshSession();
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    } catch (e) { setError(String(e)); }
  };
  if (!status) return null;
  const agent = status.agents.find((a) => a.preset === name);
  return (
    <>
      <label>{ui('menu.agent')} {saved && <span className="ok small">· {ui('menu.saved')}</span>}
        <select value={name} onChange={(e) => { const n = e.target.value; const v = savedValues(status.agents.find((a) => a.preset === n)); setName(n); setValues(v); save(n, v); }}>
          {status.agents.map((a) => <option key={a.preset} value={a.preset} disabled={!a.found}>{a.title}{a.found ? '' : ` · ${ui('ob.notfound')}`}</option>)}
        </select>
      </label>
      <AgentOptions agent={agent} values={values} onChange={(v) => { setValues(v); save(name, v); }} />
    </>
  );
}

const TRACKS = ['python', 'typescript'];

// Header center: an abstract astrolabe (mater with limb, slowly rotating rete, alidade, throne on top) and the name.
// The emblem extends slightly past the bottom edge of the header, into the sky. Click returns to the tree.
function Astrolabe({ size = 84 }: { size?: number }) {
  const ticks = Array.from({ length: 36 }, (_, i) => (i * 360) / 36);
  const stars = [[-28, -6], [-10, -30], [18, -22], [30, 8], [6, 30], [-20, 22]];
  return (
    <svg className="astrolabe" viewBox="-50 -58 100 116" width={size} height={size * 1.16} aria-hidden="true">
      <circle cx={0} cy={-52} r={5} className="al-throne" />
      <line x1={0} y1={-47} x2={0} y2={-44} className="al-throne" />
      <circle cx={0} cy={0} r={44} className="al-mater" />
      <circle cx={0} cy={0} r={44} className="al-ring" />
      <circle cx={0} cy={0} r={37} className="al-ring thin" />
      {ticks.map((a) => { const r = (a * Math.PI) / 180; const long = a % 90 === 0; const r1 = long ? 38 : 40.5; return <line key={a} x1={Math.cos(r) * r1} y1={Math.sin(r) * r1} x2={Math.cos(r) * 43.5} y2={Math.sin(r) * 43.5} className={`al-tick ${long ? 'long' : ''}`} />; })}
      <g className="al-rete">
        <circle cx={0} cy={0} r={30} className="al-ring thin" />
        <circle cx={8} cy={-6} r={21} className="al-ecliptic" />
        {stars.map(([x, y], i) => <path key={i} d={`M ${x} ${y - 3.2} l 1.2 2 2 1.2 -2 1.2 -1.2 2 -1.2 -2 -2 -1.2 2 -1.2 z`} className="al-star" />)}
        <path d="M -30 0 A 30 30 0 0 1 0 -30" className="al-rete-arc" />
      </g>
      <g className="al-alidade">
        <line x1={-41} y1={0} x2={41} y2={0} className="al-rule" />
        <path d="M 41 0 l -6 -3 v 6 z M -41 0 l 6 -3 v 6 z" className="al-rule-tip" />
      </g>
      <circle cx={0} cy={0} r={3.2} className="al-pin" />
    </svg>
  );
}
function Brand({ onHome, title }: { onHome: () => void; title: string }) {
  return (
    <button className="brand" onClick={onHome} title={title}>
      <Astrolabe size={126} />
    </button>
  );
}

function Shell() {
  const { pack, state, error, setError, reload, agent, lang, setLang, ui, track, setTrack, setup, reopenSetup } = useStore();
  const [tab, setTab] = useState<string>('tree'); // the tree is the main screen
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const [confirmImport, setConfirmImport] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const go = (tb: string) => { setTab(tb); setQ(''); setMenu(false); };

  const exportJson = async () => {
    const data = await api('GET', '/api/export');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.download = `astrolabe-${pack?.id}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const importJson = async (f: File) => {
    await api('POST', '/api/import', JSON.parse(await f.text())).catch((e) => setError(explainError(String(e), lang)));
    setConfirmImport(null);
    await reload();
  };

  if (error && !pack) return <div className="fatal">{ui('load.fail', { e: error })}</div>;
  if (!pack || !state) return <div className="fatal">{ui('loading')}</div>;
  if (!setup) return <div className="app"><Sky /><Onboarding /></div>;
  return (
    <div className={`app ${agent.open ? 'with-agent' : ''}`}>
      <Sky />
      <header className="top">
        <div className="top-left" />
        <div className="top-center">
          <button className={`tab ${tab === 'journal' && !q ? 'active' : ''}`} onClick={() => go('journal')}>{ui('tab.chronicle')}</button>
          <Brand onHome={() => go('tree')} title={ui('brand.home')} />
          <button className={`tab ${tab === 'radar' && !q ? 'active' : ''}`} onClick={() => go('radar')}>{ui('tab.rutter')}</button>
        </div>
        <div className="top-right">
          <span className="menu-wrap">
            <button className={`btn ghost icon ${menu ? 'active' : ''}`} onClick={() => setMenu((v) => !v)} title={ui('menu.open')}><Settings size={16} /></button>
            {menu && (
              <div className="menu card">
                <div className="menu-head"><b>{ui('menu.title')}</b><span className="spacer" /><button className="btn ghost icon" onClick={() => setMenu(false)}><X size={14} /></button></div>
                <label>{ui('menu.search')}<input className="search" autoFocus placeholder={ui('menu.search.ph')} value={q} onChange={(e) => setQ(e.target.value)} /></label>
                <label>{ui('menu.track')}<select value={track} onChange={(e) => setTrack(e.target.value)}>{TRACKS.map((x) => <option key={x}>{x}</option>)}</select></label>
                <label>{ui('menu.lang')}<select value={lang} onChange={(e) => setLang(e.target.value as Lang)}><option value="en">English</option><option value="ru">Русский</option></select></label>
                <AgentSettings />
                <SkyPanel inline />
                <div className="row">
                  <button className="btn ghost" onClick={exportJson} title={ui('menu.export.t')}>{ui('menu.export')}</button>
                  <button className="btn ghost" onClick={() => fileRef.current?.click()} title={ui('menu.import.t')}>{ui('menu.import')}</button>
                  <button className="btn ghost" onClick={() => { setMenu(false); reopenSetup(); }}>{ui('menu.setup')}</button>
                </div>
              </div>
            )}
          </span>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { if (e.target.files?.[0]) setConfirmImport(e.target.files[0]); e.target.value = ''; }} />
        </div>
      </header>
      {error && <div className="error" onClick={() => setError('')}>{error} {ui('err.hide')}</div>}
      {confirmImport && (
        <div className="error">{ui('import.confirm', { name: confirmImport.name })} <button className="btn" onClick={() => importJson(confirmImport)}>{ui('import.replace')}</button> <button className="btn ghost" onClick={() => setConfirmImport(null)}>{ui('cancel')}</button></div>
      )}
      <main className={tab === 'tree' && !q ? 'wide' : ''}>
        {q.trim().length >= 2 ? <SearchResults q={q.trim()} /> : (
          <>
            {tab === 'tree' && <Tree />}
            {tab === 'journal' && <Journal />}
            {tab === 'radar' && <RadarAdr />}
          </>
        )}
      </main>
      <AgentPanel />
    </div>
  );
}

export default function App() {
  return <HubProvider><Shell /></HubProvider>;
}
