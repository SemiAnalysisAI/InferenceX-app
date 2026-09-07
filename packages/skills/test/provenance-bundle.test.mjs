import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as provenance from '../skills/inferencex-api/scripts/investigate-result.mjs';
import { bundleSuite } from './bundle-harness.mjs';
import { provenanceBundleFixtures } from './provenance-bundle-fixtures.mjs';

const bundles = bundleSuite(provenanceBundleFixtures());

test('provenance replay preserves the exact result and its producing attempt separately from the curve', () => {
  const saved = bundles.create('result', 'producer-differs-from-curve');
  const report = bundles.readResult(saved.directory);
  assert.equal(report.selected_result.id, '421');
  assert.equal(report.selected_result.workflow_run_id, '17');
  assert.equal(report.selected_result.curve_workflow_run_id, '25');
  assert.equal(report.producer.github_run_id, '123456789');
  assert.equal(report.producer.run_attempt, '2');
  assert.equal(report.producer.workflow_run.github_run_id, '123456789');
  assert.equal(report.selected_result.date, '2026-08-08');
  assert.equal(report.selected_result.curve_date, '2026-08-09');
  assert.equal(report.selected_result.image, 'vllm:sha-123');
  assert.equal(report.log.text, 'INFO ready\n');
  assert.equal(report.evidence.length, 3);
  assert.ok(
    report.evidence.every(
      (entry) => /^[a-f0-9]{64}$/u.test(entry.response_id) && !Object.hasOwn(entry, 'body'),
    ),
  );
  const before = bundles.fingerprint(saved.directory);
  const verified = bundles.verify(saved.directory);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).validity, 'valid');
  assert.deepEqual(bundles.fingerprint(saved.directory), before);
});

test('a documented log 404 remains complete evidence with limited coverage', () => {
  const saved = bundles.create('result', 'missing-log');
  const report = bundles.readResult(saved.directory);
  assert.equal(report.log.status, 'not_found');
  assert.equal(report.log.text, null);
  const manifest = JSON.parse(readFileSync(join(saved.directory, 'manifest.json')));
  assert.equal(manifest.requests[2].response.status, 404);
  const verified = bundles.verify(saved.directory, ['--require-hardware', 'h200_sxm']);
  assert.equal(verified.status, 0, verified.stderr);
  const summary = JSON.parse(verified.stdout);
  assert.equal(summary.validity, 'valid');
  assert.equal(summary.coverage.status, 'partial');
  assert.equal(summary.policy.status, 'passed');
});

test('substituting a curve producer cannot be hidden by updating the result hash', () => {
  const saved = bundles.create('result', 'producer-differs-from-curve');
  const path = join(saved.directory, 'result.json');
  const report = bundles.readResult(saved.directory);
  report.producer.github_run_id = '987654321';
  const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path, bytes);
  const manifestPath = join(saved.directory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath));
  manifest.result.sha256 = createHash('sha256').update(bytes).digest('hex');
  manifest.result.size = bytes.length;
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const before = bundles.fingerprint(saved.directory);
  const verified = bundles.verify(saved.directory);
  assert.equal(verified.status, 1);
  assert.equal(JSON.parse(verified.stderr).error.code, 'INVALID_RESPONSE');
  assert.deepEqual(bundles.fingerprint(saved.directory), before);
});

test('provenance argument errors reject unsupported IDs and log scopes before collection', () => {
  assert.equal(typeof provenance.normalizeArgs, 'function');
  const args = ['--id', '421', '--model', 'DeepSeek-R1-0528'];
  const options = provenance.normalizeArgs(args);
  assert.equal(options.id, '421');
  assert.deepEqual(provenance.normalizeArgs(options), options);
  for (const extra of [
    ['--date', '2026-02-30'],
    ['--log-limit', '262145'],
    ['--id', '422'],
    ['--date', '2026-08-09', '--run-id', '123'],
    ['--id', '900719925474099312345'],
  ])
    assert.throws(() => provenance.normalizeArgs([...args, ...extra]), {
      code: 'INVALID_ARGUMENT',
    });
});
