import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import * as tco from '../skills/inferencex-api/scripts/compare-tco.mjs';
import { bundleSuite } from './bundle-harness.mjs';
import {
  TCO_BUNDLE_ARGS,
  TCO_BUNDLE_VARIANTS,
  TCO_FEED_URL,
  tcoFeed,
  tcoPoint,
} from './tco-bundle-fixtures.mjs';

const bundles = bundleSuite({ tco: TCO_BUNDLE_VARIANTS });
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function manifest(directory) {
  return JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
}

function saveManifest(directory, value) {
  writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(value, null, 2)}\n`);
}

test('TCO exposes closed canonical options with explicit units', () => {
  assert.equal(typeof tco.normalizeArgs, 'function');
  assert.equal(typeof tco.collect, 'function');
  const normalized = tco.normalizeArgs(TCO_BUNDLE_ARGS.slice(2));
  assert.deepEqual(normalized, {
    model: 'dsv4',
    date: '2026-09-06',
    workloads: ['1024x1024'],
    target_output_tokens_per_second_per_user: 50,
    gpu_hourly_prices_usd: { b200: 3.6, mi355x: 1.8 },
    units: {
      gpu_hourly_price: 'USD per GPU-hour',
      target_output_throughput: 'output tokens per second per user',
      gpu_output_throughput: 'output tokens per second per GPU',
      modeled_cost: 'USD per million output tokens',
    },
  });
  assert.deepEqual(tco.normalizeArgs(normalized), normalized);
  assert.throws(() => tco.normalizeArgs({ ...normalized, extra: true }), {
    code: 'INVALID_ARGUMENT',
  });
  assert.throws(() => tco.normalizeArgs([...TCO_BUNDLE_ARGS.slice(2), '--target', '75']), {
    code: 'INVALID_ARGUMENT',
  });
  const priceIndex = TCO_BUNDLE_ARGS.indexOf('b200=3.6,mi355x=1.8');
  for (const prices of ['b200=0', 'b200=-1', 'b200=Infinity', 'b200=3,b200=4', 'b200=3,mi355x']) {
    assert.throws(() => tco.normalizeArgs(TCO_BUNDLE_ARGS.slice(2).with(priceIndex - 2, prices)), {
      code: 'INVALID_ARGUMENT',
    });
  }
});

test('packed TCO bundles hand-check costs and reference the exact saved feed', () => {
  const saved = bundles.create('tco', 'positive');
  const result = bundles.readResult(saved.directory);
  const value = manifest(saved.directory);
  assert.deepEqual(
    result.rows.map((row) => row.usd_per_million_output_tokens),
    [1, 1],
  );
  assert.equal(result.kind, 'tco');
  assert.equal(result.metadata.price_source, 'user-supplied');
  assert.equal(result.metadata.contract_version, 1);
  assert.equal(result.source.response_id, value.requests[0].response.id);
  assert.equal(Object.hasOwn(result.source, 'body'), false);
  assert.deepEqual(saved.requests, [{ operation: 'tco-feed', url: TCO_FEED_URL }]);
  assert.equal(bundles.verify(saved.directory, []).status, 0);
});

test('missing hardware is partial evidence and fails only when explicitly required', () => {
  const saved = bundles.create('tco', 'partial');
  const result = bundles.readResult(saved.directory);
  assert.deepEqual(
    result.rows.map((row) => row.usd_per_million_output_tokens),
    [1, null],
  );
  assert.equal(result.rows[1].status, 'missing_point');
  assert.equal(manifest(saved.directory).coverage.status, 'partial');
  assert.equal(bundles.verify(saved.directory, []).status, 0);

  const required = bundles.create('tco', 'partial', {
    policy: ['--require-hardware', 'mi355x'],
  });
  assert.equal(required.result.status, 3);
  assert.equal(bundles.verify(required.directory, []).status, 0);
});

test('clamped, unreachable and rounded-zero points retain null costs and zero valid hardware', () => {
  const saved = bundles.create('tco', 'boundaries');
  const result = bundles.readResult(saved.directory);
  assert.deepEqual(
    result.rows.map((row) => row.status),
    ['clamped_low', 'zero_throughput', 'unreachable'],
  );
  assert.deepEqual(
    result.rows.map((row) => row.usd_per_million_output_tokens),
    [null, null, null],
  );
  assert.deepEqual(manifest(saved.directory).coverage.hardware, [
    { hardware: 'b200', valid_records: 0 },
    { hardware: 'h200_sxm', valid_records: 0 },
    { hardware: 'mi355x', valid_records: 0 },
  ]);
});

test('offline replay rejects a rehashed cost change and a changed request scope', () => {
  {
    const saved = bundles.create('tco', 'positive');
    const value = manifest(saved.directory);
    const resultPath = join(saved.directory, value.result.path);
    const result = JSON.parse(readFileSync(resultPath, 'utf8'));
    result.rows[0].usd_per_million_output_tokens = 2;
    const changed = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
    writeFileSync(resultPath, changed);
    value.result.size = changed.length;
    value.result.sha256 = sha256(changed);
    saveManifest(saved.directory, value);
    assert.notEqual(bundles.verify(saved.directory).status, 0);
  }
  {
    const saved = bundles.create('tco', 'positive');
    const value = manifest(saved.directory);
    value.requests[0].url = value.requests[0].url.replace('tiers=50', 'tiers=75');
    saveManifest(saved.directory, value);
    assert.notEqual(bundles.verify(saved.directory).status, 0);
  }
});

test('an altered feed date is a response-envelope failure distinct from request scope', async () => {
  const options = tco.normalizeArgs(TCO_BUNDLE_ARGS.slice(2));
  await assert.rejects(
    tco.collect(options, {
      producerVersion: '1.0.0',
      get: () =>
        Promise.resolve({
          id: 'a'.repeat(64),
          status: 200,
          retrievedAt: '2026-09-07T00:00:00.000Z',
          bytes: Buffer.from('{}'),
          body: tcoFeed([tcoPoint(), tcoPoint('mi355x', { output_tput_per_gpu: 500 })], {
            date: '2026-09-05',
          }),
        }),
    }),
    (error) => error.code === 'INVALID_RESPONSE' && /response envelope/u.test(error.message),
  );
});

test('TCO rejects mismatched, duplicate and contradictory frontier provenance', async () => {
  const options = tco.normalizeArgs(TCO_BUNDLE_ARGS.slice(2));
  for (const { name, body } of [
    { name: 'model mismatch', body: tcoFeed([], { model: 'dsr1' }) },
    { name: 'workload mismatch', body: tcoFeed([], { workloads: ['8192x1024'] }) },
    { name: 'tier mismatch', body: tcoFeed([], { tiers: [75] }) },
    { name: 'duplicate point', body: tcoFeed([tcoPoint(), tcoPoint()]) },
    {
      name: 'negative throughput',
      body: tcoFeed([tcoPoint('b200', { output_tput_per_gpu: -1 })]),
    },
    {
      name: 'non-finite throughput',
      body: tcoFeed([tcoPoint('b200', { output_tput_per_gpu: Infinity })]),
    },
    {
      name: 'string throughput',
      body: tcoFeed([tcoPoint('b200', { output_tput_per_gpu: '1000' })]),
    },
    {
      name: 'future evidence date',
      body: tcoFeed([tcoPoint('b200', { latest_date: '2026-09-07' })]),
    },
    {
      name: 'contradictory single knot',
      body: tcoFeed([
        tcoPoint('b200', {
          is_interpolated: false,
          frontier_points: 1,
          frontier_min_interactivity: 50,
          frontier_max_interactivity: 60,
          oldest_frontier_date: '2026-09-02',
          latest_date: '2026-09-02',
          evidence_date: { from: '2026-09-02', to: '2026-09-02' },
        }),
      ]),
    },
    {
      name: 'contradictory clamped boundary',
      body: tcoFeed([
        tcoPoint('b200', {
          boundary: 'clamped_low',
          is_interpolated: false,
          frontier_min_interactivity: 25,
          evidence_date: { from: '2026-09-02', to: '2026-09-02' },
        }),
      ]),
    },
    {
      name: 'unreachable point with evidence',
      body: tcoFeed([
        tcoPoint('b200', {
          boundary: 'unreachable',
          is_interpolated: false,
          frontier_max_interactivity: 40,
          output_tput_per_gpu: 0,
        }),
      ]),
    },
  ]) {
    let requests = 0;
    await assert.rejects(
      tco.collect(options, {
        producerVersion: '1.0.0',
        get: () => {
          requests += 1;
          return Promise.resolve({
            id: 'b'.repeat(64),
            status: 200,
            retrievedAt: '2026-09-07T00:00:00.000Z',
            bytes: Buffer.from(JSON.stringify(body)),
            body,
          });
        },
      }),
      (error) => error.code === 'INVALID_RESPONSE',
      name,
    );
    assert.equal(requests, 1, name);
  }
});

test('finite TCO inputs that overflow or underflow modeled cost fail at numeric range', async () => {
  const base = tco.normalizeArgs(TCO_BUNDLE_ARGS.slice(2));
  for (const { name, price, throughput } of [
    { name: 'price overflow', price: 1e308, throughput: 1000 },
    { name: 'throughput underflow', price: 3.6, throughput: Number.MIN_VALUE },
    { name: 'cost underflow', price: 3.6, throughput: 1e308 },
  ]) {
    const options = tco.normalizeArgs({
      ...base,
      gpu_hourly_prices_usd: { b200: price },
    });
    const body = tcoFeed([tcoPoint('b200', { output_tput_per_gpu: throughput })]);
    let requests = 0;
    await assert.rejects(
      tco.collect(options, {
        producerVersion: '1.0.0',
        get: () => {
          requests += 1;
          return Promise.resolve({
            id: 'c'.repeat(64),
            status: 200,
            retrievedAt: '2026-09-07T00:00:00.000Z',
            bytes: Buffer.from(JSON.stringify(body)),
            body,
          });
        },
      }),
      (error) => error.code === 'INVALID_RESPONSE' && /numeric range/u.test(error.message),
      name,
    );
    assert.equal(requests, 1, name);
  }
});

test('result records API interpolation as saved input rather than replayed methodology', () => {
  const result = bundles.readResult(bundles.create('tco', 'positive').directory);
  assert.match(result.metadata.frontier_scope, /API frontier/u);
  assert.match(result.metadata.offline_verification_scope, /not independently revalidate/u);
});
