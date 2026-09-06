import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();
const base = 'https://inferencex.semianalysis.com';
const preload = join(suite.temporaryRoot, 'collectivex-http.mjs');
const installed = new Map();
const ids = ['90071992547409930001', '90071992547409930002'];
const paths = ['/api/v1/collectivex/runs', '/api/v1/collectivex/runs/{runId}'];
const schema = {
  paths: Object.fromEntries(
    paths.map((path) => [
      path,
      {
        get: { parameters: [{ name: 'version', required: true, schema: { enum: [1] } }] },
      },
    ]),
  ),
};
const percentiles = (p50 = 20) => ({ p50, p90: 30, p95: 40, p99: 50 });
const topology = {
  ep_size: 8,
  nodes: 1,
  gpus_per_node: 8,
  scale_up_domain: 8,
  scale_up_transport: 'NVLink',
  scale_out_transport: null,
  topology_class: 'scale-up',
};
function dataset(id, latency = 20) {
  return {
    version: 1,
    run: {
      run_id: id,
      run_attempt: 2,
      generated_at: '2026-09-01T12:00:00Z',
      conclusion: null,
      source_sha: `sha-${id}`,
      requested_cases: 1,
      terminal_cases: 1,
      measured_cases: 1,
      unsupported_cases: 0,
      failed_cases: 0,
      requested_points: 1,
      terminal_points: 1,
      measured_points: 1,
      covered_skus: ['h200_sxm'],
    },
    coverage: [{ case_id: 'case-a', outcome: 'success', reason: null, detail: 'raw coverage' }],
    series: [
      {
        series_id: 'case-a',
        phase: 'decode',
        mode: 'normal',
        precision: 'bf16',
        backend: 'deepep',
        system: { ...topology, sku: 'h200_sxm', vendor: 'nvidia' },
        points: [
          {
            tokens_per_rank: 32,
            global_tokens: 256,
            components: {
              dispatch: {
                payload_bytes: 8192,
                latency_us: percentiles(latency),
                activation_data_rate_gbps_at_latency_percentile: null,
                payload_data_rate_gbps_at_latency_percentile: percentiles(0),
              },
              stage: null,
              combine: null,
              roundtrip: null,
            },
            roundtrip_token_rate_at_latency_percentile: percentiles(0),
          },
        ],
      },
    ],
  };
}
const body = (value, extra = {}) => ({ body: JSON.stringify(value), ...extra });

before(() => {
  for (const target of ['codex', 'claude']) installed.set(target, suite.install(target));
  writeFileSync(
    preload,
    `
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(process.env.COLLECTIVEX_FIXTURE, 'utf8'));
if (fixture.stdoutFailure) process.stdout.write = (_bytes, callback) => {
  queueMicrotask(() => callback(new Error('broken pipe'))); return false;
};
globalThis.fetch = async (input, options) => {
  const url = String(input);
  appendFileSync(process.env.COLLECTIVEX_REQUESTS, JSON.stringify({ url, redirect: options.redirect }) + '\\n');
  const response = fixture.responses[url];
  if (!response) throw Error('Unexpected request: ' + url);
  if (response.throw) throw Error(response.throw);
  if (response.raceOutputPath) writeFileSync(response.raceOutputPath, 'concurrent output');
  if (response.oversized) return new Response(new ReadableStream({
    pull(c) { c.enqueue(new Uint8Array(8 * 1024 * 1024)); },
  }));
  if (response.lateChunk) return new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode('{"version":1')); },
    pull(c) { c.error(new Error('late body failure')); },
  }));
  const result = new Response(response.body, { status: response.status ?? 200 });
  if (response.redirected !== undefined) Object.defineProperty(result, 'redirected', { value: response.redirected });
  if (response.url !== undefined) Object.defineProperty(result, 'url', { value: response.url });
  return result;
};
`,
  );
});

function run(left = dataset(ids[0]), right = dataset(ids[1], 10), options = {}) {
  const cwd = options.cwd ?? suite.project();
  const requestsPath = join(cwd, 'requests.jsonl');
  const responses = {
    [`${base}/api/openapi.json`]: body(schema),
    [`${base}/api/v1/collectivex/runs?version=1`]: body({
      version: 1,
      discovery_complete: false,
      runs: [
        right.run,
        { ...left.run, run_id: '90071992547409930003', measured_cases: 0 },
        left.run,
      ],
    }),
    [`${base}/api/v1/collectivex/runs/${ids[0]}?version=1`]: body(left),
    [`${base}/api/v1/collectivex/runs/${ids[1]}?version=1`]: body(right),
    ...options.responses,
  };
  const fixture = join(cwd, 'fixture.json');
  writeFileSync(fixture, JSON.stringify({ responses, stdoutFailure: options.stdoutFailure }));
  const result = suite.node(
    [
      '--import',
      pathToFileURL(preload).href,
      join(installed.get(options.target ?? 'codex'), 'scripts/compare-collectivex.mjs'),
      ...(options.args ?? ['--left', ids[0], '--right', ids[1]]),
    ],
    {
      cwd,
      env: {
        ...suite.environment,
        COLLECTIVEX_FIXTURE: fixture,
        COLLECTIVEX_REQUESTS: requestsPath,
      },
    },
  );
  return {
    ...result,
    cwd,
    responses,
    requests: existsSync(requestsPath)
      ? readFileSync(requestsPath, 'utf8').trim().split('\n').map(JSON.parse)
      : [],
  };
}
function success(result) {
  succeeded(result);
  return JSON.parse(result.stdout);
}

test('packed helper compares exact EP identities and retains complete source bodies and large string IDs', () => {
  for (const target of ['codex', 'claude']) {
    const result = run(undefined, undefined, { target });
    const output = success(result);
    assert.equal(result.requests.length, 3);
    assert.ok(result.requests.every((request) => request.redirect === 'error'));
    assert.deepEqual(output.selection.run_ids, ids);
    assert.equal(output.comparison_scope.source_sha_equal, false);
    const matched = output.comparisons.find((row) => row.status === 'matched');
    assert.equal(matched.identity.suite, 'ep');
    assert.equal(matched.identity.operation, 'dispatch');
    const latency = matched.metrics.find((metric) => metric.name === 'latency_us.p50');
    assert.deepEqual(latency, {
      name: 'latency_us.p50',
      unit: 'us',
      left: { status: 'value', value: 20 },
      right: { status: 'value', value: 10 },
      difference_right_minus_left: -10,
      ratio_right_over_left: 0.5,
    });
    assert.equal(output.summary.matched, 1);
    assert.equal(output.summary.incomparable, 3);
    for (const response of output.responses) {
      assert.equal(response.body_text, result.responses[response.query_url].body);
      assert.equal(
        response.decoded_body_sha256,
        createHash('sha256').update(response.body_text).digest('hex'),
      );
      assert.ok(Number.isFinite(Date.parse(response.retrieved_at)));
    }
    assert.deepEqual(JSON.parse(output.responses[1].body_text), dataset(ids[0]));
  }
});

function kvDataset(id, latency = 4) {
  const result = dataset(id);
  result.series = [];
  result.coverage = [];
  result.kv = [
    {
      case_id: 'kv-a',
      label: 'H200 transfer',
      disposition: 'runnable',
      sku: 'h200_sxm',
      vendor: 'nvidia',
      backend: 'nixl',
      fabric: 'rdma',
      workload: 'kv-dsv4',
      precision: 'bf16',
      topology: {
        ...topology,
        ep_size: 2,
        nodes: 2,
        gpus_per_node: 1,
        scale_up_domain: 1,
        scale_out_transport: 'InfiniBand',
        topology_class: 'scale-out',
      },
      outcome: 'success',
      reason: null,
      detail: null,
      rows: [
        {
          kind: 'paged',
          isl: 1024,
          page_tokens: 16,
          batch: 4,
          op: 'pull',
          descs: 64,
          req_bytes: 1000000,
          prep_ms: 0,
          latency_ms: { p50: latency, p95: 8, min: 2, max: 10, n: 30 },
          gbps_p50: 1,
          verify_passed: true,
        },
      ],
    },
  ];
  return result;
}

test('KV matches request bytes, burst configuration and topology while distinguishing burst and request latency', () => {
  const left = kvDataset(ids[0]);
  const right = kvDataset(ids[1], 2);
  right.kv[0].label = 'cosmetic label changed';
  right.kv[0].rows[0].request_ms = { p50: 0.5, p95: 1, min: 0.2, max: 2, n: 120 };
  const output = success(run(left, right));
  const matched = output.comparisons[0];
  assert.equal(matched.status, 'matched');
  assert.equal(matched.identity.suite, 'kv');
  assert.equal(matched.identity.row.req_bytes, 1000000);
  assert.equal(
    matched.metrics.find((metric) => metric.name === 'latency_ms.p50').difference_right_minus_left,
    -2,
  );
  const request = matched.metrics.find((metric) => metric.name === 'request_ms.p50');
  assert.deepEqual(request.left, { status: 'missing' });
  assert.deepEqual(request.right, { status: 'value', value: 0.5 });
  assert.equal(request.ratio_right_over_left, null);
  assert.equal(request.unit, 'ms per request');
  assert.equal(matched.metrics.find((metric) => metric.name === 'prep_ms').left.value, 0);
  for (const change of [
    (data) => {
      data.kv[0].rows[0].req_bytes = 2000000;
    },
    (data) => {
      data.kv[0].rows[0].batch = 8;
    },
    (data) => {
      data.kv[0].rows[0].op = 'push';
    },
    (data) => {
      data.kv[0].rows[0].page_tokens = 32;
    },
    (data) => {
      data.kv[0].fabric = 'mnnvl';
    },
    (data) => {
      data.kv[0].workload = 'kv-other';
    },
    (data) => {
      data.kv[0].rows[0].future_configuration = 'different';
    },
  ]) {
    const altered = structuredClone(right);
    change(altered);
    const result = success(run(left, altered));
    assert.equal(result.summary.matched, 0);
    assert.equal(result.summary.only_left, 1);
    assert.equal(result.summary.only_right, 1);
  }
  const failed = structuredClone(right);
  failed.kv[0].rows[0].verify_passed = false;
  const result = success(run(left, failed));
  assert.equal(result.comparisons[0].status, 'incomparable');
  assert.deepEqual(result.comparisons[0].issues, ['kv_verification_not_passed']);
  assert.deepEqual(result.comparisons[0].metrics, []);
});

test('unsafe numeric configuration cannot alias into an equal comparison identity', () => {
  for (const values of [
    ['1e400', '2e400'],
    ['9007199254740992', '9007199254740993'],
  ]) {
    const responses = Object.fromEntries(
      ids.map((runId, index) => {
        const data = dataset(runId);
        data.series[0].future_configuration = 'REPLACE';
        return [
          `${base}/api/v1/collectivex/runs/${runId}?version=1`,
          {
            body: JSON.stringify(data).replace('"REPLACE"', values[index]),
          },
        ];
      }),
    );
    const result = run(undefined, undefined, { responses });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unrepresentable number/u);
    assert.equal(result.stdout, '');
  }
});

test('redirected or foreign final responses cannot be attributed to the requested source', () => {
  for (const overrides of [
    { redirected: true },
    { url: 'https://foreign.example/api/openapi.json' },
  ]) {
    const result = run(undefined, undefined, {
      responses: {
        [`${base}/api/openapi.json`]: body(schema, overrides),
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /response URL/u);
    assert.equal(result.stdout, '');
    assert.equal(result.requests.length, 1);
  }
});

test('one discovery pass selects by exact numeric run ID and never claims exhaustive history', () => {
  const result = run(undefined, undefined, { args: [] });
  const output = success(result);
  assert.equal(result.requests.length, 4);
  assert.deepEqual(output.selection.run_ids, ids);
  assert.equal(output.discovery.returned_runs, 3);
  assert.equal(output.discovery.discovery_complete, false);
  assert.equal(output.discovery.history_complete, false);
  for (const complete of [false, true]) {
    const listed = body({ version: 1, runs: [dataset(ids[0]).run], discovery_complete: complete });
    const empty = run(undefined, undefined, {
      args: [],
      responses: {
        [`${base}/api/v1/collectivex/runs?version=1`]: listed,
      },
    });
    const data = success(empty);
    assert.equal(data.outcome, 'fewer_than_two_measured_runs');
    assert.equal(data.discovery.discovery_complete, complete);
    assert.equal(data.discovery.history_complete, false);
    assert.equal(empty.requests.length, 2);
    assert.deepEqual(data.comparisons, []);
  }
});

test('EP rejects cross-operation, configuration, dtype, message-size, rank and topology pairing', () => {
  for (const change of [
    (series) => {
      series.backend = 'uccl';
    },
    (series) => {
      series.precision = 'fp8';
    },
    (series) => {
      series.phase = 'prefill';
    },
    (series) => {
      series.mode = 'low-latency';
    },
    (series) => {
      series.series_id = 'different-case';
    },
    (series) => {
      series.system.sku = 'b200';
    },
    (series) => {
      series.system.ep_size = 16;
      series.points[0].global_tokens = 512;
    },
    (series) => {
      series.system.nodes = 2;
    },
    (series) => {
      series.system.scale_up_transport = 'different-fabric';
    },
    (series) => {
      series.points[0].tokens_per_rank = 64;
      series.points[0].global_tokens = 512;
    },
    (series) => {
      series.points[0].components.dispatch.payload_bytes = 16384;
    },
    (series) => {
      series.points[0].future_configuration = 'different';
    },
    (series) => {
      series.points[0].components.combine = series.points[0].components.dispatch;
      series.points[0].components.dispatch = null;
    },
  ]) {
    const right = dataset(ids[1]);
    change(right.series[0]);
    const output = success(run(dataset(ids[0]), right));
    assert.equal(output.summary.matched, 0);
    assert.equal(output.summary.only_left, 1);
    assert.equal(output.summary.only_right, 1);
    assert.ok(output.comparisons.every((row) => row.metrics.length === 0));
  }
});

test('duplicate identities, absent components and missing configuration are explicit instead of arbitrarily paired', () => {
  const right = dataset(ids[1]);
  right.series.push(structuredClone(right.series[0]));
  const duplicate = success(run(dataset(ids[0]), right));
  assert.equal(duplicate.summary.ambiguous, 4);
  assert.ok(duplicate.comparisons.every((row) => row.metrics.length === 0));
  assert.deepEqual(
    duplicate.comparisons[0].right.map((source) => source.json_pointer),
    ['/series/0/points/0/components/dispatch', '/series/1/points/0/components/dispatch'],
  );
  for (const change of [
    (data) => {
      data.series[0].points[0].components.dispatch.payload_bytes = null;
    },
    (data) => {
      delete data.series[0].system.scale_out_transport;
    },
    (data) => {
      data.series[0].system = null;
    },
  ]) {
    const left = dataset(ids[0]);
    const modifiedRight = dataset(ids[1]);
    change(left);
    change(modifiedRight);
    const output = success(run(left, modifiedRight));
    assert.equal(output.summary.matched, 0);
    assert.equal(output.summary.incomparable, 4);
    assert.ok(output.comparisons[0].issues.length > 0);
  }
});

test('null, missing and zero metrics retain their meanings and zero denominators have no ratio', () => {
  const left = dataset(ids[0], 0);
  const right = dataset(ids[1], 10);
  left.series[0].points[0].components.dispatch.latency_us.p90 = null;
  delete left.series[0].points[0].components.dispatch.latency_us.p95;
  const output = success(run(left, right));
  const metrics = output.comparisons.find((row) => row.status === 'matched').metrics;
  assert.deepEqual(
    metrics.find((row) => row.name === 'latency_us.p50'),
    {
      name: 'latency_us.p50',
      unit: 'us',
      left: { status: 'value', value: 0 },
      right: { status: 'value', value: 10 },
      difference_right_minus_left: 10,
      ratio_right_over_left: null,
    },
  );
  assert.deepEqual(metrics.find((row) => row.name === 'latency_us.p90').left, {
    status: 'null',
    value: null,
  });
  assert.deepEqual(metrics.find((row) => row.name === 'latency_us.p95').left, {
    status: 'missing',
  });
  assert.equal(
    metrics.find((row) => row.name === 'latency_us.p90').difference_right_minus_left,
    null,
  );
});

test('failed detail requests, redirects, malformed identity and late body failure produce no partial export', () => {
  const path = `${base}/api/v1/collectivex/runs/${ids[1]}?version=1`;
  const malformed = dataset(ids[1]);
  malformed.series[0].points[0].components.dispatch.latency_us.p50 = '10';
  for (const response of [
    body({ error: 'Not found' }, { status: 404 }),
    body({ error: 'Unavailable' }, { status: 503 }),
    body({}, { status: 302 }),
    { body: '{' },
    { body: `\uFEFF${JSON.stringify(dataset(ids[1]))}` },
    { lateChunk: true },
    body(dataset(ids[0])),
    body({ ...dataset(ids[1]), version: 2 }),
    body({ ...dataset(ids[1]), run: { ...dataset(ids[1]).run, run_id: 9007199254740992 } }),
    body({
      ...dataset(ids[1]),
      run: { ...dataset(ids[1]).run, generated_at: '2026-02-30T12:00:00Z' },
    }),
    body({
      ...dataset(ids[1]),
      run: { ...dataset(ids[1]).run, generated_at: '2026-09-01T24:00:00Z' },
    }),
    body(malformed),
  ]) {
    const result = run(undefined, undefined, {
      args: ['--left', ids[0], '--right', ids[1], '--output', 'result.json'],
      responses: { [path]: response },
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(existsSync(join(result.cwd, 'result.json')), false);
    assert.ok(readdirSync(result.cwd).every((file) => !file.startsWith('.collectivex-')));
  }
});

test('invalid selection and unsupported schema stop before guessing IDs or requesting details', () => {
  for (const args of [
    ['--left', ids[0]],
    ['--left', ids[0], '--right', ids[0]],
    ['--left', '01', '--right', ids[1]],
    ['--left', '1e3', '--right', ids[1]],
    ['--left', 'https://example.org', '--right', ids[1]],
    ['--version', '2'],
  ]) {
    const result = run(undefined, undefined, { args });
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.requests, []);
  }
  const unsupported = run(undefined, undefined, {
    responses: { [`${base}/api/openapi.json`]: body({ paths: {} }) },
  });
  assert.notEqual(unsupported.status, 0);
  assert.equal(unsupported.requests.length, 1);
  for (const runs of [
    [dataset(ids[0]).run, dataset(ids[0]).run],
    [{ ...dataset(ids[0]).run, measured_cases: null }],
  ]) {
    const result = run(undefined, undefined, {
      args: [],
      responses: {
        [`${base}/api/v1/collectivex/runs?version=1`]: body({
          version: 1,
          discovery_complete: true,
          runs,
        }),
      },
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.requests.length, 2);
  }
});

test('atomic file publication preserves existing files, symlinks and directories and reports output failure', () => {
  const result = run(undefined, undefined, {
    args: ['--left', ids[0], '--right', ids[1], '--output', 'result.json'],
  });
  succeeded(result);
  assert.equal(result.stdout, '');
  assert.equal(
    JSON.parse(readFileSync(join(result.cwd, 'result.json'), 'utf8')).summary.matched,
    1,
  );
  assert.ok(readdirSync(result.cwd).every((file) => !file.startsWith('.collectivex-')));
  for (const type of ['file', 'directory', 'symlink']) {
    const cwd = suite.project();
    const destination = join(cwd, 'result.json');
    if (type === 'file') writeFileSync(destination, 'keep');
    if (type === 'directory') mkdirSync(destination);
    if (type === 'symlink') {
      writeFileSync(join(cwd, 'original'), 'keep');
      symlinkSync('original', destination);
    }
    const failed = run(undefined, undefined, { cwd, args: ['--output', 'result.json'] });
    assert.notEqual(failed.status, 0);
    assert.deepEqual(failed.requests, []);
    if (type !== 'directory') assert.equal(readFileSync(destination, 'utf8'), 'keep');
  }
  const broken = run(undefined, undefined, { stdoutFailure: true });
  assert.notEqual(broken.status, 0);
  assert.equal(broken.stdout, '');
  assert.match(broken.stderr, /broken pipe/u);
});

test('response budget and a concurrent output file fail closed after successful earlier reads', () => {
  const path = `${base}/api/v1/collectivex/runs/${ids[1]}?version=1`;
  const oversized = run(undefined, undefined, { responses: { [path]: { oversized: true } } });
  assert.notEqual(oversized.status, 0);
  assert.equal(oversized.stdout, '');
  assert.equal(oversized.requests.length, 3);
  assert.match(oversized.stderr, /32 MiB response budget/u);
  const race = run(undefined, undefined, {
    args: ['--left', ids[0], '--right', ids[1], '--output', 'result.json'],
    responses: { [path]: body(dataset(ids[1]), { raceOutputPath: 'result.json' }) },
  });
  assert.notEqual(race.status, 0);
  assert.equal(race.stdout, '');
  assert.equal(readFileSync(join(race.cwd, 'result.json'), 'utf8'), 'concurrent output');
  assert.ok(readdirSync(race.cwd).every((file) => !file.startsWith('.collectivex-')));
});

test('native fetch refuses a redirected second run and never reaches the replacement scope', async () => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    if (request.url === `/api/v1/collectivex/runs/${ids[1]}?version=1`) {
      response.writeHead(302, { Location: '/different-run' });
      response.end();
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(request.url === '/api/openapi.json' ? schema : dataset(ids[0])));
  });
  await new Promise((resolveListen) => {
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const cwd = suite.project();
  const nativePreload = join(cwd, 'native-fetch.mjs');
  writeFileSync(
    nativePreload,
    `
const native = globalThis.fetch;
globalThis.fetch = async (input, options) => {
 const url = new URL(input);
 const response = await native(new URL(url.pathname + url.search, 'http://127.0.0.1:${server.address().port}'), options);
 // Restore the requested origin after routing through the local fixture; native redirect handling stays active.
 Object.defineProperty(response, 'url', { value: String(input) });
 return response;
};
`,
  );
  try {
    await assert.rejects(
      promisify(execFile)(
        process.execPath,
        [
          '--import',
          pathToFileURL(nativePreload).href,
          join(installed.get('codex'), 'scripts/compare-collectivex.mjs'),
          '--left',
          ids[0],
          '--right',
          ids[1],
          '--output',
          'result.json',
        ],
        { cwd, env: suite.environment, timeout: 10000 },
      ),
      { code: 1, stdout: '' },
    );
    assert.deepEqual(requests, [
      '/api/openapi.json',
      `/api/v1/collectivex/runs/${ids[0]}?version=1`,
      `/api/v1/collectivex/runs/${ids[1]}?version=1`,
    ]);
    assert.equal(existsSync(join(cwd, 'result.json')), false);
  } finally {
    await new Promise((resolveClose) => {
      server.close(resolveClose);
    });
  }
});

test('both packed cookbooks execute their installed discovery commands and retain coverage guidance', () => {
  for (const target of ['codex', 'claude']) {
    const root = installed.get(target);
    const cookbook = readFileSync(join(root, 'references/collectivex.md'), 'utf8');
    const prefix = target === 'codex' ? '.agents' : '.claude';
    const commands = [...cookbook.matchAll(/```bash\n(?<command>node [^\n]+)\n```/gu)].map(
      (match) => match.groups.command,
    );
    const command = commands.find((line) => line.includes(prefix) && !line.includes('--left'));
    assert.ok(command);
    const [, script, ...args] = command.split(' ');
    assert.equal(resolve(root, '../../../', script), join(root, 'scripts/compare-collectivex.mjs'));
    const result = run(undefined, undefined, { target, cwd: resolve(root, '../../..'), args });
    succeeded(result);
    const output = JSON.parse(
      readFileSync(join(result.cwd, 'collectivex-comparison.json'), 'utf8'),
    );
    assert.equal(output.discovery.discovery_complete, false);
    assert.equal(output.summary.matched, 1);
    assert.equal(output.responses.length, 4);
    const guidance = cookbook.replaceAll(/\s+/gu, ' ');
    for (const required of [
      'Cases with **no measured rows** have no comparison group.',
      "complete datasets' `coverage` and optional `kv` arrays",
      'not proof of a controlled experiment',
      'Even `discovery_complete=true` does **not** mean complete workflow history.',
      'Rate-at-latency-p99 is a rate derived at p99 latency',
      'A zero left denominator yields a null ratio.',
      'no new benchmarks were run',
    ])
      assert.ok(guidance.includes(required), required);
  }
});
