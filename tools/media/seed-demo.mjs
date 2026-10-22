// Lived-in demo progress for README screenshots (writes into a separate data folder, never into data/).
// Usage: node tools/media/seed-demo.mjs <dataDir>   (then start the hub with STUDY_HUB_DATA=<dataDir> MENTOR_MODE=replay)
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const dataDir = process.argv[2];
mkdirSync(dataDir, { recursive: true });
const pack = JSON.parse(readFileSync(join(ROOT, 'packs', 'ai-engineer.json'), 'utf8'));
const db = new DatabaseSync(join(dataDir, 'hub.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS topic_state (pack TEXT NOT NULL, topic_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'not_started', learned_at TEXT, note TEXT NOT NULL DEFAULT '', hours REAL, updated_at TEXT NOT NULL, PRIMARY KEY (pack, topic_key));
  CREATE TABLE IF NOT EXISTS checks (id TEXT PRIMARY KEY, pack TEXT NOT NULL, topic_key TEXT NOT NULL, lang TEXT NOT NULL, questions TEXT NOT NULL, source TEXT NOT NULL, prompt_version TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, check_id TEXT NOT NULL, question_id TEXT NOT NULL, answer TEXT NOT NULL, verdict TEXT NOT NULL, quote TEXT NOT NULL DEFAULT '', gap TEXT NOT NULL DEFAULT '', material_id TEXT NOT NULL DEFAULT '', feedback TEXT NOT NULL DEFAULT '', source TEXT NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS exams (id TEXT PRIMARY KEY, pack TEXT NOT NULL, kind TEXT NOT NULL, target TEXT NOT NULL, folder TEXT NOT NULL, lang TEXT NOT NULL, status TEXT NOT NULL, verdict TEXT, passed INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'live', duration_ms INTEGER NOT NULL DEFAULT 0, session_id TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS journal (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 0, text TEXT NOT NULL, topic_key TEXT);
`);
const P = pack.id;
const days = (n) => new Date(Date.now() - n * 86400000).toISOString();
const topics = (g) => [...g.core, ...g.adjacent.flatMap((a) => a.topics)];
const grade = (id) => pack.grades.find((g) => g.id === id);
const set = db.prepare(`INSERT OR REPLACE INTO topic_state (pack, topic_key, status, learned_at, note, hours, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
db.exec('DELETE FROM topic_state; DELETE FROM checks; DELETE FROM attempts; DELETE FROM exams; DELETE FROM journal;');

// Era I and Era II: everything learned over the past weeks
let d = 40;
for (const t of topics(grade('S0'))) set.run(P, t.key, 'learned', days(d--), '', null, days(d));
for (const t of topics(grade('G0'))) set.run(P, t.key, 'learned', days(d--), '', 1.5, days(d));
// Era II passed: a clean exam with all checks verified
const g0 = grade('G0');
db.prepare(`INSERT INTO exams (id, pack, kind, target, folder, lang, status, verdict, passed, source, duration_ms, session_id, error, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'live', 41000, 's-1', '', ?)`)
  .run('ex-demo-g0', P, 'grade', 'G0', '~/projects/my-first-llm-app', 'en', 'done', JSON.stringify({
    verdict: 'pass', feedback: 'All six checks are backed by the code and the README.', next_steps: ['Add a second provider to the cost table.'],
    checks: g0.checks.en.map((c, i) => ({ id: `G0#${i + 1}`, verdict: 'pass', evidence: { path: i < 4 ? 'main.py' : 'README.md', quote: ['"response_format": {"type": "json_schema"', 'errors = validate(obj)', 'for attempt in range(1, MAX_ATTEMPTS + 1)', 'MAX_TOKENS = 300', 'input_tokens * 3.00 / 1_000_000', 'stop_reason == "max_tokens"'][i] }, note: '', verified: true })),
  }), days(d - 1));
// Era III in progress: most core topics learned, one gap, one being worked on, one adjacent level learned
const g1 = grade('G1');
const core = g1.core;
core.forEach((t, i) => {
  if (i < 6) set.run(P, t.key, 'learned', days(d - 2 - i), '', 1, days(d - 2 - i));
  else if (i === 6) set.run(P, t.key, 'gap', null, 'retry after reading the hooks docs', 0.5, days(1));
  else if (i === 7) set.run(P, t.key, 'in_progress', null, '', null, days(0));
});
for (const t of g1.adjacent[0]?.topics ?? []) set.run(P, t.key, 'learned', days(3), '', null, days(3));
// a check with one accepted answer and one gap on the gap topic
const gapTopic = core[6];
const q = [{ id: 'q1', text: 'What does a hook let you do that a plain prompt cannot?', covers: ['1'] }, { id: 'q2', text: 'Name one hook event and what runs on it.', covers: ['2'] }];
db.prepare(`INSERT INTO checks (id, pack, topic_key, lang, questions, source, prompt_version, created_at) VALUES (?, ?, ?, 'en', ?, 'live', 'mentor-questions@2', ?)`).run('ck-demo', P, gapTopic.key, JSON.stringify(q), days(1));
const att = db.prepare(`INSERT INTO attempts (id, check_id, question_id, answer, verdict, quote, gap, material_id, feedback, source, duration_ms, at) VALUES (?, 'ck-demo', ?, ?, ?, ?, ?, ?, ?, 'live', 9000, ?)`);
att.run('at-demo-1', 'q1', 'A hook runs my own command at a fixed moment, like before the agent writes a file, so the rule holds every time instead of depending on the prompt.', 'pass', 'runs my own command at a fixed moment', '', '', 'Clear: hooks are deterministic, prompts are not.', days(1));
att.run('at-demo-2', 'q2', 'I think there is one that runs when the agent finishes, not sure about the name.', 'gap', 'not sure about the name', 'The event names and what each one receives are the point of this topic.', gapTopic.materials[0]?.id ?? '', 'Read the hooks reference, then name PreToolUse or Stop and what runs there.', days(1));
// Era III evolution attempted once: four of five items backed, one gap
db.prepare(`INSERT INTO exams (id, pack, kind, target, folder, lang, status, verdict, passed, source, duration_ms, session_id, error, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'live', 52000, 's-2', '', ?)`)
  .run('ex-demo-g1', P, 'grade', 'G1', '~/projects/agent-service', 'en', 'done', JSON.stringify({
    verdict: 'gap', feedback: 'The service, the check loop and the tests are there; the decision record lists one option instead of three.', next_steps: ['Add two more options to docs/adr/0001-stack.md with the reason each was not chosen.'],
    checks: g1.checks.en.map((c, i) => ({ id: `G1#${i + 1}`, verdict: i === g1.checks.en.length - 1 ? 'gap' : 'pass', evidence: i === g1.checks.en.length - 1 ? { path: 'docs/adr/0001-stack.md', quote: 'Chosen: FastAPI.' } : { path: ['PLAN.md', 'src/app.py', 'tests/test_app.py', 'CHRONICLE.md', 'src/app.py', 'tests/test_app.py', 'PLAN.md', 'src/app.py'][i], quote: ['Step 3: write the failing test first', 'def create_app()', 'def test_health_returns_ok()', 'the agent rewrote the handler twice', 'return JSONResponse', 'assert r.status_code == 200', 'Step 1: outline the endpoints', 'app = create_app()'][i] }, note: i === g1.checks.en.length - 1 ? 'only one option is recorded' : '', verified: true })),
  }), days(0));
// chronicle entries
const j = db.prepare(`INSERT INTO journal (date, minutes, text, topic_key) VALUES (?, ?, ?, ?)`);
j.run(days(0).slice(0, 10), 50, 'Second try at the Era III evolution tomorrow: ADR needs two more options.', null);
j.run(days(1).slice(0, 10), 40, 'Hooks: got the idea, missed the event names. Re-reading the reference.', gapTopic.key);
j.run(days(3).slice(0, 10), 90, 'Shipped the agent service with tests green.', null);
db.close();
console.log('seeded', dataDir, 'gap topic:', gapTopic.key, 'checks G1:', g1.checks.en.length);
