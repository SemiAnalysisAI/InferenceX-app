import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { selectAgentxRows } from '../skills/inferencex-api/scripts/export-contract.mjs';
import { packageInfo, packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();
const retrievedAt = '2026-09-06T12:34:56.789Z';
const origin = 'https://inferencex.semianalysis.com/api/v1/';
const powerScope = { model: 'GLM-5', date: null, isl: 8192, osl: 1024, raw_model: null };
const agentScope = {
  display_model: 'DeepSeek-V4-Pro',
  date: '2026-09-04',
  date_selection: 'as-of',
  raw_model: null,
  hardware: 'b300',
  framework: null,
  precision: null,
  spec_method: null,
  offload_mode: null,
  concurrency: null,
  benchmark_type: 'agentic_traces',
};

// Same complete row contract as the online exporter fixtures, with CSV edge values.
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
    image: 'image,"quoted"\r\nnext',
    recipe_fingerprint: null,
    metrics: { zero: 0, flag: false, absent: null, text: 'a,"b"\nnext', nested: { x: 1 } },
    date: '2026-09-01',
    workflow_run_id: '900719925474099399999',
    run_started_at: null,
    run_url: null,
    curve_date: '2026-09-04',
    ...overrides,
  };
}

const powerRow = observation('900719925474099312345', {
  model: 'glm5',
  benchmark_type: 'single_turn',
  isl: 8192,
  osl: 1024,
  metrics: {
    power_valid: 1,
    power_metric_schema_version: 2,
    avg_power_w: 0,
    joules_per_output_token: 5.3,
    peak_temp_c: null,
    avg_util_pct: false,
  },
});
const powerBenchmarks = [
  powerRow,
  observation(3),
  { ...powerRow, id: 4, metrics: { power_valid: 1, power_metric_schema_version: 1 } },
  { ...powerRow, id: 5, model: 'glm5-extra' },
];
const agentBenchmarks = [
  observation(2),
  observation('1', { conc: 10 }),
  observation(2),
  observation('900719925474099312345'),
  observation('01'),
  observation(0),
  observation(3, { hardware: 'h200_sxm', conc: 2 }),
  powerRow,
];
const group = { mean: 2, p50: 0, p75: 3, p90: 4, p95: 5, p99: 6, n: 0 };
const bodies = {
  'agentic-aggregates': {
    1: { id: 1, isl: null, osl: group, kvCacheUtil: null, prefixCacheHitRate: group, extra: false },
    2: { id: 2, isl: group, osl: group, kvCacheUtil: group, prefixCacheHitRate: group },
  },
  'derived-agentic-metrics': { 2: { id: 2, p75_e2e_norm_intvty: 0, p90_e2e_norm_intvty: null } },
  'trace-availability': { 1: false },
};
const powerUrl = `${origin}benchmarks?model=GLM-5&powerValid=strictV2`;
const responseIdFor = (body) => createHash('sha256').update(JSON.stringify(body)).digest('hex');
const responseId = responseIdFor(powerBenchmarks);
const requestUrls = [
  {
    operation: 'benchmarks',
    url: `${origin}benchmarks?model=DeepSeek-V4-Pro&date=2026-09-04`,
    response_id: responseIdFor(agentBenchmarks),
  },
  ...Object.keys(bodies).map((operation) => ({
    operation,
    url: `${origin}${operation}?ids=2%2C1`,
    response_id: responseIdFor(bodies[operation]),
    requested_ids: ['2', '1'],
  })),
];
let installed;
let preload;

before(() => {
  installed = suite.install('codex');
  preload = join(suite.temporaryRoot, 'fixed-export-context.mjs');
  writeFileSync(
    preload,
    `import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(process.env.INFERENCEX_TEST_FIXTURE, 'utf8'));
const NativeDate = Date;
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [${JSON.stringify(retrievedAt)}])); }
  static now() { return new NativeDate(${JSON.stringify(retrievedAt)}).getTime(); }
};
globalThis.fetch = async input => {
  const operation = new URL(input.url ?? input).pathname.split('/').at(-1);
  if (!Object.hasOwn(fixture, operation)) throw new Error('Unexpected request ' + operation);
  return new Response(JSON.stringify(fixture[operation]));
};
`,
  );
});

function online(kind, format) {
  const cwd = suite.project();
  const fixture = join(cwd, 'fixture.json');
  const output = join(cwd, 'bundle');
  writeFileSync(
    fixture,
    JSON.stringify(
      kind === 'powerx'
        ? { benchmarks: powerBenchmarks }
        : { benchmarks: agentBenchmarks, ...bodies },
    ),
  );
  const args =
    kind === 'powerx'
      ? ['--model', 'GLM-5', '--isl', '8192', '--osl', '1024']
      : ['--model', 'DeepSeek-V4-Pro', '--date', '2026-09-04', '--hardware', 'b300'];
  succeeded(
    suite.node(
      [
        '--import',
        pathToFileURL(preload).href,
        join(installed, 'scripts/inferencex.mjs'),
        kind,
        'export',
        ...args,
        '--format',
        format,
        '--output-dir',
        output,
      ],
      { cwd, env: { ...suite.environment, INFERENCEX_TEST_FIXTURE: fixture } },
    ),
  );
  const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8'));
  return readFileSync(join(output, manifest.result.path));
}

function contract() {
  const path = join(installed, 'scripts/export-contract.mjs');
  assert.ok(existsSync(path), 'the packed skill installs the pure export contract');
  return import(pathToFileURL(path).href);
}

function agentInput(api, format = 'json', producerVersion = packageInfo.version) {
  const selection = api.selectAgentxRows(agentBenchmarks, agentScope);
  const enrichments = Object.fromEntries(
    [
      ['aggregates', 'agentic-aggregates'],
      ['derived', 'derived-agentic-metrics'],
      ['traces', 'trace-availability'],
    ].map(([name, operation]) => [
      name,
      api.validateAgentxChunk(operation, selection.ids, bodies[operation]),
    ]),
  );
  return {
    producerVersion,
    contractVersion: 1,
    format,
    scope: agentScope,
    selection,
    enrichments,
    requestUrls,
    retrievedAt,
  };
}

test('packed pure builders reconstruct the complete online bytes and metadata', async () => {
  const api = await contract();
  for (const format of ['json', 'csv']) {
    const power = api.buildPowerxExport({
      producerVersion: packageInfo.version,
      contractVersion: 1,
      format,
      benchmarks: powerBenchmarks,
      scope: powerScope,
      queryUrl: powerUrl,
      retrievedAt,
      responseId,
    });
    const agent = api.buildAgentxExport(agentInput(api, format));
    for (const [kind, built] of [
      ['powerx', power],
      ['agentx', agent],
    ]) {
      assert.ok(Buffer.isBuffer(built.outputBytes));
      assert.deepEqual(built.outputBytes, online(kind, format));
      assert.equal(built.metadata.package_version, packageInfo.version);
      if (format === 'json')
        assert.deepEqual(JSON.parse(built.outputBytes), {
          schema_version: 1,
          kind,
          metadata: built.metadata,
          ...(kind === 'powerx' ? { units: api.POWERX_UNITS } : {}),
          rows: built.rows,
        });
      else assert.ok(built.outputBytes.toString().endsWith('\r\n'));
    }
  }
});

test('AgentX retains duplicate rows, first-seen IDs and exact omitted enrichment states', async () => {
  const api = await contract();
  const input = agentInput(api);
  const originalMaps = structuredClone(input.enrichments);
  assert.deepEqual(input.selection.ids, [2, 1]);
  assert.deepEqual(
    input.selection.selected.map((row) => row.id),
    [2, '1', 2, '900719925474099312345', '01', 0],
  );
  const { rows, metadata } = api.buildAgentxExport(input);
  assert.deepEqual(rows[0].agentx.aggregates.value, {
    ...bodies['agentic-aggregates'][2],
    id: '2',
  });
  assert.equal(rows[1].agentx.aggregates.value.extra, false);
  assert.deepEqual(rows[0].agentx.trace_availability, {
    status: 'no_stored_trace',
    value: false,
    response_key_present: false,
  });
  assert.deepEqual(rows[1].agentx.trace_availability, {
    status: 'no_stored_trace',
    value: false,
    response_key_present: true,
  });
  assert.deepEqual(rows[1].agentx.derived_metrics, { status: 'not_returned', value: null });
  assert.equal(rows[3].agentx.status, 'unsupported_id');
  assert.deepEqual(metadata.available_filter_values.concurrency, [1, 10, 2]);
  assert.equal(metadata.enrichment_coverage.safe_id_rows, 3);
  assert.equal(metadata.enrichment_coverage.unique_safe_ids, 2);
  assert.deepEqual(input.enrichments, originalMaps);
  assert.deepEqual(
    api.buildAgentxExport({
      ...input,
      scope: Object.fromEntries(Object.entries(agentScope).toReversed()),
    }).outputBytes,
    api.buildAgentxExport(input).outputBytes,
  );
  assert.equal(api.selectAgentxRows([powerRow], agentScope).outcome, 'no_agentx_rows');
  assert.equal(
    api.selectAgentxRows(agentBenchmarks, { ...agentScope, hardware: 'absent' }).outcome,
    'no_matching_rows',
  );
});

test('AgentX public filters are exact, case-sensitive, independent, and composable', () => {
  const selected = observation('1');
  const filters = [
    ['raw_model', 'model', 'dsv4', 'DSV4'],
    ['hardware', 'hardware', 'b300', 'B300'],
    ['framework', 'framework', 'sglang', 'SGLANG'],
    ['precision', 'precision', 'fp4', 'FP4'],
    ['spec_method', 'spec_method', 'mtp', 'MTP'],
    ['offload_mode', 'offload_mode', 'off', 'OFF'],
    ['concurrency', 'conc', 1, 2],
  ];
  const scope = {
    ...agentScope,
    ...Object.fromEntries(filters.map(([name, _field, value]) => [name, value])),
  };
  const decoys = filters.map(([_name, field, _value, decoy], index) =>
    observation(String(index + 2), { [field]: decoy }),
  );
  const combined = selectAgentxRows([selected, ...decoys], scope);
  assert.deepEqual(
    combined.selected.map((row) => row.id),
    ['1'],
  );
  assert.deepEqual(combined.ids, [1]);
  assert.equal(combined.outcome, 'selected_rows');

  for (const [name, field, value, decoy] of filters) {
    const oneFilterScope = {
      ...agentScope,
      [name]: value,
      hardware: name === 'hardware' ? value : null,
    };
    const result = selectAgentxRows(
      [selected, observation('2', { [field]: decoy })],
      oneFilterScope,
    );
    assert.deepEqual(
      result.selected.map((row) => row.id),
      ['1'],
      name,
    );
  }
});

test('distinct row validators check unselected rows and chunk validation stays strict', async () => {
  const api = await contract();
  const powerInput = {
    producerVersion: packageInfo.version,
    contractVersion: 1,
    format: 'json',
    scope: powerScope,
    queryUrl: powerUrl,
    retrievedAt,
    responseId,
  };
  const withoutRecipe = { ...powerRow };
  delete withoutRecipe.recipe_fingerprint;
  assert.equal(
    api.buildPowerxExport({ ...powerInput, benchmarks: [withoutRecipe] }).rows.length,
    1,
  );
  assert.throws(() => api.selectAgentxRows([withoutRecipe], agentScope), {
    code: 'INVALID_RESPONSE',
  });
  assert.equal(api.selectAgentxRows([observation('')], agentScope).selected.length, 1);
  assert.throws(
    () => api.buildPowerxExport({ ...powerInput, benchmarks: [{ ...powerRow, id: '' }] }),
    { code: 'INVALID_RESPONSE' },
  );
  assert.throws(
    () => api.selectAgentxRows([...agentBenchmarks, { ...powerRow, metrics: null }], agentScope),
    { code: 'INVALID_RESPONSE' },
  );
  assert.throws(
    () =>
      api.buildPowerxExport({
        ...powerInput,
        benchmarks: [...powerBenchmarks, { ...observation(3), metrics: null }],
      }),
    { code: 'INVALID_RESPONSE' },
  );
  for (const [operation, body] of [
    ['trace-availability', { 3: true }],
    ['trace-availability', { '01': false }],
    ['trace-availability', { 1: null }],
    ['agentic-aggregates', { 1: { ...bodies['agentic-aggregates'][1], id: '1' } }],
    [
      'derived-agentic-metrics',
      { 1: { id: 1, p75_e2e_norm_intvty: Infinity, p90_e2e_norm_intvty: null } },
    ],
  ])
    assert.throws(() => api.validateAgentxChunk(operation, [1, 2], body), {
      code: 'INVALID_RESPONSE',
    });
  assert.deepEqual([...api.validateAgentxChunk('trace-availability', [1, 2], {})], []);
});

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

test('builders are deterministic without clocks or input mutation and sanitize selected nonfinite values', async () => {
  const api = await contract();
  const benchmarks = freeze([
    observation(1, {
      metrics: {
        zero: 0,
        flag: false,
        missing: null,
        overflow: Infinity,
        nested: { overflow: -Infinity },
      },
    }),
  ]);
  const scope = freeze({ ...agentScope });
  const selection = api.selectAgentxRows(benchmarks, scope);
  const input = freeze({
    producerVersion: packageInfo.version,
    contractVersion: 1,
    format: 'json',
    scope,
    selection,
    enrichments: { aggregates: new Map(), derived: new Map(), traces: new Map() },
    requestUrls: requestUrls.slice(0, 1),
    retrievedAt,
  });
  const OriginalDate = Date;
  try {
    globalThis.Date = class extends OriginalDate {
      constructor(...args) {
        assert.ok(args.length, 'builders must not read the clock');
        super(...args);
      }
      static now() {
        assert.fail('builders must not read the clock');
      }
    };
    const first = api.buildAgentxExport(input);
    assert.deepEqual(api.buildAgentxExport(input).outputBytes, first.outputBytes);
    assert.equal(first.metadata.non_finite_values, 2);
    assert.deepEqual(first.rows[0].benchmark.metrics, {
      zero: 0,
      flag: false,
      missing: null,
      overflow: null,
      nested: { overflow: null },
    });
    assert.equal(benchmarks[0].metrics.overflow, Infinity);
    const power = api.buildPowerxExport({
      producerVersion: packageInfo.version,
      contractVersion: 1,
      format: 'json',
      benchmarks: freeze([{ ...powerRow, metrics: { ...powerRow.metrics, other: Infinity } }]),
      scope: freeze(powerScope),
      queryUrl: powerUrl,
      retrievedAt,
      responseId,
    });
    assert.equal(power.metadata.non_finite_values, 1);
    assert.equal(power.rows[0].metrics.other, null);
  } finally {
    globalThis.Date = OriginalDate;
  }
});
