// Assembles packs/src/<pack>/ into one packs/<pack>.json (schema v2) and packs/<pack>.credits.md.
// Usage: tsx tools/build-pack.ts [packs/src/ai-engineer] [--out packs]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadSources, walkOrder, type Topic, type Material } from './pack-lib.ts';

const args = process.argv.slice(2);
const srcDir = resolve(args.find((a) => !a.startsWith('--')) ?? 'packs/src/ai-engineer');
const outIdx = args.indexOf('--out');
const outDir = resolve(outIdx >= 0 ? args[outIdx + 1] : 'packs');

const src = loadSources(srcDir);
const byKey = new Map(src.topics.map((t) => [t.key, t]));
const areaById = new Map(src.areas.map((a) => [a.id, a]));

// 1. walk in study order; first occurrence of a URL is studied, later ones are marked as repeats
const walk = walkOrder(src);
const firstSeen = new Map<string, Topic>();
let seq = 0;
const cleanTopic = (t: Topic): Topic => {
  const { _file, ...rest } = t;
  const materials: Material[] = rest.materials.map((m) => {
    const prev = firstSeen.get(m.url);
    const out: Material = { ...m };
    if (prev && prev.key !== t.key) out.repeat_of = { topic: prev.key, title: prev.title };
    else if (!prev) firstSeen.set(m.url, t);
    return out;
  });
  const refs = rest.refs?.map((r) => ({ ...r, title: byKey.get(r.topic)?.title }));
  return { ...rest, seq: seq++, materials, ...(refs ? { refs } : {}) } as Topic;
};

// 2. group by grade
const grades = [...src.meta.grades].sort((a, b) => a.order - b.order).map((g) => {
  const core: Topic[] = [];
  const adjacent: { area: string; area_title: unknown; level: string; hours: number; check: unknown; topics: Topic[] }[] = [];
  for (const w of walk) {
    if (w.grade !== g.id) continue;
    if (!w.adjacent) { core.push(cleanTopic(w.topic)); continue; }
    let slot = adjacent.find((a) => a.area === w.adjacent!.area && a.level === w.adjacent!.level);
    if (!slot) {
      const area = areaById.get(w.adjacent.area)!;
      const lv = area.levels.find((l) => l.level === w.adjacent!.level)!;
      slot = { area: area.id, area_title: area.title, level: lv.level, hours: lv.hours, check: lv.check, topics: [] };
      adjacent.push(slot);
    }
    slot.topics.push(cleanTopic(w.topic));
  }
  const adjHours = adjacent.reduce((s, a) => s + a.hours, 0);
  return { id: g.id, order: g.order, title: g.title, gate: g.gate ?? 'exam', hours: { core: g.hours_core, adjacent: adjHours, total: g.hours_core + adjHours }, exam: g.exam, checks: g.checks ?? { ru: [], en: [] }, core, adjacent };
});

const hours = {
  core: grades.reduce((s, g) => s + g.hours.core, 0),
  adjacent: grades.reduce((s, g) => s + g.hours.adjacent, 0),
  total: 0,
};
hours.total = hours.core + hours.adjacent;

// 3. stats and credits
const all = grades.flatMap((g) => [...g.core, ...g.adjacent.flatMap((a) => a.topics)]);
const mats = all.flatMap((t) => t.materials);
const channelCounts = new Map<string, number>();
for (const m of mats) {
  const mm = /^channel:@?([^/]+)/.exec(m.source);
  if (mm) channelCounts.set(mm[1], (channelCounts.get(mm[1]) ?? 0) + 1);
}
const credits = ((src.meta.credits ?? []) as { channel: string; url: string; attribution?: string; note?: { ru: string; en: string } }[])
  .map((c) => ({ ...c, materials: channelCounts.get(c.channel) ?? 0 }));
for (const [ch, n] of channelCounts) if (!credits.some((c) => c.channel === ch)) {
  console.error(`ERR channel ${ch} used by ${n} material(s) but missing in pack.json credits (consent required)`);
  process.exit(1);
}
const stats = {
  topics: all.length,
  materials: mats.length,
  repeats: mats.filter((m) => m.repeat_of).length,
  own_texts: all.reduce((s, t) => s + (t.own_texts?.length ?? 0), 0),
  refs: all.reduce((s, t) => s + (t.refs?.length ?? 0), 0),
  unique_urls: new Set(mats.map((m) => m.url)).size,
  minutes_total: all.reduce((s, t) => s + t.minutes_total, 0),
};

const pack = {
  schema: 2,
  id: src.meta.id,
  version: src.meta.version,
  built_at: new Date().toISOString().slice(0, 10),
  title: src.meta.title,
  description: src.meta.description,
  license: src.meta.license,
  language: src.meta.language,
  hours,
  stats,
  credits,
  areas: src.areas.map(({ _file, ...a }) => a),
  grades,
};

mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${pack.id}.json`);
writeFileSync(outFile, JSON.stringify(pack, null, 1) + '\n', 'utf8');

const creditsMd = [
  `# Credits: ${pack.title.en}`,
  '',
  `Pack content (topics, criteria, own texts) is © Study Hub contributors, CC BY-SA 4.0. Linked materials belong to their authors under their own terms (see \`terms\` on each material).`,
  '',
  '## Telegram channels (links to posts used with the author\'s consent, attribution required)',
  '',
  ...credits.map((c) => `- [@${c.channel}](${c.url}) — ${c.materials} link(s). ${c.note?.en ?? ''}`.trim()),
  '',
  '## Linked sources by domain',
  '',
  ...[...mats.reduce((m, x) => { const h = new URL(x.url).hostname; m.set(h, (m.get(h) ?? 0) + 1); return m; }, new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]).map(([h, n]) => `- ${h}: ${n}`),
  '',
].join('\n');
writeFileSync(join(outDir, `${pack.id}.credits.md`), creditsMd, 'utf8');

console.log(`built ${outFile}: ${stats.topics} topics, ${stats.materials} materials (${stats.repeats} repeats), ${stats.own_texts} own texts, ${stats.refs} refs, ${stats.unique_urls} urls, ${hours.total} h (core ${hours.core} + adjacent ${hours.adjacent})`);
for (const g of grades) console.log(`  ${g.id} ${g.hours.total} h = core ${g.hours.core} (${g.core.length} topics) + adjacent ${g.hours.adjacent} (${g.adjacent.map((a) => `${a.area}-${a.level}`).join(' ')})`);
