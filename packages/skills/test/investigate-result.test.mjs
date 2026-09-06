import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { packedSkillSuite } from './packed-skill.mjs';

const suite = packedSkillSuite();
const base = 'https://inferencex.semianalysis.com';
const preload = join(suite.temporaryRoot, 'provenance-http.mjs');
const scripts = new Map();
const json = (body, status = 200) => ({ body: JSON.stringify(body), status });
const benchmarkPath = '/api/v1/benchmarks?model=DeepSeek-R1-0528&date=2026-08-09';
const workflowPath = '/api/v1/workflow-info?date=2026-08-08';
const logPath = '/api/v1/server-log?id=421&offset=0&limit=16384';
const row = {
  id: '421',
  hardware: 'h200_sxm',
  framework: 'vllm',
  model: 'dsr1',
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
  isl: 1024,
  osl: 1024,
  conc: 32,
  offload_mode: 'off',
  image: 'vllm:sha-123',
  recipe_fingerprint: null,
  metrics: { tput_per_gpu: 128.4, error_rate: 0 },
  date: '2026-08-08',
  workflow_run_id: 17,
  run_started_at: null,
  run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123456789/attempts/2',
  curve_date: '2026-08-09',
  curve_workflow_run_id: 25,
  curve_run_started_at: '2026-08-09T03:00:00Z',
};
const run = {
  github_run_id: 123456789,
  name: 'Benchmark',
  conclusion: 'success',
  run_attempt: 2,
  html_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123456789',
  created_at: '2026-08-08T03:00:00Z',
  date: '2026-08-08',
};
const config = {
  github_run_id: 123456789,
  run_started_at: null,
  html_url: run.html_url,
  head_sha: 'abc123',
  model: 'dsr1',
  hardware: 'h200_sxm',
  framework: 'vllm',
  precision: 'fp8',
  spec_method: 'none',
  disagg: false,
};
const workflow = { runs: [run], changelogs: [], configs: [], runConfigs: [config] };
const log = {
  id: 421,
  fileName: 'server.log',
  serverLog: 'INFO ready\n',
  offset: 0,
  nextOffset: null,
};
const responses = {
  [benchmarkPath]: json([row]),
  [workflowPath]: json(workflow),
  [logPath]: json(log),
};

before(() => {
  for (const target of ['codex', 'claude']) {
    scripts.set(target, join(suite.install(target), 'scripts/investigate-result.mjs'));
  }
  writeFileSync(
    preload,
    `
import { appendFileSync, readFileSync } from 'node:fs';
const fixtures = JSON.parse(readFileSync(process.env.INFERENCEX_PROVENANCE_FIXTURES, 'utf8'));
globalThis.fetch = async (input, options) => {
  const url = String(input.url ?? input);
  appendFileSync(process.env.INFERENCEX_PROVENANCE_REQUESTS, JSON.stringify(url) + '\\n');
  if (options?.redirect !== 'error') throw new Error('Redirects must be rejected');
  if (!(options?.signal instanceof AbortSignal)) throw new Error('A timeout signal is required');
  const fixture = fixtures[url];
  if (!fixture) throw new Error('Unexpected request: ' + url);
  if (fixture.error) throw new Error(fixture.error);
  let body = fixture.body;
  if (fixture.oversized) {
    let count = 0;
    body = new ReadableStream({ pull(controller) {
      if (count++ > 17) throw new Error('Body limit was not enforced');
      controller.enqueue(new Uint8Array(1024 * 1024));
    } });
  }
  const response = new Response(body, { status: fixture.status ?? 200 });
  if (fixture.url) Object.defineProperty(response, 'url', { value: fixture.url });
  return response;
};
`,
  );
});

function collect(fixtures = responses, { target = 'codex', args, output } = {}) {
  const project = suite.project('provenance-');
  const fixturePath = join(project, 'responses.json');
  const requestsPath = join(project, 'requests.jsonl');
  const outputPath = join(project, 'report.json');
  if (output !== undefined) writeFileSync(outputPath, output);
  writeFileSync(
    fixturePath,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(fixtures).map(([path, value]) => [`${base}${path}`, value]),
      ),
    ),
  );
  const result = suite.node(
    [
      '--import',
      pathToFileURL(preload).href,
      scripts.get(target),
      ...(args ?? ['--id', '421', '--model', 'DeepSeek-R1-0528', '--date', '2026-08-09']),
      ...(output === undefined ? [] : ['--output', outputPath]),
    ],
    {
      cwd: project,
      env: {
        ...suite.environment,
        INFERENCEX_PROVENANCE_FIXTURES: fixturePath,
        INFERENCEX_PROVENANCE_REQUESTS: requestsPath,
      },
    },
  );
  const requests = existsSync(requestsPath)
    ? readFileSync(requestsPath, 'utf8').trim().split('\n').map(JSON.parse)
    : [];
  return { ...result, requests, outputPath, project };
}

test('packed collector preserves the selected producer row independently of its later curve snapshot', () => {
  const result = collect();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.selected_result, row);
  assert.equal(report.producer.github_run_id, '123456789');
  assert.equal(report.producer.run_attempt, '2');
  assert.deepEqual(report.producer.workflow_run, run);
  assert.deepEqual(report.producer.run_configs, [config]);
  assert.deepEqual(report.log.response, log);
  assert.equal(report.metadata.ran_new_benchmark, false);
  assert.deepEqual(
    result.requests,
    [benchmarkPath, workflowPath, logPath].map((path) => `${base}${path}`),
  );
  assert.deepEqual(
    report.evidence.map((item) => item.url),
    result.requests,
  );
  for (const item of report.evidence) {
    assert.ok(Number.isFinite(Date.parse(item.retrieved_at)));
    assert.equal(
      item.decoded_body_sha256,
      createHash('sha256').update(item.body_utf8).digest('hex'),
    );
  }
  assert.equal(report.evidence[0].body_utf8, responses[benchmarkPath].body);
});

test('exactRun scopes a logical snapshot while its selected point retains its older producing run', () => {
  const path = '/api/v1/benchmarks?model=DeepSeek-R1-0528&runId=222222222&exactRun=true';
  const result = collect(
    { ...responses, [path]: responses[benchmarkPath] },
    {
      target: 'claude',
      args: ['--id', '421', '--model', 'DeepSeek-R1-0528', '--run-id', '222222222'],
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.metadata.scope.github_run_id, '222222222');
  assert.equal(report.metadata.scope.selection, 'logical_run_snapshot');
  assert.equal(report.producer.github_run_id, '123456789');
  assert.deepEqual(report.selected_result, row);
  assert.equal(result.requests[0], `${base}${path}`);
});

test('missing optional provenance stays missing and a null run URL never guesses a producer from same-day configs', () => {
  const sparse = { ...row, run_url: null, image: null };
  for (const key of [
    'workflow_run_id',
    'run_started_at',
    'curve_date',
    'curve_workflow_run_id',
    'curve_run_started_at',
    'recipe_fingerprint',
  ])
    delete sparse[key];
  const result = collect({ ...responses, [benchmarkPath]: json([sparse]) });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.selected_result, sparse);
  assert.equal(report.producer.status, 'unresolved');
  assert.equal(report.producer.workflow_run, null);
  assert.ok(report.limitations.some((item) => item.includes('run_url')));
  assert.deepEqual(
    result.requests,
    [benchmarkPath, logPath].map((path) => `${base}${path}`),
  );
});

test('a producing run absent from workflow-info remains explicitly unconfirmed', () => {
  const result = collect({
    ...responses,
    [workflowPath]: json({ ...workflow, runs: [], runConfigs: [] }),
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.producer.status, 'row_only');
  assert.equal(report.producer.github_run_id, '123456789');
  assert.equal(report.producer.workflow_run, null);
});

test('bad selected IDs and ambiguous query scopes fail before HTTP', () => {
  for (const id of ['0', '-1', '0421', '1.5', '9007199254740992', '421,422', '']) {
    const result = collect({}, { args: [`--id=${id}`, '--model', 'DeepSeek-R1-0528'] });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--id must be a canonical positive safe integer/u);
    assert.deepEqual(result.requests, []);
  }
  for (const [args, error] of [
    [['--id', '421'], /--model/u],
    [['--id', '421', '--model', 'x', '--date', '2026-02-30'], /--date/u],
    [['--id', '421', '--model', 'x', '--date', '2026-08-08', '--run-id', '1'], /cannot combine/u],
    [['--id', '421', '--model', 'x', '--run-id', '0'], /--run-id/u],
    [['--id', '421', '--model', 'x', '--log-limit', '262145'], /--log-limit/u],
    [['--id', '421', '--model', 'x', '--log-offset', '-1'], /--log-offset/u],
    [['--id', '421', '--model', 'x', '--log-file', ''], /--log-file/u],
  ]) {
    const result = collect({}, { args });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, error);
    assert.deepEqual(result.requests, []);
  }
});

test('missing or duplicated selected results fail without fetching another point or clobbering output', () => {
  for (const rows of [[], [{ ...row, id: 422 }], [row, row]]) {
    const result = collect({ ...responses, [benchmarkPath]: json(rows) }, { output: 'keep me\n' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Expected exactly one result with ID 421/u);
    assert.equal(readFileSync(result.outputPath, 'utf8'), 'keep me\n');
    assert.deepEqual(result.requests, [`${base}${benchmarkPath}`]);
  }
});

test('malformed benchmark identities and provenance fail before enrichment', () => {
  const missingId = { ...row };
  delete missingId.id;
  for (const bad of [
    missingId,
    { ...row, id: 9007199254740992 },
    { ...row, image: false },
    { ...row, date: '2026-02-30' },
    { ...row, workflow_run_id: 9007199254740992 },
    { ...row, curve_date: '2026-02-30' },
    { ...row, run_url: 'https://example.com/actions/runs/123' },
    {
      ...row,
      run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/0421/attempts/2',
    },
  ]) {
    const result = collect({ ...responses, [benchmarkPath]: json([bad]) });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid benchmark row|Invalid producer run_url/u);
    assert.deepEqual(result.requests, [`${base}${benchmarkPath}`]);
  }
});

test('workflow metadata cannot silently substitute another attempt or contradict the producer date', () => {
  for (const bad of [
    { ...run, run_attempt: 3 },
    { ...run, date: '2026-08-09' },
    { ...run, html_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/999' },
  ]) {
    const result = collect({ ...responses, [workflowPath]: json({ ...workflow, runs: [bad] }) });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Producer identity mismatch/u);
    assert.equal(result.requests.length, 2);
  }
});

test('the collector reads one requested log window and marks uninspected characters explicitly', () => {
  const path = '/api/v1/server-log?id=421&offset=100&limit=4&file=workers%2Fdecode.log';
  const chunk = {
    id: '421',
    fileName: 'workers/decode.log',
    serverLog: '😀abc',
    offset: 100,
    nextOffset: 104,
  };
  const result = collect(
    { ...responses, [path]: json(chunk) },
    {
      args: [
        '--id',
        '421',
        '--model',
        'DeepSeek-R1-0528',
        '--date',
        '2026-08-09',
        '--log-file',
        'workers/decode.log',
        '--log-offset',
        '100',
        '--log-limit',
        '4',
      ],
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.log.response, chunk);
  assert.equal(report.log.partial, true);
  assert.equal(report.log.more_available, true);
  assert.equal(report.log.inspected_characters, 4);
  assert.equal(result.requests.length, 3);
});

test('missing stored logs are evidence-bearing unavailable results rather than fabricated empty logs', () => {
  const result = collect({ ...responses, [logPath]: json({ error: 'Not found' }, 404) });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.log.status, 'not_found');
  assert.equal(report.log.response, null);
  assert.equal(report.evidence.at(-1).http_status, 404);
});

test('wrong log IDs, files, offsets, and continuation offsets fail instead of attaching foreign evidence', () => {
  for (const chunk of [
    { ...log, id: 422 },
    { ...log, offset: 1 },
    { ...log, nextOffset: 0 },
    { ...log, nextOffset: 999 },
    { ...log, serverLog: null },
  ]) {
    const result = collect({ ...responses, [logPath]: json(chunk) }, { output: 'original' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid server-log response/u);
    assert.equal(readFileSync(result.outputPath, 'utf8'), 'original');
  }
  const path = '/api/v1/server-log?id=421&offset=0&limit=16384&file=worker.log';
  const result = collect(
    { ...responses, [path]: json(log) },
    {
      args: [
        '--id',
        '421',
        '--model',
        'DeepSeek-R1-0528',
        '--date',
        '2026-08-09',
        '--log-file',
        'worker.log',
      ],
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid server-log response/u);
});

test('HTTP, redirect, stream budget, and late log failures leave existing output intact', () => {
  for (const [path, fixture, error] of [
    [benchmarkPath, json({}, 302), /HTTP 302/u],
    [
      benchmarkPath,
      { ...responses[benchmarkPath], url: 'https://example.com/api/v1/benchmarks' },
      /Unexpected response URL/u,
    ],
    [benchmarkPath, { body: '{' }, /Invalid JSON/u],
    [benchmarkPath, { oversized: true }, /response byte budget/u],
    [logPath, json({ error: 'broken' }, 500), /HTTP 500/u],
    [logPath, { error: 'timeout' }, /timeout/u],
  ]) {
    const result = collect({ ...responses, [path]: fixture }, { output: 'original' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, error);
    assert.equal(result.stdout, '');
    assert.equal(readFileSync(result.outputPath, 'utf8'), 'original');
    assert.deepEqual(readdirSync(result.project).sort(), [
      'report.json',
      'requests.jsonl',
      'responses.json',
    ]);
  }
});

test('successful file output replaces the destination only with a complete JSON report', () => {
  const result = collect(responses, { output: 'original' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(readFileSync(result.outputPath, 'utf8')).selected_result.id, '421');
  assert.deepEqual(readdirSync(result.project).sort(), [
    'report.json',
    'requests.jsonl',
    'responses.json',
  ]);
});

test('a UTF-8 BOM stays in the exact evidence body and its checksum', () => {
  const body = `\uFEFF${responses[benchmarkPath].body}`;
  const result = collect({ ...responses, [benchmarkPath]: { body } });
  assert.equal(result.status, 0, result.stderr);
  const source = JSON.parse(result.stdout).evidence[0];
  assert.equal(source.body_utf8, body);
  assert.equal(source.decoded_body_sha256, createHash('sha256').update(body).digest('hex'));
});

test('malformed workflow timestamps are rejected before attaching corroboration', () => {
  const result = collect({
    ...responses,
    [workflowPath]: json({ ...workflow, runConfigs: [{ ...config, run_started_at: 'yesterday' }] }),
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid workflow-info response/u);
  assert.equal(result.requests.length, 2);
});

test('AgentX provenance scopes workflow coverage without replacing null token lengths or internal IDs', () => {
  const selected = {
    ...row,
    benchmark_type: 'agentic_traces',
    isl: null,
    osl: null,
    workflow_run_id: '17',
    curve_workflow_run_id: '25',
  };
  const path = `${workflowPath}&benchmarkType=agentic_traces`;
  const result = collect({
    ...responses,
    [benchmarkPath]: json([selected]),
    [path]: json(workflow),
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.selected_result, selected);
  assert.equal(report.producer.github_run_id, '123456789');
  assert.equal(result.requests[1], `${base}${path}`);
});

test('impossible or abbreviated timestamps cannot corroborate a producer', () => {
  for (const timestamp of ['2026-02-30T03:00:00Z', '2026', '0', '2026-08-08T24:00:00Z']) {
    for (const [path, value, error] of [
      [benchmarkPath, [{ ...row, run_started_at: timestamp }], /Invalid benchmark row/u],
      [benchmarkPath, [{ ...row, curve_run_started_at: timestamp }], /Invalid benchmark row/u],
      [
        workflowPath,
        { ...workflow, runs: [{ ...run, created_at: timestamp }] },
        /Invalid workflow-info response/u,
      ],
      [
        workflowPath,
        { ...workflow, runConfigs: [{ ...config, run_started_at: timestamp }] },
        /Invalid workflow-info response/u,
      ],
    ]) {
      const result = collect({ ...responses, [path]: json(value) });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, error);
    }
  }
});

test('producer start-time contradictions fail while PostgreSQL subsecond timestamps match at public precision', () => {
  const fixture = {
    ...responses,
    [benchmarkPath]: json([{ ...row, run_started_at: '2026-08-08 03:00:00.123456+00' }]),
    [workflowPath]: json({
      ...workflow,
      runConfigs: [{ ...config, run_started_at: '2026-08-08T14:00:00Z' }],
    }),
  };
  const bad = collect(fixture);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /Producer identity mismatch/u);
  const good = collect({
    ...fixture,
    [workflowPath]: json({
      ...workflow,
      runConfigs: [{ ...config, run_started_at: '2026-08-07T20:00:00-07:00' }],
    }),
  });
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).producer.status, 'confirmed');
});

test('an as-of response cannot silently attribute a point or curve from after the requested cutoff', () => {
  for (const selected of [
    { ...row, date: '2026-08-10' },
    { ...row, curve_date: '2026-08-10' },
  ]) {
    const result = collect({ ...responses, [benchmarkPath]: json([selected]) });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Selected result contradicts the requested as-of cutoff/u);
    assert.equal(result.requests.length, 1);
  }
});

test('a carried point cannot be attributed to an earlier curve snapshot', () => {
  const result = collect({
    ...responses,
    [benchmarkPath]: json([{ ...row, curve_date: '2026-08-07' }]),
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Selected curve snapshot predates its producer/u);
  assert.equal(result.requests.length, 1);
});
