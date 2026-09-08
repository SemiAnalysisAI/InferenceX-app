import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { CliError } from '../skills/inferencex-api/scripts/cli-contract.mjs';
import { verifyBundle } from '../skills/inferencex-api/scripts/verify-bundle.mjs';
import { evaluatePolicy } from '../skills/inferencex-api/scripts/coverage-policy.mjs';
import { bundleSuite } from './bundle-harness.mjs';

const bundles = bundleSuite();

test('valid evidence survives an unmet hardware policy and offline verification', () => {
  const saved = bundles.create('powerx', 'positive');
  const before = bundles.fingerprint(saved.directory);
  const result = bundles.verify(saved.directory, ['--require-hardware', 'absent-hardware']);
  assert.equal(result.status, 3);
  const report = JSON.parse(result.stdout);
  assert.equal(report.validity, 'valid');
  assert.equal(report.policy.status, 'failed');
  assert.deepEqual(bundles.fingerprint(saved.directory), before);
});

test('an export policy failure commits valid evidence and its recorded summary', () => {
  const saved = bundles.create('powerx', 'positive', {
    policy: ['--require-hardware', 'absent-hardware'],
  });
  assert.equal(saved.result.status, 3);
  const exported = JSON.parse(saved.result.stdout);
  assert.equal(exported.validity, 'valid');
  assert.equal(exported.policy.status, 'failed');
  const manifest = JSON.parse(readFileSync(join(saved.directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.summary.policy.status, 'failed');
  assert.deepEqual(exported, {
    ...manifest.summary,
    output: { ...manifest.summary.output, directory: saved.directory },
  });
  const verified = bundles.verify(saved.directory);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).policy.status, 'not_requested');
});

test('a truncated response retry retains both attempts and verifies offline', () => {
  const saved = bundles.create('powerx', 'positive', { truncateOnce: true });
  assert.equal(saved.requests.length, 2);
  const manifest = JSON.parse(readFileSync(join(saved.directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.requests[0].attempts.length, 2);
  assert.equal(manifest.requests[0].attempts[0].status, 200);
  assert.equal(typeof manifest.requests[0].attempts[0].networkCode, 'string');
  assert.equal(manifest.requests[0].attempts[0].retry.decision, 'retry');
  assert.equal(manifest.requests[0].attempts[1].retry.decision, 'accepted');
  const verified = bundles.verify(saved.directory);
  assert.equal(verified.status, 0, verified.stderr);
});

test('hardware policy counts only collector-reported valid records', () => {
  const coverage = {
    status: 'partial',
    selected_records: 2,
    comparable_pairs: null,
    hardware: [
      { hardware: 'h200_sxm', valid_records: 1 },
      { hardware: 'b200', valid_records: 0 },
    ],
    reasons: [{ code: 'MISSING_MEASUREMENT', count: 1 }],
  };
  assert.equal(
    evaluatePolicy('powerx', coverage, { requireHardware: ['h200_sxm'] }).status,
    'passed',
  );
  const failed = evaluatePolicy('powerx', coverage, { requireHardware: ['b200'] });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.reasons[0].code, 'REQUIRED_HARDWARE_MISSING');
});

test('pair policy is invalid for PowerX and empty coverage passes by default', () => {
  const empty = {
    status: 'empty',
    selected_records: 0,
    comparable_pairs: null,
    hardware: [],
    reasons: [],
  };
  assert.equal(evaluatePolicy('powerx', empty, {}).status, 'not_requested');
  assert.throws(() => evaluatePolicy('powerx', empty, { minComparablePairs: 1 }), /not supported/u);
  assert.throws(
    () =>
      evaluatePolicy(
        'releases',
        { ...empty, comparable_pairs: 0 },
        { requireHardware: ['h200_sxm'] },
      ),
    /not supported/u,
  );
});

test('PowerX JSON and CSV bundles preserve literal result facts across complete, empty and partial coverage', () => {
  const statuses = { positive: 'complete', empty: 'empty', 'missing-power': 'partial' };
  for (const variant of Object.keys(statuses)) {
    const saved = bundles.create('powerx', variant);
    const before = bundles.fingerprint(saved.directory);
    const result = bundles.readResult(saved.directory);
    assert.equal(result.rows.length, saved.expected.selected_records);
    assert.deepEqual(
      result.rows.map((row) => row.id),
      saved.expected.ids,
    );
    assert.deepEqual(
      result.rows.map((row) => row.date),
      saved.expected.observation_dates,
    );
    assert.deepEqual(
      result.rows.map((row) => row.curve_date),
      saved.expected.curve_dates,
    );
    assert.equal(result.units.avg_power_w, saved.expected.units.avg_power_w);
    assert.equal(
      result.units.joules_per_successful_query,
      saved.expected.units.joules_per_successful_query,
    );
    const verified = bundles.verify(saved.directory);
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(JSON.parse(verified.stdout).coverage.status, statuses[variant]);
    assert.deepEqual(bundles.fingerprint(saved.directory), before);
  }
  const csv = bundles.create('powerx', 'positive', { format: 'csv' });
  const text = bundles.readResult(csv.directory);
  assert.match(text, /source_response_id/u);
  assert.match(text, /900719925474099312345/u);
  assert.match(text, /2026-09-01/u);
  assert.equal(bundles.verify(csv.directory).status, 0);
});

test('Markdown reports are deterministic after relocation and never edit the evidence', () => {
  const saved = bundles.create('powerx', 'positive');
  const before = bundles.fingerprint(saved.directory);
  const firstReport = join(dirname(saved.directory), 'verification.md');
  const first = bundles.verify(saved.directory, ['--report', firstReport]);
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(bundles.fingerprint(saved.directory), before);

  const relocatedRoot = mkdtempSync(join(tmpdir(), 'relocated evidence-'));
  const relocated = join(relocatedRoot, 'bundle');
  cpSync(saved.directory, relocated, { recursive: true });
  const secondReport = join(relocatedRoot, 'verification.md');
  const second = bundles.verify(relocated, ['--report', secondReport]);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(readFileSync(secondReport, 'utf8'), readFileSync(firstReport, 'utf8'));
});

test('offline errors distinguish unsupported contracts from invalid evidence', () => {
  for (const [field, value, code] of [
    ['kind', 'unknown', 'UNSUPPORTED_CONTRACT'],
    ['contract_version', 2, 'UNSUPPORTED_CONTRACT'],
    ['normalized_arguments', { isl: '8192' }, 'INVALID_EVIDENCE'],
  ]) {
    const saved = bundles.create('powerx', 'positive');
    const manifestPath = join(saved.directory, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest[field] = value;
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    const before = bundles.fingerprint(saved.directory);
    const result = bundles.verify(saved.directory);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(JSON.parse(result.stderr).error.code, code);
    assert.deepEqual(bundles.fingerprint(saved.directory), before);
  }
});

test('reconstruction rejects changed result bytes even when their manifest hash is updated', () => {
  const saved = bundles.create('powerx', 'positive');
  const manifestPath = join(saved.directory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const resultPath = join(saved.directory, manifest.result.path);
  const result = JSON.parse(readFileSync(resultPath, 'utf8'));
  result.rows[0].metrics.avg_power_w = 1;
  const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(resultPath, bytes);
  manifest.result.size = bytes.length;
  manifest.result.sha256 = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  const verified = bundles.verify(saved.directory);
  assert.equal(verified.status, 1);
  assert.equal(JSON.parse(verified.stderr).error.code, 'INVALID_EVIDENCE');
  assert.match(JSON.parse(verified.stderr).error.message, /reconstructed result bytes/iu);
});

test('offline verification preserves cancellation instead of reporting invalid evidence', async () => {
  const saved = bundles.create('powerx', 'positive');
  const reason = new CliError('CANCELLED', 'cancelled verification');
  await assert.rejects(
    verifyBundle(saved.directory, { signal: AbortSignal.abort(reason) }),
    (error) => error === reason,
  );
});

test('report output rejects existing files and evidence-directory targets without mutation', () => {
  const saved = bundles.create('powerx', 'positive');
  const before = bundles.fingerprint(saved.directory);
  const existing = join(dirname(saved.directory), 'existing.md');
  writeFileSync(existing, 'keep me');
  for (const report of [existing, join(saved.directory, 'report.md')]) {
    const result = bundles.verify(saved.directory, ['--report', report]);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_ARGUMENT');
    assert.deepEqual(bundles.fingerprint(saved.directory), before);
  }
  assert.equal(readFileSync(existing, 'utf8'), 'keep me');
});

test('null request attempts return INVALID_EVIDENCE', () => {
  const saved = bundles.create('powerx', 'positive');
  const path = join(saved.directory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.requests[0].attempts[0] = null;
  writeFileSync(path, `${JSON.stringify(manifest)}\n`);
  const result = bundles.verify(saved.directory);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_EVIDENCE');
});

test('offline verification rejects incomplete, malformed, escaping, missing and symlinked files', () => {
  const cases = [
    (directory) => rmSync(join(directory, 'manifest.json')),
    (directory) => writeFileSync(join(directory, 'manifest.json'), '{'),
    (directory) => {
      const path = join(directory, 'manifest.json');
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      manifest.result.path = '../outside.json';
      writeFileSync(path, `${JSON.stringify(manifest)}\n`);
    },
    (directory) => {
      const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
      rmSync(join(directory, manifest.requests[0].response.path));
    },
    (directory) => {
      const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
      const result = join(directory, manifest.result.path);
      const outside = join(dirname(directory), 'outside.json');
      writeFileSync(outside, readFileSync(result));
      rmSync(result);
      symlinkSync(outside, result);
    },
    (directory) => {
      const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
      const outside = join(dirname(directory), 'outside-responses');
      mkdirSync(outside);
      const source = join(directory, manifest.requests[0].response.path);
      cpSync(source, join(outside, manifest.requests[0].response.id));
      rmSync(join(directory, 'responses'), { recursive: true });
      symlinkSync(outside, join(directory, 'responses'));
    },
  ];
  for (const mutate of cases) {
    const saved = bundles.create('powerx', 'positive');
    mutate(saved.directory);
    const result = bundles.verify(saved.directory);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_EVIDENCE');
  }
});
