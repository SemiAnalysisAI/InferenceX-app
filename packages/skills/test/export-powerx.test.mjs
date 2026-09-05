import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

const packageRoot = resolve(import.meta.dirname, '..');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'inferencex-powerx-test-'));
const preload = join(temporaryRoot, 'http-response.mjs');
const environment = {
  ...process.env,
  PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`,
  npm_config_cache: join(temporaryRoot, 'npm-cache'),
  npm_config_update_notifier: 'false',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
};
const requiredArgs = ['--model', 'GLM-5', '--isl', '8192', '--osl', '1024'];
const version = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;
let exporter;

function observation(overrides = {}) {
  return {
    id: '900719925474099312345',
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
    image: 'vllm/vllm-openai:v0.10.2',
    recipe_fingerprint: 'recipe-1',
    metrics: {
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: 678.5,
      joules_per_successful_query: 5427.2,
      joules_per_input_token: 0.5,
      joules_per_output_token: 5.3,
      joules_per_total_token: 2.65,
      prefill_joules_per_input_token: 0.2,
      decode_joules_per_output_token: 4.1,
    },
    date: '2026-09-01',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/900719925474099312345',
    curve_date: '2026-09-04',
    curve_workflow_run_id: '900719925474099399999',
    curve_run_started_at: '2026-09-04T09:00:00Z',
    ...overrides,
  };
}

function succeeded(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function project() {
  return mkdtempSync(join(temporaryRoot, 'project with spaces-'));
}

function run(args, rows = [], { body = JSON.stringify(rows), status = 200, cwd = project() } = {}) {
  const fixtureRoot = mkdtempSync(join(temporaryRoot, 'response-'));
  const responsePath = join(fixtureRoot, 'response.json');
  const requestPath = join(fixtureRoot, 'requests.txt');
  writeFileSync(responsePath, JSON.stringify({ body, status }));
  const result = spawnSync(
    process.execPath,
    ['--import', pathToFileURL(preload).href, exporter, ...args],
    {
      cwd,
      env: {
        ...environment,
        INFERENCEX_TEST_RESPONSE: responsePath,
        INFERENCEX_TEST_REQUESTS: requestPath,
      },
      encoding: 'utf8',
      timeout: 10_000,
    },
  );
  assert.ifError(result.error);
  const requests = existsSync(requestPath)
    ? readFileSync(requestPath, 'utf8').trimEnd().split('\n')
    : [];
  return { ...result, cwd, requests };
}

function stderrMetadata(result) {
  const line = result.stderr.split('\n').find((entry) => entry.startsWith('{"metadata":'));
  assert.ok(line, 'successful exports include machine-readable metadata on stderr');
  return JSON.parse(line).metadata;
}

before(() => {
  writeFileSync(
    preload,
    `
import { appendFileSync, readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(process.env.INFERENCEX_TEST_RESPONSE, 'utf8'));
globalThis.fetch = async (input) => {
  appendFileSync(process.env.INFERENCEX_TEST_REQUESTS, String(input.url ?? input) + '\\n');
  return new Response(fixture.body, { status: fixture.status, headers: { 'Content-Type': 'application/json' } });
};
`,
  );
  const packed = spawnSync('npm', ['pack', '--json', '--pack-destination', temporaryRoot], {
    cwd: packageRoot,
    env: environment,
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.ifError(packed.error);
  succeeded(packed);
  const archive = join(temporaryRoot, JSON.parse(packed.stdout)[0].filename);
  const installRoot = project();
  const installed = spawnSync(
    'npm',
    [
      'exec',
      '--yes',
      '--offline',
      '--package',
      archive,
      '--',
      'inferencex-skills',
      'install',
      '--target',
      'codex',
    ],
    { cwd: installRoot, env: environment, encoding: 'utf8', timeout: 60_000 },
  );
  assert.ifError(installed.error);
  succeeded(installed);
  exporter = join(installRoot, '.agents/skills/inferencex-api/scripts/export-powerx.mjs');
  assert.ok(existsSync(exporter), 'the actual npm artifact installs the exporter');
});

after(() => {
  rmSync(temporaryRoot, { recursive: true, force: true });
});

test('installed JSON exporter preserves request, model, measurement and snapshot identities', () => {
  const rows = [observation(), observation({ id: 'release-2', model: 'glm5.1' })];
  const result = run([...requiredArgs, '--date', '2026-09-04', '--format', 'json'], rows);
  succeeded(result);
  assert.equal(result.requests.length, 1);
  const query = new URL(result.requests[0]);
  assert.equal(query.origin, 'https://inferencex.semianalysis.com');
  assert.equal(query.pathname, '/api/v1/benchmarks');
  assert.deepEqual(Object.fromEntries(query.searchParams), {
    model: 'GLM-5',
    date: '2026-09-04',
    powerValid: 'strictV2',
  });
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.rows, rows);
  assert.equal(output.metadata.package_version, version);
  assert.equal(output.metadata.query_url, query.href);
  assert.ok(Number.isFinite(Date.parse(output.metadata.retrieved_at)));
  assert.equal(output.metadata.requested_model, 'GLM-5');
  assert.equal(output.metadata.requested_date, '2026-09-04');
  assert.equal(output.metadata.date_selection, 'as-of');
  assert.equal(output.metadata.benchmark_type, 'single_turn');
  assert.equal(output.metadata.isl, 8192);
  assert.equal(output.metadata.osl, 1024);
  assert.equal(output.metadata.raw_model, null);
  assert.equal(output.metadata.returned_rows, 2);
  assert.equal(output.metadata.selected_rows, 2);
  assert.deepEqual(output.metadata.returned_models.toSorted(), ['glm5', 'glm5.1']);
  assert.deepEqual(output.metadata.selected_models.toSorted(), ['glm5', 'glm5.1']);
  assert.equal(output.metadata.non_finite_values, 0);
  assert.deepEqual(stderrMetadata(result), output.metadata);
  assert.match(result.stderr, /glm5/);
  assert.match(result.stderr, /glm5\.1/);
  assert.equal('workflow_run_id' in output.rows[0], false);
  assert.equal('run_started_at' in output.rows[0], false);
});

test('strict flags, exact numeric workload and optional raw model are filtered locally without coercion', () => {
  const invalidFlags = [
    { power_valid: '1' },
    { power_valid: true },
    { power_valid: 0 },
    { power_valid: null },
    { power_valid: undefined },
    { power_metric_schema_version: '2' },
    { power_metric_schema_version: true },
    { power_metric_schema_version: 3 },
    { power_metric_schema_version: undefined },
  ];
  const rows = [
    observation(),
    observation({ id: 'other-release', model: 'glm5.1' }),
    ...invalidFlags.map((flags, index) =>
      observation({
        id: `invalid-${index}`,
        metrics: { ...observation().metrics, ...flags },
      }),
    ),
    observation({ id: 'agentic', benchmark_type: 'agentic_traces' }),
    observation({ id: 'wrong-input', isl: 1024 }),
    observation({ id: 'wrong-output', osl: 8192 }),
    observation({ id: 'string-input', isl: '8192' }),
    observation({ id: 'string-output', osl: '1024' }),
  ];
  const allModels = run([...requiredArgs, '--format', 'json'], rows);
  succeeded(allModels);
  assert.deepEqual(
    JSON.parse(allModels.stdout).rows.map((row) => row.id),
    ['900719925474099312345', 'other-release'],
  );
  assert.deepEqual(JSON.parse(allModels.stdout).metadata.excluded_rows, {
    outside_requested_scope: 5,
    not_strict_v2: invalidFlags.length,
  });
  const result = run([...requiredArgs, '--raw-model', 'glm5.1', '--format', 'json'], rows);
  succeeded(result);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(
    output.rows.map((row) => row.id),
    ['other-release'],
  );
  assert.equal(output.metadata.returned_rows, rows.length);
  assert.equal(output.metadata.selected_rows, 1);
  assert.equal(output.metadata.raw_model, 'glm5.1');
  assert.deepEqual(output.metadata.excluded_rows, {
    outside_requested_scope: rows.length - 1,
    not_strict_v2: 0,
  });
  assert.equal(output.metadata.date_selection, 'latest');
  assert.equal(output.metadata.requested_date, null);
  assert.deepEqual(Object.fromEntries(new URL(result.requests[0]).searchParams), {
    model: 'GLM-5',
    powerValid: 'strictV2',
  });
});

test('JSON retains nested optional audit data, genuine zero and absence while disclosing non-finite values', () => {
  const row = observation({
    metrics: {
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: 0,
      joules_per_output_token: '__POSITIVE_OVERFLOW__',
      joules_per_total_token: null,
    },
    workers: [{ role: 'decode', avg_power_w: 0, hosts: [{ hostname: 'gpu-中文' }] }],
    power_invalid_reasons: [],
    power_audit: { status: 'valid', window: { duration_s: 0, energy: '__NEGATIVE_OVERFLOW__' } },
  });
  const body = JSON.stringify([row])
    .replace('"__POSITIVE_OVERFLOW__"', '1e400')
    .replace('"__NEGATIVE_OVERFLOW__"', '-1e400');
  const result = run([...requiredArgs, '--format', 'json'], [], { body });
  succeeded(result);
  const output = JSON.parse(result.stdout);
  assert.equal(output.rows[0].metrics.avg_power_w, 0);
  assert.equal(output.rows[0].metrics.joules_per_output_token, null);
  assert.equal(output.rows[0].metrics.joules_per_total_token, null);
  assert.equal('joules_per_successful_query' in output.rows[0].metrics, false);
  assert.deepEqual(output.rows[0].workers, row.workers);
  assert.deepEqual(output.rows[0].power_audit, {
    status: 'valid',
    window: { duration_s: 0, energy: null },
  });
  assert.deepEqual(output.rows[0].power_invalid_reasons, []);
  assert.equal(output.metadata.non_finite_values, 2);
  assert.deepEqual(output.metadata.metric_coverage.avg_power_w, {
    available_rows: 1,
    unavailable_rows: 0,
  });
  for (const key of [
    'joules_per_output_token',
    'joules_per_total_token',
    'joules_per_successful_query',
  ]) {
    assert.deepEqual(output.metadata.metric_coverage[key], {
      available_rows: 0,
      unavailable_rows: 1,
    });
  }
  assert.equal(
    output.metadata.selected_rows,
    1,
    'missing metrics do not remove an eligible observation',
  );
  assert.match(result.stderr, /eligibility does not guarantee every metric is available/);
  assert.match(result.stderr, /non.finite/i);
  const csv = run(requiredArgs, [], { body });
  succeeded(csv);
  const [header, record] = csv.stdout.trimEnd().split(/\r?\n/);
  const cells = record.split(',');
  assert.equal(cells[header.split(',').indexOf('joules_per_output_token')], '');
  assert.doesNotMatch(csv.stdout, /Infinity|NaN/);
  assert.equal(stderrMetadata(csv).non_finite_values, 2);
});

test('default CSV preserves identity, topology, zero, blank missing values and distinct metric families', () => {
  const row = observation({
    metrics: { ...observation().metrics, avg_power_w: 0, joules_per_total_token: null },
  });
  const result = run(requiredArgs, [row]);
  succeeded(result);
  const [header, record] = result.stdout.trimEnd().split(/\r?\n/);
  const values = Object.fromEntries(
    header.split(',').map((key, index) => [key, record.split(',')[index]]),
  );
  assert.equal(values.package_version, version);
  assert.equal(values.requested_model, 'GLM-5');
  assert.equal(values.requested_date, '');
  assert.equal(values.date_selection, 'latest');
  assert.equal(values.query_url, result.requests[0]);
  assert.ok(Number.isFinite(Date.parse(values.retrieved_at)));
  for (const key of [
    'id',
    'model',
    'hardware',
    'framework',
    'image',
    'precision',
    'spec_method',
    'benchmark_type',
    'isl',
    'osl',
    'conc',
    'disagg',
    'is_multinode',
    'prefill_tp',
    'prefill_ep',
    'prefill_dp_attention',
    'decode_tp',
    'decode_ep',
    'decode_dp_attention',
    'prefill_num_workers',
    'decode_num_workers',
    'num_prefill_gpu',
    'num_decode_gpu',
    'recipe_fingerprint',
    'date',
    'run_url',
    'curve_date',
    'curve_workflow_run_id',
    'curve_run_started_at',
  ])
    assert.equal(values[key], String(row[key]), key);
  assert.equal(values.workflow_run_id, '');
  assert.equal(values.run_started_at, '');
  assert.equal(values.avg_power_w, '0');
  assert.equal(values.joules_per_total_token, '');
  assert.equal(values.joules_per_output_token, '5.3');
  assert.equal(values.prefill_joules_per_input_token, '0.2');
  assert.equal(values.decode_joules_per_output_token, '4.1');
  assert.equal(values.power_valid, '1');
  assert.equal(values.power_metric_schema_version, '2');
  assert.equal(stderrMetadata(result).selected_rows, 1);
});

test('file exports keep data off stdout and escape CSV commas, quotes, line breaks and Unicode', () => {
  const row = observation({ image: '镜像, "quoted"\nsecond line' });
  const result = run([...requiredArgs, '--output', 'powerx export.csv'], [row]);
  succeeded(result);
  assert.equal(result.stdout, '');
  assert.deepEqual(readdirSync(result.cwd), ['powerx export.csv']);
  assert.match(
    readFileSync(join(result.cwd, 'powerx export.csv'), 'utf8'),
    /"镜像, ""quoted""\nsecond line"/,
  );
  assert.equal(stderrMetadata(result).selected_rows, 1);
});

test('empty selections retain request metadata and distinguish eligibility from benchmark absence', () => {
  for (const rows of [[], [observation({ benchmark_type: 'agentic_traces' })]]) {
    const result = run([...requiredArgs, '--format', 'json'], rows);
    succeeded(result);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(output.rows, []);
    assert.equal(output.metadata.returned_rows, rows.length);
    assert.equal(output.metadata.selected_rows, 0);
    assert.equal(result.requests.length, 1);
    assert.match(result.stderr, /No strictV2 rows matched the requested scope/);
    assert.doesNotMatch(result.stderr, /no benchmarks|no benchmark data/i);
  }
  const csv = run(requiredArgs);
  succeeded(csv);
  assert.equal(csv.stdout.trimEnd().split(/\r?\n/).length, 1);
  const metadata = stderrMetadata(csv);
  assert.equal(metadata.query_url, csv.requests[0]);
  assert.equal(metadata.package_version, version);
  assert.equal(metadata.selected_rows, 0);
  assert.deepEqual(metadata.metric_coverage.avg_power_w, {
    available_rows: 0,
    unavailable_rows: 0,
  });
  assert.ok(Number.isFinite(Date.parse(metadata.retrieved_at)));
});

test('HTTP, malformed JSON and unexpected shapes fail without replacing an existing output', () => {
  const failures = [
    { status: 400, body: '{"error":"Unknown model"}', error: /HTTP 400.*Unknown model/ },
    { status: 503, body: 'Service unavailable', error: /HTTP 503/ },
    { body: '{"unfinished":', error: /JSON/ },
    ...[
      null,
      {},
      [null],
      [true],
      [observation({ metrics: [] })],
      [observation({ model: 1 })],
      [observation({ benchmark_type: null })],
    ].map((value) => ({ body: JSON.stringify(value), error: /response shape/i })),
  ];
  for (const failure of failures) {
    const cwd = project();
    writeFileSync(join(cwd, 'existing.json'), 'keep this file');
    const result = run([...requiredArgs, '--format', 'json', '--output', 'existing.json'], [], {
      ...failure,
      cwd,
    });
    assert.notEqual(result.status, 0, result.stdout);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, failure.error);
    assert.doesNotMatch(result.stderr, /\{"metadata":|Selected \d+/);
    assert.equal(readFileSync(join(cwd, 'existing.json'), 'utf8'), 'keep this file');
    assert.deepEqual(readdirSync(cwd), ['existing.json']);
  }
});

test('invalid arguments fail before HTTP or output writes; help needs no arguments or request', () => {
  const invalid = [
    [],
    ['--model', 'GLM-5'],
    [...requiredArgs, '--unexpected'],
    [...requiredArgs, 'extra'],
    ...[
      ['--model', ''],
      ['--isl', '0'],
      ['--isl', '-1'],
      ['--osl', '1.5'],
      ['--isl', '9007199254740993'],
      ['--isl', '8192tokens'],
      ['--date', '2026-02-30'],
      ['--date', '2026-9-4'],
      ['--format', 'xml'],
      ['--raw-model', ''],
    ].map((option) => [...requiredArgs, ...option]),
  ];
  for (const args of invalid) {
    const result = run([...args, '--output', 'should-not-exist.json'], [observation()]);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.equal(result.stdout, '');
    assert.equal(result.requests.length, 0);
    assert.deepEqual(readdirSync(result.cwd), []);
  }
  const result = run(['--help']);
  succeeded(result);
  assert.match(result.stdout, /--model/);
  assert.equal(result.requests.length, 0);
  assert.deepEqual(readdirSync(result.cwd), []);
});
