import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { packageInfo, packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();
const { temporaryRoot, environment, project } = suite;
const preload = join(temporaryRoot, 'http-response.mjs');
const requiredArgs = ['--model', 'GLM-5', '--isl', '8192', '--osl', '1024'];
const version = packageInfo.version;
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

function run(
  args,
  rows = [],
  { body = JSON.stringify(rows), status = 200, cwd = project(), ...faults } = {},
) {
  const fixtureRoot = project('response-');
  const responsePath = join(fixtureRoot, 'response.json');
  const requestPath = join(fixtureRoot, 'requests.txt');
  writeFileSync(responsePath, JSON.stringify({ body, status, ...faults }));
  const result = suite.node(['--import', pathToFileURL(preload).href, exporter, ...args], {
    cwd,
    env: {
      ...environment,
      INFERENCEX_TEST_RESPONSE: responsePath,
      INFERENCEX_TEST_REQUESTS: requestPath,
    },
  });
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
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const fixture = JSON.parse(readFileSync(process.env.INFERENCEX_TEST_RESPONSE, 'utf8'));
let calls = 0;
if (fixture.timeout) AbortSignal.timeout = () => AbortSignal.abort(new DOMException('Timed out', 'TimeoutError'));
if (fixture.stdoutFailure) process.stdout.write = (_output, callback) => {
  queueMicrotask(() => callback(Object.assign(new Error('broken pipe'), { code: 'EPIPE' })));
  return false;
};
globalThis.fetch = async (input, options) => {
  appendFileSync(process.env.INFERENCEX_TEST_REQUESTS, String(input.url ?? input) + '\\n');
  options.signal.throwIfAborted();
  if (fixture.blockEvidenceFile) mkdirSync(join(fixture.evidenceDir, fixture.blockEvidenceFile));
  if (fixture.bodyFailure) return new Response(new ReadableStream({ start(controller) { controller.error(new Error('body interrupted')); } }));
  const body = calls++ === 0 ? fixture.body : fixture.secondBody ?? '[]';
  return new Response(body, { status: fixture.status, headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } });
};
`,
  );
  exporter = join(suite.install('codex'), 'scripts/export-powerx.mjs');
  assert.ok(existsSync(exporter), 'the actual npm artifact installs the exporter');
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
  ];
  const allModels = run([...requiredArgs, '--format', 'json'], rows);
  succeeded(allModels);
  assert.deepEqual(
    JSON.parse(allModels.stdout).rows.map((row) => row.id),
    ['900719925474099312345', 'other-release'],
  );
  assert.deepEqual(JSON.parse(allModels.stdout).metadata.excluded_rows, {
    outside_requested_scope: 3,
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

test('nullable fields and absent optional provenance remain valid benchmark rows', () => {
  const row = observation({
    id: 42,
    image: null,
    run_url: null,
    metrics: { power_valid: 1, power_metric_schema_version: 2 },
  });
  for (const key of [
    'recipe_fingerprint',
    'curve_date',
    'curve_workflow_run_id',
    'curve_run_started_at',
  ])
    delete row[key];
  const rows = [row, observation({ id: 'null-lengths', isl: null, osl: null })];
  const result = run([...requiredArgs, '--format', 'json'], rows);
  succeeded(result);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.rows, [row]);
  assert.equal(output.metadata.returned_rows, 2);
  assert.equal(output.metadata.selected_rows, 1);
  assert.deepEqual(output.metadata.excluded_rows, { outside_requested_scope: 1, not_strict_v2: 0 });
  assert.deepEqual(output.metadata.metric_coverage.avg_power_w, {
    available_rows: 0,
    unavailable_rows: 1,
  });
});

test('every malformed required field fails before scope filtering and leaves the output untouched', () => {
  const wrongTypes = {
    id: null,
    hardware: null,
    framework: null,
    model: null,
    precision: null,
    spec_method: null,
    benchmark_type: null,
    offload_mode: null,
    date: null,
    disagg: 'false',
    is_multinode: 0,
    prefill_dp_attention: 0,
    decode_dp_attention: 'false',
    prefill_tp: '8',
    prefill_ep: 1.5,
    prefill_num_workers: null,
    decode_tp: '8',
    decode_ep: 1.5,
    decode_num_workers: null,
    num_prefill_gpu: '0',
    num_decode_gpu: 8.5,
    conc: false,
    isl: '8192',
    osl: '1024',
    image: 1,
    run_url: false,
    metrics: [],
  };
  const failures = Object.entries(wrongTypes).flatMap(([field, value]) => [
    { label: `missing ${field}`, field, value: undefined },
    { label: `wrong type ${field}`, field, value },
  ]);
  failures.push(
    { label: 'empty id', field: 'id', value: '' },
    { label: 'blank id', field: 'id', value: '  ' },
    { label: 'fractional id', field: 'id', value: 1.5 },
    { label: 'unsafe numeric id', field: 'id', value: Number.MAX_SAFE_INTEGER + 1 },
    { label: 'non-finite id', field: 'id', value: '__NONFINITE__' },
    { label: 'non-finite integer', field: 'prefill_tp', value: '__NONFINITE__' },
    { label: 'non-finite input length', field: 'isl', value: '__NONFINITE__' },
    { label: 'non-finite output length', field: 'osl', value: '__NONFINITE__' },
    { label: 'impossible date', field: 'date', value: '2026-02-30' },
    { label: 'timestamp date', field: 'date', value: '2026-09-04T00:00:00Z' },
    { label: 'non-padded date', field: 'date', value: '2026-9-4' },
  );
  for (const { label, field, value } of failures) {
    const row = observation({
      model: 'other-release',
      benchmark_type: 'agentic_traces',
      [field]: value,
    });
    const cwd = project();
    writeFileSync(join(cwd, 'existing.json'), 'keep this file');
    const result = run(
      [...requiredArgs, '--raw-model', 'glm5', '--format', 'json', '--output', 'existing.json'],
      [row],
      { cwd, body: JSON.stringify([row]).replace('"__NONFINITE__"', '1e400') },
    );
    assert.equal(result.status, 1, label);
    assert.equal(result.requests.length, 1, label);
    assert.equal(result.stdout, '', label);
    assert.match(result.stderr, /response shape/i, label);
    assert.doesNotMatch(result.stderr, /No strictV2 rows|\{"metadata":/, label);
    assert.equal(readFileSync(join(cwd, 'existing.json'), 'utf8'), 'keep this file', label);
    assert.deepEqual(readdirSync(cwd), ['existing.json'], label);
  }
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
      ['--evidence-dir', ''],
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

function captured(result, directory = '证据 with spaces') {
  const root = join(result.cwd, directory);
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const body = manifest.response?.body_file
    ? readFileSync(join(root, manifest.response.body_file))
    : null;
  return { root, manifest, body };
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
  return records;
}

test('evidence captures the sole consumed response and independently links every CSV/JSON value', () => {
  const first = observation({
    image: '镜像, "quoted"\nsecond line',
    metrics: { power_valid: 1, power_metric_schema_version: 2, avg_power_w: 0 },
    workers: [{ role: 'decode', hosts: [{ hostname: 'gpu-中文' }], energy_j: 0 }],
    power_audit: { source: { id: '900719925474099312399', url: 'https://example.org/a?b=1&c=2' } },
  });
  const second = observation({
    id: '第二条',
    metrics: { ...observation().metrics, avg_temp_c: 0 },
  });
  const rows = [
    first,
    second,
    observation({ id: 'outside-scope', isl: 7 }),
    observation({
      id: 'not-strict',
      metrics: { power_valid: '1', power_metric_schema_version: 2 },
    }),
  ];
  const body = `\uFEFF${JSON.stringify(rows, null, 4)} \n`;
  for (const format of ['csv', 'json']) {
    for (const file of [false, true]) {
      const args = [
        ...requiredArgs,
        '--date',
        '2026-09-04',
        '--format',
        format,
        '--evidence-dir',
        '证据 with spaces',
      ];
      if (file) args.push('--output', `导出 with spaces.${format}`);
      const result = run(args, [], {
        body,
        secondBody: JSON.stringify([observation({ id: 'unnoticed-second-fetch' })]),
      });
      succeeded(result);
      assert.equal(result.requests.length, 1, 'a refetch would receive different observations');
      const { manifest, body: saved } = captured(result);
      assert.deepEqual(saved, Buffer.from(body), 'preserve BOM, whitespace and UTF-8 bytes');
      assert.deepEqual(manifest.request, {
        url: result.requests[0],
        method: 'GET',
        filters: {
          model: 'GLM-5',
          date: '2026-09-04',
          powerValid: 'strictV2',
          benchmark_type: 'single_turn',
          isl: 8192,
          osl: 1024,
          raw_model: null,
        },
      });
      assert.equal(manifest.schema_version, 1);
      assert.equal(manifest.package_version, version);
      assert.equal(manifest.status, 'complete');
      assert.equal(manifest.response.status, 200);
      assert.equal(manifest.response.body_file, 'response.json');
      assert.equal(manifest.response.sha256, createHash('sha256').update(saved).digest('hex'));
      assert.equal(manifest.response.checksum_covers, 'saved decoded response body');
      assert.ok(Number.isFinite(Date.parse(manifest.response.retrieved_at)));
      const output = file
        ? readFileSync(join(result.cwd, `导出 with spaces.${format}`), 'utf8')
        : result.stdout;
      if (file) assert.equal(result.stdout, '');
      assert.equal(manifest.export.format, format);
      assert.equal(
        manifest.export.destination,
        file ? join(result.cwd, `导出 with spaces.${format}`) : 'stdout',
      );
      assert.equal(manifest.export.sha256, createHash('sha256').update(output).digest('hex'));
      assert.deepEqual(manifest.export.metadata, stderrMetadata(result));
      assert.equal(manifest.export.metadata.retrieved_at, manifest.response.retrieved_at);
      assert.equal(manifest.export.metadata.returned_rows, 4);
      assert.equal(manifest.export.metadata.selected_rows, 2);
      const originals = JSON.parse(new TextDecoder().decode(saved));
      if (format === 'json') {
        const exported = JSON.parse(output);
        assert.deepEqual(exported.rows, originals.slice(0, 2));
        assert.deepEqual(exported.metadata, manifest.export.metadata);
        assert.equal(exported.rows[0].metrics.avg_power_w, 0);
        assert.equal('joules_per_output_token' in exported.rows[0].metrics, false);
        assert.deepEqual(exported.rows[0].power_audit, first.power_audit);
      } else {
        const [columns, ...records] = csvRecords(output);
        assert.equal(columns.length, 54);
        assert.equal(records.length, 2);
        for (const [index, cells] of records.entries()) {
          assert.equal(cells.length, 54);
          for (const [columnIndex, key] of columns.entries()) {
            const source =
              columnIndex < 7
                ? manifest.export.metadata[key]
                : Object.hasOwn(originals[index].metrics, key)
                  ? originals[index].metrics[key]
                  : originals[index][key];
            assert.equal(
              cells[columnIndex],
              source === null || source === undefined ? '' : String(source),
              `${index}:${key}`,
            );
          }
        }
        assert.equal(records[0][columns.indexOf('avg_power_w')], '0');
        assert.equal(records[0][columns.indexOf('joules_per_output_token')], '');
      }
      assert.deepEqual(readdirSync(captured(result).root).sort(), [
        'manifest.json',
        'response.json',
      ]);
    }
  }
});

test('empty successful captures distinguish an empty response from an empty local selection', () => {
  for (const format of ['csv', 'json']) {
    for (const rows of [[], [observation({ isl: 7 })]]) {
      const result = run(
        [...requiredArgs, '--format', format, '--evidence-dir', '证据 with spaces'],
        rows,
      );
      succeeded(result);
      const { manifest, body } = captured(result);
      assert.equal(manifest.status, 'complete');
      assert.equal(manifest.response.status, 200);
      assert.deepEqual(JSON.parse(body), rows);
      assert.equal(manifest.export.metadata.selected_rows, 0);
      assert.equal(manifest.export.metadata.returned_rows, rows.length);
      assert.match(result.stderr, /No strictV2 rows matched/);
      if (format === 'json') assert.deepEqual(JSON.parse(result.stdout).rows, []);
      else assert.equal(csvRecords(result.stdout).length, 1);
    }
  }
});

test('HTTP, malformed JSON and invalid response shapes retain their complete received failure bodies', () => {
  for (const failure of [
    { status: 400, body: '{"error":"Unknown model 中文"}', error: /HTTP 400.*Unknown model 中文/ },
    { status: 503, body: 'Service unavailable\n', error: /HTTP 503/ },
    { body: '{"unfinished":', error: /JSON/ },
    { body: '{"rows":[]}', error: /response shape/i },
    { body: '[null]', error: /response shape/i },
  ]) {
    const cwd = project();
    writeFileSync(join(cwd, 'existing.json'), 'preserve existing output');
    const result = run(
      [
        ...requiredArgs,
        '--format',
        'json',
        '--output',
        'existing.json',
        '--evidence-dir',
        '证据 with spaces',
      ],
      [],
      { cwd, ...failure },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.requests.length, 1);
    assert.match(result.stderr, failure.error);
    assert.doesNotMatch(result.stderr, /\{"metadata":|Selected \d+/);
    const { manifest, body } = captured(result);
    assert.equal(manifest.status, 'failed');
    assert.equal(manifest.response.status, failure.status ?? 200);
    assert.deepEqual(body, Buffer.from(failure.body));
    assert.equal(manifest.response.sha256, createHash('sha256').update(body).digest('hex'));
    assert.match(manifest.error, failure.error);
    assert.equal(manifest.export.metadata, null);
    assert.equal(manifest.export.sha256, null);
    assert.equal(readFileSync(join(cwd, 'existing.json'), 'utf8'), 'preserve existing output');
  }
});

test('timeout without a response differs from interruption after HTTP headers', () => {
  for (const fault of [{ timeout: true }, { bodyFailure: true }]) {
    const result = run([...requiredArgs, '--evidence-dir', '证据 with spaces'], [], fault);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.requests.length, 1);
    const { manifest, body } = captured(result);
    assert.equal(manifest.status, 'failed');
    assert.equal(body, null);
    if (fault.timeout) {
      assert.equal(manifest.response, null);
      assert.match(manifest.error, /Timed out/);
    } else {
      assert.equal(manifest.response.status, 200);
      assert.equal(manifest.response.body_file, null);
      assert.equal(manifest.response.sha256, null);
      assert.match(manifest.error, /body interrupted/);
    }
  }
});

test('fresh evidence directories reject reuse and output collisions before HTTP', () => {
  const cwd = project();
  mkdirSync(join(cwd, 'existing'));
  writeFileSync(join(cwd, 'existing/keep'), 'original');
  mkdirSync(join(cwd, 'empty'));
  symlinkSync(join(cwd, 'existing'), join(cwd, 'directory-link'));
  symlinkSync(join(cwd, 'new/response.json'), join(cwd, 'output-link'));
  symlinkSync(cwd, join(cwd, 'parent-link'));
  const failures = [
    ['--evidence-dir', 'existing'],
    ['--evidence-dir', 'empty'],
    ['--evidence-dir', 'directory-link'],
    ...[
      'new',
      'new/response.json',
      'new/manifest.json',
      'new/manifest.tmp',
      'new/MANIFEST.JSON',
      'NEW/response.json',
      'new/response.json/child',
      'output-link',
      'parent-link/new/response.json',
    ].map((path) => ['--evidence-dir', 'new', '--output', path]),
    ['--evidence-dir', 'parent/child', '--output', 'parent'],
  ];
  for (const args of failures) {
    const result = run([...requiredArgs, ...args], [observation()], { cwd });
    assert.equal(result.status, 1, args.join(' '));
    assert.equal(result.requests.length, 0, args.join(' '));
    assert.equal(result.stdout, '');
    assert.equal(existsSync(join(cwd, 'new')), false);
    assert.equal(existsSync(join(cwd, 'parent')), false);
  }
  assert.equal(readFileSync(join(cwd, 'existing/keep'), 'utf8'), 'original');
  assert.deepEqual(readdirSync(join(cwd, 'empty')), []);
});

test('requested evidence/output write failures and closed stdout never leave a successful manifest', () => {
  for (const fault of ['response.json', 'manifest.tmp', 'output', 'stdout']) {
    const cwd = project();
    const args = [...requiredArgs, '--evidence-dir', '证据 with spaces'];
    const options = { cwd };
    if (fault === 'output') {
      mkdirSync(join(cwd, 'output'));
      args.push('--output', 'output');
    } else if (fault === 'stdout') options.stdoutFailure = true;
    else {
      options.blockEvidenceFile = fault;
      options.evidenceDir = join(cwd, '证据 with spaces');
    }
    const result = run(args, [observation()], options);
    assert.equal(result.status, 1, fault);
    assert.equal(result.requests.length, 1);
    assert.doesNotMatch(result.stderr, /\{"metadata":|Selected \d+/);
    const { manifest } = captured(result);
    assert.notEqual(manifest.status, 'complete', fault);
    if (fault === 'manifest.tmp') {
      assert.equal(
        manifest.status,
        'pending',
        'failed atomic finalization retains the pending manifest',
      );
      assert.match(result.stderr, /could not save failure evidence/);
    } else assert.equal(manifest.status, 'failed');
  }
  const cwd = project();
  writeFileSync(join(cwd, 'parent-file'), 'untouched');
  const result = run([...requiredArgs, '--evidence-dir', 'parent-file/evidence'], [], { cwd });
  assert.equal(result.status, 1);
  assert.equal(result.requests.length, 0);
  assert.equal(readFileSync(join(cwd, 'parent-file'), 'utf8'), 'untouched');
});
