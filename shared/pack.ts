// Pack v2 as the server, the interface and the tools see it: the built pack's types and the era lock rule.
// One copy: the server enforces the rule, the sky and the era tree draw the same locks.

export type Text = { ru: string; en: string };
export type Lang = 'ru' | 'en';
export type Material = {
  id: string; title: string; url: string; kind: 'understand' | 'do'; type: string; access: string; date: string | null; classic: boolean;
  minutes: number; lang: string; checked_at: string; source: string; terms: string; track?: string; closes: Text; criteria: number[];
  repeat_of?: { topic: string; title: Text };
};
export type OwnText = { id: string; title: Text; kind: 'understand' | 'do'; minutes: number; criteria: number[]; body: Text; terms: string };
export type Ref = { id: string; topic: string; title?: Text; criteria_there: number[]; criteria: number[]; closes: Text };
export type Probe = 'hub' | 'node' | 'git' | 'agent' | 'manual';
export type Topic = {
  key: string; id: string; seq: number; order: number; grade?: string; area?: string; level?: string; to_grade?: string;
  title: Text; goal: Text; criteria: { ru: string[]; en: string[] }; materials: Material[]; own_texts?: OwnText[]; refs?: Ref[];
  minutes_total: number; minutes_by_track?: Record<string, number>;
  probe?: Probe; // topic of an era without an evolution: the hub probe lights the star (manual = checkbox)
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

export type ExamPassed = Record<string, { passed: boolean }>; // target (G1 | R1/A) -> status

// The exam an era waits for: the previous era's (by order), unless this is the first era or the previous one has no gate.
// null = open from the start, undefined = no such era.
export function gateBefore(pack: { grades: Grade[] }, gradeId: string): string | null | undefined {
  const sorted = [...pack.grades].sort((a, b) => a.order - b.order);
  const i = sorted.findIndex((g) => g.id === gradeId);
  if (i < 0) return undefined;
  return i === 0 || sorted[i - 1].gate === 'none' ? null : sorted[i - 1].id;
}

export function isGradeUnlocked(pack: { grades: Grade[] }, gradeId: string, exams: ExamPassed): boolean {
  const gate = gateBefore(pack, gradeId);
  return gate === null || (gate !== undefined && !!exams[gate]?.passed);
}
