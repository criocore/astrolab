// Sky settings: change live without reload, stored in the browser. inline = inside the shared header menu.
import { useState } from 'react';
import { SKY_DEFAULTS, useStore } from './store';

export function SkyPanel({ inline = false }: { inline?: boolean }) {
  const { sky, setSky, ui } = useStore();
  const [open, setOpen] = useState(false);
  const row = (label: string, value: string) => <div className="sky-row"><span>{label}</span><b>{value}</b></div>;
  const body = (
    <>
      <label><input type="checkbox" checked={sky.enabled} onChange={(e) => setSky({ enabled: e.target.checked })} /> {ui('sky.show')}</label>
      {row(ui('sky.period'), ui('sec.n', { n: sky.period }))}
      <input type="range" min={30} max={1800} step={10} value={sky.period} onChange={(e) => setSky({ period: Number(e.target.value) })} />
      {row(ui('sky.angle'), `${sky.angle}°`)}
      <input type="range" min={0} max={359} step={1} value={sky.angle} onChange={(e) => setSky({ angle: Number(e.target.value) })} />
      <label><input type="checkbox" checked={sky.flashes} onChange={(e) => setSky({ flashes: e.target.checked })} /> {ui('sky.flashes')}</label>
      {row(ui('sky.flash'), ui('sec.n', { n: sky.flash }))}
      <input type="range" min={1} max={12} step={0.5} value={sky.flash} onChange={(e) => setSky({ flash: Number(e.target.value) })} />
      {row(ui('sky.concurrent'), `${sky.concurrent}`)}
      <input type="range" min={0} max={30} step={1} value={sky.concurrent} onChange={(e) => setSky({ concurrent: Number(e.target.value) })} />
      <div className="row"><button className="btn ghost" onClick={() => setSky(SKY_DEFAULTS)}>{ui('sky.reset')}</button>{!inline && <><span className="spacer" /><button className="btn ghost" onClick={() => setOpen(false)}>{ui('sky.done')}</button></>}</div>
    </>
  );
  if (inline) return <div className="sky-inline"><div className="menu-sub">{ui('sky.title')}</div>{body}</div>;
  return (
    <span className="sky-wrap">
      <button className="btn ghost" onClick={() => setOpen((v) => !v)} title={ui('sky.settings')}>✦ {ui('sky.title')}</button>
      {open && <div className="sky-panel card">{body}</div>}
    </span>
  );
}
