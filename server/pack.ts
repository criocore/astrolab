// Pack v2: loading, topic index by key, grade membership and locks. Types and the lock rule are in shared/pack.ts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type AdjacentLevel, type ExamPassed, type Grade, isGradeUnlocked, type Lang, type Pack, type Text, type Topic } from '../shared/pack.ts';
export type { AdjacentLevel, ExamPassed, Grade, Lang, Material, OwnText, Pack, Ref, Text, Topic } from '../shared/pack.ts';
export { isGradeUnlocked } from '../shared/pack.ts';

export type LoadedPack = {
  path: string; raw: string; pack: Pack;
  topics: Map<string, Topic>;                 // key → topic
  gradeOf: Map<string, string>;               // topic key -> grade id (for adjacent: to_grade)
  levelOf: Map<string, AdjacentLevel>;        // topic key -> level (adjacent only)
};

// Pack: from STUDY_HUB_PACK, otherwise the first schema-2 .json in packs/.
export function findPack(root: string, env = process.env): string {
  if (env.STUDY_HUB_PACK) return resolve(env.STUDY_HUB_PACK);
  const dir = join(root, 'packs');
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
      const p = join(dir, f);
      try { if (JSON.parse(readFileSync(p, 'utf8')).schema === 2) return p; } catch { /* not a pack */ }
    }
  }
  throw new Error('No schema-2 pack found: build it (npm run build:pack) or set STUDY_HUB_PACK');
}

export function loadPack(path: string): LoadedPack {
  const raw = readFileSync(path, 'utf8');
  const pack = JSON.parse(raw) as Pack;
  if (pack.schema !== 2) throw new Error(`${path}: a schema-2 pack is expected`);
  const topics = new Map<string, Topic>();
  const gradeOf = new Map<string, string>();
  const levelOf = new Map<string, AdjacentLevel>();
  for (const g of pack.grades) {
    for (const t of g.core) { topics.set(t.key, t); gradeOf.set(t.key, g.id); }
    for (const lv of g.adjacent) for (const t of lv.topics) { topics.set(t.key, t); gradeOf.set(t.key, g.id); levelOf.set(t.key, lv); }
  }
  return { path, raw, pack, topics, gradeOf, levelOf };
}

export const levelKey = (area: string, level: string) => `${area}/${level}`;

export function isTopicUnlocked(lp: LoadedPack, key: string, exams: ExamPassed): boolean {
  const g = lp.gradeOf.get(key);
  return g !== undefined && isGradeUnlocked(lp.pack, g, exams);
}

export function findLevel(pack: Pack, target: string): { grade: Grade; level: AdjacentLevel } | null {
  for (const g of pack.grades) for (const lv of g.adjacent) if (levelKey(lv.area, lv.level) === target) return { grade: g, level: lv };
  return null;
}

export const text = (t: Text | undefined, lang: Lang) => (t ? t[lang] || t.ru || t.en : '');
