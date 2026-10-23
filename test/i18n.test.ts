// Error codes the server sends are shown to the learner as phrases in the interface language, never as raw codes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { explainError, tr, type Key } from '../web/src/i18n.ts';
import { ROOT } from '../server/config.ts';

// Codes the client never shows: the exam stop answers not_running when the exam has already ended (ignored),
// no_preset comes with the terminal result, which is not displayed.
const NOT_SHOWN = new Set(['not_running', 'no_preset']);

// schema.ts is left out: its fail() names a failed JSON schema rule, the caller only sees schema_invalid.
function serverCodes(): Set<string> {
  const dir = join(ROOT, 'server');
  const src = readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'schema.ts').map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  const codes = new Set<string>();
  for (const re of [/error: '([a-z_]+)'/g, /fail\('([a-z_]+)'/g, /\b(?:bad|err)\(\d+, '([a-z_]+)'\)/g, /lastError = '([a-z_]+)'/g]) {
    for (const m of src.matchAll(re)) codes.add(m[1]);
  }
  return codes;
}

test('every error code the server sends has a phrase in both languages', () => {
  const codes = serverCodes();
  for (const known of ['limit', 'locked', 'bad_material', 'no_recording']) assert.ok(codes.has(known), `the scan finds ${known}: the patterns still match the server code`);
  const missing = [...codes].filter((c) => !NOT_SHOWN.has(c) && explainError(c, 'en') === c);
  assert.deepEqual(missing, [], 'codes shown raw in the interface');
  for (const c of codes) if (!NOT_SHOWN.has(c)) assert.notEqual(tr('ru', `err.${c}` as Key), tr('en', `err.${c}` as Key), `err.${c} has its own Russian text`);
});

test('explainError: the "Error: " prefix of a thrown error is dropped; unknown text is shown as is', () => {
  assert.equal(explainError('Error: bad_material', 'ru'), tr('ru', 'err.bad_material' as Key));
  assert.equal(explainError('Error: format_unsupported', 'en'), tr('en', 'err.format_unsupported'));
  assert.equal(explainError('GET /api/x: 500 boom', 'en'), 'GET /api/x: 500 boom');
});
