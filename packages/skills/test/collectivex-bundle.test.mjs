import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import * as collectivex from '../skills/inferencex-api/scripts/compare-collectivex.mjs';
import { bundleSuite } from './bundle-harness.mjs';
import { COLLECTIVEX_BUNDLE_VARIANTS } from './collectivex-bundle-fixtures.mjs';

const bundles = bundleSuite({ collectivex: COLLECTIVEX_BUNDLE_VARIANTS });
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function manifest(directory) {
  return JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
}

function saveManifest(directory, value) {
  writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(value, null, 2)}\n`);
}

function replaceResponse(directory, requestIndex, body) {
  const value = manifest(directory);
  const request = value.requests[requestIndex];
  const bytes = Buffer.from(JSON.stringify(body));
  const responseId = sha256(bytes);
  writeFileSync(join(directory, 'responses', `${responseId}.body`), bytes);
  request.response = {
    ...request.response,
    id: responseId,
    path: `responses/${responseId}.body`,
    sha256: responseId,
    size: bytes.length,
  };
  request.attempts.at(-1).consumedBytes = bytes.length;
  saveManifest(directory, value);
}

test('CollectiveX exposes the formal collector', () => {
  assert.equal(typeof collectivex.normalizeArgs, 'function');
  assert.equal(typeof collectivex.collect, 'function');
  assert.deepEqual(collectivex.normalizeArgs([]), { left: null, right: null });
  assert.deepEqual(
    collectivex.normalizeArgs([
      '--left',
      '90071992547409930001',
      '--right',
      '90071992547409930002',
    ]),
    { left: '90071992547409930001', right: '90071992547409930002' },
  );
  assert.throws(() => collectivex.normalizeArgs(['--left', '1']), {
    code: 'INVALID_ARGUMENT',
  });
});

test('topology mismatches remain valid evidence with no comparable pair', () => {
  const saved = bundles.create('collectivex', 'topology-mismatch');
  const report = bundles.readResult(saved.directory);
  assert.equal(report.summary.matched, 0);
  assert.equal(bundles.verify(saved.directory, []).status, 0);
  assert.equal(bundles.verify(saved.directory, ['--min-comparable-pairs', '1']).status, 3);
});

test('explicit and one-list bundles reconstruct exact identities, metrics, units and sources', () => {
  for (const variant of ['positive', 'one-list']) {
    const saved = bundles.create('collectivex', variant);
    const report = bundles.readResult(saved.directory);
    assert.equal(saved.result.status, 0, saved.result.stderr);
    assert.equal(report.kind, 'collectivex');
    assert.equal(report.contract_version, 1);
    assert.equal(report.summary.matched, 1);
    assert.deepEqual(report.selection.run_ids, ['90071992547409930001', '90071992547409930002']);
    assert.ok(report.sources.every((source) => /^[a-f\d]{64}$/u.test(source.response_id)));
    assert.equal(
      report.sources.some((source) => Object.hasOwn(source, 'body_text')),
      false,
    );
    const matched = report.comparisons.find((row) => row.status === 'matched');
    assert.equal(matched.identity.operation, 'dispatch');
    assert.deepEqual(
      matched.metrics.find((metric) => metric.name === 'latency_us.p50'),
      {
        name: 'latency_us.p50',
        unit: 'us',
        left: { status: 'value', value: 20 },
        right: { status: 'value', value: 10 },
        difference_right_minus_left: -10,
        ratio_right_over_left: 0.5,
      },
    );
    const before = bundles.fingerprint(saved.directory);
    const verified = bundles.verify(saved.directory);
    assert.equal(verified.status, 0, verified.stderr);
    assert.deepEqual(bundles.fingerprint(saved.directory), before);
  }
  const listed = bundles.readResult(bundles.create('collectivex', 'one-list').directory);
  assert.equal(listed.selection.mode, 'newest_two_measured_from_one_list');
  assert.equal(listed.discovery.response_id, listed.sources[1].response_id);

  const kv = bundles.readResult(bundles.create('collectivex', 'kv-positive').directory);
  const kvMetrics = kv.comparisons[0].metrics;
  assert.equal(kvMetrics.find((metric) => metric.name === 'latency_ms.p50').unit, 'ms per burst');
  assert.equal(kvMetrics.find((metric) => metric.name === 'request_ms.p50').unit, 'ms per request');
  assert.equal(kvMetrics.find((metric) => metric.name === 'gbps_p50').unit, 'GB/s');

  const zero = bundles.readResult(bundles.create('collectivex', 'zero-denominator').directory);
  const zeroMetric = zero.comparisons[0].metrics.find((metric) => metric.name === 'latency_us.p50');
  assert.equal(zeroMetric.left.value, 0);
  assert.equal(zeroMetric.difference_right_minus_left, 10);
  assert.equal(zeroMetric.ratio_right_over_left, null);
});

test('a complete list with fewer than two measured runs is valid empty evidence', () => {
  const saved = bundles.create('collectivex', 'empty');
  const report = bundles.readResult(saved.directory);
  assert.equal(report.outcome, 'fewer_than_two_measured_runs');
  assert.deepEqual(report.selection.run_ids, ['90071992547409930001']);
  assert.deepEqual(report.comparisons, []);
  assert.equal(manifest(saved.directory).coverage.status, 'empty');
  assert.equal(bundles.verify(saved.directory).status, 0);
  assert.equal(bundles.verify(saved.directory, ['--min-comparable-pairs', '1']).status, 3);
});

test('CollectiveX replay rejects missing discovery, wrong runs, altered topology and rehashed output', () => {
  {
    const saved = bundles.create('collectivex', 'one-list');
    const value = manifest(saved.directory);
    rmSync(join(saved.directory, value.requests[1].response.path));
    assert.notEqual(bundles.verify(saved.directory).status, 0);
  }
  {
    const saved = bundles.create('collectivex', 'positive');
    const response = structuredClone(COLLECTIVEX_BUNDLE_VARIANTS.positive.responses[1].body);
    response.run.run_id = '90071992547409939999';
    replaceResponse(saved.directory, 1, response);
    assert.notEqual(bundles.verify(saved.directory).status, 0);
  }
  {
    const saved = bundles.create('collectivex', 'positive');
    const response = structuredClone(COLLECTIVEX_BUNDLE_VARIANTS.positive.responses[2].body);
    response.series[0].system.nodes = 2;
    replaceResponse(saved.directory, 2, response);
    assert.notEqual(bundles.verify(saved.directory).status, 0);
  }
  {
    const saved = bundles.create('collectivex', 'positive');
    const value = manifest(saved.directory);
    const path = join(saved.directory, value.result.path);
    const report = JSON.parse(readFileSync(path, 'utf8'));
    report.summary.matched = 0;
    const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(path, bytes);
    value.result.size = bytes.length;
    value.result.sha256 = sha256(bytes);
    saveManifest(saved.directory, value);
    assert.notEqual(bundles.verify(saved.directory).status, 0);
  }
});

test('an unavailable required explicit run leaves incomplete evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'collectivex-unavailable-'));
  const directory = join(root, 'evidence');
  const fixturePath = join(root, 'fixture.json');
  const requestPath = join(root, 'requests.jsonl');
  const responses = structuredClone(COLLECTIVEX_BUNDLE_VARIANTS.positive.responses);
  responses.at(-1).status = 404;
  responses.at(-1).body = { error: 'Not found' };
  writeFileSync(fixturePath, JSON.stringify({ responses }));
  const result = bundles.invoke(
    [
      ...COLLECTIVEX_BUNDLE_VARIANTS.positive.args,
      '--output-dir',
      directory,
      '--max-attempts',
      '1',
    ],
    {
      cwd: root,
      env: {
        INFERENCEX_BUNDLE_FIXTURE: fixturePath,
        INFERENCEX_BUNDLE_REQUESTS: requestPath,
      },
    },
  );
  assert.equal(result.status, 1);
  assert.equal(existsSync(directory), true);
  assert.equal(existsSync(join(directory, 'manifest.json')), false);
});
test('malformed CollectiveX source contracts are response failures', async () => {
  await assert.rejects(
    collectivex.collect(collectivex.normalizeArgs(['--left', '101', '--right', '102']), {
      get: () =>
        Promise.resolve({
          id: '0'.repeat(64),
          status: 200,
          retrievedAt: '2026-09-07T00:00:00.000Z',
          bytes: Buffer.from('{}'),
          body: {},
        }),
    }),
    { code: 'INVALID_RESPONSE' },
  );
});
