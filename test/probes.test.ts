// Gateless era (S0): hub probes light the stars, the next era is open without an exam, exam and mentor check for it are rejected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeConfig, ROOT } from '../server/config.ts';
import { openDb, readState, examsPassed } from '../server/db.ts';
import { findPack, isGradeUnlocked, loadPack } from '../server/pack.ts';
import { hooks, nodeOk, probeTopics, runProbes } from '../server/probes.ts';
import { startExam } from '../server/exam.ts';
import { createCheck } from '../server/mentor.ts';

const dir = mkdtempSync(join(tmpdir(), 'hub-probes-'));
const config = makeConfig({ dataDir: dir, fixturesDir: join(dir, 'fx'), mentorMode: 'replay' });
const lp = loadPack(findPack(ROOT, { STUDY_HUB_PACK: join(ROOT, 'packs', 'ai-engineer.json') } as any));
const db = openDb(join(dir, 'hub.db'));
test.after(() => { hooks.versionOf = undefined; hooks.nodeVersion = undefined; db.close(); rmSync(dir, { recursive: true, force: true }); });

const agent = { preset: 'claude', title: 'Claude Code', found: true, version: '2.1', install: '', scope: 'restricted', modes: ['check' as const], options: {} };

test('the first era has no gate: the next grade is open without an exam, and the gate-none grade cannot be examined', () => {
  const first = [...lp.pack.grades].sort((a, b) => a.order - b.order)[0];
  assert.equal(first.gate, 'none');
  assert.equal(first.checks.ru.length, 0);
  assert.ok(isGradeUnlocked(lp.pack, 'G0', {}), 'G0 opens right away');
  assert.ok(!isGradeUnlocked(lp.pack, 'G1', {}), 'G1 still waits for the G0 exam');
  const r = startExam(config, db, lp, { kind: 'grade', target: first.id, folder: dir, lang: 'en' });
  assert.equal(r.status, 400); assert.equal(r.body.error, 'no_gate');
});

test('probes light the stars: node and hub always, git and agent when found; manual topics stay untouched', async () => {
  hooks.nodeVersion = '22.13.0';
  hooks.versionOf = async (cmd) => (cmd === 'git' ? { found: true, version: 'git version 2.50.0' } : { found: false, version: '' });
  const res = await runProbes(config, lp, db, agent);
  const by = Object.fromEntries(res.map((r) => [r.probe, r]));
  assert.equal(by.hub.ok, true); assert.equal(by.node.ok, true); assert.equal(by.git.ok, true); assert.equal(by.agent.ok, true);
  assert.match(by.git.detail, /2\.50/); assert.match(by.agent.detail, /Claude Code/);
  assert.equal(by.manual.ok, false);
  const st = readState(db, lp.pack.id);
  for (const t of probeTopics(lp)) {
    const learned = st.topics[t.key]?.status === 'learned';
    assert.equal(learned, t.probe !== 'manual', `${t.key} (${t.probe})`);
  }
  // probes do not fail when git is absent and Node is old
  hooks.nodeVersion = '20.0.0';
  hooks.versionOf = async () => ({ found: false, version: '' });
  const res2 = await runProbes(config, lp, db, { ...agent, found: false, version: '' });
  const by2 = Object.fromEntries(res2.map((r) => [r.probe, r]));
  assert.equal(by2.node.ok, false); assert.equal(by2.git.ok, false); assert.equal(by2.agent.ok, false);
  assert.ok(nodeOk('22.13.1') && nodeOk('24.0.0') && !nodeOk('22.12.9'));
});

test('a probe topic has no mentor check', async () => {
  const t = probeTopics(lp)[0];
  const r = await createCheck(config, db, lp, t.key, 'en');
  assert.equal(r.status, 400); assert.equal(r.body.error, 'probe_topic');
  assert.deepEqual(examsPassed(db, lp.pack.id), {});
});
