import assert from 'node:assert/strict';
import { readFileSync, truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { packedSkillSuite } from './packed-skill.mjs';

const suite = packedSkillSuite();
const { environment, temporaryRoot } = suite;
const base = 'https://inferencex.semianalysis.com';
const installed = new Map();
const installedRoots = new Map();
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
    assert.match(cookbook, /`key_present: false`\s+means the response omitted the selected ID/u);
    assert.match(cookbook, /`key_present: true` with\s+`available: false`/u);
    installed.set(target, snippet.groups.code);
    installedRoots.set(target, root);
  }
  writeFileSync(
    preload,
    `
import { appendFileSync, readFileSync } from 'node:fs';
const fixtures = JSON.parse(readFileSync(process.env.INFERENCEX_AGENTX_FIXTURES, 'utf8'));
globalThis.fetch = async (input, options) => {
  const url = String(input.url ?? input);
  appendFileSync(process.env.INFERENCEX_AGENTX_REQUESTS, JSON.stringify(url) + '\\n');
  if (options?.redirect !== 'error') throw new Error('AgentX requests must reject redirects');
  const response = fixtures[url];
  if (!response) throw new Error('Unexpected request: ' + url);
  return new Response(response.body, { status: response.status ?? 200 });
};
`,
  );
});

const response = (value, status = 200) => ({ body: JSON.stringify(value), status });
const counts = (samples, finite, nonzero, missing) => ({
  sample_count: samples,
  fields: {
    value: {
      finite_count: finite,
      nonzero_count: nonzero,
      missing_or_nonfinite_count: missing,
    },
  },
});
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
  kvCacheUsage: [{ t: 0, value: 0.44 }],
  prefixCacheHitRate: [{ t: 0, value: 0 }],
  queueDepth: [{ t: 0, running: 2, waiting: 0, total: 2 }],
  promptTokensBySource: { agent: [{ t: 0, value: 100 }] },
  prefillTps: [{ t: 0, value: 80 }],
  decodeTps: [{ t: 0, value: 40 }],
  prefixCacheHitsTps: [],
  hostKvCacheUsage: [],
  kvCacheUsageByEngine: [{ engineLabel: '0', points: [{ t: 0, value: 0.44 }] }],
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
  code = code.replaceAll(
    './.agents/skills/inferencex-api/scripts/trace-summary.mjs',
    pathToFileURL(join(installedRoots.get(target), 'scripts/trace-summary.mjs')).href,
  );
  code = code.replaceAll(
    './.agents/skills/inferencex-api/scripts/capture-response.mjs',
    pathToFileURL(join(installedRoots.get(target), 'scripts/capture-response.mjs')).href,
  );
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

test('installed recipe preserves explicit false separately from an omitted availability key', () => {
  const result = run({
    ...lightResponses,
    '/api/v1/trace-availability?ids=421': response({ 421: false }),
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.outcome, 'trace_unavailable');
  assert.deepEqual(output.trace_availability, {
    response: { 421: false },
    key_present: true,
    available: false,
  });
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

test('installed recipe retains original timestamp digits beyond JavaScript safe integers', () => {
  const path = '/api/v1/request-timeline?id=421';
  const body = JSON.stringify({ ...timeline, startNs: 'EXACT_START', endNs: 'EXACT_END' }, null, 2)
    .replace('"EXACT_START"', '1700000000000000001')
    .replace('"EXACT_END"', '1700000001400000001');
  const result = run({ ...heavyResponses, [path]: { body } });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  const evidence = output.metadata.requests.find((item) => item.query_url === `${base}${path}`);
  assert.equal(evidence.body_utf8, body);
  assert.ok(Number.isFinite(Date.parse(evidence.retrieved_at)));
  assert.equal(Number.isSafeInteger(output.timeline.startNs), false);
  assert.equal(JSON.stringify(output.timeline).includes('1700000000000000001'), false);
  assert.equal(JSON.stringify(output.timeline).includes('1700000001400000001'), false);
});

test('trace summaries keep each series denominator and distinguish cumulative from inflight time', () => {
  const result = run({
    ...heavyResponses,
    '/api/v1/request-timeline?id=421': response({
      ...timeline,
      endNs: 6e9,
      durationS: 5,
      requests: [
        request('main-agent', { start: 1e9, end: 3e9 }),
        request('warmup', { start: 0, end: 2e9 }),
        request('replay-lane', { start: 4e9, end: 4.5e9, cancelled: true }),
      ],
    }),
    '/api/v1/trace-server-metrics?id=421': response({
      ...serverMetrics,
      prefillTps: [
        { t: 0, value: 80 },
        { t: 1, value: 0 },
        { t: 2, value: null },
      ],
      decodeTps: [{ t: 0, value: 40 }, { t: 1 }, { t: 2, value: 20 }, { t: 3, value: 0 }],
      prefixCacheHitsTps: [{ t: 0, value: 10 }],
    }),
  });
  assert.equal(result.status, 0, result.stderr);
  const { trace_summary: summary, trace_report_markdown: markdown } = JSON.parse(result.stdout);
  assert.ok(summary, 'recipe must compute the maintained trace summary');
  assert.equal(summary.request_count, 3);
  assert.equal(summary.cancelled_request_count, 1);
  assert.equal(summary.cumulative_request_latency_s, 4.5);
  assert.equal(summary.request_inflight_union_s, 3.5);
  assert.deepEqual(summary.server_metric_samples.prefillTps, counts(3, 2, 1, 1));
  assert.deepEqual(summary.server_metric_samples.decodeTps, counts(4, 3, 2, 1));
  assert.deepEqual(summary.server_metric_samples.prefixCacheHitsTps, counts(1, 1, 1, 0));
  assert.deepEqual(summary.server_metric_samples.hostKvCacheUsage, counts(0, 0, 0, 0));
  assert.deepEqual(summary.server_metric_samples.queueDepth, {
    sample_count: 1,
    fields: {
      running: { finite_count: 1, nonzero_count: 1, missing_or_nonfinite_count: 0 },
      waiting: { finite_count: 1, nonzero_count: 0, missing_or_nonfinite_count: 0 },
      total: { finite_count: 1, nonzero_count: 1, missing_or_nonfinite_count: 0 },
    },
  });
  assert.deepEqual(summary.server_metric_samples.promptTokensBySource.agent, counts(1, 1, 1, 0));
  assert.deepEqual(summary.server_metric_samples.kvCacheUsageByEngine, [
    { engineLabel: '0', ...counts(1, 1, 1, 0) },
  ]);
  assert.match(
    markdown,
    /prefillTps.value[^\n]*3 samples, 2 finite; 1\/2 finite samples nonzero; 1 missing/u,
  );
  assert.match(
    markdown,
    /decodeTps.value[^\n]*4 samples, 3 finite; 2\/3 finite samples nonzero; 1 missing/u,
  );
  assert.match(
    markdown,
    /hostKvCacheUsage.value[^\n]*0 samples, 0 finite; nonzero fraction unavailable/u,
  );
});

test('an empty timeline has zero requests and durations without inventing server samples', () => {
  const result = run({
    ...heavyResponses,
    '/api/v1/request-timeline?id=421': response({ ...timeline, requests: [] }),
  });
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout).trace_summary;
  assert.ok(summary, 'recipe must compute the maintained trace summary');
  assert.equal(summary.request_count, 0);
  assert.equal(summary.cancelled_request_count, 0);
  assert.equal(summary.cumulative_request_latency_s, 0);
  assert.equal(summary.request_inflight_union_s, 0);
  assert.equal(summary.status, 'empty_timeline');
  assert.equal(summary.longest_request, null);
  assert.deepEqual(summary.phases, []);
});

test('the installed recipe labels global and per-phase longest requests with their identities', () => {
  const records = [
    request('warmup', { cid: 'warmup-0', end: 33_738_000_000, start: 0 }),
    request('profiling', {
      cid: 'profile-0',
      ri: 8,
      ti: 2,
      start: 40_000_000_000,
      end: 168_284_000_000,
      cancelled: true,
      ack: null,
      osl: null,
      srcTrace: 'source-4',
      srcOuter: 2,
      srcInner: 1,
      srcKind: 'subagent',
    }),
    request('profiling', { cid: 'profile-1', start: 50e9, end: 60e9 }),
  ];
  const result = run({
    ...heavyResponses,
    '/api/v1/request-timeline?id=421': response({
      ...timeline,
      requests: records,
      durationS: 170,
      endNs: 171e9,
    }),
  });
  assert.equal(result.status, 0, result.stderr);
  const { trace_summary: summary, trace_report_markdown: markdown } = JSON.parse(result.stdout);
  assert.equal(summary.status, 'available');
  assert.equal(summary.selected_result_id, '421');
  assert.equal(summary.scope, 'all_phases_including_cancelled');
  assert.deepEqual(summary.longest_request, {
    scope: 'all_phases',
    selected_result_id: '421',
    phase: 'profiling',
    request_index: 1,
    duration: { value: 128.284, unit: 's' },
    request: records[1],
  });
  assert.deepEqual(
    summary.phases.map((phase) => [
      phase.phase,
      phase.request_count,
      phase.cancelled_request_count,
    ]),
    [
      ['warmup', 1, 0],
      ['profiling', 2, 1],
    ],
  );
  assert.equal(summary.phases[0].longest_request.scope, 'phase');
  assert.equal(summary.phases[0].longest_request.phase, 'warmup');
  assert.equal(summary.phases[0].longest_request.duration.value, 33.738);
  assert.equal(summary.phases[1].longest_request.duration.value, 128.284);
  assert.match(markdown, /Across all phases[^\n]*3 requests[^\n]*1 cancelled/u);
  assert.match(
    markdown,
    /Longest request across all phases[^\n]*128\.284 s[^\n]*profiling[^\n]*profile-0/u,
  );
  assert.match(markdown, /Phase[^\n]*warmup[^\n]*33\.738 s[^\n]*warmup-0/u);
  assert.match(markdown, /Phase[^\n]*profiling[^\n]*128\.284 s[^\n]*profile-0/u);
  assert.match(markdown, /neither GPU utilization nor server busy time/u);

  for (const target of ['codex', 'claude']) {
    const project = suite.project('offline-trace-');
    const savedPath = join(project, 'selected-point.json');
    writeFileSync(savedPath, JSON.stringify({ ...JSON.parse(result.stdout), trace_summary: {} }));
    const offline = suite.node([
      join(installedRoots.get(target), 'scripts/trace-summary.mjs'),
      savedPath,
    ]);
    assert.equal(offline.status, 0, offline.stderr);
    assert.deepEqual(JSON.parse(offline.stdout), {
      trace_summary: summary,
      trace_report_markdown: markdown,
    });
  }
});

test('no stored trace has an explicit unavailable report without inventing an empty timeline', () => {
  const result = run(lightResponses);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.trace_summary?.status, 'trace_unavailable');
  assert.equal(output.trace_summary.request_count, null);
  assert.equal(output.trace_summary.longest_request, null);
  assert.match(output.trace_report_markdown, /result 421[^\n]*no stored trace/iu);
  assert.match(output.trace_report_markdown, /omitted the selected ID/u);
});

test('the installed offline helper rejects invalid scope and events without a no-trace report', () => {
  const result = run(heavyResponses);
  assert.equal(result.status, 0, result.stderr);
  const saved = JSON.parse(result.stdout);
  const project = suite.project('invalid-offline-trace-');
  const inputPath = join(project, 'selected-point.json');
  for (const [changed, expected] of [
    [{ metadata: {} }, /scope/u],
    [{ metadata: { selected_result_id: '0421' } }, /scope/u],
    [{ selected_point: { id: 422 } }, /scope/u],
    [
      { trace_availability: { response: { 421: true }, key_present: false, available: false } },
      /availability/u,
    ],
    [
      { outcome: 'trace_unavailable', timeline: null, histograms: null, server_metrics: null },
      /outcome/u,
    ],
    [
      {
        timeline: {
          ...timeline,
          requests: [request('warmup', { end: Number.MAX_SAFE_INTEGER + 1 })],
        },
      },
      /timeline/u,
    ],
    [
      { server_metrics: { ...serverMetrics, kvCacheUsageByEngine: [{ engineLabel: '0' }] } },
      /server metrics/u,
    ],
  ]) {
    writeFileSync(inputPath, JSON.stringify({ ...saved, ...changed }));
    const offline = suite.node([
      join(installedRoots.get('codex'), 'scripts/trace-summary.mjs'),
      inputPath,
    ]);
    assert.notEqual(offline.status, 0);
    assert.equal(offline.stdout, '');
    assert.match(offline.stderr, expected);
  }
});

test('the installed trace helper reports invalid input through the package CLI error contract', () => {
  const script = join(installedRoots.get('codex'), 'scripts/trace-summary.mjs');
  const usage = suite.node([script]);
  assert.equal(usage.status, 2);
  assert.equal(usage.stdout, '');
  assert.equal(JSON.parse(usage.stderr).error.code, 'INVALID_ARGUMENT');
  const invalidPath = join(suite.project('invalid-trace-json-'), 'selected-point.json');
  writeFileSync(invalidPath, '{');
  const malformed = suite.node([script, invalidPath]);
  assert.equal(malformed.status, 1);
  assert.equal(malformed.stdout, '');
  assert.equal(JSON.parse(malformed.stderr).error.code, 'INVALID_RESPONSE');
});

test('the installed trace helper rejects an oversized saved file before parsing it', () => {
  const oversizedPath = join(suite.project('oversized-trace-'), 'selected-point.json');
  writeFileSync(oversizedPath, '');
  truncateSync(oversizedPath, 64 * 1024 * 1024 + 1);
  const result = suite.node([
    join(installedRoots.get('codex'), 'scripts/trace-summary.mjs'),
    oversizedPath,
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /64 MiB/u);
  assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_RESPONSE');
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
    ...[
      { start: 2, end: 1 },
      { start: -1 },
      { end: Number.MAX_SAFE_INTEGER + 1 },
      { credit: Number.MAX_SAFE_INTEGER + 1 },
      { ack: Number.MAX_SAFE_INTEGER + 1 },
      { ack: 0.5 },
    ].map((overrides) => ({
      responses: {
        ...heavyResponses,
        '/api/v1/request-timeline?id=421': response({
          ...timeline,
          requests: [request('main-agent', overrides)],
        }),
      },
    })),
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
