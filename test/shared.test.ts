// The lock rule and the pack types live once, in shared/pack.ts: the server enforces the rule, the sky and the era tree draw it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { gateBefore, isGradeUnlocked, type Grade } from '../shared/pack.ts';
import * as serverPack from '../server/pack.ts';
import { ROOT } from '../server/config.ts';

const lp = serverPack.loadPack(join(ROOT, 'packs', 'ai-engineer.json'));

test('gateBefore: the first era and the era after a gateless one are open; the others wait for the previous exam', () => {
  assert.equal(gateBefore(lp.pack, 'S0'), null);
  assert.equal(gateBefore(lp.pack, 'G0'), null, 'S0 has no gate');
  assert.equal(gateBefore(lp.pack, 'G1'), 'G0');
  assert.equal(gateBefore(lp.pack, 'G6'), 'G5');
  assert.equal(gateBefore(lp.pack, 'nope'), undefined);
});

test('the rule follows order, not the position in the file; an unknown era is locked', () => {
  const g = (id: string, order: number, gate?: 'exam' | 'none') => ({ id, order, gate }) as Grade;
  const pack = { grades: [g('B', 2), g('A', 1, 'none'), g('Z', 0)] };
  assert.equal(gateBefore(pack, 'Z'), null);
  assert.equal(gateBefore(pack, 'A'), 'Z');
  assert.equal(gateBefore(pack, 'B'), null);
  assert.equal(isGradeUnlocked(pack, 'A', {}), false);
  assert.equal(isGradeUnlocked(pack, 'A', { Z: { passed: true } }), true);
  assert.equal(isGradeUnlocked(pack, 'nope', { Z: { passed: true } }), false);
});

test('the server enforces the shared rule, not a copy', () => {
  assert.equal(serverPack.isGradeUnlocked, isGradeUnlocked);
});
