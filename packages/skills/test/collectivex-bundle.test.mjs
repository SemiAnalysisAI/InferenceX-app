import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import * as collectivex from '../skills/inferencex-api/scripts/compare-collectivex.mjs';
import { bundleSuite } from './bundle-harness.mjs';
import {
  COLLECTIVEX_BUNDLE_VARIANTS,
  COLLECTIVEX_IDS,
  collectivexDataset,
  collectivexKvDataset,
} from './collectivex-bundle-fixtures.mjs';

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

function savedResponse(body, index = 0) {
  const bytes = Buffer.from(JSON.stringify(body));
  return {
    id: String(index).padStart(64, '0'),
    status: 200,
    retrievedAt: '2026-09-07T00:00:00.000Z',
    bytes,
    body,
  };
}

async function collectDatasets(left, right) {
  const responses = [COLLECTIVEX_BUNDLE_VARIANTS.positive.responses[0].body, left, right];
  let cursor = 0;
  const collected = await collectivex.collect(
    collectivex.normalizeArgs(['--left', COLLECTIVEX_IDS[0], '--right', COLLECTIVEX_IDS[1]]),
    {
      producerVersion: '1.0.0',
      get: () => Promise.resolve(savedResponse(responses[cursor], cursor++)),
    },
  );
  assert.equal(cursor, 3);
  return JSON.parse(collected.bytes);
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
test('malformed CollectiveX lists and details fail after valid OpenAPI validation', async () => {
  const schema = COLLECTIVEX_BUNDLE_VARIANTS.positive.responses[0].body;
  for (const { name, options, responses, expectedRequests } of [
    {
      name: 'malformed run list',
      options: collectivex.normalizeArgs([]),
      responses: [schema, {}],
      expectedRequests: 2,
    },
    {
      name: 'malformed run detail',
      options: collectivex.normalizeArgs(['--left', '101', '--right', '102']),
      responses: [schema, {}],
      expectedRequests: 2,
    },
    {
      name: 'mismatched requested run identity',
      options: collectivex.normalizeArgs(['--left', '101', '--right', '102']),
      responses: [schema, collectivexDataset('103')],
      expectedRequests: 2,
    },
  ]) {
    let cursor = 0;
    await assert.rejects(
      collectivex.collect(options, {
        producerVersion: '1.0.0',
        get: () => Promise.resolve(savedResponse(responses[cursor], cursor++)),
      }),
      (error) => error.code === 'INVALID_RESPONSE',
      name,
    );
    assert.equal(cursor, expectedRequests, name);
  }
});

test('CollectiveX EP and KV identity dimensions never acquire cross-configuration metrics', async () => {
  const epChanges = [
    ['backend', (data) => (data.series[0].backend = 'uccl')],
    ['precision', (data) => (data.series[0].precision = 'fp8')],
    ['phase', (data) => (data.series[0].phase = 'prefill')],
    ['mode', (data) => (data.series[0].mode = 'low-latency')],
    ['series ID', (data) => (data.series[0].series_id = 'different-case')],
    ['hardware SKU', (data) => (data.series[0].system.sku = 'b200')],
    [
      'EP rank topology',
      (data) => {
        data.series[0].system.ep_size = 16;
        data.series[0].points[0].global_tokens = 512;
      },
    ],
    ['node topology', (data) => (data.series[0].system.nodes = 2)],
    [
      'transport topology',
      (data) => (data.series[0].system.scale_up_transport = 'different-fabric'),
    ],
    [
      'tokens per rank',
      (data) => {
        data.series[0].points[0].tokens_per_rank = 64;
        data.series[0].points[0].global_tokens = 512;
      },
    ],
    [
      'payload bytes',
      (data) => (data.series[0].points[0].components.dispatch.payload_bytes = 16_384),
    ],
    [
      'future point configuration',
      (data) => (data.series[0].points[0].future_configuration = 'different'),
    ],
    [
      'operation',
      (data) => {
        data.series[0].points[0].components.combine = data.series[0].points[0].components.dispatch;
        data.series[0].points[0].components.dispatch = null;
      },
    ],
  ];
  for (const [name, change] of epChanges) {
    const left = collectivexDataset(COLLECTIVEX_IDS[0]);
    const right = collectivexDataset(COLLECTIVEX_IDS[1], 10);
    change(right);
    const report = await collectDatasets(left, right);
    assert.equal(report.summary.matched, 0, name);
    assert.ok(report.summary.only_left > 0, name);
    assert.ok(report.summary.only_right > 0, name);
    assert.ok(
      report.comparisons.every((row) => row.metrics.length === 0),
      name,
    );
  }

  const kvChanges = [
    ['request bytes', (data) => (data.kv[0].rows[0].req_bytes = 2_000_000)],
    ['batch', (data) => (data.kv[0].rows[0].batch = 8)],
    ['operation', (data) => (data.kv[0].rows[0].op = 'push')],
    ['page size', (data) => (data.kv[0].rows[0].page_tokens = 32)],
    ['fabric', (data) => (data.kv[0].fabric = 'mnnvl')],
    ['workload', (data) => (data.kv[0].workload = 'kv-other')],
    ['future row configuration', (data) => (data.kv[0].rows[0].future_configuration = 'different')],
  ];
  for (const [name, change] of kvChanges) {
    const left = collectivexKvDataset(COLLECTIVEX_IDS[0]);
    const right = collectivexKvDataset(COLLECTIVEX_IDS[1], 2);
    change(right);
    const report = await collectDatasets(left, right);
    assert.equal(report.summary.matched, 0, name);
    assert.equal(report.summary.only_left, 1, name);
    assert.equal(report.summary.only_right, 1, name);
    assert.ok(
      report.comparisons.every((row) => row.metrics.length === 0),
      name,
    );
  }
});

test('CollectiveX metrics distinguish omitted, null, zero and positive values', async () => {
  const left = collectivexDataset(COLLECTIVEX_IDS[0], 0);
  const right = collectivexDataset(COLLECTIVEX_IDS[1], 10);
  left.series[0].points[0].components.dispatch.latency_us.p90 = null;
  delete left.series[0].points[0].components.dispatch.latency_us.p95;
  left.series[0].points[0].components.dispatch.latency_us.p99 = 5;
  right.series[0].points[0].components.dispatch.latency_us.p99 = 15;
  const report = await collectDatasets(left, right);
  const metrics = report.comparisons.find((row) => row.status === 'matched').metrics;
  assert.deepEqual(
    metrics.find((row) => row.name === 'latency_us.p50'),
    {
      name: 'latency_us.p50',
      unit: 'us',
      left: { status: 'value', value: 0 },
      right: { status: 'value', value: 10 },
      difference_right_minus_left: 10,
      ratio_right_over_left: null,
    },
  );
  assert.deepEqual(metrics.find((row) => row.name === 'latency_us.p90').left, {
    status: 'null',
    value: null,
  });
  assert.deepEqual(metrics.find((row) => row.name === 'latency_us.p95').left, {
    status: 'missing',
  });
  assert.deepEqual(
    metrics.find((row) => row.name === 'latency_us.p99'),
    {
      name: 'latency_us.p99',
      unit: 'us',
      left: { status: 'value', value: 5 },
      right: { status: 'value', value: 15 },
      difference_right_minus_left: 10,
      ratio_right_over_left: 3,
    },
  );
});
