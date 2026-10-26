// Topic check by the mentor: questions per criteria, then a verdict on each answer with a quote and evidence.
// A topic counts as learned when all questions of one check are accepted.
import { randomBytes } from 'node:crypto';
import type { Config } from './config.ts';
import { type Db, getCheck, getTopic, insertAttempt, insertCheck, attemptsOf, setMeta, setTopic, examsPassed } from './db.ts';
import { resolvePreset } from './adapter.ts';
import { askTwice, esc, loadPrompt } from './recordings.ts';
import { isTopicUnlocked, text, type Lang, type LoadedPack } from './pack.ts';
import { isValid } from './schema.ts';

export const MAX_ANSWER = 4000;
const NO_RETRY = new Set(['limit', 'auth', 'not_found', 'no_recording', 'mode_not_supported']); // retrying will not help
const retryable = (error: string) => !NO_RETRY.has(error); // the topic check's rule: any other agent error is asked again once
type Handled = { status: number; body: Record<string, unknown> };

// A live mentor answer proves the agent is logged in: the era I log reads this from meta.
export function noteAgentAnswered(config: Config, db: Db, ms: number, via: 'check' | 'button') {
  setMeta(db, 'agent_call', { ok: true, at: new Date().toISOString(), agent: resolvePreset(config).name, ms, via });
}
const err = (status: number, error: string): Handled => ({ status, body: { error } });

function covered(questions: { covers: string[] }[], n: number): boolean {
  const got = new Set(questions.flatMap((q) => q.covers));
  for (let i = 1; i <= n; i++) if (!got.has(String(i))) return false;
  return questions.every((q) => q.covers.every((c) => Number(c) >= 1 && Number(c) <= n));
}

export async function createCheck(config: Config, db: Db, lp: LoadedPack, key: string, lang: Lang): Promise<Handled> {
  const topic = lp.topics.get(key);
  if (!topic) return err(404, 'not_found');
  if (topic.probe) return err(400, 'probe_topic'); // the star is lit by a hub probe, not by the mentor
  if (!isTopicUnlocked(lp, key, examsPassed(db, lp.pack.id))) return err(409, 'locked');
  const p = loadPrompt(config, 'mentor-questions');
  const crit = topic.criteria[lang];
  const request = {
    mode: 'check' as const, step: 'questions', system: p.system.replaceAll('{{lang}}', lang), schema: p.schema, prompt_version: p.version,
    user: `<topic id="${topic.key}">\n<title>${esc(text(topic.title, lang))}</title>\n<goal>${esc(text(topic.goal, lang))}</goal>\n<criteria>\n${crit.map((c, i) => `${i + 1}. ${esc(c)}`).join('\n')}\n</criteria>\n</topic>`,
  };
  const a = await askTwice(config, request, { retryable, reject: (json) => (isValid(p.schema, json) && covered(json.questions, crit.length) ? null : 'schema_invalid') });
  if (!a.ok) return { status: 502, body: { error: a.error, duration_ms: a.total } };
  const r = a.call;
  const check = { id: `ck-${randomBytes(6).toString('hex')}`, pack: lp.pack.id, topic_key: key, lang, questions: a.json.questions, source: r.source, prompt_version: p.version, created_at: new Date().toISOString() };
  insertCheck(db, check);
  if (r.source === 'live') noteAgentAnswered(config, db, r.duration_ms, 'check');
  // A new check on a learned topic (a review) leaves it learned: only an answer with a gap takes it back.
  if (getTopic(db, lp.pack.id, key)?.status !== 'learned') setTopic(db, lp.pack.id, key, { status: 'in_progress' });
  return { status: 200, body: { check_id: check.id, questions: check.questions.map((q: any) => ({ id: q.id, text: q.text })), source: r.source, duration_ms: a.total, recorded_at: r.recorded_at } };
}

export async function createAttempt(config: Config, db: Db, lp: LoadedPack, checkId: string, input: { question_id?: unknown; answer?: unknown }): Promise<Handled> {
  const { question_id: qid, answer } = input;
  if (typeof qid !== 'string' || typeof answer !== 'string' || !answer.trim()) return err(400, 'bad_request');
  if (answer.length > MAX_ANSWER) return err(400, 'answer_too_long');
  const check = getCheck(db, checkId);
  if (!check) return err(404, 'not_found');
  const question = check.questions.find((q) => q.id === qid);
  const topic = lp.topics.get(check.topic_key);
  if (!question || !topic) return err(400, 'bad_request');
  const lang = check.lang as Lang;
  const p = loadPrompt(config, 'mentor-verdict');
  const covers = question.covers.map((n) => `${n}. ${esc(topic.criteria[lang][Number(n) - 1] ?? '')}`).join('\n');
  const materials = topic.materials.map((m) => `- id: ${m.id} | kind: ${m.kind} | title: ${esc(m.title)} | closes: ${esc(text(m.closes, lang))}`).join('\n');
  const request = {
    mode: 'check' as const, step: 'verdict', system: p.system.replaceAll('{{lang}}', lang), schema: p.schema, prompt_version: p.version,
    user: `<question id="${question.id}">${esc(question.text)}</question>\n<covers>\n${covers}\n</covers>\n<materials>\n${materials}\n</materials>\n<answer>${esc(answer)}</answer>`,
  };
  const materialIds = new Set(topic.materials.map((m) => m.id));
  const a = await askTwice(config, request, {
    retryable,
    reject: (json) => {
      if (!isValid(p.schema, json)) return 'schema_invalid';
      // The quote must be a non-empty substring of the answer; material_id comes from the topic (required for gap).
      if (!json.quote || !answer.includes(json.quote)) return 'quote_not_in_answer';
      if (json.verdict === 'gap' ? !materialIds.has(json.material_id) : json.material_id !== '' && !materialIds.has(json.material_id)) return 'bad_material';
      return null;
    },
  });
  if (!a.ok) return { status: 502, body: { error: a.error, duration_ms: a.total } };
  const verdict = a.json;
  const { source, recorded_at: recordedAt } = a.call;
  if (source === 'live') noteAgentAnswered(config, db, a.call.duration_ms, 'check');
  const total = a.total;
  const attempt = {
    id: `at-${randomBytes(6).toString('hex')}`, check_id: check.id, question_id: question.id, answer, verdict: verdict.verdict, quote: verdict.quote,
    gap: verdict.gap ?? '', material_id: verdict.material_id ?? '', feedback: verdict.feedback ?? '', source, duration_ms: total, at: new Date().toISOString(),
  };
  insertAttempt(db, attempt);
  // Topic status: all questions of the check accepted -> learned; otherwise gap/in_progress.
  const all = attemptsOf(db, check.id);
  const accepted = (q: string) => all.some((a) => a.question_id === q && a.verdict === 'pass');
  // A learned topic under review stays learned until an answer shows a gap; a gap clears the learned date.
  const wasLearned = getTopic(db, lp.pack.id, check.topic_key)?.status === 'learned';
  const allAccepted = check.questions.every((q) => accepted(q.id));
  const status: 'in_progress' | 'gap' | 'learned' = allAccepted ? 'learned' : attempt.verdict === 'gap' ? 'gap' : wasLearned ? 'learned' : 'in_progress';
  setTopic(db, lp.pack.id, check.topic_key, { status, ...(allAccepted ? { learnedAt: attempt.at } : status === 'gap' ? { learnedAt: null } : {}) });
  const body: Record<string, unknown> = { attempt_id: attempt.id, verdict: attempt.verdict, quote: attempt.quote, feedback: attempt.feedback, source, duration_ms: total, status, recorded_at: recordedAt };
  if (attempt.verdict === 'gap') {
    body.gap = attempt.gap;
    const m = topic.materials.find((x) => x.id === attempt.material_id);
    if (m) body.material = { id: m.id, title: m.title, url: m.url };
  }
  return { status: 200, body };
}
