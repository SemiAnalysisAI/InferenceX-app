import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import * as powerx from '../skills/inferencex-api/scripts/export-powerx.mjs';
import { observation } from './bundle-fixtures.mjs';

const args = ['--model', 'GLM-5', '--isl', '8192', '--osl', '1024'];
const retrievedAt = '2026-09-04T12:00:00.000Z';

async function collect(rows, extra = []) {
  const bytes = Buffer.from(JSON.stringify(rows));
  const id = createHash('sha256').update(bytes).digest('hex');
  const requests = [];
  const built = await powerx.collect(powerx.normalizeArgs([...args, ...extra]), {
    producerVersion: '1.0.0',
    generatedAt: retrievedAt,
    get: (spec) => {
      requests.push(spec);
      return Promise.resolve({ id, status: 200, retrievedAt, bytes, body: rows });
    },
  });
  return { built, requests, id };
}

test('PowerX collector keeps measurement dates, exact IDs, units and saved source references', async () => {
  assert.equal(typeof powerx.collect, 'function');
  const { built, requests, id } = await collect([observation({ workflow_run_id: 42 })]);
  const document = JSON.parse(built.bytes);
  assert.equal(built.format, 'json');
  assert.deepEqual(requests, [
    {
      operation: 'benchmarks',
      url: 'https://inferencex.semianalysis.com/api/v1/benchmarks?model=GLM-5&powerValid=strictV2',
      allowedStatuses: [200],
    },
  ]);
  assert.equal(document.rows[0].id, '900719925474099312345');
  assert.equal(document.rows[0].workflow_run_id, '42');
  assert.equal(document.rows[0].date, '2026-09-01');
  assert.equal(document.rows[0].curve_date, '2026-09-04');
  assert.equal(document.metadata.source_response_id, id);
  assert.equal(document.metadata.retrieved_at, retrievedAt);
  assert.equal(document.units.avg_power_w, 'measured W per GPU');
  assert.equal(document.units.joules_per_successful_query, 'whole-deployment accelerator J/query');
  assert.deepEqual(built.coverage, {
    status: 'complete',
    selected_records: 1,
    comparable_pairs: null,
    hardware: [{ hardware: 'h200_sxm', valid_records: 1 }],
    reasons: [],
  });
});

test('PowerX normalizes replay options and rejects bad arguments before collection', () => {
  assert.equal(typeof powerx.normalizeArgs, 'function');
  const options = powerx.normalizeArgs(args);
  assert.deepEqual(options, {
    model: 'GLM-5',
    date: null,
    isl: 8192,
    osl: 1024,
    raw_model: null,
    format: 'json',
  });
  assert.deepEqual(powerx.normalizeArgs(options), options);
  for (const bad of [
    [...args, '--date', '2026-02-30'],
    [...args, '--isl', '0'],
    [...args, '--model', 'GLM-5'],
    [...args, '--output', 'old.json'],
    { ...options, unexpected: true },
    { ...options, isl: '8192' },
  ])
    assert.throws(() => powerx.normalizeArgs(bad), { code: 'INVALID_ARGUMENT' });
});

test('PowerX strict coverage excludes invalid measurements without silently counting hardware', async () => {
  const invalid = observation({
    hardware: 'b200',
    metrics: { power_valid: 0, power_metric_schema_version: 2 },
  });
  const { built: partial } = await collect([observation(), invalid]);
  assert.equal(partial.coverage.status, 'partial');
  assert.deepEqual(partial.coverage.hardware, [{ hardware: 'h200_sxm', valid_records: 1 }]);
  assert.deepEqual(partial.coverage.reasons, [{ code: 'not_strict_v2', count: 1 }]);
  const { built: empty } = await collect([invalid]);
  assert.equal(empty.coverage.status, 'empty');
  assert.equal(empty.coverage.selected_records, 0);
  const { built: csvResult } = await collect([], ['--format', 'csv']);
  const csv = csvResult.bytes.toString();
  assert.ok(
    csv.startsWith(
      'package_version,query_url,retrieved_at,requested_model,requested_date,date_selection,raw_model,source_response_id,id,',
    ),
  );
  assert.equal(csv.split('\r\n').length, 2);
});

test('PowerX strict markers and workload selection are exact without coercion', async () => {
  const invalidMarkers = [
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
    observation({ id: 'selected' }),
    ...invalidMarkers.map((markers, index) =>
      observation({
        id: `invalid-marker-${index}`,
        metrics: { ...observation().metrics, ...markers },
      }),
    ),
    observation({ id: 'agentic', benchmark_type: 'agentic_traces' }),
    observation({ id: 'wrong-isl', isl: 1024 }),
    observation({ id: 'wrong-osl', osl: 8192 }),
  ];
  const { built } = await collect(rows);
  const document = JSON.parse(built.bytes);
  assert.deepEqual(
    document.rows.map((row) => row.id),
    ['selected'],
  );
  assert.deepEqual(document.metadata.excluded_rows, {
    outside_requested_scope: 3,
    not_strict_v2: invalidMarkers.length,
  });
});

test('PowerX raw-model selection is exact and retains its complete response scope', async () => {
  const rows = [
    observation({ id: 'glm5-row' }),
    observation({ id: 'glm5.1-row', model: 'glm5.1' }),
  ];
  const { built, requests } = await collect(rows, ['--raw-model', 'glm5.1']);
  const document = JSON.parse(built.bytes);
  assert.deepEqual(
    document.rows.map((row) => row.id),
    ['glm5.1-row'],
  );
  assert.equal(document.metadata.raw_model, 'glm5.1');
  assert.equal(document.metadata.returned_rows, 2);
  assert.equal(document.metadata.selected_rows, 1);
  assert.deepEqual(document.metadata.returned_models, ['glm5', 'glm5.1']);
  assert.deepEqual(document.metadata.selected_models, ['glm5.1']);
  assert.deepEqual(document.metadata.excluded_rows, {
    outside_requested_scope: 1,
    not_strict_v2: 0,
  });
  assert.equal(requests.length, 1);
});

test('PowerX validates complete rows before filtering by workload or raw model', async () => {
  const malformed = [
    ['unsafe numeric id', 'id', Number.MAX_SAFE_INTEGER + 1],
    ['string input length', 'isl', '8192'],
    ['string output length', 'osl', '1024'],
    ['impossible date', 'date', '2026-02-30'],
    ['object workflow ID', 'workflow_run_id', { id: '42' }],
    ['unsafe curve workflow ID', 'curve_workflow_run_id', Number.MAX_SAFE_INTEGER + 1],
    ['object producer timestamp', 'run_started_at', {}],
    ['boolean curve timestamp', 'curve_run_started_at', false],
    ['impossible curve date', 'curve_date', '2026-02-30'],
  ];
  for (const [label, field, value] of malformed) {
    await assert.rejects(
      collect(
        [
          observation({
            id: `outside-scope-${field}`,
            model: 'other-model',
            benchmark_type: 'agentic_traces',
            isl: 1,
            osl: 1,
            [field]: value,
          }),
        ],
        ['--raw-model', 'glm5.1'],
      ),
      { code: 'INVALID_RESPONSE' },
      label,
    );
  }
});

test('PowerX validates malformed rows even outside the selected workload', async () => {
  assert.equal(typeof powerx.collect, 'function');
  await assert.rejects(collect([observation(), { isl: 1, osl: 1 }]), { code: 'INVALID_RESPONSE' });
});

test('strict markers without any measured power or energy do not satisfy hardware coverage', async () => {
  const { built } = await collect([
    observation({
      metrics: {
        power_valid: 1,
        power_metric_schema_version: 2,
        avg_temp_c: 40,
      },
    }),
  ]);
  assert.equal(built.coverage.status, 'partial');
  assert.equal(built.coverage.selected_records, 1);
  assert.deepEqual(built.coverage.hardware, [{ hardware: 'h200_sxm', valid_records: 0 }]);
  assert.deepEqual(built.coverage.reasons, [{ code: 'measurement_unavailable', count: 1 }]);
});
