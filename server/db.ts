// Progress: a single SQLite file in data/. Pack content is not stored here.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type TopicStatus = 'not_started' | 'in_progress' | 'gap' | 'learned';
export type TopicState = { status: TopicStatus; learnedAt: string | null; note: string; hours: number | null; updatedAt: string };
export type ExamRow = {
  id: string; pack: string; kind: 'grade' | 'level'; target: string; folder: string; lang: string; status: 'running' | 'done' | 'error' | 'stopped';
  verdict: any; passed: boolean; source: string; duration_ms: number; session_id: string; error: string; at: string;
};

// Database schema version: PRAGMA user_version. New version = new entry in MIGRATIONS; old databases are upgraded step by step on open.
export const DB_VERSION = 2;
const MIGRATIONS: Record<number, string> = {
  1: `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`, // meta: service values (last agent call, etc.)
  2: "ALTER TABLE chats ADD COLUMN lang TEXT NOT NULL DEFAULT '';", // language of the conversation: a saved answer is reopened in its own language only ('' = saved before)
};

export function openDb(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS topic_state (
      pack TEXT NOT NULL, topic_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'not_started', learned_at TEXT,
      note TEXT NOT NULL DEFAULT '', hours REAL, updated_at TEXT NOT NULL, PRIMARY KEY (pack, topic_key));
    CREATE TABLE IF NOT EXISTS checks (
      id TEXT PRIMARY KEY, pack TEXT NOT NULL, topic_key TEXT NOT NULL, lang TEXT NOT NULL, questions TEXT NOT NULL,
      source TEXT NOT NULL, prompt_version TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY, check_id TEXT NOT NULL, question_id TEXT NOT NULL, answer TEXT NOT NULL, verdict TEXT NOT NULL,
      quote TEXT NOT NULL DEFAULT '', gap TEXT NOT NULL DEFAULT '', material_id TEXT NOT NULL DEFAULT '', feedback TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY, pack TEXT NOT NULL, kind TEXT NOT NULL, target TEXT NOT NULL, folder TEXT NOT NULL, lang TEXT NOT NULL,
      status TEXT NOT NULL, verdict TEXT, passed INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'live',
      duration_ms INTEGER NOT NULL DEFAULT 0, session_id TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY, pack TEXT NOT NULL, topic_key TEXT NOT NULL DEFAULT '', template TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 0, text TEXT NOT NULL, topic_key TEXT);
    CREATE TABLE IF NOT EXISTS radar (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ring TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', date TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS adr (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, status TEXT NOT NULL, context TEXT NOT NULL DEFAULT '',
      options TEXT NOT NULL DEFAULT '', decision TEXT NOT NULL DEFAULT '', date TEXT NOT NULL);
  `);
  const current = Number((db.prepare('PRAGMA user_version').get() as any).user_version ?? 0);
  if (current > DB_VERSION) throw new Error(`hub.db is version ${current}, this hub understands up to ${DB_VERSION}: update the hub`);
  // One transaction per step: an interrupted start leaves the database at the old version, never half-migrated
  // (ALTER TABLE ADD COLUMN cannot be repeated).
  for (let v = current + 1; v <= DB_VERSION; v++) {
    db.exec('BEGIN');
    try { db.exec(MIGRATIONS[v] ?? ''); db.exec(`PRAGMA user_version = ${v}`); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  return db;
}
export type Db = ReturnType<typeof openDb>;
const now = () => new Date().toISOString();

export function getMeta<T = unknown>(db: Db, key: string): T | null {
  const r = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as any;
  if (!r) return null;
  try { return JSON.parse(r.value) as T; } catch { return null; }
}
export function setMeta(db: Db, key: string, value: unknown) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}

// Exams interrupted by a server restart: the registry lives in memory, a database row would stay "running" forever.
export function closeStaleExams(db: Db): number {
  return Number(db.prepare(`UPDATE exams SET status = 'stopped', error = 'server restarted' WHERE status = 'running'`).run().changes);
}

const rowToExam = (r: any): ExamRow => ({ ...r, verdict: r.verdict ? JSON.parse(r.verdict) : null, passed: !!r.passed });

export function readState(db: Db, pack: string) {
  const topics: Record<string, TopicState> = {};
  for (const r of db.prepare('SELECT * FROM topic_state WHERE pack = ?').all(pack) as any[]) {
    topics[r.topic_key] = { status: r.status, learnedAt: r.learned_at, note: r.note, hours: r.hours, updatedAt: r.updated_at };
  }
  // For each target (grade or level): the latest exam and a "passed at least once" flag.
  const exams: Record<string, { passed: boolean; last: ExamRow | null }> = {};
  for (const r of db.prepare('SELECT * FROM exams WHERE pack = ? ORDER BY at ASC').all(pack) as any[]) {
    const e = rowToExam(r);
    const cur = exams[e.target] ?? { passed: false, last: null };
    exams[e.target] = { passed: cur.passed || e.passed, last: e };
  }
  return {
    topics, exams,
    journal: db.prepare('SELECT * FROM journal ORDER BY date DESC, id DESC').all(),
    radar: db.prepare('SELECT * FROM radar ORDER BY ring, name').all(),
    adr: db.prepare('SELECT * FROM adr ORDER BY id DESC').all(),
  };
}
export type State = ReturnType<typeof readState>;

export function getTopic(db: Db, pack: string, key: string): TopicState | null {
  const r = db.prepare('SELECT * FROM topic_state WHERE pack = ? AND topic_key = ?').get(pack, key) as any;
  return r ? { status: r.status, learnedAt: r.learned_at, note: r.note, hours: r.hours, updatedAt: r.updated_at } : null;
}

export function setTopic(db: Db, pack: string, key: string, patch: Partial<TopicState>) {
  const cur = getTopic(db, pack, key);
  const status = patch.status ?? cur?.status ?? 'not_started';
  const learnedAt = patch.learnedAt !== undefined ? patch.learnedAt : cur?.learnedAt ?? null;
  const note = patch.note ?? cur?.note ?? '';
  const hours = patch.hours !== undefined ? patch.hours : cur?.hours ?? null;
  db.prepare(`INSERT INTO topic_state (pack, topic_key, status, learned_at, note, hours, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (pack, topic_key) DO UPDATE SET status = excluded.status, learned_at = excluded.learned_at, note = excluded.note,
    hours = excluded.hours, updated_at = excluded.updated_at`).run(pack, key, status, learnedAt, note, hours, now());
}

export type CheckRow = { id: string; pack: string; topic_key: string; lang: string; questions: { id: string; text: string; covers: string[] }[]; source: string; prompt_version: string; created_at: string };
export function insertCheck(db: Db, c: CheckRow) {
  db.prepare('INSERT INTO checks (id, pack, topic_key, lang, questions, source, prompt_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(c.id, c.pack, c.topic_key, c.lang, JSON.stringify(c.questions), c.source, c.prompt_version, c.created_at);
}
export function getCheck(db: Db, id: string): CheckRow | null {
  const r = db.prepare('SELECT * FROM checks WHERE id = ?').get(id) as any;
  return r ? { ...r, questions: JSON.parse(r.questions) } : null;
}
export type AttemptRow = { id: string; check_id: string; question_id: string; answer: string; verdict: string; quote: string; gap: string; material_id: string; feedback: string; source: string; duration_ms: number; at: string };
export function insertAttempt(db: Db, a: AttemptRow) {
  db.prepare(`INSERT INTO attempts (id, check_id, question_id, answer, verdict, quote, gap, material_id, feedback, source, duration_ms, at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(a.id, a.check_id, a.question_id, a.answer, a.verdict, a.quote, a.gap, a.material_id, a.feedback, a.source, a.duration_ms, a.at);
}
export function attemptsOf(db: Db, checkId: string): AttemptRow[] {
  return db.prepare('SELECT * FROM attempts WHERE check_id = ? ORDER BY at ASC').all(checkId) as any[];
}
export function topicHistory(db: Db, pack: string, key: string) {
  return (db.prepare('SELECT * FROM checks WHERE pack = ? AND topic_key = ? ORDER BY created_at DESC').all(pack, key) as any[])
    .map((r) => ({ ...r, questions: JSON.parse(r.questions), attempts: attemptsOf(db, r.id) }));
}

export function insertExam(db: Db, e: ExamRow) {
  db.prepare(`INSERT INTO exams (id, pack, kind, target, folder, lang, status, verdict, passed, source, duration_ms, session_id, error, at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(e.id, e.pack, e.kind, e.target, e.folder, e.lang, e.status, e.verdict ? JSON.stringify(e.verdict) : null, e.passed ? 1 : 0, e.source, e.duration_ms, e.session_id, e.error, e.at);
}
export function updateExam(db: Db, id: string, patch: Partial<ExamRow>) {
  const cur = getExam(db, id);
  if (!cur) return;
  const e = { ...cur, ...patch };
  db.prepare('UPDATE exams SET status = ?, verdict = ?, passed = ?, source = ?, duration_ms = ?, session_id = ?, error = ? WHERE id = ?')
    .run(e.status, e.verdict ? JSON.stringify(e.verdict) : null, e.passed ? 1 : 0, e.source, e.duration_ms, e.session_id, e.error, id);
}
export function getExam(db: Db, id: string): ExamRow | null {
  const r = db.prepare('SELECT * FROM exams WHERE id = ?').get(id) as any;
  return r ? rowToExam(r) : null;
}
export function listExams(db: Db, pack: string): ExamRow[] {
  return (db.prepare('SELECT * FROM exams WHERE pack = ? ORDER BY at DESC').all(pack) as any[]).map(rowToExam);
}
export function examsPassed(db: Db, pack: string): Record<string, { passed: boolean }> {
  const out: Record<string, { passed: boolean }> = {};
  for (const r of db.prepare('SELECT target FROM exams WHERE pack = ? AND passed = 1').all(pack) as any[]) out[r.target] = { passed: true };
  return out;
}

// Journal, radar and ADR are simple lists with the same operations.
const LISTS = {
  journal: ['date', 'minutes', 'text', 'topic_key'],
  radar: ['name', 'ring', 'note', 'date'],
  adr: ['title', 'status', 'context', 'options', 'decision', 'date'],
} as const;
export type ListName = keyof typeof LISTS;
export const isList = (s: string): s is ListName => s in LISTS;

export function upsertRow(db: Db, list: ListName, row: Record<string, unknown>, id?: number) {
  const cols = LISTS[list];
  const vals = cols.map((c) => (row[c] ?? (c === 'date' ? now().slice(0, 10) : c === 'minutes' ? 0 : c === 'topic_key' ? null : '')) as any);
  if (id) {
    db.prepare(`UPDATE ${list} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...vals, id);
    return id;
  }
  const r = db.prepare(`INSERT INTO ${list} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);
  return Number(r.lastInsertRowid);
}
export function deleteRow(db: Db, list: ListName, id: number) {
  db.prepare(`DELETE FROM ${list} WHERE id = ?`).run(id);
}

// Export format version: bumped on any change to the set of fields; import rejects a newer format.
export const EXPORT_FORMAT = 1;
export function exportState(db: Db, pack: string) {
  const checks = (db.prepare('SELECT * FROM checks WHERE pack = ?').all(pack) as any[]).map((r) => ({ ...r, questions: JSON.parse(r.questions) }));
  const attempts = checks.flatMap((c) => attemptsOf(db, c.id));
  return { ...readState(db, pack), checks, attempts, examRows: listExams(db, pack) };
}

export function importState(db: Db, pack: string, s: any) {
  db.exec('BEGIN');
  try {
    for (const t of ['topic_state', 'checks', 'exams']) db.prepare(`DELETE FROM ${t} WHERE pack = ?`).run(pack);
    db.exec('DELETE FROM attempts');
    for (const l of Object.keys(LISTS)) db.exec(`DELETE FROM ${l}`);
    for (const [key, v] of Object.entries(s.topics ?? {})) setTopic(db, pack, key, v as TopicState);
    for (const c of s.checks ?? []) insertCheck(db, { ...c, pack });
    for (const a of s.attempts ?? []) insertAttempt(db, a);
    for (const e of s.examRows ?? []) insertExam(db, { ...e, pack });
    for (const l of Object.keys(LISTS) as ListName[]) for (const row of (s[l] ?? []) as any[]) upsertRow(db, l, row);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// Conversations with the mentor: stored so that a repeated "Explain" does not burn tokens again.
export type ChatRow = { id: string; pack: string; topic_key: string; template: string; title: string; lang: string; session_id: string; created_at: string; updated_at: string; messages: { id: number; role: string; text: string; at: string }[] };
const chatMessages = (db: Db, id: string) => db.prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY id ASC').all(id) as ChatRow['messages'];
export function insertChat(db: Db, c: { id: string; pack: string; topic_key: string; template: string; title: string; lang: string }) {
  db.prepare('INSERT INTO chats (id, pack, topic_key, template, title, lang, session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(c.id, c.pack, c.topic_key, c.template, c.title, c.lang, '', now(), now());
}
export function appendChatMessage(db: Db, chatId: string, role: 'user' | 'agent' | 'error', text: string, sessionId?: string) {
  db.prepare('INSERT INTO chat_messages (chat_id, role, text, at) VALUES (?, ?, ?, ?)').run(chatId, role, text, now());
  db.prepare("UPDATE chats SET updated_at = ?, session_id = COALESCE(NULLIF(?, ''), session_id) WHERE id = ?").run(now(), sessionId ?? '', chatId);
}
export function getChat(db: Db, id: string): ChatRow | null {
  const r = db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as any;
  return r ? { ...r, messages: chatMessages(db, id) } : null;
}
export function listChats(db: Db, pack: string, topicKey: string): ChatRow[] {
  return (db.prepare('SELECT * FROM chats WHERE pack = ? AND topic_key = ? ORDER BY updated_at DESC').all(pack, topicKey) as any[]).map((r) => ({ ...r, messages: chatMessages(db, r.id) }));
}
export function deleteChat(db: Db, id: string) {
  db.prepare('DELETE FROM chat_messages WHERE chat_id = ?').run(id);
  db.prepare('DELETE FROM chats WHERE id = ?').run(id);
}

