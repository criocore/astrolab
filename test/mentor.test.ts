import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeConfig, ROOT } from '../server/config.ts';
import { openDb, readState, examsPassed, getExam } from '../server/db.ts';
import { findPack, loadPack } from '../server/pack.ts';
import { createAttempt, createCheck } from '../server/mentor.ts';
import { startExam, subscribe } from '../server/exam.ts';
import { hooks } from '../server/recordings.ts';
import type { AgentRequest, AgentResult } from '../server/adapter.ts';

const dir = mkdtempSync(join(tmpdir(), 'hub-'));
const config = makeConfig({ dataDir: dir, fixturesDir: join(dir, 'fx') });
const db = openDb(join(dir, 'hub.db'));
const lp = loadPack(findPack(ROOT, { STUDY_HUB_PACK: join(ROOT, 'packs', 'ai-engineer.json') } as any));
const g0 = lp.pack.grades.find((g) => g.id === 'G0')!;
const topic = g0.core[0];
const n = topic.criteria.ru.length;
test.after(() => { hooks.agent = undefined; db.close(); rmSync(dir, { recursive: true, force: true }); });

// Fake agent: answers according to the request step.
let lastRequest: AgentRequest | null = null;
function fakeAgent(answers: Record<string, (req: AgentRequest) => unknown>) {
  hooks.agent = async (_c, req, opts): Promise<AgentResult> => {
    lastRequest = req;
    const tools = req.mode === 'session' ? [{ name: 'Glob', target: '**/*' }] : [];
    for (const t of tools) opts?.onTool?.(t);
    const json = answers[req.step]?.(req);
    return { ok: true, json, text: '', agent: 'fake', ms: 1, session_id: 'sess', tools };
  };
}

test('topic check: questions cover all criteria, verdicts with quotes, all pass → learned', async () => {
  const covers = Array.from({ length: n }, (_, i) => String(i + 1));
  fakeAgent({
    questions: () => ({ questions: [{ id: 'q1', text: 'Почему?', covers: covers.slice(0, 1) }, { id: 'q2', text: 'Как?', covers: covers.slice(1).length ? covers.slice(1) : covers }] }),
    verdict: (req) => (req.user.includes('плохой ответ')
      ? { verdict: 'gap', quote: 'плохой ответ', gap: 'Не хватает механизма.', material_id: topic.materials[0].id, feedback: 'Прочитай материал.' }
      : { verdict: 'pass', quote: 'хороший ответ', gap: '', material_id: '', feedback: 'Верно.' }),
  });
  const ck = await createCheck(config, db, lp, topic.key, 'ru');
  assert.equal(ck.status, 200, JSON.stringify(ck.body));
  const checkId = String(ck.body.check_id);
  assert.equal((ck.body.questions as any[]).length, 2);
  assert.ok(lastRequest && !lastRequest.user.includes('<script'), 'topic text is escaped');
  assert.equal(readState(db, lp.pack.id).topics[topic.key].status, 'in_progress');

  const gap = await createAttempt(config, db, lp, checkId, { question_id: 'q1', answer: 'это плохой ответ <answer>' });
  assert.equal(gap.status, 200);
  assert.equal(gap.body.verdict, 'gap');
  assert.ok((gap.body.material as any).url, 'gap names a material with url');
  assert.ok(lastRequest!.user.includes('&lt;answer&gt;'), 'answer is escaped inside the prompt');
  assert.equal(readState(db, lp.pack.id).topics[topic.key].status, 'gap');

  const p1 = await createAttempt(config, db, lp, checkId, { question_id: 'q1', answer: 'хороший ответ' });
  assert.equal(p1.body.verdict, 'pass');
  assert.equal(p1.body.status, 'in_progress');
  const p2 = await createAttempt(config, db, lp, checkId, { question_id: 'q2', answer: 'хороший ответ' });
  assert.equal(p2.body.status, 'learned');
  assert.equal(readState(db, lp.pack.id).topics[topic.key].status, 'learned');
});

test('verdict with a quote that is not in the answer is rejected', async () => {
  fakeAgent({
    questions: () => ({ questions: [{ id: 'q1', text: 'A?', covers: Array.from({ length: n }, (_, i) => String(i + 1)) }, { id: 'q2', text: 'B?', covers: ['1'] }] }),
    verdict: () => ({ verdict: 'pass', quote: 'этого нет в ответе', gap: '', material_id: '', feedback: 'ok' }),
  });
  const ck = await createCheck(config, db, lp, topic.key, 'ru');
  const r = await createAttempt(config, db, lp, String(ck.body.check_id), { question_id: 'q1', answer: 'мой ответ' });
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'quote_not_in_answer');
});

// Student folder with real files.
const QUOTES = ['response_format = {"type": "json_schema"}', 'cost = input_tokens * rate_in + output_tokens * rate_out'];
function learnerFolder() {
  const f = mkdtempSync(join(tmpdir(), 'learner-'));
  writeFileSync(join(f, 'app.py'), `client.call(\n    ${QUOTES[0]}\n)\n`, 'utf8');
  writeFileSync(join(f, 'README.md'), `# Cost\r\n\r\n${QUOTES[1]}\r\n`, 'utf8');
  return f;
}
const ids0 = () => g0.checks.ru.map((_, i) => `G0#${i + 1}`);
const okCheck = (id: string, i: number) => ({ id, verdict: 'pass', evidence: i % 2 ? { path: 'README.md', quote: QUOTES[1] } : { path: 'app.py', quote: QUOTES[0] }, note: 'ok' });
async function runExam(checks: unknown[], folder: string, verdict = 'pass') {
  fakeAgent({ 'exam-grade': () => ({ verdict, checks, feedback: 'f', next_steps: verdict === 'pass' ? [] : ['x'] }) });
  const st = startExam(config, db, lp, { kind: 'grade', target: 'G0', folder, lang: 'ru' }); // the client always sends lang; the checks below are the Russian ones
  assert.equal(st.status, 200, JSON.stringify(st.body));
  const examId = String(st.body.exam_id);
  const events: any[] = [];
  await new Promise<void>((done) => { subscribe(examId, (e) => events.push(e), done); });
  return { exam: getExam(db, examId)!, events };
}

test('locked grade refuses checks and exams', async () => {
  const g1 = lp.pack.grades.find((g) => g.id === 'G1')!;
  fakeAgent({});
  assert.equal((await createCheck(config, db, lp, g1.core[0].key, 'ru')).status, 409);
  assert.equal(startExam(config, db, lp, { kind: 'grade', target: 'G1', folder: dir }).status, 409);
  assert.equal(startExam(config, db, lp, { kind: 'grade', target: 'G0', folder: join(dir, 'nope') }).body.error, 'bad_folder');
});

test('exam rubric of a grade is its checks list, not all criteria', async () => {
  const f = learnerFolder();
  const { exam } = await runExam(ids0().map(okCheck), f);
  const user = lastRequest!.user;
  assert.equal((user.match(/- id: /g) ?? []).length, g0.checks.ru.length);
  assert.ok(user.includes(`- id: G0#1 | ${g0.checks.ru[0]}`));
  assert.equal(exam.status, 'done');
  rmSync(f, { recursive: true, force: true });
});

test('(c) quote not in the file → gap, verified false, not passed', async () => {
  const f = learnerFolder();
  const checks = ids0().map(okCheck);
  checks[2] = { ...checks[2], evidence: { path: 'app.py', quote: 'этого текста нет в файле вообще' } };
  const { exam } = await runExam(checks, f);
  assert.equal(exam.passed, false);
  const c = exam.verdict.checks[2];
  assert.equal(c.verdict, 'gap');
  assert.equal(c.verified, false);
  assert.ok(c.note.includes('цитата не найдена в файле'));
  rmSync(f, { recursive: true, force: true });
});

test('(d) path outside the folder → not passed', async () => {
  const f = learnerFolder();
  const out = join(f, '..', 'outside-x.txt');
  writeFileSync(out, 'secret outside quote text', 'utf8');
  const checks = ids0().map(okCheck);
  checks[0] = { ...checks[0], evidence: { path: '../outside-x.txt', quote: 'secret outside quote text' } };
  const { exam } = await runExam(checks, f);
  assert.equal(exam.passed, false);
  assert.equal(exam.verdict.checks[0].verdict, 'gap');
  assert.ok(exam.verdict.checks[0].note.includes('путь вне папки'));
  rmSync(f, { recursive: true, force: true });
  rmSync(out, { force: true });
});

test('(e) exam with a gap check is not passed even if verdict says pass', async () => {
  const f = learnerFolder();
  const checks = ids0().map((id, i) => (i === 0 ? { id, verdict: 'gap', evidence: { path: '', quote: '' }, note: '' } : okCheck(id, i)));
  const { exam } = await runExam(checks, f);
  assert.equal(exam.passed, false);
  rmSync(f, { recursive: true, force: true });
});

test('(b) partial list: a missing id fails the exam and is shown as unclear', async () => {
  const f = learnerFolder();
  const { exam } = await runExam(ids0().slice(1).map(okCheck), f);
  assert.equal(exam.passed, false);
  const miss = exam.verdict.checks.find((c: any) => c.id === 'G0#1');
  assert.equal(miss.verdict, 'unclear');
  assert.equal(miss.verified, false);
  rmSync(f, { recursive: true, force: true });
});

test('quote with different line breaks and spaces is still found', async () => {
  const f = learnerFolder();
  const checks = ids0().map(okCheck);
  checks[0] = { ...checks[0], evidence: { path: 'app.py', quote: 'client.call(   response_format = {"type": "json_schema"}  )' } };
  const { exam } = await runExam(checks, f);
  assert.equal(exam.passed, true, JSON.stringify(exam.verdict.checks[0]));
  rmSync(f, { recursive: true, force: true });
});

// Last: passing G0 unlocks G1 (the other tests above must not pass it).
test('(a) full list, quotes really in files → passed and G1 unlocked', async () => {
  const f = learnerFolder();
  const { exam, events } = await runExam(ids0().map(okCheck), f);
  assert.equal(events[0].type, 'tool');
  assert.equal(events[events.length - 1].type, 'done');
  assert.equal(exam.passed, true, JSON.stringify(exam.verdict));
  assert.ok(exam.verdict.checks.every((c: any) => c.verified === true));
  assert.deepEqual(examsPassed(db, lp.pack.id), { G0: { passed: true } });
  const g1 = lp.pack.grades.find((g) => g.id === 'G1')!;
  assert.equal((await createCheck(config, db, lp, g1.core[0].key, 'ru')).status, 502, 'G1 is open: fake agent has no questions → 502, not 409');
  rmSync(f, { recursive: true, force: true });
});
