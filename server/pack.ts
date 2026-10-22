// Pack v2: loading, topic index by key, grade membership and locks.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type Text = { ru: string; en: string };
export type Lang = 'ru' | 'en';
export type Material = {
  id: string; title: string; url: string; kind: 'understand' | 'do'; type: string; access: string; date: string | null; classic: boolean;
  minutes: number; lang: string; checked_at: string; source: string; terms: string; track?: string; closes: Text; criteria: number[];
  repeat_of?: { topic: string; title: Text };
};
export type OwnText = { id: string; title: Text; kind: 'understand' | 'do'; minutes: number; criteria: number[]; body: Text; terms: string };
export type Ref = { id: string; topic: string; title?: Text; criteria_there: number[]; criteria: number[]; closes: Text };
export type Topic = {
  key: string; id: string; seq: number; order: number; grade?: string; area?: string; level?: string; to_grade?: string;
  title: Text; goal: Text; criteria: { ru: string[]; en: string[] }; materials: Material[]; own_texts?: OwnText[]; refs?: Ref[];
  minutes_total: number; minutes_by_track?: Record<string, number>;
  probe?: 'hub' | 'node' | 'git' | 'agent' | 'manual';
};
export type AdjacentLevel = { area: string; area_title: Text; level: string; hours: number; check: Text; topics: Topic[] };
export type Grade = {
  id: string; order: number; title: Text; gate?: 'exam' | 'none'; hours: { core: number; adjacent: number; total: number }; exam: Text; checks: { ru: string[]; en: string[] };
  core: Topic[]; adjacent: AdjacentLevel[];
};
export type Pack = {
  schema: 2; id: string; version: string; title: Text; description?: Text; license: string;
  hours: { core: number; adjacent: number; total: number }; stats?: Record<string, number>;
  credits?: { channel: string; url: string; materials?: number }[];
  areas: { id: string; title: Text; levels: { level: string; hours: number; to_grade: string; check: Text }[] }[];
  grades: Grade[];
};

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

export type ExamPassed = Record<string, { passed: boolean }>; // target (G1 | R1/A) -> status

// A grade is open if it is the first grade, the previous one has no evolution (gate none), or the previous grade's exam is passed.
export function isGradeUnlocked(pack: Pack, gradeId: string, exams: ExamPassed): boolean {
  const sorted = [...pack.grades].sort((a, b) => a.order - b.order);
  const i = sorted.findIndex((g) => g.id === gradeId);
  if (i < 0) return false;
  if (i === 0) return true;
  const prev = sorted[i - 1];
  return prev.gate === 'none' || !!exams[prev.id]?.passed;
}

export function isTopicUnlocked(lp: LoadedPack, key: string, exams: ExamPassed): boolean {
  const g = lp.gradeOf.get(key);
  return g !== undefined && isGradeUnlocked(lp.pack, g, exams);
}

export function findLevel(pack: Pack, target: string): { grade: Grade; level: AdjacentLevel } | null {
  for (const g of pack.grades) for (const lv of g.adjacent) if (levelKey(lv.area, lv.level) === target) return { grade: g, level: lv };
  return null;
}

export const text = (t: Text | undefined, lang: Lang) => (t ? t[lang] || t.ru || t.en : '');
