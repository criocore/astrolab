// Grade exam and level check on an artifact: the agent reads the student's folder (only Read/Grep/Glob, restricted to the folder)
// and gives a verdict per rubric item with evidence (file + quote). Exam passed -> the next grade is open.
import { randomBytes } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { type Config, requestLang } from './config.ts';
import { type Db, type ExamRow, examsPassed, getExam, insertExam, updateExam } from './db.ts';
import type { Ctl, Tool } from './adapter.ts';
import { killTree } from './adapter.ts';
import { esc, loadPrompt, mentorCall } from './recordings.ts';
import { findLevel, isGradeUnlocked, levelKey, text, type Lang, type LoadedPack, type Topic } from './pack.ts';
import { isValid } from './schema.ts';

export type ExamEvent = { type: 'tool'; name: string; target: string } | { type: 'done'; exam: ExamRow } | { type: 'error'; error: string; detail?: string };
type Entry = { id: string; events: ExamEvent[]; subs: Set<(e: ExamEvent) => void>; ctl: Ctl; finished: Promise<void> };
const registry = new Map<string, Entry>(); // in memory: a running exam is lost on server restart
type Handled = { status: number; body: Record<string, unknown> };
const bad = (status: number, error: string): Handled => ({ status, body: { error } });

export function checkFolder(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim() || raw.includes('\0')) return null;
  const p = resolve(raw.trim());
  if (!isAbsolute(p)) return null;
  try { return statSync(p).isDirectory() ? p : null; } catch { return null; }
}

const MAX_READ = 5 * 1024 * 1024;
const REASONS = {
  ru: { missing: 'наставник не дал вердикт', notFound: 'файл не найден', outside: 'путь вне папки', short: 'цитата короче 12 символов', noQuote: 'цитата не найдена в файле' },
  en: { missing: 'no verdict from the examiner', notFound: 'file not found', outside: 'path outside the folder', short: 'quote shorter than 12 characters', noQuote: 'quote not found in the file' },
};
const lf = (x: string) => x.replace(/\r\n/g, '\n');
const squash = (x: string) => x.replace(/\s+/g, ' ');

// Mechanical evidence check: the file is inside the folder, is regular, and the quote is found in the text. Returns a rejection reason or null.
export function verifyEvidence(folder: string, ev: { path?: unknown; quote?: unknown } | undefined, lang: Lang): string | null {
  const R = REASONS[lang];
  const path = typeof ev?.path === 'string' ? ev.path.trim() : '';
  const quote = typeof ev?.quote === 'string' ? ev.quote : '';
  if (!path || path.includes('\0')) return R.notFound;
  try {
    const root = realpathSync(folder);
    const full = resolve(root, path);
    const inside = (a: string) => { const rel = relative(root, a); return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel)); };
    if (!inside(full)) return R.outside;
    let real: string;
    try { real = realpathSync(full); } catch { return R.notFound; }
    if (!inside(real)) return R.outside;
    const st = statSync(real);
    if (!st.isFile()) return R.notFound;
    if (quote.trim().length < 12) return R.short;
    if (st.size > MAX_READ) return R.noQuote;
    const text = lf(readFileSync(real, 'utf8'));
    const q = lf(quote);
    if (text.includes(q) || text.includes(q.trim())) return null;
    return squash(text).includes(squash(q).trim()) ? null : R.noQuote;
  } catch { return R.notFound; }
}

function rubric(lp: LoadedPack, kind: 'grade' | 'level', target: string, lang: Lang): { title: string; task: string; topics: Topic[] } | null {
  if (kind === 'grade') {
    const g = lp.pack.grades.find((x) => x.id === target);
    return g ? { title: `${g.id} ${text(g.title, lang)}`, task: text(g.exam, lang), topics: g.core } : null;
  }
  const f = findLevel(lp.pack, target);
  return f ? { title: `${f.level.area} ${text(f.level.area_title, lang)} · ${f.level.level}`, task: text(f.level.check, lang), topics: f.level.topics } : null;
}

export function startExam(config: Config, db: Db, lp: LoadedPack, body: any): Handled {
  const kind = body?.kind === 'level' ? 'level' : body?.kind === 'grade' ? 'grade' : null;
  const target = typeof body?.target === 'string' ? body.target : '';
  const lang: Lang = requestLang(body?.lang, config);
  if (!kind || !target) return bad(400, 'bad_request');
  const r = rubric(lp, kind, target, lang);
  if (!r) return bad(404, 'not_found');
  const passed = examsPassed(db, lp.pack.id);
  const gradeId = kind === 'grade' ? target : findLevel(lp.pack, target)!.grade.id;
  if (kind === 'grade' && lp.pack.grades.find((x) => x.id === target)?.gate === 'none') return bad(400, 'no_gate');
  if (!isGradeUnlocked(lp.pack, gradeId, passed)) return bad(409, 'locked');
  const folder = checkFolder(body?.folder);
  if (!folder) return bad(400, 'bad_folder');

  const p = loadPrompt(config, 'exam-artifact');
  const grade = kind === 'grade' ? lp.pack.grades.find((x) => x.id === target)! : null;
  const items = grade
    ? grade.checks[lang].map((c, i) => `- id: ${grade.id}#${i + 1} | ${esc(c)}`)
    : r.topics.flatMap((t) => t.criteria[lang].map((c, i) => `- id: ${t.key}#${i + 1} | ${esc(text(t.title, lang))}: ${esc(c)}`));
  const user = [`<exam kind="${kind}" target="${esc(target)}">`, `<title>${esc(r.title)}</title>`, `<task>${esc(r.task)}</task>`, `<criteria>`, ...items, `</criteria>`, `</exam>`].join('\n');
  const request = { mode: 'session' as const, step: `exam-${kind}`, system: p.system.replaceAll('{{lang}}', lang), user, schema: p.schema, prompt_version: p.version, workspace: folder, timeout_ms: 240_000 };

  const id = `ex-${randomBytes(6).toString('hex')}`;
  const exam: ExamRow = { id, pack: lp.pack.id, kind, target, folder, lang, status: 'running', verdict: null, passed: false, source: 'live', duration_ms: 0, session_id: '', error: '', at: new Date().toISOString() };
  insertExam(db, exam);
  const entry: Entry = { id, events: [], subs: new Set(), ctl: { stopped: false }, finished: Promise.resolve() };
  registry.set(id, entry);
  const emit = (e: ExamEvent) => { entry.events.push(e); for (const s of entry.subs) s(e); };
  entry.finished = (async () => {
    const t0 = Date.now();
    let outcome: ExamEvent = { type: 'error', error: 'bad_output' };
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await mentorCall(config, request, { ctl: entry.ctl, retry: attempt > 0, onTool: (t: Tool) => emit({ type: 'tool', name: t.name, target: t.target }) });
        if (entry.ctl.stopped) { outcome = { type: 'error', error: 'stopped' }; break; }
        if (!res.result.ok) { outcome = { type: 'error', error: res.result.error, detail: res.result.detail }; if (res.result.error !== 'bad_output') break; continue; }
        const json: any = res.result.json;
        if (!isValid(p.schema, json)) { outcome = { type: 'error', error: 'schema_invalid' }; continue; }
        const ids = items.map((l) => /id: (\S+)/.exec(l)![1]);
        const idSet = new Set(ids);
        const given = new Map<string, any[]>();
        for (const c of json.checks as any[]) if (idSet.has(c.id)) given.set(c.id, [...(given.get(c.id) ?? []), c]);
        const checks: any[] = [];
        let complete = true;
        for (const cid of ids) {
          const list = given.get(cid) ?? [];
          if (list.length !== 1) complete = false;
          if (!list.length) { checks.push({ id: cid, verdict: 'unclear', evidence: { path: '', quote: '' }, note: REASONS[lang].missing, verified: false }); continue; }
          const c = { ...list[0] };
          if (c.verdict === 'pass') {
            const why = verifyEvidence(folder, c.evidence, lang);
            c.verified = why === null;
            if (why) { c.verdict = 'gap'; c.note = [c.note, why].filter(Boolean).join('. '); }
          } else c.verified = false;
          checks.push(c);
        }
        const isPass = json.verdict === 'pass' && complete && checks.length > 0 && checks.every((c) => c.verdict === 'pass' && c.verified === true);
        const verdict = { ...json, checks };
        updateExam(db, id, { status: 'done', verdict, passed: isPass, source: res.source, duration_ms: Date.now() - t0, session_id: res.result.session_id });
        outcome = { type: 'done', exam: getExam(db, id)! };
        break;
      }
    } catch (e) {
      outcome = { type: 'error', error: 'internal_error', detail: String((e as Error).message) };
    }
    if (outcome.type === 'error') updateExam(db, id, { status: outcome.error === 'stopped' ? 'stopped' : 'error', error: outcome.error, duration_ms: Date.now() - t0 });
    emit(outcome);
  })();
  return { status: 200, body: { exam_id: id, status: 'running' } };
}

// Replays past events, then live ones. Returns an unsubscribe function, or null for an unknown id.
export function subscribe(id: string, send: (e: ExamEvent) => void, onEnd: () => void): (() => void) | null {
  const entry = registry.get(id);
  if (!entry) return null;
  const isLast = (e: ExamEvent) => e.type !== 'tool';
  for (const e of entry.events) send(e);
  if (entry.events.some(isLast)) { onEnd(); return () => {}; }
  const sub = (e: ExamEvent) => { send(e); if (isLast(e)) { entry.subs.delete(sub); onEnd(); } };
  entry.subs.add(sub);
  return () => { entry.subs.delete(sub); };
}

export async function stopExam(id: string): Promise<Handled> {
  const entry = registry.get(id);
  if (!entry) return bad(404, 'not_found');
  if (entry.events.some((e) => e.type !== 'tool')) return bad(409, 'not_running');
  entry.ctl.stopped = true;
  killTree(entry.ctl.child);
  await entry.finished;
  return { status: 200, body: { exam_id: id, status: 'stopped' } };
}

export const examTargetOfLevel = levelKey;
