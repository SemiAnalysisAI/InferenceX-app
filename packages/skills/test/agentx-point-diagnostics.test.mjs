import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { packedSkillSuite } from './packed-skill.mjs';

const suite = packedSkillSuite();
const { environment, temporaryRoot } = suite;
const base = 'https://inferencex.semianalysis.com';
const installed = new Map();
const preload = join(temporaryRoot, 'agentx-http-response.mjs');
const operation = (parameter) => ({
  get: { parameters: [{ name: parameter, in: 'query', required: true }] },
});
const openapi = {
  paths: {
    '/api/v1/benchmark-siblings': operation('id'),
    '/api/v1/trace-availability': operation('ids'),
    '/api/v1/request-timeline': operation('id'),
    '/api/v1/trace-histograms': operation('ids'),
    '/api/v1/trace-server-metrics': operation('id'),
    '/api/v1/request-chart-data': operation('id'),
    '/api/v1/trace-server-metric-source': operation('id'),
  },
};

before(() => {
  for (const target of ['codex', 'claude']) {
    const root = suite.install(target);
    const cookbook = readFileSync(join(root, 'references/agentx.md'), 'utf8');
    const [snippet, ...extra] = cookbook.matchAll(
      /```bash\nnode --input-type=module <<'JS'\n(?<code>[\s\S]*?)\nJS\n```/gu,
    );
    assert.ok(snippet, 'installed AgentX cookbook must contain the maintained recipe');
    assert.equal(extra.length, 0, 'AgentX cookbook must have one maintained executable recipe');
    installed.set(target, snippet.groups.code);
  }
  writeFileSync(
    preload,
    `
import { appendFileSync, readFileSync } from 'node:fs';
const fixtures = JSON.parse(readFileSync(process.env.INFERENCEX_AGENTX_FIXTURES, 'utf8'));
globalThis.fetch = async (input) => {
  const url = String(input.url ?? input);
  appendFileSync(process.env.INFERENCEX_AGENTX_REQUESTS, JSON.stringify(url) + '\\n');
  const response = fixtures[url];
  if (!response) throw new Error('Unexpected request: ' + url);
  return new Response(response.body, { status: response.status ?? 200 });
};
`,
  );
});

const response = (value, status = 200) => ({ body: JSON.stringify(value), status });
const siblingResponse = {
  sku: {
    hardware: 'h200_sxm',
    framework: 'vllm',
    model: 'dsr1',
    precision: 'fp8',
    spec_method: 'none',
    benchmark_type: 'agentic_traces',
    github_run_id: 123456789,
    date: '2026-08-08',
    dataset_slug: 'cc-traces-weka',
    image: 'vllm:sha-123',
    observation_id: 'observation-421',
    producer: { workflow: 'agentx' },
    snapshot: { date: '2026-08-09' },
  },
  siblings: [
    {
      id: 421,
      conc: 32,
      offload_mode: 'off',
      decode_tp: 8,
      decode_ep: 1,
      decode_pp: null,
      decode_dcp_size: 8,
      decode_pcp_size: 1,
      decode_dp_attention: false,
      decode_num_workers: 1,
      prefill_tp: 8,
      prefill_ep: 1,
      prefill_pp: null,
      prefill_dcp_size: 8,
      prefill_pcp_size: 1,
      prefill_dp_attention: false,
      prefill_num_workers: 1,
      num_prefill_gpu: 0,
      num_decode_gpu: 8,
      disagg: false,
      is_multinode: false,
      tput_per_gpu: 128.4,
      total_requests: 320,
      is_current: true,
      has_trace: true,
    },
  ],
};
const request = (phase, overrides = {}) => ({
  cid: `trace-${phase}`,
  ri: 0,
  ti: 0,
  wid: '7',
  ad: 0,
  phase,
  credit: 0,
  start: 1_200_000,
  ack: 1_800_000,
  end: 420_000_000,
  ttftMs: 42.3,
  tpotMs: 18.1,
  isl: 18_320,
  osl: 410,
  cancelled: false,
  ...overrides,
});
const timeline = {
  version: 6,
  startNs: 1_000_000_000,
  endNs: 2_400_000_000,
  durationS: 1.4,
  requests: [
    request('warmup'),
    request('profiling'),
    request('main-agent'),
    request('subagent', { srcKind: 'subagent' }),
    request('replay-lane', {
      srcTrace: 'trace-018',
      srcOuter: 2,
      srcInner: 1,
      srcKind: 'tool',
      cancelled: true,
      ack: null,
      ttftMs: null,
      tpotMs: null,
      osl: null,
    }),
  ],
};
const histograms = { 421: { id: 421, isl: [18_220, 19_340], osl: [410, 380] } };
const serverMetrics = {
  meta: { id: 421, hardware: 'h200_sxm', framework: 'vllm', model: 'dsr1', conc: 32 },
  startNs: 1_000_000_000,
  endNs: 2_400_000_000,
  durationS: 1.4,
  timeslicesCount: 2,
  kvCacheUsage: [{ t: 0, v: 0.44 }],
  prefixCacheHitRate: [{ t: 0, v: 0 }],
  queueDepth: [{ t: 0, v: 2 }],
  promptTokensBySource: { agent: [{ t: 0, v: 100 }] },
  prefillTps: [{ t: 0, v: 80 }],
  decodeTps: [{ t: 0, v: 40 }],
  prefixCacheHitsTps: [],
  hostKvCacheUsage: [],
  kvCacheUsageByEngine: [{ engine: '0', t: 0, v: 0.44 }],
  kvCachePoolTokens: 983_040,
  metricSources: [{ key: 'aggregate', label: 'Aggregate' }],
};

function run(
  responses,
  { target = 'codex', openapiResponse = response(openapi), replacement } = {},
) {
  const project = suite.project('agentx-request-');
  const fixtures = { [`${base}/api/openapi.json`]: openapiResponse };
  for (const [path, value] of Object.entries(responses)) fixtures[`${base}${path}`] = value;
  const fixturesPath = join(project, 'responses.json');
  const requestsPath = join(project, 'requests.jsonl');
  writeFileSync(fixturesPath, JSON.stringify(fixtures));
  let code = installed.get(target);
  if (replacement) code = code.replace(...replacement);
  const result = suite.node(['--import', pathToFileURL(preload).href, '--input-type=module'], {
    cwd: project,
    env: {
      ...environment,
      INFERENCEX_AGENTX_FIXTURES: fixturesPath,
      INFERENCEX_AGENTX_REQUESTS: requestsPath,
    },
    input: code,
  });
  const logged = readFileSync(requestsPath, { encoding: 'utf8', flag: 'a+' }).trimEnd();
  return { ...result, requests: logged ? logged.split('\n').map(JSON.parse) : [] };
}

const lightResponses = {
  '/api/v1/benchmark-siblings?id=421': response(siblingResponse),
  '/api/v1/trace-availability?ids=421': response({}),
};
const heavyResponses = {
  '/api/v1/benchmark-siblings?id=421': response(siblingResponse),
  '/api/v1/trace-availability?ids=421': response({ 421: true }),
  '/api/v1/request-timeline?id=421': response(timeline),
  '/api/v1/trace-histograms?ids=421': response(histograms),
  '/api/v1/trace-server-metrics?id=421': response(serverMetrics),
};

test('installed recipe short-circuits an unavailable trace after preserving sibling identity', () => {
  const result = run(lightResponses);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.outcome, 'trace_unavailable');
  assert.deepEqual(output.benchmark_siblings, siblingResponse);
  assert.deepEqual(output.selected_point, siblingResponse.siblings[0]);
  assert.deepEqual(output.trace_availability, {
    response: {},
    key_present: false,
    available: false,
  });
  assert.equal(output.metadata.ran_new_benchmark, false);
  assert.equal(output.metadata.event_timestamp_unit, 'nanoseconds');
  assert.match(output.metadata.event_timestamp_origin, /timeline\.startNs; not wall-clock/u);
  assert.equal(output.timeline, null);
  assert.equal(output.histograms, null);
  assert.equal(output.server_metrics, null);
  assert.deepEqual(result.requests, [
    `${base}/api/openapi.json`,
    `${base}/api/v1/benchmark-siblings?id=421`,
    `${base}/api/v1/trace-availability?ids=421`,
  ]);
});

test('installed recipe reads one selected point and preserves every request phase and cancellation', () => {
  const result = run(heavyResponses, { target: 'claude' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.outcome, 'trace_diagnostics');
  assert.deepEqual(output.timeline, timeline);
  assert.deepEqual(
    output.timeline.requests.map((item) => item.phase),
    ['warmup', 'profiling', 'main-agent', 'subagent', 'replay-lane'],
  );
  assert.equal(output.timeline.requests.at(-1).cancelled, true);
  assert.equal(output.timeline.requests.at(-1).srcTrace, 'trace-018');
  assert.deepEqual(output.histograms, histograms);
  assert.deepEqual(output.server_metrics, serverMetrics);
  assert.deepEqual(result.requests, [
    `${base}/api/openapi.json`,
    `${base}/api/v1/benchmark-siblings?id=421`,
    `${base}/api/v1/trace-availability?ids=421`,
    `${base}/api/v1/request-timeline?id=421`,
    `${base}/api/v1/trace-histograms?ids=421`,
    `${base}/api/v1/trace-server-metrics?id=421`,
  ]);
  assert.ok(result.requests.every((url) => !url.includes('request-chart-data')));
  assert.ok(result.requests.every((url) => !url.includes('trace-server-metric-source')));
  assert.deepEqual(
    output.metadata.requests.map((item) => item.query_url),
    result.requests,
  );
  assert.ok(
    output.metadata.requests.every((item) => Number.isFinite(Date.parse(item.retrieved_at))),
  );
});

test('one positive safe result ID is required before any HTTP request', () => {
  for (const value of ['0', '1.5', '9007199254740992', '0421']) {
    const result = run(
      {},
      {
        replacement: ["const selectedResultId = '421';", `const selectedResultId = '${value}';`],
      },
    );
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.deepEqual(result.requests, []);
  }
});

test('the selected decimal ID remains a string in output while diagnostic URLs use it losslessly', () => {
  const result = run(lightResponses);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).metadata.selected_result_id, '421');
});

test('advertised traces fail as inconsistencies on HTTP and malformed heavy responses', () => {
  const failures = [
    {
      responses: {
        ...heavyResponses,
        '/api/v1/request-timeline?id=421': response({ error: 'Not found' }, 404),
      },
    },
    {
      responses: { ...heavyResponses, '/api/v1/request-timeline?id=421': { body: '{' } },
    },
    {
      responses: {
        ...heavyResponses,
        '/api/v1/request-timeline?id=421': response({ ...timeline, requests: [{}] }),
      },
    },
    {
      responses: { ...heavyResponses, '/api/v1/trace-histograms?ids=421': response({}) },
    },
    {
      responses: {
        ...heavyResponses,
        '/api/v1/trace-server-metrics?id=421': response({ ...serverMetrics, queueDepth: null }),
      },
    },
  ];
  for (const { responses } of failures) {
    const result = run(responses);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Trace availability inconsistency for result 421/u);
  }
});

test('malformed light responses and missing live operations fail without heavy trace requests', () => {
  for (const [responses, options = {}] of [
    [{ '/api/v1/benchmark-siblings?id=421': { body: '{' } }],
    [{ '/api/v1/benchmark-siblings?id=421': response({ sku: {}, siblings: [] }) }],
    [
      {
        '/api/v1/benchmark-siblings?id=421': response(siblingResponse),
        '/api/v1/trace-availability?ids=421': response({ 422: true }),
      },
    ],
    [lightResponses, { openapiResponse: response({ paths: {} }) }],
  ]) {
    const result = run(responses, options);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.ok(
      result.requests.every(
        (url) =>
          !url.includes('request-timeline') &&
          !url.includes('trace-histograms') &&
          !url.includes('trace-server-metrics'),
      ),
    );
  }
});
