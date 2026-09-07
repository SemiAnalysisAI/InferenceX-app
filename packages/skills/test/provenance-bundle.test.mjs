import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as provenance from '../skills/inferencex-api/scripts/investigate-result.mjs';
import { bundleSuite } from './bundle-harness.mjs';
import { provenanceBundleFixtures, provenanceFixture } from './provenance-bundle-fixtures.mjs';

const bundles = bundleSuite(provenanceBundleFixtures());
const collectArgs = ['--id', '421', '--model', 'DeepSeek-R1-0528', '--date', '2026-08-09'];

function collectFrom(sequence, args = collectArgs) {
  const requests = [];
  const promise = provenance.collect(provenance.normalizeArgs(args), {
    producerVersion: '1.0.0',
    generatedAt: '2026-09-07T00:00:00.000Z',
    get(spec) {
      const expected = sequence[requests.length];
      assert.ok(expected, `unexpected request: ${spec.operation}`);
      assert.equal(spec.operation, expected.operation);
      requests.push(spec);
      const bytes = Buffer.from(JSON.stringify(expected.body));
      return Promise.resolve({
        id: createHash('sha256').update(bytes).digest('hex'),
        status: expected.status ?? 200,
        retrievedAt: '2026-09-07T00:00:00.000Z',
        bytes,
        body: expected.body,
      });
    },
  });
  return { promise, requests };
}

async function rejectsAfter(label, sequence, requestCount, args = collectArgs) {
  const execution = collectFrom(sequence, args);
  await assert.rejects(execution.promise, { code: 'INVALID_RESPONSE' }, label);
  assert.equal(execution.requests.length, requestCount, label);
}

test('provenance replay preserves the exact result and its producing attempt separately from the curve', () => {
  const saved = bundles.create('result', 'producer-differs-from-curve');
  const report = bundles.readResult(saved.directory);
  assert.equal(report.selected_result.id, '421');
  assert.equal(report.selected_result.workflow_run_id, '17');
  assert.equal(report.selected_result.curve_workflow_run_id, '25');
  assert.equal(report.producer.github_run_id, '123456789');
  assert.equal(report.producer.run_attempt, '2');
  assert.equal(report.producer.workflow_run.github_run_id, '123456789');
  assert.equal(report.selected_result.date, '2026-08-08');
  assert.equal(report.selected_result.curve_date, '2026-08-09');
  assert.equal(report.selected_result.image, 'vllm:sha-123');
  assert.equal(report.log.text, 'INFO ready\n');
  assert.equal(report.evidence.length, 3);
  assert.ok(
    report.evidence.every(
      (entry) => /^[a-f0-9]{64}$/u.test(entry.response_id) && !Object.hasOwn(entry, 'body'),
    ),
  );
  const before = bundles.fingerprint(saved.directory);
  const verified = bundles.verify(saved.directory);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).validity, 'valid');
  assert.deepEqual(bundles.fingerprint(saved.directory), before);
});

test('exact logical run scope retains the selected row older producing identity', async () => {
  const { row, workflow, log } = provenanceFixture();
  const execution = collectFrom(
    [
      { operation: 'benchmarks', body: [row] },
      { operation: 'workflow-info', body: workflow },
      { operation: 'server-log', body: log },
    ],
    ['--id', '421', '--model', 'DeepSeek-R1-0528', '--run-id', '222222222'],
  );
  const collected = await execution.promise;
  const report = JSON.parse(collected.bytes);
  assert.equal(
    execution.requests[0].url,
    'https://inferencex.semianalysis.com/api/v1/benchmarks?model=DeepSeek-R1-0528&runId=222222222&exactRun=true',
  );
  assert.deepEqual(report.metadata.scope, {
    display_model: 'DeepSeek-R1-0528',
    date: null,
    github_run_id: '222222222',
    selection: 'logical_run_snapshot',
  });
  assert.equal(report.selected_result.id, '421');
  assert.equal(report.selected_result.workflow_run_id, '17');
  assert.equal(report.producer.github_run_id, '123456789');
  assert.equal(report.producer.run_attempt, '2');
  assert.equal(execution.requests.length, 3);
});

test('a documented log 404 remains complete evidence with limited coverage', () => {
  const saved = bundles.create('result', 'missing-log');
  const report = bundles.readResult(saved.directory);
  assert.equal(report.log.status, 'not_found');
  assert.equal(report.log.text, null);
  const manifest = JSON.parse(readFileSync(join(saved.directory, 'manifest.json')));
  assert.equal(manifest.requests[2].response.status, 404);
  const verified = bundles.verify(saved.directory, ['--require-hardware', 'h200_sxm']);
  assert.equal(verified.status, 0, verified.stderr);
  const summary = JSON.parse(verified.stdout);
  assert.equal(summary.validity, 'valid');
  assert.equal(summary.coverage.status, 'partial');
  assert.equal(summary.policy.status, 'passed');
});

test('missing optional provenance stays missing without guessing a producer', () => {
  const saved = bundles.create('result', 'missing-optional-provenance');
  const report = bundles.readResult(saved.directory);
  assert.equal(report.selected_result.run_url, null);
  assert.equal(Object.hasOwn(report.selected_result, 'workflow_run_id'), false);
  assert.equal(report.producer.status, 'unresolved');
  assert.equal(report.producer.workflow_run, null);
  assert.equal(report.evidence.length, 2);
});

test('substituting a curve producer cannot be hidden by updating the result hash', () => {
  const saved = bundles.create('result', 'producer-differs-from-curve');
  const path = join(saved.directory, 'result.json');
  const report = bundles.readResult(saved.directory);
  report.producer.github_run_id = '987654321';
  const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path, bytes);
  const manifestPath = join(saved.directory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath));
  manifest.result.sha256 = createHash('sha256').update(bytes).digest('hex');
  manifest.result.size = bytes.length;
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const before = bundles.fingerprint(saved.directory);
  const verified = bundles.verify(saved.directory);
  assert.equal(verified.status, 1);
  assert.equal(JSON.parse(verified.stderr).error.code, 'INVALID_EVIDENCE');
  assert.deepEqual(bundles.fingerprint(saved.directory), before);
});

test('provenance argument errors reject unsupported IDs and log scopes before collection', () => {
  assert.equal(typeof provenance.normalizeArgs, 'function');
  const args = ['--id', '421', '--model', 'DeepSeek-R1-0528'];
  const options = provenance.normalizeArgs(args);
  assert.equal(options.id, '421');
  assert.deepEqual(provenance.normalizeArgs(options), options);
  for (const extra of [
    ['--date', '2026-02-30'],
    ['--log-limit', '262145'],
    ['--id', '422'],
    ['--date', '2026-08-09', '--run-id', '123'],
    ['--id', '900719925474099312345'],
  ])
    assert.throws(() => provenance.normalizeArgs([...args, ...extra]), {
      code: 'INVALID_ARGUMENT',
    });
});

test('malformed optional provenance fails before producer or log enrichment', async () => {
  const row = provenanceFixture().row;
  for (const [label, malformed] of [
    ['producer timestamp', { run_started_at: '2026-02-30T00:00:00Z' }],
    ['curve workflow ID', { curve_workflow_run_id: false }],
    ['recipe fingerprint', { recipe_fingerprint: 7 }],
  ]) {
    await rejectsAfter(label, [{ operation: 'benchmarks', body: [{ ...row, ...malformed }] }], 1);
  }
});

test('selection and temporal contradictions stop before producer enrichment', async () => {
  const { row } = provenanceFixture();
  const cases = [
    ['missing selected result', []],
    ['duplicate selected result', [row, row]],
    ['result after requested scope', [{ ...row, date: '2026-08-10' }]],
    ['curve after requested scope', [{ ...row, curve_date: '2026-08-10' }]],
    ['curve before its producer', [{ ...row, curve_date: '2026-08-07' }]],
  ];
  for (const [label, body] of cases) {
    await rejectsAfter(label, [{ operation: 'benchmarks', body }], 1);
  }
});

test('workflow identity and producer timestamps cannot corroborate another attempt', async () => {
  const { row, run, config, workflow } = provenanceFixture();
  const timestampedRow = { ...row, run_started_at: '2026-08-08T03:00:00.100Z' };
  const cases = [
    ['attempt', row, { ...workflow, runs: [{ ...run, run_attempt: 3 }] }],
    ['producer date', row, { ...workflow, runs: [{ ...run, date: '2026-08-09' }] }],
    [
      'producer URL',
      row,
      {
        ...workflow,
        runs: [
          {
            ...run,
            html_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/999',
          },
        ],
      },
    ],
    [
      'producer config timestamp',
      timestampedRow,
      {
        ...workflow,
        runConfigs: [{ ...config, run_started_at: '2026-08-08T03:00:02Z' }],
      },
    ],
  ];
  for (const [label, selectedRow, metadata] of cases) {
    await rejectsAfter(
      label,
      [
        { operation: 'benchmarks', body: [selectedRow] },
        { operation: 'workflow-info', body: metadata },
      ],
      2,
    );
  }
});

test('foreign log identities and character ranges fail after the requested window', async () => {
  const { row, workflow, log } = provenanceFixture();
  const cases = [
    ['result ID', { ...log, id: 422 }, collectArgs],
    ['file name', { ...log, fileName: 'worker.log' }, [...collectArgs, '--log-file', 'server.log']],
    ['offset', { ...log, offset: 1 }, collectArgs],
    ['continuation offset', { ...log, nextOffset: 999 }, collectArgs],
  ];
  for (const [label, badLog, args] of cases) {
    await rejectsAfter(
      label,
      [
        { operation: 'benchmarks', body: [row] },
        { operation: 'workflow-info', body: workflow },
        { operation: 'server-log', body: badLog },
      ],
      3,
      args,
    );
  }
});
