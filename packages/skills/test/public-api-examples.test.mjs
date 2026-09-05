import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { packedSkillSuite, succeeded as expectSuccess } from './packed-skill.mjs';

const suite = packedSkillSuite();
const { temporaryRoot, environment } = suite;
const base = 'https://inferencex.semianalysis.com';
const installed = new Map();
const preload = join(temporaryRoot, 'http-response.mjs');
const schema = {
  components: {
    schemas: {
      BenchmarkRows: {
        items: {
          properties: {
            metrics: {
              properties: {
                avg_power_w: { description: 'Mean measured watts per GPU.' },
              },
            },
          },
        },
      },
    },
  },
  paths: {
    '/api/v1/benchmarks/history': {
      get: {
        parameters: [
          { name: 'model', schema: { enum: ['DeepSeek-V4-Pro'] } },
          { name: 'isl' },
          { name: 'osl' },
        ],
      },
    },
    '/api/v1/evaluations': { get: { parameters: [] } },
    '/api/v1/datasets': { get: { parameters: [] } },
    '/api/v1/datasets/{slug}/conversations': {
      get: {
        parameters: [
          { name: 'sort', schema: { enum: ['tokens', 'turns', 'subagents', 'id'] } },
          { name: 'limit', schema: { minimum: 1, maximum: 200 } },
        ],
      },
    },
    '/api/v1/datasets/{slug}/conversations/{convId}': { get: {} },
  },
};

before(() => {
  for (const target of ['codex', 'claude']) {
    const root = suite.install(target);
    const cookbook = readFileSync(join(root, 'references/public-api-examples.md'), 'utf8');
    const snippets = [
      ...cookbook.matchAll(
        /```bash\nnode --input-type=module <<'JS'\n(?<code>[\s\S]*?)\nJS\n```/gu,
      ),
    ];
    assert.equal(snippets.length, 3, 'run all recipes from the installed npm archive');
    installed.set(
      target,
      snippets.map((snippet) => snippet.groups.code),
    );
  }
  writeFileSync(
    preload,
    `
import { appendFileSync, readFileSync } from 'node:fs';
const fixtures = JSON.parse(readFileSync(process.env.INFERENCEX_EXAMPLE_FIXTURES, 'utf8'));
globalThis.fetch = async (input) => {
  const url = String(input.url ?? input);
  appendFileSync(process.env.INFERENCEX_EXAMPLE_REQUESTS, JSON.stringify(url) + '\\n');
  const response = fixtures[url];
  if (!response) throw new Error('Unexpected request: ' + url);
  return new Response(response.body, { status: response.status ?? 200 });
};
`,
  );
});

function run(index, responses, { target = 'codex', replacement, openapi = schema } = {}) {
  const project = suite.project('request-');
  const fixtures = { [`${base}/api/openapi.json`]: { body: JSON.stringify(openapi) } };
  for (const [path, value] of Object.entries(responses)) {
    fixtures[`${base}${path}`] = value;
  }
  const fixturesPath = join(project, 'responses.json');
  const requestsPath = join(project, 'requests.jsonl');
  writeFileSync(fixturesPath, JSON.stringify(fixtures));
  let code = installed.get(target)[index];
  if (replacement) code = code.replace(...replacement);
  const result = suite.node(['--import', pathToFileURL(preload).href, '--input-type=module'], {
    cwd: project,
    env: {
      ...environment,
      INFERENCEX_EXAMPLE_FIXTURES: fixturesPath,
      INFERENCEX_EXAMPLE_REQUESTS: requestsPath,
    },
    input: code,
  });
  return {
    ...result,
    requests: readFileSync(requestsPath, 'utf8').trimEnd().split('\n').map(JSON.parse),
  };
}

const response = (value) => ({ body: JSON.stringify(value) });
const evaluation = (id, date, overrides = {}) => ({
  id,
  config_id: 9,
  model: 'dsv4',
  task: 'gsm8k',
  hardware: 'b200',
  framework: 'vllm',
  precision: 'fp4',
  date,
  timestamp: `${date}T12:00:00Z`,
  run_url: null,
  conc: null,
  metrics: { score: 0, score_se: null, custom_metric: 0.25 },
  ...overrides,
});
const dataset = (slug, overrides = {}) => ({
  id: `publisher/${slug}`,
  slug,
  label: slug,
  variant: 'test',
  description: null,
  hf_url: null,
  license: null,
  conversation_count: 20,
  summary: { cachedPct: null },
  ingested_at: '2026-09-01 00:00:00+00',
  ...overrides,
});
const item = (conv_id) => ({
  conv_id,
  models: ['example-model'],
  num_turns: 1,
  num_subagent_groups: 0,
  total_in: 100,
  total_out: 0,
  total_cached: 50,
});

function succeeded(result) {
  expectSuccess(result);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(
    output.requests.map((request) => request.query_url),
    result.requests,
  );
  assert.ok(output.requests.every((request) => Number.isFinite(Date.parse(request.retrieved_at))));
  return output;
}

test('installed evaluation recipe counts the full scope and preserves raw metrics, IDs, nulls and provenance', () => {
  const newest = Array.from({ length: 5 }, (_, i) =>
    evaluation(`90071992547409931234${i}`, `2026-09-0${7 - i}`),
  );
  const rows = [
    evaluation('old', '2026-07-01'),
    newest[2],
    evaluation('wrong-task', '2026-09-08', { task: 'gpqa', metrics: { accuracy: 0.8 } }),
    newest[4],
    evaluation('wrong-model', '2026-09-09', { model: 'other' }),
    newest[0],
    newest[3],
    newest[1],
  ];
  const result = run(0, { '/api/v1/evaluations': response(rows) }, { target: 'claude' });
  const output = succeeded(result);
  assert.deepEqual(result.requests, [`${base}/api/openapi.json`, `${base}/api/v1/evaluations`]);
  assert.equal(output.returned_rows, 8);
  assert.equal(output.matching_rows, 6);
  assert.deepEqual(output.scope, { model: 'dsv4', task: 'gsm8k', sample_limit: 5 });
  assert.deepEqual(output.sample_rows, newest);
  assert.deepEqual(output.available_tasks_for_model, ['gpqa', 'gsm8k']);
  assert.deepEqual(output.available_models, ['dsv4', 'other']);
});

test('evaluation no-match is distinct from missing metrics, unavailable HTTP, or malformed rows', () => {
  const missingMetrics = evaluation('no-score', '2026-09-01', { metrics: {} });
  const retained = succeeded(run(0, { '/api/v1/evaluations': response([missingMetrics]) }));
  assert.deepEqual(retained.sample_rows, [missingMetrics]);
  for (const rows of [[], [evaluation('different-task', '2026-09-01', { task: 'gpqa' })]]) {
    const output = succeeded(run(0, { '/api/v1/evaluations': response(rows) }));
    assert.equal(output.outcome, 'no_matching_evaluations');
    assert.equal(output.matching_rows, 0);
    assert.deepEqual(output.sample_rows, []);
  }
  for (const bad of [
    { status: 503, body: '{"error":"Unavailable"}' },
    { body: 'not JSON' },
    response({ rows: [] }),
    response([evaluation('bad', '2026-09-01', { metrics: null, model: 'outside-scope' })]),
    response([evaluation(9007199254740992, '2026-09-01')]),
    response([evaluation('bad-date', '2026-02-31')]),
  ]) {
    const result = run(0, { '/api/v1/evaluations': bad });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
  }
});

test('recipes inspect live operation availability before making data requests', () => {
  for (const index of [0, 1, 2]) {
    const result = run(index, {}, { openapi: { paths: {} } });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.deepEqual(result.requests, [`${base}/api/openapi.json`]);
  }
});

test('dataset recipe preserves the page, counts and full detail without pretending to fetch the collection', () => {
  const selected = dataset('a dataset%');
  const items = [item('900719925474099312345/% +对话'), item('second'), item('third')];
  const page = { total: 7, items };
  const detail = {
    ...items[0],
    structure: { name: 'example', value: null, children: [{ value: 0 }] },
  };
  const path = `/api/v1/datasets/${encodeURIComponent(selected.slug)}/conversations`;
  const result = run(1, {
    '/api/v1/datasets': response([dataset('z'), selected]),
    [`${path}?limit=3&offset=0&sort=id`]: response(page),
    [`${path}/${encodeURIComponent(items[0].conv_id)}`]: response(detail),
  });
  const output = succeeded(result);
  assert.equal(result.requests.length, 4, 'one page and one detail after schema and registry');
  assert.deepEqual(output.selected_dataset, selected);
  assert.deepEqual(output.page, page);
  assert.deepEqual(output.conversation, detail);
  assert.deepEqual(output.pagination, {
    returned_items: 3,
    total_matching: 7,
    has_more: true,
    next_offset: 3,
  });
  assert.equal(
    output.selected_dataset.conversation_count,
    20,
    'registry and index totals remain separate',
  );
  assert.equal(output.outcome, 'page_and_one_detail');
});

test('empty registry, unlisted slug and empty conversation page do not trigger guessed detail requests', () => {
  const empty = succeeded(run(1, { '/api/v1/datasets': response([]) }));
  assert.equal(empty.outcome, 'empty_registry');
  assert.equal(empty.selected_dataset, null);
  const absent = succeeded(
    run(
      1,
      { '/api/v1/datasets': response([dataset('available')]) },
      {
        replacement: ['const requestedSlug = null;', "const requestedSlug = 'absent';"],
      },
    ),
  );
  assert.equal(absent.outcome, 'dataset_not_listed');
  assert.equal(absent.requests.length, 2);
  const output = succeeded(
    run(
      1,
      {
        '/api/v1/datasets': response([dataset('empty', { conversation_count: 0 })]),
        '/api/v1/datasets/empty/conversations?limit=3&offset=0&sort=id': response({
          total: 0,
          items: [],
        }),
      },
      { target: 'claude' },
    ),
  );
  assert.equal(output.outcome, 'empty_page');
  assert.equal(output.conversation, null);
  assert.equal(output.requests.length, 3);
  assert.deepEqual(output.pagination, {
    returned_items: 0,
    total_matching: 0,
    has_more: false,
    next_offset: null,
  });
  const beyond = succeeded(
    run(
      1,
      {
        '/api/v1/datasets': response([dataset('small')]),
        '/api/v1/datasets/small/conversations?limit=3&offset=8&sort=id': response({
          total: 7,
          items: [],
        }),
      },
      { replacement: ['offset: 0', 'offset: 8'] },
    ),
  );
  assert.equal(beyond.outcome, 'empty_page');
  assert.equal(beyond.pagination.total_matching, 7);
  assert.equal(beyond.pagination.has_more, false);
});

test('invalid pages and failed or mismatched details fail instead of producing false empty or complete results', () => {
  const path = '/api/v1/datasets/example/conversations';
  const listing = '/api/v1/datasets';
  for (const page of [
    {},
    { total: '7', items: [] },
    { total: 7, items: [] },
    { total: 0, items: [item('one')] },
    { total: 2, items: [item('one'), item('one')] },
    { total: 1, items: [{ conv_id: 123 }] },
  ]) {
    const result = run(1, {
      [listing]: response([dataset('example')]),
      [`${path}?limit=3&offset=0&sort=id`]: response(page),
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.requests.length, 3);
  }
  for (const detail of [
    { status: 404, body: '{"error":"Not found"}' },
    { body: '{' },
    response({ ...item('different'), structure: {} }),
    response({ ...item('one'), structure: null }),
  ]) {
    const result = run(1, {
      [listing]: response([dataset('example')]),
      [`${path}?limit=3&offset=0&sort=id`]: response({ total: 1, items: [item('one')] }),
      [`${path}/one`]: detail,
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
  }
});

const historyRow = (id, date, overrides = {}) => ({
  id,
  date,
  model: 'dsv4',
  hardware: 'b200',
  framework: 'vllm',
  precision: 'fp4',
  benchmark_type: 'single_turn',
  isl: 8192,
  osl: 1024,
  conc: 16,
  metrics: { avg_power_w: 0, output_tput_per_gpu: 12 },
  run_url:
    'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/9007199254740993123/attempts/2',
  curve_date: '2026-09-05',
  curve_workflow_run_id: '9007199254740993124',
  workers: [{ device_id: 'GPU-001', sample: null }],
  ...overrides,
});

test('installed history recipe keeps all scoped observations, dates, raw configuration and documented units', () => {
  const first = historyRow('9007199254740993123', '2026-08-01');
  const last = historyRow('last', '2026-09-04', {
    framework: 'sglang',
    metrics: { output_tput_per_gpu: 0 },
  });
  const rows = [
    last,
    historyRow('outside-date', '2026-07-31'),
    historyRow('other-gpu', '2026-08-02', { hardware: 'h200' }),
    first,
    historyRow('other-workload', '2026-08-03', { isl: 1024 }),
    historyRow('other-type', '2026-08-03', { benchmark_type: 'agentic_traces' }),
    historyRow('after-range', '2026-09-05'),
  ];
  const path = '/api/v1/benchmarks/history?model=DeepSeek-V4-Pro&isl=8192&osl=1024';
  for (const target of ['codex', 'claude']) {
    const result = run(2, { [path]: response(rows) }, { target });
    const output = succeeded(result);
    assert.deepEqual(result.requests, [`${base}/api/openapi.json`, `${base}${path}`]);
    assert.equal(output.returned_rows, 7);
    assert.equal(output.selected_rows, 2);
    assert.deepEqual(output.rows, [first, last]);
    assert.deepEqual(output.observed_dates, ['2026-08-01', '2026-09-04']);
    assert.deepEqual(output.available_hardware, ['b200', 'h200']);
    assert.deepEqual(output.metric_descriptions, {
      avg_power_w: 'Mean measured watts per GPU.',
      output_tput_per_gpu: null,
    });
    assert.deepEqual(output.scope, {
      model: 'DeepSeek-V4-Pro',
      hardware: 'b200',
      benchmark_type: 'single_turn',
      isl: 8192,
      osl: 1024,
      date_from: '2026-08-01',
      date_to: '2026-09-04',
      date_field: 'date',
    });
  }
  for (const input of [[], [historyRow('outside-date', '2026-07-31')]]) {
    const output = succeeded(run(2, { [path]: response(input) }));
    assert.equal(output.outcome, 'no_matching_observations');
    assert.deepEqual(output.rows, []);
    assert.equal(output.returned_rows, input.length);
  }
  for (const input of [
    { status: 503, body: 'unavailable' },
    { body: '{' },
    response({ rows }),
    response([historyRow('bad', '2026-02-31')]),
    response([historyRow('bad', '2026-08-01', { metrics: null })]),
  ]) {
    const result = run(2, { [path]: input });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
  }
});
