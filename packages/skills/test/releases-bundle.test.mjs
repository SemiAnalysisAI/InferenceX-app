import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { collect, normalizeArgs } from '../skills/inferencex-api/scripts/compare-releases.mjs';
import { bundleSuite } from './bundle-harness.mjs';
import { succeeded } from './packed-skill.mjs';
import {
  RELEASE_ARGS,
  RELEASE_BUNDLE_VARIANTS,
  releaseObservation,
} from './releases-bundle-fixtures.mjs';

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

async function collectRows(rows) {
  const collected = await collect(normalizeArgs(RELEASE_ARGS), {
    producerVersion: '1.0.0',
    get: () =>
      Promise.resolve({
        id: 'a'.repeat(64),
        status: 200,
        retrievedAt: '2026-09-07T00:00:00.000Z',
        bytes: Buffer.from(JSON.stringify(rows)),
        body: rows,
      }),
  });
  return { coverage: collected.coverage, output: JSON.parse(collected.bytes) };
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
  const { delta, percent_change: percentChange, ...metric } = saved.output.comparisons[0].metric;
  assert.deepEqual(metric, {
    name: 'median_ttft',
    before: 0.4,
    after: 0.3,
    status: 'observed_change',
  });
  assert.ok(Math.abs(delta - -0.1) < 1e-12);
  assert.ok(Math.abs(percentChange - -25) < 1e-12);
  assert.equal(saved.output.evidence, undefined);
  assert.equal(saved.output.sources[0].response_id, saved.manifest.requests[0].response.id);
  const beforeVerify = fingerprint(saved.directory);
  succeeded(verify(saved.directory));
  assert.deepEqual(fingerprint(saved.directory), beforeVerify);
});

test('release metrics preserve missing sides, missing pairs and zero baselines', async () => {
  for (const { name, before, after, expected, comparablePairs } of [
    {
      name: 'missing before',
      before: {},
      after: { median_ttft: 0.3 },
      expected: {
        name: 'median_ttft',
        before: null,
        after: 0.3,
        delta: null,
        percent_change: null,
        status: 'missing_before',
      },
      comparablePairs: 0,
    },
    {
      name: 'missing after',
      before: { median_ttft: 0.4 },
      after: {},
      expected: {
        name: 'median_ttft',
        before: 0.4,
        after: null,
        delta: null,
        percent_change: null,
        status: 'missing_after',
      },
      comparablePairs: 0,
    },
    {
      name: 'missing both',
      before: {},
      after: {},
      expected: {
        name: 'median_ttft',
        before: null,
        after: null,
        delta: null,
        percent_change: null,
        status: 'missing_both',
      },
      comparablePairs: 0,
    },
    {
      name: 'zero baseline',
      before: { median_ttft: 0 },
      after: { median_ttft: 0.3 },
      expected: {
        name: 'median_ttft',
        before: 0,
        after: 0.3,
        delta: 0.3,
        percent_change: null,
        status: 'zero_baseline',
      },
      comparablePairs: 1,
    },
  ]) {
    const { output, coverage } = await collectRows([
      releaseObservation(false, { metrics: before }),
      releaseObservation(true, { metrics: after }),
    ]);
    assert.deepEqual(output.comparisons[0].metric, expected, name);
    assert.equal(coverage.comparable_pairs, comparablePairs, name);
  }
});

test('every release configuration field and metric prevents cross-configuration matching', async () => {
  const fieldChanges = {
    model: 'glm5.1',
    hardware: 'h100_sxm',
    framework: 'sglang',
    precision: 'bf16',
    spec_method: 'mtp',
    benchmark_type: 'agentic_traces',
    isl: 1024,
    osl: 8192,
    conc: 64,
    offload_mode: 'on',
    disagg: true,
    is_multinode: true,
    prefill_tp: 4,
    prefill_ep: 2,
    prefill_dp_attention: true,
    prefill_num_workers: 2,
    decode_tp: 4,
    decode_ep: 2,
    decode_dp_attention: true,
    decode_num_workers: 2,
    num_prefill_gpu: 8,
    num_decode_gpu: 16,
  };
  for (const [field, changed] of Object.entries(fieldChanges)) {
    const { output } = await collectRows([
      releaseObservation(),
      releaseObservation(true, { [field]: changed }),
    ]);
    assert.equal(output.comparisons.length, 0, field);
    assert.equal(output.outcome, 'no_comparable_pairs', field);
  }

  const metricChanges = {
    prefill_pp: [1, 2],
    decode_pp: [1, 2],
    dcp_size: [1, 2],
    pcp_size: [1, 2],
    prefill_dcp_size: [1, 2],
    decode_dcp_size: [1, 2],
    prefill_pcp_size: [1, 2],
    decode_pcp_size: [1, 2],
    kv_offloading: ['none', 'dram'],
    kv_offload_backend: ['none', 'lmcache'],
    kv_offload_backend_version: ['0.1', '0.2'],
    kv_p2p_transfer: ['none', 'nixl'],
    router_name: ['sglang', 'dynamo'],
    router_version: ['0.1', '0.2'],
  };
  for (const [metric, [before, after]] of Object.entries(metricChanges)) {
    const { output } = await collectRows([
      releaseObservation(false, { metrics: { median_ttft: 0.4, [metric]: before } }),
      releaseObservation(true, { metrics: { median_ttft: 0.3, [metric]: after } }),
    ]);
    assert.equal(output.comparisons.length, 0, metric);
    assert.equal(output.outcome, 'no_comparable_pairs', metric);
  }
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

test('a mismatched producer identity is excluded instead of paired across release scopes', () => {
  const saved = create('producer-mismatch');
  assert.equal(saved.output.comparisons.length, 0);
  assert.deepEqual(saved.output.selection.before.excluded[0].reasons, ['image_mismatch']);
  assert.equal(saved.manifest.coverage.comparable_pairs, 0);
});

test('exact release run URLs distinguish attempts from misleading workflow IDs', async () => {
  const before = releaseObservation(false, { image: null, workflow_run_id: 222 });
  const decoy = releaseObservation(false, {
    id: '103',
    image: null,
    run_url: releaseObservation(false).run_url.replace('/attempts/2', '/attempts/1'),
  });
  const after = releaseObservation(true, { image: null, workflow_run_id: 111 });
  const args = [
    ...RELEASE_ARGS.slice(0, -4),
    '--before-run-url',
    before.run_url,
    '--after-run-url',
    after.run_url,
  ];
  let requests = 0;
  const collected = await collect(normalizeArgs(args), {
    producerVersion: '1.0.0',
    get: () => {
      requests += 1;
      const rows = [before, decoy, after];
      return Promise.resolve({
        id: 'b'.repeat(64),
        status: 200,
        retrievedAt: '2026-09-07T00:00:00.000Z',
        bytes: Buffer.from(JSON.stringify(rows)),
        body: rows,
      });
    },
  });
  const output = JSON.parse(collected.bytes);
  assert.equal(requests, 1);
  assert.equal(output.comparisons.length, 1);
  assert.deepEqual(output.selection.before.rows, [{ ...before, workflow_run_id: '222' }]);
  assert.deepEqual(output.selection.after.rows, [{ ...after, workflow_run_id: '111' }]);
  assert.deepEqual(output.selection.before.excluded, [
    { row: decoy, reasons: ['run_url_mismatch'] },
  ]);
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
