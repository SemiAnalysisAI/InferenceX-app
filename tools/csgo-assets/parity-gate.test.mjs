import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateAcceptance } from './parity-gate.mjs';

const proposed = JSON.parse(await readFile(new URL('acceptance.json', import.meta.url)));
const passing = () => ({
  ...structuredClone(proposed),
  state: 'approved',
  approvedBy: 'test-reviewer',
  referenceBuild: 'test-fixture-build',
  referenceMapSha256: 'a'.repeat(64),
  checks: proposed.checks.map((check) => ({
    ...check,
    status: 'pass',
    evidence: ['https://example.com/test-evidence'],
  })),
});

test('current proposal is explicitly not merge eligible', () => {
  const result = evaluateAcceptance(proposed);
  assert.equal(result.eligible, false);
  assert.equal(result.checklistPercent, 0);
});
test('ninety-five percent can pass only when every required check passes', () => {
  const matrix = passing();
  matrix.checks.at(-1).status = 'not-run';
  assert.equal(evaluateAcceptance(matrix).eligible, true);
  matrix.checks[0].status = 'not-run';
  assert.equal(evaluateAcceptance(matrix).eligible, false);
});
test('high coverage cannot conceal a missing critical feature or evidence', () => {
  const matrix = passing();
  matrix.checks[0].status = 'fail';
  assert.equal(evaluateAcceptance(matrix).checklistPercent, 95);
  assert.equal(evaluateAcceptance(matrix).eligible, false);
  matrix.checks[0].status = 'pass';
  matrix.checks[0].evidence = [];
  assert.equal(evaluateAcceptance(matrix).eligible, false);
});
test('baseline, map fingerprint, weights and threshold cannot be omitted', () => {
  for (const mutate of [
    (m) => {
      m.approvedBy = null;
    },
    (m) => {
      m.referenceMapSha256 = null;
    },
    (m) => {
      m.requiredPercent = 90;
    },
    (m) => {
      m.checks[0].weight = -1;
    },
    (m) => {
      m.checks[0].weight = 0;
    },
    (m) => {
      m.checks[0].weight = 6;
    },
    (m) => {
      m.checks[0].id = m.checks[1].id;
    },
  ]) {
    const matrix = passing();
    mutate(matrix);
    assert.equal(evaluateAcceptance(matrix).eligible, false);
  }
});
