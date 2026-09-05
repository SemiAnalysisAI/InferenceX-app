import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { packageInfo, packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();
const { temporaryRoot, environment, project } = suite;
const preload = join(temporaryRoot, 'http-response.mjs');
const version = packageInfo.version;
const powerKeys = [
  'avg_power_w',
  'prefill_avg_power_w',
  'decode_avg_power_w',
  'joules_per_successful_query',
  'joules_per_input_token',
  'joules_per_output_token',
  'joules_per_total_token',
  'prefill_joules_per_input_token',
  'decode_joules_per_output_token',
];
let diagnosticCode;

function strictMetadata(overrides = {}) {
  return {
    package_version: version,
    query_url:
      'https://inferencex.semianalysis.com/api/v1/benchmarks?model=GLM-5&date=2026-09-04&powerValid=strictV2',
    retrieved_at: '2026-09-04T23:58:55.956Z',
    requested_model: 'GLM-5',
    requested_date: '2026-09-04',
    date_selection: 'as-of',
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    raw_model: 'glm5.1',
    returned_rows: 0,
    selected_rows: 0,
    returned_models: [],
    selected_models: [],
    non_finite_values: 0,
    ...overrides,
  };
}

function observation(metrics = {}, overrides = {}) {
  return {
    id: '900719925474099312345',
    hardware: 'h200_sxm',
    framework: 'vllm',
    model: 'glm5.1',
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
    date: '2026-09-01',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/900719925474099312345',
    metrics,
    ...overrides,
  };
}

function run(
  rows = [],
  {
    metadata = strictMetadata(),
    report = `${JSON.stringify({ metadata })}\nNo strictV2 rows matched the requested scope.\n`,
    body = JSON.stringify(rows),
    status = 200,
    networkError = false,
  } = {},
) {
  const cwd = project();
  const reportPath = join(cwd, 'powerx-report.log');
  const responseRoot = project('response-');
  const responsePath = join(responseRoot, 'response.json');
  const requestPath = join(responseRoot, 'requests.jsonl');
  writeFileSync(reportPath, report);
  writeFileSync(responsePath, JSON.stringify({ body, status, networkError }));
  const result = suite.node(
    ['--import', pathToFileURL(preload).href, '--input-type=module', '-', reportPath],
    {
      cwd,
      env: {
        ...environment,
        INFERENCEX_TEST_RESPONSE: responsePath,
        INFERENCEX_TEST_REQUESTS: requestPath,
      },
      input: diagnosticCode,
    },
  );
  const requests = existsSync(requestPath)
    ? readFileSync(requestPath, 'utf8').trimEnd().split('\n').map(JSON.parse)
    : [];
  assert.ok(requests.length <= 1, 'the recipe makes at most one diagnostic request');
  assert.equal(readFileSync(reportPath, 'utf8'), report, 'the strict export report is unchanged');
  assert.deepEqual(
    readdirSync(cwd),
    ['powerx-report.log'],
    'diagnosis creates no export or other file',
  );
  return { ...result, requests };
}

before(() => {
  writeFileSync(
    preload,
    `
import { appendFileSync, readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(process.env.INFERENCEX_TEST_RESPONSE, 'utf8'));
globalThis.fetch = async (input, options) => {
  appendFileSync(process.env.INFERENCEX_TEST_REQUESTS, JSON.stringify({
    url: String(input.url ?? input), method: options?.method ?? input.method ?? 'GET',
  }) + '\\n');
  if (fixture.networkError) throw new TypeError('fixture network failure');
  return new Response(fixture.body, { status: fixture.status, headers: { 'Content-Type': 'application/json' } });
};
`,
  );
  const cookbook = readFileSync(join(suite.install('codex'), 'references/powerx.md'), 'utf8');
  const section = cookbook.split('## Diagnose an empty strict selection\n')[1]?.split('\n## ')[0];
  assert.ok(section, 'the installed cookbook contains the empty-selection recipe');
  const snippet = section.match(
    /```bash\nnode --input-type=module - powerx-report\.log <<'JS'\n(?<code>[\s\S]*?)\nJS\n```/,
  );
  assert.ok(snippet, 'execute the shipped recipe, not a test-only diagnostic implementation');
  diagnosticCode = snippet.groups.code;
});

test('installed recipe makes one same-scope GET and preserves the earlier strict result', () => {
  const selected = observation({ power_valid: 0, avg_power_w: 0 });
  const rows = [
    selected,
    observation({}, { id: 'other-release', model: 'glm5' }),
    observation({}, { id: 'agentic', benchmark_type: 'agentic' }),
    observation({}, { id: 'other-isl', isl: 1024 }),
    observation({}, { id: 'other-osl', osl: 8192 }),
  ];
  const metadata = strictMetadata({ returned_rows: 3, returned_models: ['glm5'] });
  const result = run(rows, { metadata });
  succeeded(result);
  assert.deepEqual(result.requests, [
    {
      url: 'https://inferencex.semianalysis.com/api/v1/benchmarks?model=GLM-5&date=2026-09-04',
      method: 'GET',
    },
  ]);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.strict, metadata);
  assert.equal(output.diagnostic.query_url, result.requests[0].url);
  assert.ok(Number.isFinite(Date.parse(output.diagnostic.retrieved_at)));
  assert.deepEqual(output.diagnostic.scope, {
    requested_model: 'GLM-5',
    requested_date: '2026-09-04',
    raw_model: 'glm5.1',
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
  });
  assert.equal(output.diagnostic.returned_rows, rows.length);
  assert.equal(output.diagnostic.scoped_rows, 1);
  assert.equal(output.diagnostic.outcome, 'classified');
  assert.equal(output.diagnostic.rows[0].id, selected.id);
  assert.equal(output.diagnostic.rows[0].model, selected.model);
  assert.equal(output.diagnostic.rows[0].date, selected.date);
  assert.equal(output.diagnostic.rows[0].run_url, selected.run_url);
  assert.equal(output.diagnostic.rows[0].validation, 'invalid');
});

test('latest scope keeps no date and an omitted raw model includes each returned release', () => {
  const metadata = strictMetadata({
    query_url:
      'https://inferencex.semianalysis.com/api/v1/benchmarks?model=GLM-5&powerValid=strictV2',
    requested_date: null,
    date_selection: 'latest',
    raw_model: null,
  });
  const result = run([observation(), observation({}, { id: 'glm5', model: 'glm5' })], { metadata });
  succeeded(result);
  assert.deepEqual(result.requests, [
    {
      url: 'https://inferencex.semianalysis.com/api/v1/benchmarks?model=GLM-5',
      method: 'GET',
    },
  ]);
  const { diagnostic } = JSON.parse(result.stdout);
  assert.equal(diagnostic.scope.requested_date, null);
  assert.equal(diagnostic.scope.raw_model, null);
  assert.deepEqual(
    diagnostic.rows.map((row) => row.model),
    ['glm5.1', 'glm5'],
  );
});

test('validation classes use numeric evidence and keep unsupported or malformed data unverified', () => {
  const cases = [
    ['invalid-no-schema', { power_valid: 0 }, 'invalid'],
    ['invalid-future-schema', { power_valid: 0, power_metric_schema_version: 3 }, 'invalid'],
    ['absent-both', {}, 'legacy_unverified'],
    ['absent-verdict-v2', { power_metric_schema_version: 2 }, 'legacy_unverified'],
    ['absent-schema', { power_valid: 1 }, 'legacy_unverified'],
    ['schema-v1', { power_valid: 1, power_metric_schema_version: 1 }, 'legacy_unverified'],
    ['future-schema', { power_valid: 1, power_metric_schema_version: 3 }, 'unsupported_schema'],
    ['future-without-verdict', { power_metric_schema_version: 4 }, 'unsupported_schema'],
    ['string-verdict', { power_valid: '1', power_metric_schema_version: 2 }, 'unknown'],
    ['boolean-verdict', { power_valid: true, power_metric_schema_version: 2 }, 'unknown'],
    ['null-verdict', { power_valid: null, power_metric_schema_version: 2 }, 'unknown'],
    ['other-verdict', { power_valid: 2, power_metric_schema_version: 3 }, 'unknown'],
    ['string-schema', { power_valid: 1, power_metric_schema_version: '2' }, 'unknown'],
    ['null-schema', { power_valid: 1, power_metric_schema_version: null }, 'unknown'],
    ['fractional-schema', { power_valid: 1, power_metric_schema_version: 2.5 }, 'unknown'],
    ['zero-schema', { power_valid: 1, power_metric_schema_version: 0 }, 'unknown'],
    ['negative-schema', { power_metric_schema_version: -1 }, 'unknown'],
    ['unsafe-schema', { power_metric_schema_version: Number.MAX_SAFE_INTEGER + 1 }, 'unknown'],
  ];
  const rows = cases.map(([id, metrics]) => observation(metrics, { id }));
  rows[0].power_invalid_reasons = ['recorded upstream reason'];
  const result = run(rows);
  succeeded(result);
  const { diagnostic } = JSON.parse(result.stdout);
  assert.equal(diagnostic.outcome, 'classified');
  assert.deepEqual(
    diagnostic.rows.map(({ id, validation }) => [id, validation]),
    cases.map(([id, , validation]) => [id, validation]),
  );
  assert.deepEqual(diagnostic.validation_counts, {
    invalid: 2,
    legacy_unverified: 4,
    unsupported_schema: 2,
    unknown: 10,
    strictV2_eligible: 0,
  });
  assert.deepEqual(diagnostic.rows[0].power_invalid_reasons, rows[0].power_invalid_reasons);
  assert.equal('power_invalid_reasons' in diagnostic.rows[1], false, 'no reason is invented');
  assert.equal(diagnostic.rows[8].power_valid, '1', 'diagnostic evidence is not coerced');
  assert.equal(diagnostic.rows[12].power_metric_schema_version, '2');
});

test('measurement availability counts finite watts and joules independently of validation', () => {
  const rows = [
    observation({ power_valid: 0, avg_power_w: 0 }, { id: 'zero-watts' }),
    observation(Object.fromEntries(powerKeys.map((key, index) => [key, index])), {
      id: 'all-measured',
    }),
    observation(
      { avg_temp_c: 55, peak_temp_c: 61, avg_util_pct: 100, avg_mem_used_mb: 1024 },
      { id: 'telemetry-only' },
    ),
    observation({ avg_power_w: null, joules_per_output_token: '0' }, { id: 'null-and-string' }),
    observation({}, { id: 'absent' }),
    observation(
      { avg_power_w: 'positive-infinity', joules_per_total_token: 'negative-infinity' },
      { id: 'nonfinite' },
    ),
  ];
  const body = JSON.stringify(rows)
    .replace('"positive-infinity"', '1e400')
    .replace('"negative-infinity"', '-1e400');
  const result = run(rows, { body });
  succeeded(result);
  const { diagnostic } = JSON.parse(result.stdout);
  assert.deepEqual(diagnostic.measurement_counts, { some_recorded: 2, missing: 4 });
  assert.deepEqual(diagnostic.rows[0].recorded_metrics, { avg_power_w: 0 });
  assert.deepEqual(
    diagnostic.rows[0].unavailable_metrics.toSorted(),
    powerKeys.filter((key) => key !== 'avg_power_w').toSorted(),
  );
  assert.deepEqual(diagnostic.rows[1].recorded_metrics, rows[1].metrics);
  assert.deepEqual(diagnostic.rows[1].unavailable_metrics, []);
  for (const row of diagnostic.rows.slice(2)) {
    assert.deepEqual(row.recorded_metrics, {}, row.id);
    assert.deepEqual(row.unavailable_metrics.toSorted(), powerKeys.toSorted(), row.id);
  }
  assert.equal(diagnostic.rows[0].validation, 'invalid', 'zero does not make invalid data valid');
});

test('newly eligible same-scope rows are a discrepancy rather than an absence explanation', () => {
  const result = run([
    observation({ power_valid: 1, power_metric_schema_version: 2, avg_power_w: 0 }),
    observation({ power_valid: 0 }, { id: 'invalid' }),
  ]);
  succeeded(result);
  const output = JSON.parse(result.stdout);
  assert.equal(output.strict.selected_rows, 0);
  assert.equal(output.diagnostic.outcome, 'response_discrepancy');
  assert.equal(output.diagnostic.validation_counts.strictV2_eligible, 1);
  assert.equal(output.diagnostic.rows[0].validation, 'strictV2_eligible');
  assert.equal(
    'rows' in output,
    false,
    'diagnostic rows are not presented as the validated export',
  );
});

test('no observations means no rows in the original local scope', () => {
  for (const rows of [[], [observation({}, { model: 'glm5' })]]) {
    const result = run(rows);
    succeeded(result);
    const { diagnostic } = JSON.parse(result.stdout);
    assert.equal(result.requests.length, 1);
    assert.equal(diagnostic.returned_rows, rows.length);
    assert.equal(diagnostic.scoped_rows, 0);
    assert.equal(diagnostic.outcome, 'no_observations');
    assert.deepEqual(diagnostic.rows, []);
    assert.deepEqual(diagnostic.measurement_counts, { some_recorded: 0, missing: 0 });
    assert.ok(Object.values(diagnostic.validation_counts).every((count) => count === 0));
  }
});

test('nullable fields and absent optional provenance stay valid during diagnosis', () => {
  const result = run([
    observation({}, { id: 42, image: null, run_url: null }),
    observation({}, { id: 'null-lengths', isl: null, osl: null }),
  ]);
  succeeded(result);
  const { diagnostic } = JSON.parse(result.stdout);
  assert.equal(diagnostic.returned_rows, 2);
  assert.equal(diagnostic.scoped_rows, 1);
  assert.equal(diagnostic.outcome, 'classified');
  assert.equal(diagnostic.rows[0].id, 42);
  assert.equal(diagnostic.rows[0].run_url, null);
  assert.equal(diagnostic.rows[0].validation, 'legacy_unverified');
  assert.deepEqual(diagnostic.measurement_counts, { some_recorded: 0, missing: 1 });
});

test('every malformed required field fails before scope filtering instead of proving no observations', () => {
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
    const row = observation(
      {},
      { model: 'other-release', benchmark_type: 'agentic_traces', [field]: value },
    );
    const result = run([row], { body: JSON.stringify([row]).replace('"__NONFINITE__"', '1e400') });
    assert.equal(result.status, 1, label);
    assert.equal(result.requests.length, 1, label);
    assert.equal(result.stdout, '', label);
    assert.match(result.stderr, /response shape/i, label);
    assert.match(result.stderr, /strict.*empty|empty.*strict/i, label);
    assert.doesNotMatch(result.stderr, /no_observations|no benchmark observations/i, label);
  }
});

test('HTTP, network, malformed JSON and response-shape failures do not claim data absence', () => {
  const cases = [
    { status: 503, body: 'Service unavailable' },
    { status: 429, body: 'Rate limited' },
    { networkError: true },
    { body: 'not JSON' },
    { body: '{"rows":[]}' },
    { body: '[null]' },
    { body: JSON.stringify([observation(null)]) },
    { body: JSON.stringify([observation({}, { model: null })]) },
  ];
  for (const options of cases) {
    const result = run([], options);
    assert.equal(result.status, 1, JSON.stringify(options));
    assert.equal(result.requests.length, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /strict.*empty|empty.*strict/i);
    assert.doesNotMatch(result.stderr, /no_observations|no benchmark observations/i);
  }
});

test('nonempty and malformed strict reports are rejected before any request', () => {
  const cases = [
    { report: 'not JSON\n' },
    { report: '{}\n' },
    { metadata: strictMetadata({ selected_rows: 1, selected_models: ['glm5.1'] }) },
    { metadata: strictMetadata({ selected_rows: '0' }) },
    { metadata: strictMetadata({ selected_models: ['glm5.1'] }) },
    { metadata: strictMetadata({ benchmark_type: 'agentic' }) },
    { metadata: strictMetadata({ isl: '8192' }) },
    { metadata: strictMetadata({ osl: 0 }) },
    { metadata: strictMetadata({ requested_date: '2026-02-30' }) },
    { metadata: strictMetadata({ raw_model: '' }) },
    { metadata: strictMetadata({ returned_rows: -1 }) },
    { metadata: strictMetadata({ retrieved_at: 'not a timestamp' }) },
  ];
  for (const options of cases) {
    const result = run([], options);
    assert.equal(result.status, 1, JSON.stringify(options));
    assert.deepEqual(result.requests, []);
    assert.equal(result.stdout, '');
  }
});

test('report URLs cannot change the host, endpoint, query or recorded export scope', () => {
  const base = 'https://inferencex.semianalysis.com/api/v1/benchmarks';
  const query = '?model=GLM-5&date=2026-09-04&powerValid=strictV2';
  const urls = [
    `https://example.com/api/v1/benchmarks${query}`,
    `http://inferencex.semianalysis.com/api/v1/benchmarks${query}`,
    `https://inferencex.semianalysis.com.evil.example/api/v1/benchmarks${query}`,
    `https://user:password@inferencex.semianalysis.com/api/v1/benchmarks${query}`,
    `https://inferencex.semianalysis.com/api/v1/server-log${query}`,
    `${base}${query}#fragment`,
    `${base}${query}&runId=123`,
    `${base}${query}&model=GLM-5`,
    `${base}${query}&powerValid=strictV2`,
    `${base}?model=GLM-5&date=2026-09-04`,
    `${base}?model=GLM-5&date=2026-09-04&powerValid=all`,
    `${base}?model=DeepSeek-V4-Pro&date=2026-09-04&powerValid=strictV2`,
    `${base}?model=GLM-5&date=2026-09-03&powerValid=strictV2`,
    `${base}?model=GLM-5&powerValid=strictV2`,
  ];
  for (const query_url of urls) {
    const result = run([], { metadata: strictMetadata({ query_url }) });
    assert.equal(result.status, 1, query_url);
    assert.deepEqual(result.requests, [], query_url);
    assert.equal(result.stdout, '');
  }
});
