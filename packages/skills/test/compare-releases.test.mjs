import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { before as beforeSuite, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();
const preload = join(suite.temporaryRoot, 'release-response.mjs');
let script;
let claudeScript;
const required = [
  '--model',
  'GLM-5',
  '--hardware',
  'h200_sxm',
  '--framework',
  'vllm',
  '--isl',
  '8192',
  '--osl',
  '1024',
  '--metric',
  'median_ttft',
  '--before-date',
  '2026-09-01',
  '--after-date',
  '2026-09-02',
  '--before-image',
  'vllm/vllm-openai:before',
  '--after-image',
  'vllm/vllm-openai:after',
];

function observation(after = false, overrides = {}) {
  return {
    id: after ? '900719925474099312346' : '900719925474099312345',
    hardware: 'h200_sxm',
    framework: 'vllm',
    model: 'glm5',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 0,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc: 32,
    offload_mode: 'off',
    image: `vllm/vllm-openai:${after ? 'after' : 'before'}`,
    recipe_fingerprint: after ? 'new-recipe' : 'old-recipe',
    metrics: { median_ttft: after ? 0.3 : 0.4 },
    date: after ? '2026-09-02' : '2026-09-01',
    run_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${after ? '222' : '111'}/attempts/2`,
    ...overrides,
  };
}

function run(rows = [observation(), observation(true)], args = required, faults = {}) {
  const cwd = faults.cwd ?? suite.project();
  const responsePath = join(suite.project('response-'), 'response.json');
  const requestPath = `${responsePath}.requests`;
  writeFileSync(responsePath, JSON.stringify({ body: JSON.stringify(rows), ...faults }));
  const result = suite.node(
    [
      '--import',
      pathToFileURL(preload).href,
      faults.target === 'claude' ? claudeScript : script,
      ...args,
    ],
    {
      cwd,
      env: {
        ...suite.environment,
        INFERENCEX_TEST_RESPONSE: responsePath,
        INFERENCEX_TEST_REQUESTS: requestPath,
      },
    },
  );
  const requests = existsSync(requestPath)
    ? readFileSync(requestPath, 'utf8').trim().split('\n').map(JSON.parse)
    : [];
  return { ...result, cwd, requests };
}

beforeSuite(() => {
  writeFileSync(
    preload,
    `
import { appendFileSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
const fixture = JSON.parse(readFileSync(process.env.INFERENCEX_TEST_RESPONSE, 'utf8'));
if (fixture.timeout) AbortSignal.timeout = () => AbortSignal.abort(new DOMException('Timed out', 'TimeoutError'));
if (fixture.stdoutFailure) process.stdout.write = (_bytes, callback) => { callback(new Error('stdout closed')); return false; };
if (fixture.writeFailure) {
  const write = fs.writeFile;
  fs.writeFile = async (path, bytes, options) => { await write(path, bytes.slice(0, 7), options); throw new Error('disk write interrupted'); };
  syncBuiltinESMExports();
}
globalThis.fetch = async (input, options) => {
  appendFileSync(process.env.INFERENCEX_TEST_REQUESTS, JSON.stringify({ url: String(input), redirect: options.redirect, signal: options.signal instanceof AbortSignal }) + '\\n');
  options.signal.throwIfAborted();
  if (fixture.bodyFailure) return new Response(new ReadableStream({ start(controller) { controller.error(new Error('body interrupted')); } }));
  if (fixture.lateBodyFailure) return new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(fixture.body)); },
    pull(controller) { controller.error(new Error('body interrupted after first chunk')); },
  }));
  if (fixture.redirect && options.redirect === 'error') throw new TypeError('fetch failed: unexpected redirect');
  let body = fixture.body;
  if (fixture.invalidUtf8) body = Uint8Array.from([0xc3, 0x28]);
  if (fixture.oversized) {
    let count = 0;
    body = new ReadableStream({ pull(controller) {
      if (count++ > 17) throw new Error('Body limit was not enforced');
      controller.enqueue(new Uint8Array(1024 * 1024));
    } });
  }
  const response = new Response(body, { status: fixture.status ?? 200 });
  if (fixture.responseUrl) Object.defineProperty(response, 'url', { value: fixture.responseUrl });
  if (fixture.redirected) Object.defineProperty(response, 'redirected', { value: true });
  return response;
};
`,
  );
  script = join(suite.install('codex'), 'scripts/compare-releases.mjs');
  claudeScript = join(suite.install('claude'), 'scripts/compare-releases.mjs');
});

test('packed helper reports descriptive changes for one matched public configuration', () => {
  const rows = [observation(), observation(true)];
  const result = run(rows);
  succeeded(result);
  assert.match(result.stdout, /"comparisons"/);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.selection.before.rows, [rows[0]]);
  assert.deepEqual(output.selection.after.rows, [rows[1]]);
  assert.equal(output.comparisons.length, 1);
  const comparison = output.comparisons[0];
  assert.equal(comparison.before_id, rows[0].id);
  assert.equal(comparison.after_id, rows[1].id);
  assert.equal(comparison.configuration_verification, 'public_fields_only');
  assert.equal(comparison.recipe_fingerprint_match, false);
  assert.equal(comparison.metric.before, 0.4);
  assert.equal(comparison.metric.after, 0.3);
  assert.ok(Math.abs(comparison.metric.delta - -0.1) < 1e-12);
  assert.ok(Math.abs(comparison.metric.percent_change - -25) < 1e-12);
  assert.equal(output.metadata.release_mapping, 'unknown');
  assert.equal(output.metadata.causal_attribution, 'not_established');
  assert.equal(result.requests.length, 1);
  assert.deepEqual(result.requests[0], {
    url: 'https://inferencex.semianalysis.com/api/v1/benchmarks/history?model=GLM-5&isl=8192&osl=1024',
    redirect: 'error',
    signal: true,
  });
});

test('source evidence retains the complete consumed body and live PostgreSQL timestamps', () => {
  const rows = [
    observation(false, {
      run_started_at: '2026-09-01 02:22:13.123456+00',
      curve_date: '2026-09-03',
      curve_run_started_at: '2026-09-03 02:22:13+00',
      metrics: { median_ttft: 0.4, router_name: 'sglang-router', router_version: '0.2' },
      extra_metadata: { available: false, count: 0, unknown: null },
    }),
    observation(true, {
      metrics: { median_ttft: 0.3, router_name: 'sglang-router', router_version: '0.2' },
    }),
    observation(true, { id: '999', date: '2026-09-04', hardware: 'mi355x' }),
  ];
  const body = `\uFEFF${JSON.stringify(rows, null, 1)}\n`;
  const result = run(rows, required, { body });
  succeeded(result);
  const output = JSON.parse(result.stdout);
  assert.equal(output.comparisons.length, 1);
  assert.equal(output.evidence.length, 1);
  assert.equal(output.evidence[0].body_utf8, body);
  assert.equal(
    output.evidence[0].decoded_body_sha256,
    createHash('sha256').update(body).digest('hex'),
  );
  assert.equal(output.evidence[0].url, result.requests[0].url);
  assert.deepEqual(JSON.parse(output.evidence[0].body_utf8.slice(1)), rows);
  assert.deepEqual(output.selection.before.rows[0], rows[0]);
});

test('every exposed configuration dimension prevents an unmatched pair from acquiring a delta', () => {
  const variants = {
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
  for (const [key, value] of Object.entries(variants)) {
    const result = run([observation(), observation(true, { [key]: value })]);
    succeeded(result);
    const output = JSON.parse(result.stdout);
    assert.equal(output.comparisons.length, 0, key);
    assert.equal(output.outcome, 'no_comparable_pairs', key);
    assert.equal(output.unmatched.before[0].reason, 'no_matching_configuration', key);
    assert.equal(
      output.metadata.outside_requested_scope,
      ['hardware', 'framework', 'benchmark_type', 'isl', 'osl'].includes(key) ? 1 : 0,
      key,
    );
  }
});

test('topology and runtime metadata inside metrics participate in configuration matching', () => {
  for (const [key, before, after] of [
    ['prefill_pp', 1, 2],
    ['decode_pp', 1, 2],
    ['prefill_dcp_size', 1, 2],
    ['decode_dcp_size', 1, 2],
    ['prefill_pcp_size', 1, 2],
    ['decode_pcp_size', 1, 2],
    ['dcp_size', 1, 2],
    ['pcp_size', 1, 2],
    ['kv_p2p_transfer', 'none', 'nixl'],
    ['router_name', 'sglang', 'dynamo'],
    ['router_version', '0.1', '0.2'],
    ['kv_offloading', 'none', 'dram'],
    ['kv_offload_backend', 'none', 'lmcache'],
    ['kv_offload_backend_version', '0.1', '0.2'],
  ]) {
    const result = run([
      observation(false, { metrics: { median_ttft: 0.4, [key]: before } }),
      observation(true, { metrics: { median_ttft: 0.3, [key]: after } }),
    ]);
    succeeded(result);
    const output = JSON.parse(result.stdout);
    assert.equal(output.comparisons.length, 0, key);
    assert.equal(output.unmatched.before[0].reason, 'no_matching_configuration', key);
  }
  const missing = run([
    observation(false, { metrics: { median_ttft: 0.4, prefill_pp: 1 } }),
    observation(true),
  ]);
  succeeded(missing);
  assert.equal(JSON.parse(missing.stdout).comparisons.length, 0);
  const same = run([
    observation(false, { metrics: { median_ttft: 0.4, prefill_pp: 2 } }),
    observation(true, { metrics: { median_ttft: 0.3, prefill_pp: 2 } }),
  ]);
  succeeded(same);
  assert.equal(JSON.parse(same.stdout).comparisons[0].configuration_metrics.prefill_pp, 2);
});

test('a public-field match discloses changed or unavailable recipe and producer evidence', () => {
  const result = run();
  succeeded(result);
  const pair = JSON.parse(result.stdout).comparisons[0];
  assert.equal(pair.full_recipe_verified, false);
  assert.ok(
    pair.confounders.includes('recipe_fingerprint_changed_includes_image_and_unexposed_config'),
  );
  assert.ok(pair.configuration_unknown_fields.includes('metrics.prefill_pp'));
  assert.deepEqual(pair.producer.before, {
    image: observation().image,
    run_url: observation().run_url,
  });
  const legacy = run([observation(false, { recipe_fingerprint: null }), observation(true)]);
  succeeded(legacy);
  assert.ok(
    JSON.parse(legacy.stdout).comparisons[0].confounders.includes('recipe_fingerprint_unavailable'),
  );
});

test('mixed recipes or repeated runs never produce arbitrary or Cartesian pairings', () => {
  const result = run([
    observation(),
    observation(false, { id: '101', recipe_fingerprint: 'other' }),
    observation(true),
  ]);
  succeeded(result);
  const output = JSON.parse(result.stdout);
  assert.equal(output.comparisons.length, 0);
  assert.deepEqual(
    output.unmatched.before.map((entry) => entry.reason),
    ['ambiguous_configuration', 'ambiguous_configuration'],
  );
  assert.equal(output.unmatched.after[0].reason, 'ambiguous_configuration');
});

test('append-only snapshots preserve raw producer dates and IDs while counting each observation once', () => {
  const before = observation(false, {
    workflow_run_id: '900719925474099399999',
    run_started_at: null,
    curve_date: '2026-09-02',
    curve_workflow_run_id: '900719925474099399997',
    curve_run_started_at: null,
  });
  const reused = {
    ...before,
    curve_date: '2026-09-03',
    curve_workflow_run_id: '900719925474099399998',
  };
  const result = run([before, reused, observation(true)]);
  succeeded(result);
  const output = JSON.parse(result.stdout);
  assert.equal(output.comparisons.length, 1);
  assert.deepEqual(output.selection.before.rows, [before, reused]);
  assert.equal(output.selection.before.unique_observations, 1);
  assert.equal(output.selection.before.snapshot_reuses, 1);
  assert.equal(output.selection.after.unique_observations, 1);
});

test('the same producer observation selected on both sides is not an independent measurement', () => {
  const args = required.map((arg) =>
    arg === '2026-09-02'
      ? '2026-09-01'
      : arg === 'vllm/vllm-openai:after'
        ? 'vllm/vllm-openai:before'
        : arg,
  );
  const result = run([observation()], args);
  succeeded(result);
  const output = JSON.parse(result.stdout);
  assert.equal(output.comparisons.length, 0);
  assert.equal(output.unmatched.before[0].reason, 'reused_observation');
  assert.equal(output.unmatched.after[0].reason, 'reused_observation');
});

test('missing identities and identity mismatches remain explicit exclusions, not changed releases', () => {
  const rows = [
    observation(false, { image: null, run_url: null }),
    observation(false, { id: '102', image: 'nightly' }),
    observation(true),
  ];
  const result = run(rows);
  succeeded(result);
  const output = JSON.parse(result.stdout);
  assert.equal(output.comparisons.length, 0);
  assert.deepEqual(
    output.selection.before.excluded.map((entry) => [entry.row.id, entry.reasons]),
    [
      [rows[0].id, ['missing_image_identity']],
      ['102', ['image_mismatch']],
    ],
  );
});

test('exact producer URL selectors distinguish attempts and never interpret internal workflow IDs as GitHub IDs', () => {
  const args = [
    ...required.filter((_value, index) => index < required.length - 4),
    '--before-run-url',
    observation().run_url,
    '--after-run-url',
    observation(true).run_url,
  ];
  const rows = [
    observation(false, { image: null, workflow_run_id: 222 }),
    observation(false, {
      id: '103',
      run_url: observation().run_url.replace('/attempts/2', '/attempts/1'),
    }),
    observation(true, { image: null, workflow_run_id: 111 }),
  ];
  const result = run(rows, args);
  succeeded(result);
  const output = JSON.parse(result.stdout);
  assert.equal(output.comparisons.length, 1);
  assert.deepEqual(output.selection.before.rows, [rows[0]]);
  assert.equal(output.selection.before.excluded[0].reasons[0], 'run_url_mismatch');
});

test('missing metrics and zero baselines have explicit coverage without invented zeroes or percentages', () => {
  for (const [metrics, expectedStatus] of [
    [{}, 'missing_before'],
    [{ median_ttft: null }, 'missing_before'],
    [{ median_ttft: 0 }, 'zero_baseline'],
  ]) {
    const result = run([
      observation(false, { recipe_fingerprint: null, metrics }),
      observation(true),
    ]);
    succeeded(result);
    const output = JSON.parse(result.stdout);
    const metric = output.comparisons[0].metric;
    assert.equal(metric.status, expectedStatus);
    assert.equal(metric.percent_change, null);
    assert.equal(output.comparisons[0].recipe_fingerprint_match, null);
    assert.deepEqual(output.selection.before.rows[0].metrics, metrics);
    assert.equal(
      output.metadata.metric_coverage.comparable_values,
      expectedStatus === 'zero_baseline' ? 1 : 0,
    );
  }
});

test('invalid records and conflicting reuse fail instead of emitting plausible comparisons', () => {
  const malformed = [
    null,
    [],
    { id: 1 },
    observation(false, { id: 9007199254740992 }),
    observation(false, { date: '2026-02-30' }),
    observation(false, { prefill_tp: '8' }),
    observation(false, { image: {} }),
    observation(false, { run_url: {} }),
    observation(false, { curve_workflow_run_id: 9007199254740992 }),
    observation(false, { recipe_fingerprint: {} }),
    observation(false, { metrics: { median_ttft: '0.4' } }),
  ];
  for (const row of malformed) {
    const result = run([row, observation(true)]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Unexpected benchmark response/);
  }
  const result = run([
    observation(),
    observation(false, { metrics: { median_ttft: 0.6 } }),
    observation(true),
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Conflicting observation/);
});

test('HTTP, malformed JSON, redirects, timeouts and interrupted bodies leave existing outputs untouched', () => {
  const faults = [
    { status: 503 },
    { status: 302 },
    { body: '{' },
    { body: '{}' },
    { body: '[1e400]' },
    { redirect: true },
    { timeout: true },
    { bodyFailure: true },
    { lateBodyFailure: true },
  ];
  for (const fault of faults) {
    const cwd = suite.project();
    writeFileSync(join(cwd, 'comparison.json'), 'keep');
    const result = run(undefined, [...required, '--output', 'comparison.json'], { ...fault, cwd });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(readFileSync(join(cwd, 'comparison.json'), 'utf8'), 'keep');
    assert.equal(result.requests.length, 1);
  }
});

test('file output is exclusively created after successful validation, and stdout failures are reported', () => {
  const result = run(undefined, [...required, '--output', 'comparison.json']);
  succeeded(result);
  assert.equal(result.stdout, '');
  assert.equal(
    JSON.parse(readFileSync(join(result.cwd, 'comparison.json'), 'utf8')).comparisons.length,
    1,
  );
  const second = run(undefined, [...required, '--output', 'comparison.json'], { cwd: result.cwd });
  assert.equal(second.status, 1);
  assert.match(second.stderr, /EEXIST/);
});

test('packed Claude installation rejects partial output writes and stdout errors', () => {
  const good = run(undefined, required, { target: 'claude' });
  succeeded(good);
  assert.equal(JSON.parse(good.stdout).comparisons.length, 1);
  for (const args of [required, ['--help']]) {
    const broken = run(undefined, args, { stdoutFailure: true, target: 'claude' });
    assert.equal(broken.status, 1);
    assert.match(broken.stderr, /stdout closed/);
  }
  const failed = run(undefined, [...required, '--output', 'comparison.json'], {
    writeFailure: true,
  });
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout, '');
  assert.match(failed.stderr, /disk write interrupted/);
  assert.deepEqual(readdirSync(failed.cwd), []);
  const cwd = suite.project();
  writeFileSync(join(cwd, 'existing.json'), 'keep');
  symlinkSync('existing.json', join(cwd, 'comparison.json'));
  const symlink = run(undefined, [...required, '--output', 'comparison.json'], { cwd });
  assert.equal(symlink.status, 1);
  assert.equal(readFileSync(join(cwd, 'existing.json'), 'utf8'), 'keep');
  assert.deepEqual(readdirSync(cwd).sort(), ['comparison.json', 'existing.json']);
});

test('redirect attribution, response budgets and malformed UTF-8 fail without output', () => {
  for (const [fault, error] of [
    [{ responseUrl: 'https://example.com/rows' }, /response URL/],
    [{ redirected: true }, /response URL/],
    [{ oversized: true }, /16 MiB/],
    [{ invalidUtf8: true }, /encoded data/],
  ]) {
    const result = run(undefined, [...required, '--output', 'comparison.json'], fault);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, error);
    assert.deepEqual(readdirSync(result.cwd), []);
  }
});

test('invalid required identity and impossible provenance fail instead of creating matches', () => {
  for (const overrides of [
    { id: 'unparseable' },
    { id: '001' },
    { id: '0' },
    { workflow_run_id: null },
    { workflow_run_id: ' 421' },
    { curve_date: '2026-08-31' },
    { run_started_at: '2026-09-01 24:00:00+00' },
    { curve_run_started_at: '2026-09-01 02:61:13+00' },
    { run_url: 'https://github.com/user:password/repo/actions/runs/123' },
    { prefill_tp: undefined },
    { metrics: { median_ttft: 0.4, prefill_pp: '2' } },
  ]) {
    const result = run([observation(false, overrides), observation(true)]);
    assert.equal(result.status, 1, JSON.stringify(overrides));
    assert.equal(result.stdout, '');
  }
});

test('power, energy and audit fields are refused before reading unvalidated history', () => {
  const rows = [
    observation(false, {
      metrics: { joules_per_output_token: 10, power_valid: 0, power_metric_schema_version: 1 },
    }),
    observation(true, {
      metrics: { joules_per_output_token: 5, power_valid: 1, power_metric_schema_version: 2 },
    }),
  ];
  for (const metric of [
    'joules_per_output_token',
    'prefill_avg_power_w',
    'avg_util_pct',
    'power_valid',
    'power_metric_schema_version',
    'unknown_energy_metric',
  ]) {
    const args = required.map((value) => (value === 'median_ttft' ? metric : value));
    const result = run(rows, args);
    assert.notEqual(result.status, 0, metric);
    assert.match(result.stderr, /PowerX/u);
    assert.deepEqual(result.requests, []);
    assert.equal(result.stdout, '');
  }
});

test('repeated selectors fail before silently changing the comparison scope', () => {
  const result = run(undefined, [...required, '--metric', 'output_tput_per_gpu']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only once/u);
  assert.deepEqual(result.requests, []);
});

test('invalid scopes fail before requests and help works offline', () => {
  const invalid = [
    [],
    required.filter((_arg, index) => index < required.length - 2),
    required.map((arg) => (arg === '2026-09-01' ? '2026-02-30' : arg)),
    required.map((arg) => (arg === '2026-09-01' ? '2026-09-03' : arg)),
    required.map((arg) => (arg === '8192' ? '0' : arg)),
    required.map((arg) => (arg === 'vllm' ? 'unknown' : arg)),
    [...required, '--before-run-url', 'https://example.com/111'],
  ];
  for (const args of invalid) {
    const result = run(undefined, args);
    assert.equal(result.status, 1);
    assert.equal(result.requests.length, 0);
    assert.equal(result.stdout, '');
  }
  const result = run(undefined, ['--help']);
  succeeded(result);
  assert.equal(result.requests.length, 0);
  assert.match(result.stdout, /before-image/);
});
