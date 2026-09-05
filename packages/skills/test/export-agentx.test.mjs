import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';

import { packageInfo, packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();
const { environment, project, temporaryRoot } = suite;
const preload = join(temporaryRoot, 'agentx-http-response.mjs');
const redirectPreload = join(temporaryRoot, 'agentx-native-fetch-redirect.mjs');
const execFileAsync = promisify(execFile);
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

const mapBody = (entries) => JSON.stringify(Object.fromEntries(entries));

const response = (body, status = 200, faults = {}) => ({ body, status, ...faults });

function run(args, routes, cwdOrOptions = project()) {
  const options = typeof cwdOrOptions === 'string' ? { cwd: cwdOrOptions } : cwdOrOptions;
  const { cwd = project(), maxBuffer = 16 * 1024 * 1024, ...faults } = options;
  const fixtureRoot = project('agentx-response-');
  const fixturePath = join(fixtureRoot, 'responses.json');
  const requestPath = join(fixtureRoot, 'requests.txt');
  writeFileSync(fixturePath, JSON.stringify({ routes, ...faults }));
  const result = suite.node(['--import', pathToFileURL(preload).href, exporter, ...args], {
    cwd,
    maxBuffer,
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

async function runNative(args, origin, cwd = project()) {
  const result = await execFileAsync(
    process.execPath,
    ['--import', pathToFileURL(redirectPreload).href, exporter, ...args],
    {
      cwd,
      env: { ...environment, INFERENCEX_TEST_ORIGIN: origin },
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 10_000,
    },
  );
  return { ...result, status: 0, cwd };
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

function metadataFrom(result) {
  return JSON.parse(result.stderr.split('\n', 1)[0]).metadata;
}

function csvRecords(text) {
  const records = [];
  let record = [];
  const matches = [...text.matchAll(/(?<cell>"(?:[^"]|"")*"|[^,"\r\n]*)(?<delimiter>,|\r\n)/gu)];
  assert.equal(matches.map(([whole]) => whole).join(''), text, 'parse every CSV byte');
  for (const [, raw, delimiter] of matches) {
    record.push(raw.startsWith('"') ? raw.slice(1, -1).replaceAll('""', '"') : raw);
    if (delimiter === '\r\n') {
      records.push(record);
      record = [];
    }
  }
  const [header, ...lines] = records;
  return {
    header,
    rows: lines.map((line) => Object.fromEntries(header.map((key, index) => [key, line[index]]))),
  };
}

function captured(result, directory = 'evidence') {
  const root = join(result.cwd, directory);
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const bodies = new Map(
    manifest.responses
      .filter((record) => record.body_file !== null)
      .map((record) => [record.request_number, readFileSync(join(root, record.body_file))]),
  );
  return { root, manifest, bodies };
}

function chunks(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

before(() => {
  writeFileSync(
    preload,
    `
import fs, { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
const fixture = JSON.parse(readFileSync(process.env.INFERENCEX_TEST_RESPONSE, 'utf8'));
const calls = {};
const originalWriteFile = fs.promises.writeFile;
let completeManifestFailure = fixture.failCompleteManifest;
fs.promises.writeFile = async (path, data, ...rest) => {
  const text = String(data);
  if (String(path).endsWith('manifest.tmp')) {
    if (completeManifestFailure && text.includes('"status": "complete"')) {
      completeManifestFailure = false;
      throw new Error('controlled complete manifest failure');
    }
    if (fixture.failFailureManifest && text.includes('"status": "failed"')) {
      throw new Error('controlled failure-manifest failure');
    }
  }
  return originalWriteFile(path, data, ...rest);
};
syncBuiltinESMExports();
if (fixture.stdoutFailure) process.stdout.write = (_output, callback) => {
  queueMicrotask(() => callback(Object.assign(new Error('broken pipe'), { code: 'EPIPE' })));
  return false;
};
globalThis.fetch = async (input, options) => {
  const url = new URL(input.url ?? input);
  appendFileSync(process.env.INFERENCEX_TEST_REQUESTS, url.href + '\\n');
  options.signal.throwIfAborted();
  const index = calls[url.pathname] ?? 0;
  calls[url.pathname] = index + 1;
  const reply = fixture.routes[url.pathname]?.[index];
  if (!reply) return new Response('{"error":"unexpected request"}', { status: 599 });
  if (reply.timeout) throw new DOMException('Timed out', 'TimeoutError');
  if (reply.blockEvidenceFile) mkdirSync(join(fixture.evidenceDir, reply.blockEvidenceFile));
  const headers = { 'Content-Type': 'application/json' };
  if (reply.gzip) headers['Content-Encoding'] = 'gzip';
  if (reply.bodyFailure) {
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"partial":'));
        controller.error(new Error('body interrupted'));
      },
    }), { status: reply.status, headers });
  }
  return new Response(reply.body, { status: reply.status, headers });
};
`,
  );
  writeFileSync(
    redirectPreload,
    `
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const requested = new URL(input.url ?? input);
  const redirected = new URL(requested.pathname + requested.search, process.env.INFERENCEX_TEST_ORIGIN);
  return nativeFetch(redirected, options);
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
  const result = run(
    ['--model', 'DeepSeek-V4-Pro', '--date', '2026-09-04', '--format', 'json'],
    routes,
  );
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
    hardware: null,
    framework: null,
    precision: null,
    spec_method: null,
    offload_mode: null,
    concurrency: null,
    benchmark_type: 'agentic_traces',
  });
  assert.deepEqual(output.metadata.filters, {
    raw_model: { status: 'omitted', value: null },
    hardware: { status: 'omitted', value: null },
    framework: { status: 'omitted', value: null },
    precision: { status: 'omitted', value: null },
    spec_method: { status: 'omitted', value: null },
    offload_mode: { status: 'omitted', value: null },
    concurrency: { status: 'omitted', value: null },
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
    [
      '--model',
      'DeepSeek-V4-Pro',
      '--raw-model',
      'dsv4',
      '--format',
      'json',
      '--output',
      'agentx.json',
    ],
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
  assert.deepEqual(output.metadata.filters.raw_model, { status: 'applied', value: 'dsv4' });
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
    ['--model', 'DeepSeek-V4-Pro', '--format', 'json'],
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

test('empty AgentX selections explain only the complete response and local filters', () => {
  for (const [rows, args, outcome] of [
    [[observation('1', { benchmark_type: 'single_turn' })], [], 'no_agentx_rows'],
    [[observation('1')], ['--raw-model', 'different'], 'no_matching_rows'],
  ]) {
    const result = run(['--model', 'DeepSeek-V4-Pro', '--format', 'json', ...args], {
      '/api/v1/benchmarks': [response(JSON.stringify(rows))],
    });
    succeeded(result);
    const output = JSON.parse(result.stdout);
    assert.equal(output.metadata.outcome, outcome);
    assert.equal(output.metadata.returned_rows, 1);
    assert.equal(output.metadata.returned_agentx_rows, outcome === 'no_agentx_rows' ? 0 : 1);
    assert.equal(output.metadata.selected_rows, 0);
    assert.deepEqual(output.rows, []);
    assert.equal(result.requests.length, 1);
    assert.deepEqual(
      output.metadata.available_filter_values.hardware,
      outcome === 'no_agentx_rows' ? [] : ['b300'],
    );
    assert.equal(output.metadata.filters.raw_model.status, args.length > 0 ? 'applied' : 'omitted');
    assert.doesNotMatch(result.stderr, /failed run|source artifact|benchmark job/iu);
  }
});

test('all serving filters are independent, exact, case-sensitive, and composable', () => {
  const cases = [
    ['--raw-model', 'dsv4', { model: 'dsv4-next' }, 'raw_model'],
    ['--hardware', 'b300', { hardware: 'b200' }, 'hardware'],
    ['--framework', 'sglang', { framework: 'vllm' }, 'framework'],
    ['--precision', 'fp4', { precision: 'fp8' }, 'precision'],
    ['--spec-method', 'mtp', { spec_method: 'none' }, 'spec_method'],
    ['--offload-mode', 'off', { offload_mode: 'on' }, 'offload_mode'],
    ['--concurrency', '1', { conc: 2 }, 'concurrency'],
  ];
  for (const [option, value, differingField, metadataKey] of cases) {
    const result = run(
      ['--model', 'DeepSeek-V4-Pro', '--format', 'json', option, value],
      routesFor([observation('1'), observation('2', differingField)], [1]),
    );
    succeeded(result);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(
      output.rows.map((row) => row.benchmark.id),
      ['1'],
      option,
    );
    assert.equal(output.metadata.filters[metadataKey].status, 'applied');
    assert.equal(String(output.metadata.filters[metadataKey].value), value);
  }

  const combined = [
    '--model',
    'DeepSeek-V4-Pro',
    '--raw-model',
    'dsv4',
    '--hardware',
    'b300',
    '--framework',
    'sglang',
    '--precision',
    'fp4',
    '--spec-method',
    'mtp',
    '--offload-mode',
    'off',
    '--concurrency',
    '1',
    '--format',
    'json',
  ];
  const result = run(combined, routesFor([observation('1'), observation('2', { conc: 2 })], [1]));
  succeeded(result);
  assert.deepEqual(
    JSON.parse(result.stdout).rows.map((row) => row.benchmark.id),
    ['1'],
  );

  const wrongCase = run(['--model', 'DeepSeek-V4-Pro', '--hardware', 'B300'], {
    '/api/v1/benchmarks': [response(JSON.stringify([observation('1')]))],
  });
  succeeded(wrongCase);
  assert.equal(wrongCase.stdout.trimEnd().split('\r\n').length, 1);
  assert.equal(metadataFrom(wrongCase).outcome, 'no_matching_rows');
  assert.equal(wrongCase.requests.length, 1);
});

test('default CSV has deterministic context, dynamic scalar metrics, and fixed enrichments', () => {
  const rows = [
    observation('2', {
      metrics: {
        z_metric: null,
        alpha_metric: 2,
        'comma,key': 3,
        'quote"key': 4,
        'line\nkey': 5,
        nested_metric: { value: 3 },
      },
    }),
    observation('1', {
      metrics: {
        z_metric: 0,
        beta_metric: false,
        alpha_metric: null,
        array_metric: [1, 2],
      },
    }),
  ];
  const routes = {
    '/api/v1/benchmarks': [response(JSON.stringify(rows))],
    '/api/v1/agentic-aggregates': [
      response(
        mapBody([
          [2, aggregate(2)],
          [1, aggregate(1, 0)],
        ]),
      ),
    ],
    '/api/v1/derived-agentic-metrics': [
      response(
        mapBody([
          [2, derived(2)],
          [1, derived(1, 0)],
        ]),
      ),
    ],
    '/api/v1/trace-availability': [
      response(
        mapBody([
          [2, true],
          [1, false],
        ]),
      ),
    ],
  };
  const result = run(
    [
      '--model',
      'DeepSeek-V4-Pro',
      '--hardware',
      'b300',
      '--framework',
      'sglang',
      '--precision',
      'fp4',
      '--spec-method',
      'mtp',
      '--offload-mode',
      'off',
      '--concurrency',
      '1',
    ],
    routes,
  );
  succeeded(result);

  const csv = csvRecords(result.stdout);
  assert.deepEqual(
    csv.header.filter((column) => column.startsWith('metrics.')),
    [
      'metrics.alpha_metric',
      'metrics.beta_metric',
      'metrics.comma,key',
      'metrics.line\nkey',
      'metrics.quote"key',
      'metrics.z_metric',
    ],
  );
  assert.equal(csv.header.includes('metrics.array_metric'), false);
  assert.equal(csv.header.includes('metrics.nested_metric'), false);
  assert.ok(csv.header.indexOf('metrics.alpha_metric') < csv.header.indexOf('aggregate.isl.mean'));
  for (const fixed of [
    'package_version',
    'query_url',
    'filter.hardware',
    'id',
    'recipe_fingerprint',
    'num_decode_gpu',
    'date',
    'workflow_run_id',
    'curve_date',
    'aggregate.prefixCacheHitRate.p99',
    'derived.p90_e2e_norm_intvty',
    'trace.available',
    'enrichment.status',
  ]) {
    assert.ok(csv.header.includes(fixed), fixed);
  }
  assert.deepEqual(
    csv.rows.map((row) => row.id),
    ['2', '1'],
  );
  for (const row of csv.rows) {
    assert.equal(row.package_version, packageInfo.version);
    assert.match(row.query_url, /\/api\/v1\/benchmarks\?model=DeepSeek-V4-Pro/u);
    assert.equal(row.requested_model, 'DeepSeek-V4-Pro');
    assert.equal(row['filter.hardware'], 'b300');
    assert.equal(row['filter.raw_model'], '');
  }
  assert.equal(csv.rows[0]['metrics.z_metric'], '');
  assert.equal(csv.rows[0]['metrics.comma,key'], '3');
  assert.equal(csv.rows[0]['metrics.quote"key'], '4');
  assert.equal(csv.rows[0]['metrics.line\nkey'], '5');
  assert.equal(csv.rows[0]['metrics.beta_metric'], '');
  assert.equal(csv.rows[1]['metrics.z_metric'], '0');
  assert.equal(csv.rows[1]['metrics.beta_metric'], 'false');
  assert.equal(csv.rows[1]['aggregate.isl.mean'], '0');
  assert.equal(csv.rows[1]['derived.p75_e2e_norm_intvty'], '0');
  assert.equal(csv.rows[1]['trace.available'], 'false');
  assert.equal(metadataFrom(result).outcome, 'selected_rows');

  const reordered = run(['--model', 'DeepSeek-V4-Pro'], {
    ...routes,
    '/api/v1/benchmarks': [response(JSON.stringify(rows.toReversed()))],
  });
  succeeded(reordered);
  assert.deepEqual(csvRecords(reordered.stdout).header, csv.header);
});

test('invalid arguments fail before HTTP or output writes; help is offline', () => {
  const invalid = [
    [],
    ['--model', ''],
    ['--model', 'DeepSeek-V4-Pro', '--date', '2026-02-30'],
    ['--model', 'DeepSeek-V4-Pro', '--date', '2026-9-4'],
    ['--model', 'DeepSeek-V4-Pro', '--raw-model', ''],
    ['--model', 'DeepSeek-V4-Pro', '--hardware', ''],
    ['--model', 'DeepSeek-V4-Pro', '--framework', ''],
    ['--model', 'DeepSeek-V4-Pro', '--precision', ''],
    ['--model', 'DeepSeek-V4-Pro', '--spec-method', ''],
    ['--model', 'DeepSeek-V4-Pro', '--offload-mode', ''],
    ['--model', 'DeepSeek-V4-Pro', '--concurrency', ''],
    ['--model', 'DeepSeek-V4-Pro', '--concurrency', '0'],
    ['--model', 'DeepSeek-V4-Pro', '--concurrency', '-1'],
    ['--model', 'DeepSeek-V4-Pro', '--concurrency', '1.5'],
    ['--model', 'DeepSeek-V4-Pro', '--concurrency', '9007199254740992'],
    ['--model', 'DeepSeek-V4-Pro', '--format', 'yaml'],
    ['--model', 'DeepSeek-V4-Pro', '--output', ''],
    ['--model', 'DeepSeek-V4-Pro', '--evidence-dir', ''],
    ['--model', 'DeepSeek-V4-Pro', '--unexpected'],
    ['--model', 'DeepSeek-V4-Pro', 'extra'],
  ];
  for (const args of invalid) {
    const cwd = project();
    const runArgs = args.includes('--output')
      ? [...args]
      : [...args, '--output', 'should-not-exist.json'];
    if (!args.includes('--evidence-dir')) {
      runArgs.push('--evidence-dir', 'should-not-exist-evidence');
    }
    const result = run(runArgs, {}, cwd);
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
      '/api/v1/benchmarks': [response(JSON.stringify([observation(Number.MAX_SAFE_INTEGER + 1)]))],
    },
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

test('evidence captures every decoded response chunk once and hashes stdout bytes', () => {
  const ids = Array.from({ length: 501 }, (_, index) => index + 1);
  const rows = ids.map((id) => observation(String(id)));
  const benchmarkBody = `\uFEFF${JSON.stringify(rows, null, 2)} \n`;
  const aggregateBodies = chunks(ids, 200).map(
    (chunk) => ` ${mapBody(chunk.map((id) => [id, aggregate(id)]))}\n`,
  );
  const derivedBodies = chunks(ids, 200).map(
    (chunk) => `${mapBody(chunk.map((id) => [id, derived(id)]))} \n`,
  );
  const traceBodies = chunks(ids, 500).map(
    (chunk) => `${mapBody(chunk.map((id) => [id, true]))}\n`,
  );
  const routes = {
    '/api/v1/benchmarks': [response(benchmarkBody, 200, { gzip: true })],
    '/api/v1/agentic-aggregates': aggregateBodies.map((body) =>
      response(body, 200, { gzip: true }),
    ),
    '/api/v1/derived-agentic-metrics': derivedBodies.map((body) =>
      response(body, 200, { gzip: true }),
    ),
    '/api/v1/trace-availability': traceBodies.map((body) => response(body, 200, { gzip: true })),
  };
  const result = run(
    [
      '--model',
      'DeepSeek-V4-Pro',
      '--date',
      '2026-09-04',
      '--format',
      'json',
      '--evidence-dir',
      'evidence',
    ],
    routes,
  );
  succeeded(result);

  const { root, manifest, bodies } = captured(result);
  const expectedBodies = [benchmarkBody, ...aggregateBodies, ...derivedBodies, ...traceBodies];
  const expectedChunks = [null, ...chunks(ids, 200), ...chunks(ids, 200), ...chunks(ids, 500)];
  assert.equal(result.requests.length, 9);
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.package_version, packageInfo.version);
  assert.equal(manifest.status, 'complete');
  assert.equal(manifest.error, null);
  assert.equal(manifest.outcome, 'selected_rows');
  assert.ok(Number.isFinite(Date.parse(manifest.started_at)));
  assert.ok(Number.isFinite(Date.parse(manifest.finished_at)));
  assert.deepEqual(manifest.counts, {
    returned_rows: 501,
    returned_agentx_rows: 501,
    selected_rows: 501,
  });
  assert.equal(manifest.requested_filters.display_model, 'DeepSeek-V4-Pro');
  assert.deepEqual(manifest.applied_filters.hardware, { status: 'omitted', value: null });
  assert.deepEqual(
    manifest.responses.map((record) => record.operation),
    [
      'benchmarks',
      'agentic-aggregates',
      'agentic-aggregates',
      'agentic-aggregates',
      'derived-agentic-metrics',
      'derived-agentic-metrics',
      'derived-agentic-metrics',
      'trace-availability',
      'trace-availability',
    ],
  );
  for (const [index, record] of manifest.responses.entries()) {
    const requestNumber = index + 1;
    const saved = bodies.get(requestNumber);
    assert.equal(record.request_number, requestNumber);
    assert.equal(record.url, result.requests[index]);
    assert.equal(record.method, 'GET');
    assert.equal(record.http_status, 200);
    assert.ok(Number.isFinite(Date.parse(record.retrieved_at)));
    assert.deepEqual(record.requested_chunk_ids, expectedChunks[index]);
    assert.equal(
      record.body_file,
      `response-${String(requestNumber).padStart(4, '0')}-${record.operation}.json`,
    );
    assert.deepEqual(saved, Buffer.from(expectedBodies[index]));
    assert.equal(record.decoded_body_sha256, createHash('sha256').update(saved).digest('hex'));
    assert.equal(record.checksum_covers, 'saved decoded response body');
  }
  assert.deepEqual(manifest.export.source_request_numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(manifest.export.destination, 'stdout');
  assert.equal(manifest.export.format, 'json');
  assert.equal(
    manifest.export.sha256,
    createHash('sha256').update(Buffer.from(result.stdout)).digest('hex'),
  );
  assert.deepEqual(manifest.export.metadata, JSON.parse(result.stdout).metadata);
  assert.deepEqual(
    readdirSync(root).sort(),
    ['manifest.json', ...manifest.responses.map((record) => record.body_file)].sort(),
  );
});

test('native fetch evidence hashes decoded gzip response bytes', async () => {
  const decoded = Buffer.from(`\uFEFF${JSON.stringify([], null, 2)} \n`);
  const compressed = gzipSync(decoded);
  const requests = [];
  const server = createServer((request, serverResponse) => {
    requests.push(request.url);
    serverResponse.writeHead(200, {
      'Content-Encoding': 'gzip',
      'Content-Length': compressed.length,
      'Content-Type': 'application/json',
    });
    serverResponse.end(compressed);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const result = await runNative(
      ['--model', 'DeepSeek-V4-Pro', '--format', 'json', '--evidence-dir', 'evidence'],
      `http://127.0.0.1:${server.address().port}`,
    );
    succeeded(result);

    const { manifest, bodies } = captured(result);
    const saved = bodies.get(1);
    assert.deepEqual(requests, ['/api/v1/benchmarks?model=DeepSeek-V4-Pro']);
    assert.equal(manifest.status, 'complete');
    assert.equal(manifest.responses.length, 1);
    assert.deepEqual(saved, decoded);
    assert.equal(
      manifest.responses[0].decoded_body_sha256,
      createHash('sha256').update(decoded).digest('hex'),
    );
    assert.notEqual(
      manifest.responses[0].decoded_body_sha256,
      createHash('sha256').update(compressed).digest('hex'),
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('empty evidence exports are complete, distinct, and benchmark-only', () => {
  for (const [rows, extraArgs, outcome, destination] of [
    [[observation('1', { benchmark_type: 'single_turn' })], [], 'no_agentx_rows', null],
    [[observation('1')], ['--hardware', 'b200'], 'no_matching_rows', 'empty.csv'],
  ]) {
    const args = ['--model', 'DeepSeek-V4-Pro', '--evidence-dir', 'evidence', ...extraArgs];
    if (destination) args.push('--output', destination);
    const body = `${JSON.stringify(rows, null, 2)}\n`;
    const result = run(args, {
      '/api/v1/benchmarks': [response(body, 200, { gzip: true })],
    });
    succeeded(result);
    const { manifest, bodies } = captured(result);
    const output = destination
      ? readFileSync(join(result.cwd, destination))
      : Buffer.from(result.stdout);
    assert.equal(result.requests.length, 1);
    assert.equal(manifest.status, 'complete');
    assert.equal(manifest.outcome, outcome);
    assert.equal(manifest.responses.length, 1);
    assert.deepEqual(bodies.get(1), Buffer.from(body));
    assert.deepEqual(manifest.export.source_request_numbers, [1]);
    assert.equal(manifest.export.sha256, createHash('sha256').update(output).digest('hex'));
    assert.equal(manifest.export.metadata.outcome, outcome);
    assert.equal(manifest.counts.selected_rows, 0);
    assert.equal(manifest.counts.returned_agentx_rows, outcome === 'no_agentx_rows' ? 0 : 1);
  }
});

test('HTTP failures for every operation are captured and never replace an output', () => {
  const operationForPath = {
    '/api/v1/benchmarks': 'benchmarks',
    '/api/v1/agentic-aggregates': 'agentic-aggregates',
    '/api/v1/derived-agentic-metrics': 'derived-agentic-metrics',
    '/api/v1/trace-availability': 'trace-availability',
  };
  for (const [path, operation] of Object.entries(operationForPath)) {
    const routes = routesFor([observation('1')], [1]);
    const failureBody = `{"error":"controlled ${operation} failure"}\n`;
    routes[path][0] = response(failureBody, 503, { gzip: true });
    const cwd = project();
    writeFileSync(join(cwd, 'agentx.json'), 'keep existing output');
    const result = run(
      [
        '--model',
        'DeepSeek-V4-Pro',
        '--format',
        'json',
        '--output',
        'agentx.json',
        '--evidence-dir',
        'evidence',
      ],
      routes,
      { cwd },
    );
    assert.equal(result.status, 1, operation);
    assert.match(result.stderr, /HTTP 503.*controlled/u, operation);
    assert.equal(readFileSync(join(cwd, 'agentx.json'), 'utf8'), 'keep existing output');
    const { manifest, bodies } = captured(result);
    const failed = manifest.responses.at(-1);
    assert.equal(manifest.status, 'failed');
    assert.equal(manifest.outcome, 'failed');
    assert.equal(manifest.export.sha256, null);
    assert.deepEqual(manifest.export.source_request_numbers, []);
    assert.equal(failed.operation, operation);
    assert.equal(failed.http_status, 503);
    assert.deepEqual(bodies.get(failed.request_number), Buffer.from(failureBody));
    assert.equal(
      failed.decoded_body_sha256,
      createHash('sha256').update(Buffer.from(failureBody)).digest('hex'),
    );
  }
});

test('transport, JSON, shape, and enrichment-ID failures leave auditable failed evidence', () => {
  const row = observation('1');
  const cases = [
    {
      routes: { '/api/v1/benchmarks': [response('', 200, { timeout: true })] },
      error: /Timed out/u,
      status: null,
      body: null,
    },
    {
      routes: { '/api/v1/benchmarks': [response('', 200, { bodyFailure: true, gzip: true })] },
      error: /body interrupted/u,
      status: 200,
      body: null,
    },
    {
      routes: { '/api/v1/benchmarks': [response('{')] },
      error: /JSON/u,
      status: 200,
      body: '{',
    },
    {
      routes: { '/api/v1/benchmarks': [response('{}')] },
      error: /response shape/iu,
      status: 200,
      body: '{}',
    },
    {
      routes: {
        ...routesFor([row], [1]),
        '/api/v1/agentic-aggregates': [response(mapBody([[2, aggregate(2)]]))],
      },
      error: /result ID/u,
      status: 200,
      body: mapBody([[2, aggregate(2)]]),
    },
  ];
  for (const entry of cases) {
    const cwd = project();
    writeFileSync(join(cwd, 'agentx.json'), 'keep existing output');
    const result = run(
      ['--model', 'DeepSeek-V4-Pro', '--output', 'agentx.json', '--evidence-dir', 'evidence'],
      entry.routes,
      { cwd },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, entry.error);
    assert.equal(readFileSync(join(cwd, 'agentx.json'), 'utf8'), 'keep existing output');
    const { manifest, bodies } = captured(result);
    const failed = manifest.responses.at(-1);
    assert.equal(manifest.status, 'failed');
    assert.match(manifest.error, entry.error);
    assert.equal(failed.http_status, entry.status);
    if (entry.body === null) {
      assert.equal(failed.body_file, null);
      assert.equal(failed.decoded_body_sha256, null);
      assert.equal(bodies.has(failed.request_number), false);
    } else {
      assert.deepEqual(bodies.get(failed.request_number), Buffer.from(entry.body));
    }
  }
});

test('fresh evidence preflight rejects reuse, aliases, and two-way containment before HTTP', () => {
  const cwd = project();
  mkdirSync(join(cwd, 'existing'));
  writeFileSync(join(cwd, 'existing/keep'), 'untouched');
  mkdirSync(join(cwd, 'empty'));
  symlinkSync(join(cwd, 'existing'), join(cwd, 'directory-link'));
  symlinkSync(join(cwd, 'evidence/manifest.json'), join(cwd, 'output-link'));
  const failures = [
    ['--evidence-dir', 'existing'],
    ['--evidence-dir', 'empty'],
    ['--evidence-dir', 'directory-link'],
    ['--evidence-dir', 'evidence', '--output', 'evidence'],
    ['--evidence-dir', 'evidence', '--output', 'evidence/export.csv'],
    ['--evidence-dir', 'evidence', '--output', 'evidence/manifest.json'],
    ['--evidence-dir', 'evidence', '--output', 'EVIDENCE/EXPORT.CSV'],
    ['--evidence-dir', 'parent/child', '--output', 'parent'],
    ['--evidence-dir', 'evidence', '--output', 'output-link'],
  ];
  for (const args of failures) {
    const result = run(
      ['--model', 'DeepSeek-V4-Pro', ...args],
      routesFor([observation('1')], [1]),
      { cwd },
    );
    assert.equal(result.status, 1, args.join(' '));
    assert.equal(result.requests.length, 0, args.join(' '));
    assert.equal(result.stdout, '');
    assert.equal(existsSync(join(cwd, 'evidence')), false);
    assert.equal(existsSync(join(cwd, 'parent')), false);
  }
  assert.equal(readFileSync(join(cwd, 'existing/keep'), 'utf8'), 'untouched');
  assert.deepEqual(readdirSync(join(cwd, 'empty')), []);
});

test('evidence, output, and stdout write failures never become complete', () => {
  {
    const cwd = project();
    const evidenceDir = join(cwd, 'evidence');
    const result = run(
      ['--model', 'DeepSeek-V4-Pro', '--evidence-dir', 'evidence'],
      {
        '/api/v1/benchmarks': [
          response(JSON.stringify([observation('1')]), 200, {
            blockEvidenceFile: 'response-0001-benchmarks.json',
          }),
        ],
      },
      { cwd, evidenceDir },
    );
    assert.equal(result.status, 1);
    const { manifest } = captured(result);
    assert.equal(manifest.status, 'failed');
    assert.equal(manifest.responses[0].body_file, null);
  }

  {
    const cwd = project();
    const evidenceDir = join(cwd, 'evidence');
    const result = run(
      ['--model', 'DeepSeek-V4-Pro', '--evidence-dir', 'evidence'],
      {
        '/api/v1/benchmarks': [
          response(JSON.stringify([observation('1')]), 200, {
            blockEvidenceFile: 'manifest.tmp',
          }),
        ],
      },
      { cwd, evidenceDir },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /could not save failure evidence/u);
    assert.equal(captured(result).manifest.status, 'pending');
  }

  {
    const cwd = project();
    mkdirSync(join(cwd, 'output'));
    writeFileSync(join(cwd, 'output/keep'), 'untouched');
    const result = run(
      ['--model', 'DeepSeek-V4-Pro', '--output', 'output', '--evidence-dir', 'evidence'],
      routesFor([observation('1')], [1]),
      { cwd },
    );
    assert.equal(result.status, 1);
    assert.equal(readFileSync(join(cwd, 'output/keep'), 'utf8'), 'untouched');
    assert.equal(captured(result).manifest.status, 'failed');
  }

  {
    const cwd = project();
    const result = run(
      ['--model', 'DeepSeek-V4-Pro', '--evidence-dir', 'evidence'],
      routesFor([observation('1')], [1]),
      { cwd, stdoutFailure: true },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /broken pipe/u);
    assert.equal(captured(result).manifest.status, 'failed');
  }

  {
    const cwd = project();
    writeFileSync(join(cwd, 'agentx.json'), 'keep existing output');
    const result = run(
      [
        '--model',
        'DeepSeek-V4-Pro',
        '--format',
        'json',
        '--output',
        'agentx.json',
        '--evidence-dir',
        'evidence',
      ],
      routesFor([observation('1')], [1]),
      { cwd, failCompleteManifest: true },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /controlled complete manifest failure/u);
    assert.equal(readFileSync(join(cwd, 'agentx.json'), 'utf8'), 'keep existing output');
    assert.equal(captured(result).manifest.status, 'failed');
    assert.deepEqual(
      readdirSync(cwd).filter((file) => file.includes('.backup') || file.includes('.tmp')),
      [],
    );
  }

  {
    const result = run(
      ['--model', 'DeepSeek-V4-Pro', '--evidence-dir', 'evidence'],
      routesFor([observation('1')], [1]),
      { stdoutFailure: true, failFailureManifest: true },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /broken pipe.*could not save failure evidence/isu);
    assert.equal(captured(result).manifest.status, 'pending');
  }
});
