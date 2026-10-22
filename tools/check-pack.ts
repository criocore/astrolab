// Validates pack sources (packs/src/<pack>) and, if present, the built pack against packs/schema/pack.schema.json.
// Usage: tsx tools/check-pack.ts [packs/src/ai-engineer] [--built packs/ai-engineer.json]
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadSources, walkOrder, rel, type Topic } from './pack-lib.ts';

const args = process.argv.slice(2);
const srcDir = resolve(args.find((a) => !a.startsWith('--')) ?? 'packs/src/ai-engineer');
const builtIdx = args.indexOf('--built');
const builtPath = builtIdx >= 0 ? resolve(args[builtIdx + 1]) : null;

const errs: string[] = [];
const warns: string[] = [];
const src = loadSources(srcDir);
const byKey = new Map(src.topics.map((t) => [t.key, t]));
const gradeIds = new Set(src.meta.grades.map((g) => g.id));
const areaIds = new Set(src.areas.map((a) => a.id));
const BANNED = ['roadmap.sh', 'youtube.com', 'youtu.be'];

for (const t of src.topics) {
  const f = rel(src, t._file);
  const n = t.criteria.ru.length;
  if (n !== t.criteria.en.length) errs.push(`${f}: criteria RU ${n} != EN ${t.criteria.en.length}`);
  if (n < 1) errs.push(`${f}: no criteria`);
  if (t.area) {
    if (!areaIds.has(t.area)) errs.push(`${f}: unknown area ${t.area}`);
    const a = src.areas.find((x) => x.id === t.area);
    if (a && !a.levels.some((l) => l.level === t.level)) errs.push(`${f}: level ${t.level} not in ${t.area}/levels.json`);
    if (t.to_grade && !gradeIds.has(t.to_grade)) errs.push(`${f}: unknown to_grade ${t.to_grade}`);
  } else if (!gradeIds.has(t.grade ?? '')) errs.push(`${f}: unknown grade ${t.grade}`);

  const cov = new Set<number>(); const kinds = new Set<string>(); const ids = new Set<string>();
  const items: { id: string; kind: string; criteria: number[] }[] = [...t.materials, ...(t.own_texts ?? [])];
  for (const m of items) {
    if (ids.has(m.id)) errs.push(`${f}: duplicate material id ${m.id}`); ids.add(m.id);
    kinds.add(m.kind);
    if (!m.criteria.length) errs.push(`${f}: ${m.id} closes no criteria`);
    for (const c of m.criteria) { if (c < 1 || c > n) errs.push(`${f}: ${m.id} criterion ${c} out of 1..${n}`); cov.add(c); }
  }
  for (const m of t.materials) {
    if (!/^https?:\/\//.test(m.url)) errs.push(`${f}: ${m.id} bad url`);
    if (!m.closes?.ru || !m.closes?.en) errs.push(`${f}: ${m.id} missing closes`);
    if (m.date !== null && !/^\d{4}(-\d{2})?$/.test(m.date)) errs.push(`${f}: ${m.id} date must be YYYY, YYYY-MM or null`);
  }
  for (const r of t.refs ?? []) {
    for (const c of r.criteria) { if (c < 1 || c > n) errs.push(`${f}: ref ${r.id} criterion ${c} out of range`); cov.add(c); }
    const target = byKey.get(r.topic);
    if (!target) errs.push(`${f}: ref ${r.id} -> unknown topic ${r.topic}`);
    else for (const c of r.criteria_there) if (c < 1 || c > target.criteria.ru.length) errs.push(`${f}: ref ${r.id} criterion ${c} missing in ${r.topic}`);
  }
  for (let c = 1; c <= n; c++) if (!cov.has(c)) errs.push(`${f}: criterion ${c} not covered`);
  for (const k of ['understand', 'do']) if (!kinds.has(k)) errs.push(`${f}: no ${k} item`);

  const sum = t.materials.reduce((s, m) => s + m.minutes, 0) + (t.own_texts ?? []).reduce((s, o) => s + o.minutes, 0);
  if (!t.minutes_by_track && t.minutes_total !== sum) warns.push(`${f}: minutes_total ${t.minutes_total} != sum ${sum}`);
  if (t.minutes_by_track) {
    const mx = Math.max(...Object.values(t.minutes_by_track));
    if (t.minutes_total !== mx) warns.push(`${f}: minutes_total ${t.minutes_total} != max track ${mx}`);
  }
  if (t.probe && !['hub', 'node', 'git', 'agent', 'manual'].includes(t.probe)) errs.push(`${f}: unknown probe ${t.probe}`);
  const g0 = src.meta.grades.find((g) => g.id === t.grade);
  if (t.probe && (!g0 || g0.gate !== 'none')) errs.push(`${f}: probe is allowed only in a grade with gate none`);
  if (!t.probe && g0?.gate === 'none') errs.push(`${f}: every topic of a gate-none grade needs a probe`);
  const raw = readFileSync(t._file, 'utf8').toLowerCase();
  for (const b of BANNED) if (raw.includes(b)) errs.push(`${f}: contains ${b}`);
}

// unique order within grade core / area level
const seen = new Map<string, string>();
for (const t of src.topics) {
  const g = t.area ? `${t.area}/${t.level}` : `${t.grade}/core`;
  const k = `${g}#${t.order}`;
  if (seen.has(k)) errs.push(`duplicate order ${k}: ${t.key} and ${seen.get(k)}`);
  seen.set(k, t.key);
}
// every level has topics; every grade has core topics
for (const a of src.areas) for (const l of a.levels) {
  if (!src.topics.some((t) => t.area === a.id && t.level === l.level)) errs.push(`${a.id}/${l.level}: no topics`);
  if (!gradeIds.has(l.to_grade)) errs.push(`${a.id}/${l.level}: unknown to_grade ${l.to_grade}`);
}
for (const g of src.meta.grades) if (!src.topics.some((t) => t.grade === g.id && !t.area)) errs.push(`${g.id}: no core topics`);
// exam checks: 5-8 items, ru and en of the same length
for (const g of src.meta.grades) {
  if (g.gate === 'none') { if (g.checks) errs.push(`${g.id}: gate none must not have checks`); continue; }
  const c = g.checks;
  if (!c || !Array.isArray(c.ru) || !Array.isArray(c.en)) { errs.push(`${g.id}: checks missing (ru/en arrays)`); continue; }
  if (c.ru.length < 5 || c.ru.length > 8) errs.push(`${g.id}: checks must have 5-8 items, got ${c.ru.length}`);
  if (c.ru.length !== c.en.length) errs.push(`${g.id}: checks ru (${c.ru.length}) and en (${c.en.length}) differ in length`);
}

// walk covers every topic exactly once
const walked = walkOrder(src).map((w) => w.topic.key);
if (new Set(walked).size !== walked.length) errs.push('walk order visits a topic twice');
for (const t of src.topics) if (!walked.includes(t.key)) errs.push(`${t.key}: unreachable in walk order (level to_grade?)`);

// stats
const urls = new Set(src.topics.flatMap((t: Topic) => t.materials.map((m) => m.url)));
const mats = src.topics.reduce((s, t) => s + t.materials.length, 0);
const own = src.topics.reduce((s, t) => s + (t.own_texts?.length ?? 0), 0);
console.log(`sources: ${src.topics.length} topics, ${mats} materials, ${own} own texts, ${urls.size} unique urls, ${src.areas.length} areas`);

// built pack vs JSON schema (ajv optional)
if (builtPath) {
  if (!existsSync(builtPath)) errs.push(`built pack not found: ${builtPath}`);
  else {
    const schema = JSON.parse(readFileSync(join(process.cwd(), 'packs/schema/pack.schema.json'), 'utf8'));
    const built = JSON.parse(readFileSync(builtPath, 'utf8'));
    try {
      const mod: any = await import('ajv/dist/2020.js');
      const Ajv = mod.default?.default ?? mod.default; // CJS default-export shape differs between loaders
      const ajv = new Ajv({ allErrors: true, strict: false });
      const ok = ajv.validate(schema, built);
      if (!ok) for (const e of ajv.errors ?? []) errs.push(`schema ${e.instancePath}: ${e.message}`);
      else console.log(`built pack ${rel({ dir: process.cwd() } as any, builtPath)} matches schema`);
    } catch (e) {
      warns.push(`ajv not installed, schema check skipped (${(e as Error).message.split('\n')[0]})`);
    }
  }
}

for (const w of warns) console.log('WARN ' + w);
for (const e of errs) console.log('ERR  ' + e);
console.log(errs.length ? `${errs.length} error(s)` : 'OK');
process.exit(errs.length ? 1 : 0);
