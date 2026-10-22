// Shared loader for pack sources: packs/src/<pack>/{pack.json, G*/*.json, R*/levels.json, R*/<L>-*.json}
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

export type Text = { ru: string; en: string };
export type Material = {
  id: string; title: string; url: string; kind: 'understand' | 'do'; type: string; access: string;
  date: string | null; classic: boolean; minutes: number; lang: string; checked_at: string;
  source: string; terms: string; track?: string; closes: Text; criteria: number[];
  repeat_of?: { topic: string; title: Text };
};
export type OwnText = { id: string; title: Text; kind: 'understand' | 'do'; minutes: number; criteria: number[]; source: 'own'; terms: string; body: Text };
export type Ref = { id: string; topic: string; title?: Text; criteria_there: number[]; criteria: number[]; closes: Text };
export type Topic = {
  key: string; seq?: number; id: string; order: number; grade?: string; area?: string; level?: string; to_grade?: string;
  title: Text; goal: Text; criteria: { ru: string[]; en: string[] };
  materials: Material[]; own_texts?: OwnText[]; refs?: Ref[]; minutes_total: number; minutes_by_track?: Record<string, number>;
  probe?: 'hub' | 'node' | 'git' | 'agent' | 'manual'; // topic of a gateless era: the hub lights the star (or a tick when manual)
  _file: string;
};
export type Level = { level: string; hours: number; to_grade: string; check: Text };
export type Area = { id: string; title: Text; levels: Level[]; _file: string };
// gate: exam (default) = gate with a folder exam; none = no gate, topics are lit by probes, checks not needed.
export type GradeMeta = { id: string; order: number; title: Text; hours_core: number; exam: Text; checks?: { ru: string[]; en: string[] }; gate?: 'exam' | 'none' };
export type PackMeta = { id: string; version: string; title: Text; description?: Text; license: string; language?: unknown; grades: GradeMeta[]; credits?: unknown[] };

export type Sources = { dir: string; meta: PackMeta; topics: Topic[]; areas: Area[] };

function readJson(p: string) {
  const raw = readFileSync(p, 'utf8').replace(/^﻿/, '');
  return JSON.parse(raw);
}

export function loadSources(dir: string): Sources {
  const meta = readJson(join(dir, 'pack.json')) as PackMeta;
  const topics: Topic[] = [];
  const areas: Area[] = [];
  for (const sub of readdirSync(dir).sort()) {
    const full = join(dir, sub);
    if (!statSync(full).isDirectory()) continue;
    const isGrade = /^[GS]\d$/.test(sub), isArea = /^R\d+$/.test(sub); // S0 = setup era without a gate
    if (!isGrade && !isArea) continue;
    for (const f of readdirSync(full).sort()) {
      if (!f.endsWith('.json')) continue;
      const file = join(full, f);
      if (f === 'levels.json') {
        const lv = readJson(file);
        areas.push({ id: lv.area, title: lv.title, levels: lv.levels, _file: file });
        continue;
      }
      const t = readJson(file) as Topic;
      t._file = file;
      t.key = isGrade ? `${sub}/${t.id}` : `${sub}/${t.level}-${t.id}`;
      topics.push(t);
    }
  }
  return { dir, meta, topics, areas };
}

/** Walk order: for each grade by order — core topics, then adjacent levels (area number, level) with their topics. */
export function walkOrder(src: Sources): { topic: Topic; grade: string; adjacent?: { area: string; level: string } }[] {
  const out: { topic: Topic; grade: string; adjacent?: { area: string; level: string } }[] = [];
  const levelRank = (l: string) => ({ A: 0, B: 1, C: 2, PII: 3 } as Record<string, number>)[l] ?? 9;
  const areaNum = (a: string) => Number(a.slice(1));
  for (const g of [...src.meta.grades].sort((a, b) => a.order - b.order)) {
    const core = src.topics.filter((t) => t.grade === g.id && !t.area).sort((a, b) => a.order - b.order);
    for (const t of core) out.push({ topic: t, grade: g.id });
    const lvls: { area: string; level: string }[] = [];
    for (const a of src.areas) for (const l of a.levels) if (l.to_grade === g.id) lvls.push({ area: a.id, level: l.level });
    lvls.sort((x, y) => areaNum(x.area) - areaNum(y.area) || levelRank(x.level) - levelRank(y.level));
    for (const lv of lvls) {
      const ts = src.topics.filter((t) => t.area === lv.area && t.level === lv.level).sort((a, b) => a.order - b.order);
      for (const t of ts) out.push({ topic: t, grade: g.id, adjacent: lv });
    }
  }
  return out;
}

export function rel(src: Sources, file: string) {
  return file.slice(src.dir.length + 1).replaceAll('\\', '/');
}

export function fileName(p: string) {
  return basename(p);
}
