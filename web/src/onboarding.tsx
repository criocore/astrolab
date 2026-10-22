// First launch: language, coding agent and its parameters (model, effort). Shown until a choice is saved; can be reopened from the menu.
// The server detects agents from the agents.json allowlist with a single `--version`; no login and no model call.
import { Check, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from './api';
import { useStore } from './store';
import type { AgentHealth, Lang, OptionStatus } from './types';

export type Status = { default: string; agents: AgentHealth[] };
export type Values = Record<string, string>;
const OPTION_KEY = { model: 'opt.model', effort: 'opt.effort' } as const;
const CUSTOM = '__custom__';

// Agent parameter values from the server status: what is saved in data/agents.local.json.
export const savedValues = (a: AgentHealth | undefined): Values => Object.fromEntries(Object.entries(a?.options ?? {}).map(([k, o]) => [k, o.value]));

// One parameter: a list of suggestions + "as in CLI"; for free-form, an extra "other…" option with an input field.
function OptionField({ name, opt, value, onChange }: { name: string; opt: OptionStatus; value: string; onChange: (v: string) => void }) {
  const { ui } = useStore();
  const label = name in OPTION_KEY ? ui(OPTION_KEY[name as keyof typeof OPTION_KEY]) : name;
  const listed = value === '' || opt.choices.includes(value);
  const [custom, setCustom] = useState(!listed);
  const sel = custom ? CUSTOM : value;
  return (
    <label>{label}
      <select value={sel} onChange={(e) => { const v = e.target.value; if (v === CUSTOM) { setCustom(true); onChange(''); } else { setCustom(false); onChange(v); } }}>
        <option value="">{ui('opt.default')}</option>
        {opt.choices.map((c) => <option key={c} value={c}>{c}</option>)}
        {opt.free && <option value={CUSTOM}>{ui('opt.custom')}</option>}
      </select>
      {custom && <input value={value} placeholder={ui('opt.custom.ph')} onChange={(e) => onChange(e.target.value.trim())} />}
    </label>
  );
}

// Parameters of the selected agent. Used in onboarding and in the settings menu.
export function AgentOptions({ agent, values, onChange }: { agent: AgentHealth | undefined; values: Values; onChange: (v: Values) => void }) {
  const { ui } = useStore();
  if (!agent) return null;
  const names = Object.keys(agent.options ?? {});
  return (
    <div className="agent-options">
      {names.map((n) => <OptionField key={`${agent.preset}:${n}`} name={n} opt={agent.options[n]!} value={values[n] ?? ''} onChange={(v) => onChange({ ...values, [n]: v })} />)}
      {!names.includes('effort') && <span className="small muted">{ui('opt.effort.none')}</span>}
      <span className="small muted">{ui('opt.note')}</span>
    </div>
  );
}

export function Onboarding() {
  const { ui, lang, setLang, session, finishSetup, refreshSession, setError } = useStore();
  const [status, setStatus] = useState<Status | null>(null);
  const [chosen, setChosen] = useState<string>('');
  const [values, setValues] = useState<Record<string, Values>>({}); // parameters per preset, until saved
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api<Status>('GET', '/api/agents').then((s) => {
      setStatus(s);
      // default: the already selected one if found; otherwise the first found; otherwise the current one
      const found = s.agents.filter((a) => a.found);
      setChosen(found.some((a) => a.preset === s.default) ? s.default : found[0]?.preset ?? s.default);
      setValues(Object.fromEntries(s.agents.map((a) => [a.preset, savedValues(a)])));
    }).catch((e) => setError(String(e)));
  }, [setError]);
  const current = status?.agents.find((a) => a.preset === chosen);
  const scopeKey = (s: string) => (s === 'restricted' ? 'scope.restricted' : s === 'sandbox' ? 'scope.sandbox' : s === 'plan' ? 'scope.plan' : null);
  const go = async () => {
    setSaving(true);
    try {
      if (status && chosen) await api('PUT', '/api/agents/default', { name: chosen, options: values[chosen] ?? {} });
      await refreshSession();
      finishSetup();
    } catch (e) { setError(String(e)); }
    setSaving(false);
  };
  return (
    <div className="onboard">
      <section className="card onboard-card">
        <h1>{ui('ob.title')}</h1>
        <p className="muted">{ui('ob.lead')}</p>
        <h2>{ui('ob.lang')}</h2>
        <div className="seg">
          {(['en', 'ru'] as Lang[]).map((l) => <button key={l} className={`btn ${lang === l ? 'gold' : 'ghost'}`} onClick={() => setLang(l)}>{l === 'en' ? 'English' : 'Русский'}</button>)}
        </div>
        <h2>{ui('ob.agent')}</h2>
        <p className="muted small">{ui('ob.agent.note')}</p>
        {session?.demo && <p className="ok">{ui('ob.demo')}</p>}
        {!status ? <p className="muted">{ui('ob.checking')}</p> : (
          <div className="agent-cards">
            {status.agents.map((a) => {
              const sk = scopeKey(a.scope);
              return (
                <button key={a.preset} className={`agent-card ${chosen === a.preset ? 'chosen' : ''} ${a.found ? '' : 'missing'}`} onClick={() => setChosen(a.preset)} disabled={!a.found && !session?.demo}>
                  <div className="agent-card-head"><b>{a.title}</b>{chosen === a.preset && <span className="chip st-learned"><Check size={12} /> {ui('ob.chosen')}</span>}</div>
                  <div className={`small ${a.found ? 'ok' : 'muted'}`}>{a.found ? ui('ob.found', { v: a.version }) : ui('ob.notfound')}</div>
                  {sk && <div className="small muted">{ui(sk)}</div>}
                  {!a.found && a.install && <a className="small" href={a.install} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{ui('ob.install')} <ExternalLink size={11} /></a>}
                </button>
              );
            })}
          </div>
        )}
        {current && Object.keys(current.options ?? {}).length > 0 && <AgentOptions agent={current} values={values[chosen] ?? {}} onChange={(v) => setValues((cur) => ({ ...cur, [chosen]: v }))} />}
        <div className="row onboard-foot">
          <span className="muted small">{ui('ob.later')}</span>
          <span className="spacer" />
          <button className="btn gold" disabled={saving || !status} onClick={go}>{ui('ob.continue')}</button>
        </div>
      </section>
    </div>
  );
}
