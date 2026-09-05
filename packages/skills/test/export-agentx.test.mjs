import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { packageInfo, packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();
const { environment, project, temporaryRoot } = suite;
const preload = join(temporaryRoot, 'agentx-http-response.mjs');
let exporter;

function observation(id, overrides = {}) {
  return {
    id,
    hardware: 'b300',
    framework: 'sglang',
    model: 'dsv4',
    precision: 'fp4',
    spec_method: 'mtp',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'agentic_traces',
    isl: null,
    osl: null,
    conc: 1,
    offload_mode: 'off',
    image: 'lmsysorg/sglang:nightly-dev-cu13',
    recipe_fingerprint: 'recipe-agentx',
    metrics: { mean_ttft: 0, output_tput_per_gpu: 14.5 },
    workers: null,
    date: '2026-09-01',
    workflow_run_id: '2390',
    run_started_at: '2026-09-01 17:04:07+00',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/33145139961',
    curve_date: '2026-09-01',
    curve_workflow_run_id: '2390',
    curve_run_started_at: '2026-09-01 17:04:07+00',
    ...overrides,
  };
}

function percentiles(seed = 1) {
  return { mean: seed, p50: seed, p75: seed, p90: seed, p95: seed, p99: seed, n: seed };
}

function aggregate(id, seed = id) {
  return {
    id,
    isl: percentiles(seed),
    osl: percentiles(seed),
    kvCacheUtil: percentiles(seed),
    prefixCacheHitRate: percentiles(seed),
  };
}

function derived(id, value = id) {
  return { id, p75_e2e_norm_intvty: value, p90_e2e_norm_intvty: value };
}

function mapBody(entries) {
  return `{${entries
    .map(([key, value]) => `${JSON.stringify(String(key))}:${JSON.stringify(value)}`)
    .join(',')}}`;
}

const response = (body, status = 200) => ({ body, status });

function run(args, routes, cwd = project()) {
  const fixtureRoot = project('agentx-response-');
  const fixturePath = join(fixtureRoot, 'responses.json');
  const requestPath = join(fixtureRoot, 'requests.txt');
  writeFileSync(fixturePath, JSON.stringify({ routes }));
  const result = suite.node(['--import', pathToFileURL(preload).href, exporter, ...args], {
    cwd,
    env: {
      ...environment,
      INFERENCEX_TEST_RESPONSE: fixturePath,
      INFERENCEX_TEST_REQUESTS: requestPath,
    },
  });
  const requests = existsSync(requestPath)
    ? readFileSync(requestPath, 'utf8').trimEnd().split('\n')
    : [];
  return { ...result, cwd, requests };
}

function routesFor(rows, ids) {
  return {
    '/api/v1/benchmarks': [response(JSON.stringify(rows))],
    '/api/v1/agentic-aggregates': [
      response(mapBody(ids.map((id) => [id, aggregate(id)]).toReversed())),
    ],
    '/api/v1/derived-agentic-metrics': [
      response(mapBody(ids.map((id) => [id, derived(id)]).toReversed())),
    ],
    '/api/v1/trace-availability': [response(mapBody(ids.map((id) => [id, true]).toReversed()))],
  };
}

before(() => {
  writeFileSync(
    preload,
    `
import { appendFileSync, readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(process.env.INFERENCEX_TEST_RESPONSE, 'utf8'));
const calls = {};
globalThis.fetch = async (input, options) => {
  const url = new URL(input.url ?? input);
  appendFileSync(process.env.INFERENCEX_TEST_REQUESTS, url.href + '\\n');
  options.signal.throwIfAborted();
  const index = calls[url.pathname] ?? 0;
  calls[url.pathname] = index + 1;
  const reply = fixture.routes[url.pathname]?.[index];
  if (!reply) return new Response('{"error":"unexpected request"}', { status: 599 });
  return new Response(reply.body, { status: reply.status, headers: { 'Content-Type': 'application/json' } });
};
`,
  );
  const codex = suite.install('codex');
  const claude = suite.install('claude');
  exporter = join(codex, 'scripts/export-agentx.mjs');
  assert.ok(existsSync(exporter), 'the actual npm archive installs the AgentX exporter for Codex');
  assert.ok(
    existsSync(join(claude, 'scripts/export-agentx.mjs')),
    'the actual npm archive installs the AgentX exporter for Claude Code',
  );
  assert.ok(suite.packedFiles.includes('skills/inferencex-api/scripts/export-agentx.mjs'));
});

test('installed JSON exporter chunks and joins enrichments by safe result ID', () => {
  const ids = Array.from({ length: 201 }, (_, index) => index + 1);
  const safeRows = ids.map((id) => observation(String(id)));
  const unsupportedRows = [observation('001'), observation('9007199254740993')];
  const fixedSequence = observation('9999', { benchmark_type: 'single_turn' });
  const rows = [fixedSequence, safeRows[0], ...unsupportedRows, ...safeRows.slice(1), safeRows[0]];
  const aggregateEntries = ids
    .filter((id) => id !== 2)
    .map((id) => {
      const value = aggregate(id, id === 4 ? 0 : id);
      if (id === 3) value.isl = null;
      return [id, value];
    });
  const derivedEntries = ids
    .filter((id) => id !== 5)
    .map((id) => [id, derived(id, id === 4 ? 0 : id)]);
  const traceEntries = ids.filter((id) => id % 2 === 1 || id === 6).map((id) => [id, id !== 6]);
  const routes = {
    '/api/v1/benchmarks': [response(JSON.stringify(rows))],
    '/api/v1/agentic-aggregates': [
      response(mapBody(aggregateEntries.filter(([id]) => id <= 200).toReversed())),
      response(mapBody(aggregateEntries.filter(([id]) => id > 200).toReversed())),
    ],
    '/api/v1/derived-agentic-metrics': [
      response(mapBody(derivedEntries.filter(([id]) => id <= 200).toReversed())),
      response(mapBody(derivedEntries.filter(([id]) => id > 200).toReversed())),
    ],
    '/api/v1/trace-availability': [response(mapBody(traceEntries.toReversed()))],
  };
  const result = run(['--model', 'DeepSeek-V4-Pro', '--date', '2026-09-04'], routes);
  succeeded(result);

  const output = JSON.parse(result.stdout);
  assert.equal(output.schema_version, 1);
  assert.deepEqual(
    output.rows.map((row) => row.benchmark.id),
    rows.filter((row) => row.benchmark_type === 'agentic_traces').map((row) => row.id),
    'complete benchmark objects retain response order and exact IDs',
  );
  assert.deepEqual(output.rows[0].benchmark, safeRows[0]);
  assert.equal(output.rows[0].benchmark.metrics.mean_ttft, 0);
  assert.equal(output.rows.at(-1).benchmark.id, '1');
  assert.deepEqual(output.rows.at(-1).agentx, output.rows[0].agentx);

  assert.deepEqual(output.metadata.requested_scope, {
    display_model: 'DeepSeek-V4-Pro',
    date: '2026-09-04',
    date_selection: 'as-of',
    raw_model: null,
    benchmark_type: 'agentic_traces',
  });
  assert.equal(output.metadata.package_version, packageInfo.version);
  assert.equal(output.metadata.returned_rows, rows.length);
  assert.equal(output.metadata.returned_agentx_rows, rows.length - 1);
  assert.equal(output.metadata.selected_rows, rows.length - 1);
  assert.deepEqual(output.metadata.returned_model_keys, ['dsv4']);
  assert.deepEqual(output.metadata.selected_model_keys, ['dsv4']);
  assert.match(output.metadata.observation_context, /no new benchmark was run/i);
  assert.ok(Number.isFinite(Date.parse(output.metadata.retrieved_at)));
  assert.equal(output.metadata.request_urls.length, 6);
  assert.deepEqual(
    output.metadata.request_urls.map(({ operation }) => operation),
    [
      'benchmarks',
      'agentic-aggregates',
      'agentic-aggregates',
      'derived-agentic-metrics',
      'derived-agentic-metrics',
      'trace-availability',
    ],
  );

  const requests = result.requests.map((request) => new URL(request));
  assert.deepEqual(Object.fromEntries(requests[0].searchParams), {
    model: 'DeepSeek-V4-Pro',
    date: '2026-09-04',
  });
  assert.equal(requests[0].pathname, '/api/v1/benchmarks');
  for (const forbidden of ['exact', 'view', 'sequence', 'powerValid']) {
    assert.equal(requests[0].searchParams.has(forbidden), false);
  }
  const requestedIds = requests
    .slice(1)
    .flatMap((request) => request.searchParams.get('ids').split(',').map(Number));
  assert.equal(requestedIds.includes(9007199254740992), false);
  assert.equal(requestedIds.includes(1), true);
  for (const request of requests.filter((url) => url.pathname.endsWith('agentic-aggregates'))) {
    assert.ok(request.searchParams.get('ids').split(',').length <= 200);
  }
  for (const request of requests.filter((url) =>
    url.pathname.endsWith('derived-agentic-metrics'),
  )) {
    assert.ok(request.searchParams.get('ids').split(',').length <= 200);
  }
  for (const request of requests.filter((url) => url.pathname.endsWith('trace-availability'))) {
    assert.ok(request.searchParams.get('ids').split(',').length <= 500);
  }

  const byId = new Map(output.rows.map((row) => [row.benchmark.id, row]));
  assert.equal(byId.get('2').agentx.aggregates.status, 'not_returned');
  assert.equal(byId.get('2').agentx.aggregates.value, null);
  assert.equal(byId.get('3').agentx.aggregates.status, 'available');
  assert.equal(byId.get('3').agentx.aggregates.value.isl, null);
  assert.equal(byId.get('4').agentx.aggregates.value.isl.mean, 0);
  assert.equal(byId.get('4').agentx.derived_metrics.value.p75_e2e_norm_intvty, 0);
  assert.equal(byId.get('5').agentx.derived_metrics.status, 'not_returned');
  assert.deepEqual(byId.get('2').agentx.trace_availability, {
    status: 'no_stored_trace',
    value: false,
    response_key_present: false,
  });
  assert.deepEqual(byId.get('6').agentx.trace_availability, {
    status: 'no_stored_trace',
    value: false,
    response_key_present: true,
  });
  for (const id of ['001', '9007199254740993']) {
    assert.equal(byId.get(id).benchmark.id, id);
    assert.equal(byId.get(id).agentx.status, 'unsupported_id');
    assert.equal(byId.get(id).agentx.result_id, null);
  }
  assert.equal(output.metadata.enrichment_coverage.safe_id_rows, 202);
  assert.equal(output.metadata.enrichment_coverage.unsupported_id_rows, 2);
  assert.equal(output.metadata.enrichment_coverage.unique_safe_ids, 201);
  assert.deepEqual(output.metadata.enrichment_coverage.aggregates.isl, {
    available_rows: 200,
    null_rows: 1,
    missing_entry_rows: 1,
    unsupported_id_rows: 2,
  });
  assert.deepEqual(output.metadata.enrichment_coverage.derived_metrics, {
    available_rows: 201,
    missing_entry_rows: 1,
    unsupported_id_rows: 2,
  });
  assert.deepEqual(output.metadata.enrichment_coverage.trace_availability, {
    stored_trace_rows: 102,
    no_stored_trace_rows: 100,
    response_key_rows: 103,
    missing_key_rows: 99,
    unsupported_id_rows: 2,
  });
});

test('raw-model selection is exact and latest/as-of request context stays distinct', () => {
  const rows = [
    observation('10', { model: 'dsv4' }),
    observation('11', { model: 'dsv4-next' }),
    observation('12', { benchmark_type: 'single_turn' }),
  ];
  const cwd = project();
  const result = run(
    ['--model', 'DeepSeek-V4-Pro', '--raw-model', 'dsv4', '--output', 'agentx.json'],
    routesFor(rows, [10]),
    cwd,
  );
  succeeded(result);
  assert.equal(result.stdout, '');
  const output = JSON.parse(readFileSync(join(cwd, 'agentx.json'), 'utf8'));
  assert.deepEqual(
    output.rows.map((row) => row.benchmark.id),
    ['10'],
  );
  assert.equal(output.metadata.requested_scope.date, null);
  assert.equal(output.metadata.requested_scope.date_selection, 'latest');
  assert.equal(output.metadata.requested_scope.raw_model, 'dsv4');
  assert.equal(output.metadata.returned_rows, 3);
  assert.equal(output.metadata.returned_agentx_rows, 2);
  assert.equal(output.metadata.selected_rows, 1);
  assert.deepEqual(output.metadata.returned_model_keys, ['dsv4', 'dsv4-next']);
  assert.deepEqual(output.metadata.selected_model_keys, ['dsv4']);
  assert.deepEqual(Object.fromEntries(new URL(result.requests[0]).searchParams), {
    model: 'DeepSeek-V4-Pro',
  });
});

test('response order cannot move enrichment values between result IDs', () => {
  const ids = [5_000_000_001, 5_000_000_002];
  const result = run(
    ['--model', 'DeepSeek-V4-Pro'],
    routesFor(
      ids.map((id) => observation(String(id))),
      ids,
    ),
  );
  succeeded(result);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(
    output.rows.map((row) => [
      row.benchmark.id,
      row.agentx.aggregates.value.id,
      row.agentx.derived_metrics.value.id,
    ]),
    ids.map((id) => [String(id), id, id]),
  );
});

test('empty AgentX selections succeed without enrichment requests', () => {
  for (const [rows, args, outcome] of [
    [[observation('1', { benchmark_type: 'single_turn' })], [], 'no_agentx_rows'],
    [[observation('1')], ['--raw-model', 'different'], 'no_matching_rows'],
  ]) {
    const result = run(['--model', 'DeepSeek-V4-Pro', ...args], {
      '/api/v1/benchmarks': [response(JSON.stringify(rows))],
    });
    succeeded(result);
    const output = JSON.parse(result.stdout);
    assert.equal(output.metadata.outcome, outcome);
    assert.equal(output.metadata.returned_rows, 1);
    assert.equal(output.metadata.selected_rows, 0);
    assert.deepEqual(output.rows, []);
    assert.equal(result.requests.length, 1);
  }
});

test('invalid arguments fail before HTTP or output writes; help is offline', () => {
  const invalid = [
    [],
    ['--model', ''],
    ['--model', 'DeepSeek-V4-Pro', '--date', '2026-02-30'],
    ['--model', 'DeepSeek-V4-Pro', '--date', '2026-9-4'],
    ['--model', 'DeepSeek-V4-Pro', '--raw-model', ''],
    ['--model', 'DeepSeek-V4-Pro', '--output', ''],
    ['--model', 'DeepSeek-V4-Pro', '--unexpected'],
    ['--model', 'DeepSeek-V4-Pro', 'extra'],
  ];
  for (const args of invalid) {
    const cwd = project();
    const result = run(
      args.includes('--output') ? args : [...args, '--output', 'should-not-exist.json'],
      {},
      cwd,
    );
    assert.notEqual(result.status, 0, args.join(' '));
    assert.equal(result.stdout, '');
    assert.equal(result.requests.length, 0);
    assert.deepEqual(readdirSync(cwd), []);
  }
  const help = run(['--help'], {});
  succeeded(help);
  assert.match(help.stdout, /--model/);
  assert.match(help.stdout, /does not run a benchmark/);
  assert.equal(help.requests.length, 0);
});

test('every HTTP endpoint failure preserves an existing output', () => {
  const row = observation('1');
  const ok = routesFor([row], [1]);
  for (const failingPath of Object.keys(ok)) {
    const routes = structuredClone(ok);
    routes[failingPath][0] = response('{"error":"controlled failure"}', 503);
    const cwd = project();
    writeFileSync(join(cwd, 'agentx.json'), 'keep existing output');
    const result = run(['--model', 'DeepSeek-V4-Pro', '--output', 'agentx.json'], routes, cwd);
    assert.equal(result.status, 1, failingPath);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /HTTP 503.*controlled failure/);
    assert.equal(readFileSync(join(cwd, 'agentx.json'), 'utf8'), 'keep existing output');
  }
});

test('malformed required shapes and unrelated enrichment IDs fail closed', () => {
  const row = observation('1');
  const failures = [
    { '/api/v1/benchmarks': [response('{}')] },
    { '/api/v1/benchmarks': [response('{')] },
    {
      ...routesFor([row], [1]),
      '/api/v1/agentic-aggregates': [response('[]')],
    },
    {
      ...routesFor([row], [1]),
      '/api/v1/derived-agentic-metrics': [response(mapBody([[1, { id: 1 }]]))],
    },
    {
      ...routesFor([row], [1]),
      '/api/v1/trace-availability': [response(mapBody([[2, true]]))],
    },
  ];
  for (const routes of failures) {
    const result = run(['--model', 'DeepSeek-V4-Pro'], routes);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Unexpected|JSON/);
  }
});
