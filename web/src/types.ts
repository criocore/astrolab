// Pack types are shared with the server and the tools; the rest are the API shapes the interface reads.
export type { AdjacentLevel, Grade, Lang, Material, OwnText, Pack, Probe, Ref, Text, Topic } from '../../shared/pack';
import type { Lang, Probe } from '../../shared/pack';

export type ProbeResult = { topic: string; probe: Probe; ok: boolean; detail: string };
export type AgentCall = { ok: boolean; error?: string; detail?: string; ms: number; agent: string; at: string; via?: 'check' | 'button'; source?: 'live' | 'record' };

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
