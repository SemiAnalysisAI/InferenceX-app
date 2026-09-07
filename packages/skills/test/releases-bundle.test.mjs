import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { normalizeArgs } from '../skills/inferencex-api/scripts/compare-releases.mjs';
import { bundleSuite } from './bundle-harness.mjs';
import { succeeded } from './packed-skill.mjs';
import { RELEASE_ARGS, RELEASE_BUNDLE_VARIANTS } from './releases-bundle-fixtures.mjs';

const bundles = bundleSuite({
  releases: Object.fromEntries(
    Object.entries(RELEASE_BUNDLE_VARIANTS).map(([variant, fixture]) => [
      variant,
      {
        args: ['releases', 'compare', ...RELEASE_ARGS],
        responses: [
          {
            operation: 'history',
            url: 'https://inferencex.semianalysis.com/api/v1/benchmarks/history?model=GLM-5&isl=8192&osl=1024',
            body: fixture.rows,
            status: 200,
          },
        ],
        expected: fixture.expected,
      },
    ]),
  ),
});
const { verify, fingerprint } = bundles;

function create(variant) {
  const saved = bundles.create('releases', variant);
  succeeded(saved.result);
  return {
    ...saved,
    manifest: JSON.parse(readFileSync(join(saved.directory, 'manifest.json'), 'utf8')),
    output: bundles.readResult(saved.directory),
  };
}

test('release options normalize to one closed replayable object', () => {
  const canonical = normalizeArgs(RELEASE_ARGS);
  assert.deepEqual(normalizeArgs(canonical), canonical);
  assert.throws(
    () => normalizeArgs({ ...canonical, unrecorded_selector: 'silent-scope-change' }),
    (error) => error.code === 'INVALID_ARGUMENT',
  );
});

test('release comparison bundle reconstructs offline without mutating evidence', () => {
  const saved = create('comparable');
  assert.equal(saved.output.metadata.causal_attribution, 'not_established');
  assert.equal(saved.output.metadata.statistical_verdict, 'not_established');
  assert.equal(saved.output.comparisons.length, saved.expected.comparisons);
  assert.equal(saved.manifest.coverage.comparable_pairs, saved.expected.comparable_pairs);
  assert.equal(saved.output.selection.before.rows[0].date, '2026-09-01');
  assert.equal(saved.output.selection.before.rows[0].curve_date, '2026-09-02');
  assert.equal(saved.output.comparisons[0].recipe_fingerprint_match, null);
  assert.ok(saved.output.comparisons[0].confounders.includes('recipe_fingerprint_unavailable'));
  assert.equal(saved.output.evidence, undefined);
  assert.equal(saved.output.sources[0].response_id, saved.manifest.requests[0].response.id);
  const beforeVerify = fingerprint(saved.directory);
  succeeded(verify(saved.directory));
  assert.deepEqual(fingerprint(saved.directory), beforeVerify);
});

test('valid evidence can have zero comparable pairs until policy requests one', () => {
  const saved = create('no-comparable-pairs');
  assert.equal(verify(saved.directory).status, 0);
  const gated = verify(saved.directory, ['--min-comparable-pairs', '1']);
  assert.equal(gated.status, 3);
  const decision = JSON.parse(gated.stdout);
  assert.equal(decision.validity, 'valid');
  assert.equal(decision.coverage.comparable_pairs, 0);
});

test('ambiguous identities stay unmatched and never satisfy pair policy', () => {
  const saved = create('ambiguous');
  assert.equal(saved.output.comparisons.length, 0);
  assert.equal(
    saved.output.unmatched.before.length + saved.output.unmatched.after.length,
    saved.expected.unmatched,
  );
  assert.equal(saved.manifest.coverage.comparable_pairs, 0);
  assert.ok(
    saved.output.unmatched.before.every(({ reason }) => reason === 'ambiguous_configuration'),
  );
});

test('rehashing a stronger causal claim cannot bypass offline reconstruction', () => {
  for (const field of ['causal_attribution', 'statistical_verdict']) {
    const saved = create('comparable');
    const resultPath = join(saved.directory, saved.manifest.result.path);
    const result = JSON.parse(readFileSync(resultPath, 'utf8'));
    result.metadata[field] = 'established';
    const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
    writeFileSync(resultPath, bytes);
    saved.manifest.result.sha256 = createHash('sha256').update(bytes).digest('hex');
    saved.manifest.result.size = bytes.length;
    writeFileSync(join(saved.directory, 'manifest.json'), `${JSON.stringify(saved.manifest)}\n`);
    const checked = verify(saved.directory);
    assert.equal(checked.status, 1);
    assert.equal(checked.stdout, '');
    assert.equal(JSON.parse(checked.stderr).error.code, 'INVALID_EVIDENCE');
  }
});
