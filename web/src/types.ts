export type Lang = 'ru' | 'en';
export type Text = { ru: string; en: string };

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
  probe?: Probe; // topic of an era without an evolution: the hub probe lights the star (manual = checkbox)
};
export type Probe = 'hub' | 'node' | 'git' | 'agent' | 'manual';
export type ProbeResult = { topic: string; probe: Probe; ok: boolean; detail: string };
export type AgentCall = { ok: boolean; error?: string; detail?: string; ms: number; agent: string; at: string; via?: 'check' | 'button' };
export type AdjacentLevel = { area: string; area_title: Text; level: string; hours: number; check: Text; topics: Topic[] };
export type Grade = { id: string; order: number; title: Text; gate?: 'exam' | 'none'; hours: { core: number; adjacent: number; total: number }; exam: Text; checks: { ru: string[]; en: string[] }; core: Topic[]; adjacent: AdjacentLevel[] };
export type Pack = {
  schema: 2; id: string; version: string; title: Text; description?: Text; license: string;
  hours: { core: number; adjacent: number; total: number }; stats?: Record<string, number>;
  credits?: { channel: string; url: string; materials?: number }[];
  areas: { id: string; title: Text; levels: { level: string; hours: number; to_grade: string; check: Text }[] }[];
  grades: Grade[];
};

export type TopicStatus = 'not_started' | 'in_progress' | 'gap' | 'learned';
export type TopicState = { status: TopicStatus; learnedAt: string | null; note: string; hours: number | null; updatedAt?: string };
export type ExamCheck = { id: string; verdict: 'pass' | 'gap' | 'unclear'; evidence: { path: string; quote: string }; note: string; verified?: boolean };
export type ExamVerdict = { verdict: 'pass' | 'gap'; checks: ExamCheck[]; feedback: string; next_steps: string[] };
export type ExamRow = {
  id: string; kind: 'grade' | 'level'; target: string; folder: string; lang: string; status: 'running' | 'done' | 'error' | 'stopped';
  verdict: ExamVerdict | null; passed: boolean; source: string; duration_ms: number; session_id: string; error: string; at: string;
};
export type JournalRow = { id: number; date: string; minutes: number; text: string; topic_key: string | null };
export type RadarRow = { id: number; name: string; ring: string; note: string; date: string };
export type AdrRow = { id: number; title: string; status: string; context: string; options: string; decision: string; date: string };
export type State = {
  topics: Record<string, TopicState>;
  exams: Record<string, { passed: boolean; last: ExamRow | null }>;
  journal: JournalRow[]; radar: RadarRow[]; adr: AdrRow[];
};
export type Session = { token: string; pack: string; packPath: string; mentorMode: 'live' | 'record' | 'replay'; demo: boolean; lang: Lang; agent: AgentHealth };
export type OptionStatus = { choices: string[]; free: boolean; value: string };
export type AgentHealth = { preset: string; title: string; found: boolean; version: string; install: string; scope: string; modes: string[]; options: Record<string, OptionStatus> };

export type Question = { id: string; text: string };
export type Attempt = { id: string; question_id: string; answer: string; verdict: 'pass' | 'gap'; quote: string; gap: string; material_id: string; feedback: string; source: string; at: string };
export type CheckHistory = { id: string; lang: Lang; questions: Question[]; source: string; created_at: string; attempts: Attempt[] };
export type AttemptResult = { attempt_id: string; verdict: 'pass' | 'gap'; quote: string; feedback: string; gap?: string; material?: { id: string; title: string; url: string }; status: TopicStatus; source: string; error?: string };
export type ExamEvent = { type: 'tool'; name: string; target: string } | { type: 'done'; exam: ExamRow } | { type: 'error'; error: string; detail?: string };

export type AgentContext = { title?: string; summary?: string; grade?: string; criteria?: string[]; links?: { title: string; url: string }[]; exam?: string; note?: string };
