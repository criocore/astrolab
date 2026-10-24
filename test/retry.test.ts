// Each caller's retry rule, pinned: a topic check asks again after a timeout or a rejected answer but not after limit/sign-in;
// the exam asks again only after unreadable output or a rejected answer. At most two calls everywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeConfig, ROOT } from '../server/config.ts';
import { openDb, getExam } from '../server/db.ts';
import { findPack, loadPack } from '../server/pack.ts';
import { createAttempt, createCheck } from '../server/mentor.ts';
import { startExam, subscribe } from '../server/exam.ts';
import { hooks } from '../server/recordings.ts';
import type { AgentResult } from '../server/adapter.ts';

const dir = mkdtempSync(join(tmpdir(), 'hub-retry-'));
const config = makeConfig({ dataDir: dir, fixturesDir: join(dir, 'fx') });
const db = openDb(join(dir, 'hub.db'));
const lp = loadPack(findPack(ROOT, { STUDY_HUB_PACK: join(ROOT, 'packs', 'ai-engineer.json') } as any));
const topic = lp.pack.grades.find((g) => g.id === 'G0')!.core[0];
test.after(() => { hooks.agent = undefined; db.close(); rmSync(dir, { recursive: true, force: true }); });

// The agent answers from a script, one entry per call: an error code or the JSON to return.
function script(steps: (string | object)[]) {
  const calls: boolean[] = [];
  hooks.agent = async (_c, _req, opts): Promise<AgentResult> => {
    calls.push(opts?.retry ?? false);
    const s = steps[Math.min(calls.length - 1, steps.length - 1)];
    return typeof s === 'string' ? { ok: false, error: s as any, detail: `${s} detail`, tools: [] } : { ok: true, json: s, text: '', agent: 'fake', ms: 1, session_id: '', tools: [] };
  };
  return calls;
}
const questions = { questions: [{ id: 'q1', text: 'A?', covers: topic.criteria.en.map((_, i) => String(i + 1)) }, { id: 'q2', text: 'B?', covers: ['1'] }] };
const verdict = { verdict: 'pass', quote: 'my answer', gap: '', material_id: '', feedback: 'ok' };
const exam = { verdict: 'gap', checks: [{ id: 'G0#1', verdict: 'unclear', evidence: { path: '', quote: '' }, note: 'n' }], feedback: 'f', next_steps: ['x'] };

test('topic check questions: a timeout or a rejected answer is asked again once; limit and sign-in are not', async () => {
  let calls = script(['timeout', questions]);
  assert.equal((await createCheck(config, db, lp, topic.key, 'en')).status, 200);
  assert.deepEqual(calls, [false, true], 'the second call is marked as a retry');
  calls = script([{ questions: [] }, questions]);
  assert.equal((await createCheck(config, db, lp, topic.key, 'en')).status, 200);
  assert.equal(calls.length, 2);
  calls = script(['timeout', 'timeout', questions]);
  const r = await createCheck(config, db, lp, topic.key, 'en');
  assert.equal(r.status, 502); assert.equal(r.body.error, 'timeout'); assert.equal(calls.length, 2, 'two calls at most');
  for (const code of ['limit', 'auth', 'not_found', 'no_recording', 'mode_not_supported']) {
    calls = script([code, questions]);
    const x = await createCheck(config, db, lp, topic.key, 'en');
    assert.equal(x.body.error, code); assert.equal(calls.length, 1, `${code}: no retry`);
  }
  calls = script([{ questions: [] }, { questions: [] }]);
  assert.equal((await createCheck(config, db, lp, topic.key, 'en')).body.error, 'schema_invalid');
});

test('topic check verdict: the same rule; a rejected answer keeps its own code', async () => {
  script([questions]);
  const id = String((await createCheck(config, db, lp, topic.key, 'en')).body.check_id);
  let calls = script(['exit_code', verdict]);
  assert.equal((await createAttempt(config, db, lp, id, { question_id: 'q1', answer: 'my answer' })).status, 200);
  assert.equal(calls.length, 2);
  calls = script(['limit', verdict]);
  assert.equal((await createAttempt(config, db, lp, id, { question_id: 'q1', answer: 'my answer' })).body.error, 'limit');
  assert.equal(calls.length, 1);
  calls = script([{ ...verdict, quote: 'not in it' }, { ...verdict, quote: 'not in it' }]);
  assert.equal((await createAttempt(config, db, lp, id, { question_id: 'q1', answer: 'my answer' })).body.error, 'quote_not_in_answer');
  assert.equal(calls.length, 2);
  calls = script([{ ...verdict, verdict: 'gap', material_id: 'nope' }, verdict]);
  assert.equal((await createAttempt(config, db, lp, id, { question_id: 'q1', answer: 'my answer' })).status, 200, 'bad_material is asked again');
  assert.equal(calls.length, 2);
});

async function runExam() {
  const st = startExam(config, db, lp, { kind: 'grade', target: 'G0', folder: dir, lang: 'en' });
  const examId = String(st.body.exam_id);
  const events: any[] = [];
  await new Promise<void>((done) => { subscribe(examId, (e) => events.push(e), done); });
  return { row: getExam(db, examId)!, last: events.at(-1) };
}

test('exam: asked again only after unreadable output or a rejected answer; a timeout ends it at once', async () => {
  let calls = script(['bad_output', exam]);
  assert.equal((await runExam()).row.status, 'done'); assert.deepEqual(calls, [false, true]);
  calls = script([{ verdict: 'gap' }, exam]);
  assert.equal((await runExam()).row.status, 'done'); assert.equal(calls.length, 2, 'schema_invalid is asked again');
  calls = script(['timeout', exam]);
  const t = await runExam();
  assert.equal(t.row.status, 'error'); assert.equal(t.row.error, 'timeout'); assert.equal(calls.length, 1);
  assert.equal(t.last.detail, 'timeout detail', 'the agent error keeps its detail');
  calls = script(['bad_output', 'bad_output']);
  assert.equal((await runExam()).row.error, 'bad_output'); assert.equal(calls.length, 2);
  calls = script(['bad_output', { verdict: 'gap' }]);
  assert.equal((await runExam()).row.error, 'schema_invalid', 'the last failure is the one reported');
});
