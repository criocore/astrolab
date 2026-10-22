import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { findPack, isGradeUnlocked, isTopicUnlocked, loadPack, findLevel } from '../server/pack.ts';
import { ROOT } from '../server/config.ts';

const lp = loadPack(findPack(ROOT, { STUDY_HUB_PACK: join(ROOT, 'packs', 'ai-engineer.json') } as any));

test('pack loads with topics indexed by key and grade', () => {
  assert.equal(lp.pack.schema, 2);
  assert.ok(lp.topics.size > 100);
  const t = lp.topics.get('G0/tokens-context') ?? [...lp.topics.values()][0];
  assert.ok(t.key);
  assert.ok(lp.gradeOf.get(t.key));
  const adj = [...lp.topics.values()].find((x) => x.area);
  assert.ok(adj && lp.levelOf.get(adj.key), 'adjacent topic knows its level');
});

test('locks: G0 open, G1 opens after G0 exam, adjacent topics follow their grade', () => {
  assert.equal(isGradeUnlocked(lp.pack, 'G0', {}), true);
  assert.equal(isGradeUnlocked(lp.pack, 'G1', {}), false);
  assert.equal(isGradeUnlocked(lp.pack, 'G1', { G0: { passed: true } }), true);
  assert.equal(isGradeUnlocked(lp.pack, 'G2', { G0: { passed: true } }), false);
  const g1core = lp.pack.grades.find((g) => g.id === 'G1')!.core[0];
  assert.equal(isTopicUnlocked(lp, g1core.key, {}), false);
  assert.equal(isTopicUnlocked(lp, g1core.key, { G0: { passed: true } }), true);
  const lvl = lp.pack.grades.find((g) => g.id === 'G0')!.adjacent[0];
  assert.equal(isTopicUnlocked(lp, lvl.topics[0].key, {}), true, 'R1-A belongs to G0, open from start');
  assert.ok(findLevel(lp.pack, `${lvl.area}/${lvl.level}`));
  assert.equal(findLevel(lp.pack, 'R99/Z'), null);
});
