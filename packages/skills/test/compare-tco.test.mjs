import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { packageInfo, packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();
const preload = join(suite.temporaryRoot, 'tco-response.mjs');
let comparer;
let claudeComparer;

function point(hardware = 'b200', overrides = {}) {
  return {
    hardware,
    workload: '1024x1024',
    tier: 50,
    output_tput_per_gpu: 1000,
    boundary: 'interpolated',
    is_interpolated: true,
    frontier_points: 3,
    frontier_min_interactivity: 25,
    frontier_max_interactivity: 100,
    latest_date: '2026-09-05',
    oldest_frontier_date: '2026-09-01',
    evidence_date: { from: '2026-09-02', to: '2026-09-05' },
    ...overrides,
  };
}

function feed(rows = [point(), point('mi355x', { output_tput_per_gpu: 500 })], overrides = {}) {
  return {
    model: 'dsv4',
    db_model_keys: ['dsv4'],
    date: '2026-09-06',
    workloads: ['1024x1024'],
    tiers: [50],
    rows,
    ...overrides,
  };
}

const selection = [
  '--model',
  'dsv4',
  '--workloads',
  '1024x1024',
  '--target',
  '50',
  '--gpu-hourly-prices',
  'b200=3.6,mi355x=1.8',
  '--date',
  '2026-09-06',
];

function run(args = selection, body = feed(), faults = {}, script = comparer) {
  const cwd = suite.project();
  const fixture = join(cwd, 'fixture.json');
  const requests = join(cwd, 'requests.jsonl');
  const responseBody = typeof body === 'string' ? body : JSON.stringify(body);
  writeFileSync(fixture, JSON.stringify({ body: responseBody, ...faults }));
  if (faults.oldOutput) writeFileSync(join(cwd, 'comparison.json'), faults.oldOutput);
  const result = suite.node(['--import', pathToFileURL(preload).href, script, ...args], {
    cwd,
    env: {
      ...suite.environment,
      INFERENCEX_TEST_RESPONSE: fixture,
      INFERENCEX_TEST_REQUESTS: requests,
    },
  });
  return {
    ...result,
    cwd,
    responseBody,
    requests: existsSync(requests)
      ? readFileSync(requests, 'utf8').trimEnd().split('\n').map(JSON.parse)
      : [],
  };
}

before(() => {
  writeFileSync(
    preload,
    `
import fs, { appendFileSync, readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const fixture = JSON.parse(readFileSync(process.env.INFERENCEX_TEST_RESPONSE, 'utf8'));
const rename = fs.promises.rename;
const writeFile = fs.promises.writeFile;
fs.promises.writeFile = async (...args) => {
  if (fixture.writeFailure) {
    await writeFile(args[0], 'partial output', args[2]);
    throw new Error('controlled file write failure');
  }
  return writeFile(...args);
};
fs.promises.rename = async (...args) => {
  if (fixture.renameFailure) throw new Error('controlled atomic rename failure');
  return rename(...args);
};
syncBuiltinESMExports();
if (fixture.stdoutFailure) process.stdout.write = (_bytes, callback) => {
  queueMicrotask(() => callback(new Error('controlled broken pipe')));
  return false;
};
globalThis.fetch = async (input, options) => {
  appendFileSync(process.env.INFERENCEX_TEST_REQUESTS, JSON.stringify({
    url: String(input), redirect: options.redirect, signal: options.signal instanceof AbortSignal,
  }) + '\\n');
  if (fixture.timeout) throw new DOMException('Controlled timeout', 'TimeoutError');
  if (fixture.bodyFailure) return new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"rows":['));
    controller.error(new Error('controlled late body failure'));
  } }), { headers: { 'Content-Type': 'application/json' } });
  const body = fixture.chunks ? new ReadableStream({ start(controller) {
    for (const chunk of fixture.chunks) controller.enqueue(Buffer.from(chunk, 'base64'));
    controller.close();
  } }) : fixture.body;
  return new Response(body, {
    status: fixture.status ?? 200,
    headers: { 'Content-Type': fixture.contentType ?? 'application/json' },
  });
};
`,
  );
  comparer = join(suite.install('codex'), 'scripts/compare-tco.mjs');
  claudeComparer = join(suite.install('claude'), 'scripts/compare-tco.mjs');
});

test('packed helper applies per-GPU hourly prices to API output throughput and retains same-response evidence', () => {
  assert.ok(existsSync(comparer), 'the npm archive installs the TCO helper');
  assert.ok(
    existsSync(join(dirname(comparer), '../references/tco.md')),
    'the installed helper has its cookbook',
  );
  const result = succeeded(
    run(
      selection,
      feed([point('h200_sxm'), point(), point('mi355x', { output_tput_per_gpu: 500 })]),
    ),
  );
  const data = JSON.parse(result.stdout);
  assert.equal(data.metadata.package_version, packageInfo.version);
  assert.equal(data.metadata.benchmark_type, 'single_turn');
  assert.equal(data.metadata.interactivity_statistic, 'median');
  assert.equal(data.metadata.assumed_throughput_fraction, 1);
  assert.equal(data.metadata.target_output_tokens_per_second_per_user, 50);
  assert.deepEqual(data.metadata.gpu_hourly_prices_usd, { b200: 3.6, mi355x: 1.8 });
  assert.equal(data.rows.length, 2);
  assert.equal(data.rows[0].point.output_tput_per_gpu, 1000);
  assert.equal(data.rows[0].usd_per_million_output_tokens, 1);
  assert.equal(data.rows[1].usd_per_million_output_tokens, 1);
  assert.equal(data.rows[0].status, 'available');
  assert.equal(data.rows[0].point.is_interpolated, true);
  assert.equal(data.coverage.requested_points, 2);
  assert.equal(data.coverage.available_points, 2);
  assert.equal(data.coverage.status, 'complete');
  assert.deepEqual(data.coverage.returned_hardware, ['b200', 'h200_sxm', 'mi355x']);
  assert.equal(data.source.body, result.responseBody);
  assert.equal(data.source.sha256, createHash('sha256').update(result.responseBody).digest('hex'));
  assert.ok(Number.isFinite(Date.parse(data.source.retrieved_at)));
  assert.equal(result.requests.length, 1);
  const query = new URL(result.requests[0].url);
  assert.equal(query.origin, 'https://inferencex.semianalysis.com');
  assert.equal(query.pathname, '/api/v1/tco-feed');
  assert.deepEqual(Object.fromEntries(query.searchParams), {
    model: 'dsv4',
    workloads: '1024x1024',
    tiers: '50',
    view: 'points',
    format: 'json',
    date: '2026-09-06',
  });
  assert.equal(result.requests[0].redirect, 'error');
  assert.equal(result.requests[0].signal, true);
});

test('missing workload or hardware points remain explicit null costs instead of fabricated zero-cost winners', () => {
  const args = selection.map((value) => (value === '1024x1024' ? '1024x1024,8192x1024' : value));
  const result = succeeded(run(args, feed([point()], { workloads: ['1024x1024', '8192x1024'] })));
  const data = JSON.parse(result.stdout);
  assert.equal(data.coverage.status, 'incomplete');
  assert.equal(data.coverage.requested_points, 4);
  assert.equal(data.coverage.available_points, 1);
  assert.equal(data.coverage.status_counts.missing_point, 3);
  assert.deepEqual(
    data.rows.map(({ hardware, workload, status, usd_per_million_output_tokens }) => [
      hardware,
      workload,
      status,
      usd_per_million_output_tokens,
    ]),
    [
      ['b200', '1024x1024', 'available', 1],
      ['b200', '8192x1024', 'missing_point', null],
      ['mi355x', '1024x1024', 'missing_point', null],
      ['mi355x', '8192x1024', 'missing_point', null],
    ],
  );
  assert.equal(data.rows[1].point, null);
});

test('clamped, unreachable and rounded-zero points retain source values but have no modeled token cost', () => {
  const args = selection.map((value) =>
    value === 'b200=3.6,mi355x=1.8' ? 'b200=3.6,mi355x=1.8,h200_sxm=2' : value,
  );
  const data = JSON.parse(
    succeeded(
      run(
        args,
        feed([
          point('b200', {
            boundary: 'clamped_low',
            is_interpolated: false,
            frontier_min_interactivity: 75,
            evidence_date: { from: '2026-09-02', to: '2026-09-02' },
          }),
          point('mi355x', {
            boundary: 'unreachable',
            is_interpolated: false,
            frontier_max_interactivity: 40,
            output_tput_per_gpu: 0,
            evidence_date: null,
          }),
          point('h200_sxm', { output_tput_per_gpu: 0 }),
        ]),
      ),
    ).stdout,
  );
  assert.deepEqual(
    data.rows.map((row) => row.status),
    ['clamped_low', 'unreachable', 'zero_throughput'],
  );
  assert.deepEqual(
    data.rows.map((row) => row.usd_per_million_output_tokens),
    [null, null, null],
  );
  assert.deepEqual(
    data.rows.map((row) => row.point.output_tput_per_gpu),
    [1000, 0, 0],
  );
  assert.equal(data.coverage.status, 'incomplete');
  assert.equal(data.coverage.available_points, 0);
});

test('empty response and exact case-sensitive hardware selections remain coverage gaps', () => {
  const empty = JSON.parse(succeeded(run(selection, feed([]))).stdout);
  assert.equal(empty.coverage.status_counts?.missing_point, 2);
  const args = selection.map((value) => (value === 'b200=3.6,mi355x=1.8' ? 'B200=3.6' : value));
  const exact = JSON.parse(succeeded(run(args)).stdout);
  assert.equal(exact.rows[0].hardware, 'B200');
  assert.equal(exact.rows[0].status, 'missing_point');
  assert.deepEqual(exact.coverage.returned_hardware, ['b200', 'mi355x']);
});

test('display model and omitted date are passed through without an invented raw model mapping', () => {
  const args = selection
    .slice(0, -2)
    .map((value) => (value === 'dsv4' ? 'DeepSeek-V4-Pro' : value));
  const data = JSON.parse(
    succeeded(run(args, feed(undefined, { model: 'DeepSeek-V4-Pro', date: null }))).stdout,
  );
  assert.equal(data.metadata.requested_model, 'DeepSeek-V4-Pro');
  assert.deepEqual(data.metadata.db_model_keys, ['dsv4']);
  assert.equal(data.metadata.requested_date, null);
  assert.equal(data.metadata.date_selection, 'latest');
  assert.equal(data.metadata.cost_unit, 'USD per million output tokens');
  assert.equal(data.metadata.throughput_unit, 'output tokens per second per GPU');
  assert.equal(data.metadata.price_source, 'user-supplied');
  assert.equal(new URL(data.source.query_url).searchParams.has('date'), false);
});

test('exact knots retain observed evidence and reject contradictory single-knot provenance', () => {
  const knot = point('b200', {
    is_interpolated: false,
    frontier_points: 1,
    frontier_min_interactivity: 50,
    frontier_max_interactivity: 50,
    latest_date: '2026-09-02',
    oldest_frontier_date: '2026-09-02',
    evidence_date: { from: '2026-09-02', to: '2026-09-02' },
  });
  const data = JSON.parse(succeeded(run(selection, feed([knot]))).stdout);
  assert.equal(data.rows[0].status, 'available');
  assert.equal(data.rows[0].point.is_interpolated, false);
  assert.equal(data.rows[0].usd_per_million_output_tokens, 1);
  for (const bad of [
    { ...knot, frontier_max_interactivity: 60 },
    { ...knot, latest_date: '2026-09-03' },
    point('b200', { is_interpolated: false }),
    point('b200', {
      boundary: 'clamped_low',
      is_interpolated: false,
      frontier_min_interactivity: 75,
    }),
  ]) {
    const result = run(selection, feed([bad]));
    assert.notEqual(result.status, 0, JSON.stringify(bad));
    assert.equal(result.stdout, '');
  }
});

test('two-knot frontiers reject invented interior observations and incomplete bracketing dates', () => {
  const twoKnots = point('b200', {
    frontier_points: 2,
    evidence_date: { from: '2026-09-01', to: '2026-09-05' },
  });
  assert.equal(
    JSON.parse(succeeded(run(selection, feed([twoKnots]))).stdout).rows[0].status,
    'available',
  );
  for (const bad of [
    {
      ...twoKnots,
      is_interpolated: false,
      evidence_date: { from: '2026-09-01', to: '2026-09-01' },
    },
    { ...twoKnots, evidence_date: { from: '2026-09-02', to: '2026-09-03' } },
  ]) {
    const result = run([...selection, '--output', 'comparison.json'], feed([bad]), {
      oldOutput: 'keep',
    });
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(join(result.cwd, 'comparison.json'), 'utf8'), 'keep');
    assert.equal(result.stdout, '');
  }
});

test('rounded bounds preserve the server boundary verdict and real leap dates remain valid', () => {
  const data = JSON.parse(
    succeeded(
      run(
        selection,
        feed([
          point('b200', {
            boundary: 'clamped_low',
            is_interpolated: false,
            frontier_min_interactivity: 50,
            evidence_date: { from: '2026-09-02', to: '2026-09-02' },
          }),
          point('mi355x', {
            boundary: 'unreachable',
            is_interpolated: false,
            frontier_max_interactivity: 50,
            output_tput_per_gpu: 0,
            evidence_date: null,
          }),
        ]),
      ),
    ).stdout,
  );
  assert.deepEqual(
    data.rows.map((row) => row.status),
    ['clamped_low', 'unreachable'],
  );
  assert.deepEqual(
    data.rows.map((row) => row.usd_per_million_output_tokens),
    [null, null],
  );
  const args = selection.map((value) => (value === '2026-09-06' ? '2024-02-29' : value));
  const leap = feed(
    [
      point('b200', {
        latest_date: '2024-02-29',
        oldest_frontier_date: '2024-02-28',
        evidence_date: { from: '2024-02-28', to: '2024-02-29' },
      }),
    ],
    { date: '2024-02-29' },
  );
  assert.equal(JSON.parse(succeeded(run(args, leap)).stdout).rows[0].status, 'available');
});

test('unrepresentable token costs fail instead of becoming zero or null prices', () => {
  const hugePrice = selection.map((value) =>
    value === 'b200=3.6,mi355x=1.8' ? `b200=1${'0'.repeat(308)}` : value,
  );
  for (const [args, body] of [
    [hugePrice, feed()],
    [selection, feed([point('b200', { output_tput_per_gpu: Number.MIN_VALUE })])],
    [selection, feed([point('b200', { output_tput_per_gpu: 1e308 })])],
  ]) {
    const result = run([...args, '--output', 'comparison.json'], body, { oldOutput: 'original' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /numeric range/u);
    assert.equal(readFileSync(join(result.cwd, 'comparison.json'), 'utf8'), 'original');
  }
});

test('invalid or ambiguous assumptions fail before requesting data', () => {
  const replace = (key, value) =>
    selection.map((entry, index) => (selection[index - 1] === key ? value : entry));
  const invalid = [
    [],
    replace('--model', ' '),
    replace('--date', '2026-02-30'),
    replace('--date', '2026-9-06'),
    replace('--target', '0'),
    replace('--target', '-1'),
    replace('--target', 'NaN'),
    replace('--target', '10001'),
    replace('--target', '1e2'),
    replace('--workloads', '1024x0'),
    replace('--workloads', '01024x1024'),
    replace('--workloads', '1024x1024,1024x1024'),
    replace('--workloads', '1024x1024,8192x1024,1x1,2x2,3x3,4x4,5x5,6x6,7x7'),
    replace('--gpu-hourly-prices', 'b200=0'),
    replace('--gpu-hourly-prices', 'b200=-1'),
    replace('--gpu-hourly-prices', 'b200=Infinity'),
    replace('--gpu-hourly-prices', 'b200=3,b200=4'),
    replace('--gpu-hourly-prices', 'b200=3,mi355x'),
    replace('--gpu-hourly-prices', 'b200=3=4'),
    replace('--gpu-hourly-prices', 'b200=3,'),
    [...selection, '--target', '75'],
    [...selection, '--alpha', '0.25'],
    [...selection, '--framework', 'sglang'],
    [...selection, '--format', 'csv'],
    [...selection, '--output', ''],
  ];
  for (const args of invalid) {
    const result = run(args);
    assert.notEqual(result.status, 0, JSON.stringify(args));
    assert.equal(result.stdout, '', JSON.stringify(args));
    assert.equal(result.requests.length, 0, JSON.stringify(args));
  }
});

test('malformed, mismatched and duplicate response points fail before replacing old output', () => {
  const malformed = [
    'not json',
    null,
    [],
    feed([], { model: 'dsr1' }),
    feed([], { date: null }),
    feed([], { db_model_keys: [] }),
    feed([], { db_model_keys: [123] }),
    feed([], { workloads: ['8192x1024'] }),
    feed([], { tiers: [75] }),
    feed([], { alpha: 0.25 }),
    feed([point(), point()]),
    ...[
      { hardware: 123 },
      { workload: '8192x1024' },
      { tier: 75 },
      { output_tput_per_gpu: '1000' },
      { output_tput_per_gpu: null },
      { output_tput_per_gpu: -1 },
      { boundary: 'assumed' },
      { boundary: 'unreachable' },
      { boundary: 'clamped_low' },
      { is_interpolated: 'true' },
      { frontier_points: 0 },
      { frontier_points: 1 },
      { frontier_min_interactivity: 60 },
      { frontier_max_interactivity: 40 },
      { latest_date: '2026-02-30' },
      { latest_date: '2026-09-07' },
      { oldest_frontier_date: '2026-09-06' },
      { evidence_date: null },
      { evidence_date: { from: '2026-09-01', to: '2026-09-06' } },
      { evidence_date: { from: '2026-09-04', to: '2026-09-02' } },
      { evidence_labels: [123] },
    ].map((overrides) => feed([point('b200', overrides)])),
  ];
  for (const body of malformed) {
    const result = run([...selection, '--output', 'comparison.json'], body, {
      oldOutput: 'original',
    });
    assert.notEqual(result.status, 0, JSON.stringify(body));
    assert.equal(result.stdout, '');
    assert.equal(result.requests.length, 1);
    assert.equal(readFileSync(join(result.cwd, 'comparison.json'), 'utf8'), 'original');
  }
});

test('HTTP, timeout and late response-body failures preserve the previously selected file', () => {
  for (const faults of [
    { status: 302 },
    { status: 503 },
    { timeout: true },
    { bodyFailure: true },
    { contentType: 'text/html' },
  ]) {
    const result = run([...selection, '--output', 'comparison.json'], feed(), {
      ...faults,
      oldOutput: 'original',
    });
    assert.notEqual(result.status, 0, JSON.stringify(faults));
    assert.equal(result.stdout, '');
    assert.equal(result.requests.length, 1);
    assert.equal(readFileSync(join(result.cwd, 'comparison.json'), 'utf8'), 'original');
  }
});

test('atomic output success replaces the chosen file and rename failure leaves it intact without temporary residue', () => {
  const args = [...selection, '--output', 'comparison.json'];
  const success = succeeded(run(args, feed(), { oldOutput: 'original' }));
  assert.equal(success.stdout, '');
  assert.equal(
    JSON.parse(readFileSync(join(success.cwd, 'comparison.json'), 'utf8')).rows[0]
      .usd_per_million_output_tokens,
    1,
  );
  for (const faults of [{ renameFailure: true }, { writeFailure: true }]) {
    const failed = run(args, feed(), { oldOutput: 'original', ...faults });
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /controlled .* failure/u);
    assert.equal(readFileSync(join(failed.cwd, 'comparison.json'), 'utf8'), 'original');
    assert.deepEqual(readdirSync(failed.cwd).sort(), [
      'comparison.json',
      'fixture.json',
      'requests.jsonl',
    ]);
  }
});

test('closed stdout is reported as an export failure', () => {
  const result = run(selection, feed(), { stdoutFailure: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /^compare-tco: controlled broken pipe$/mu);
});

test('response capture preserves chunked UTF-8 exactly and rejects oversized or invalid bytes before output', () => {
  const body = `${JSON.stringify(feed([point('b200', { evidence_labels: ['中文 evidence'] })]), null, 2)}\n`;
  const bytes = Buffer.from(body);
  const split = bytes.indexOf(Buffer.from('中')) + 1;
  const result = succeeded(
    run(selection, body, {
      chunks: [bytes.subarray(0, split), bytes.subarray(split)].map((chunk) =>
        chunk.toString('base64'),
      ),
    }),
  );
  const data = JSON.parse(result.stdout);
  assert.equal(data.source.body, body);
  assert.equal(data.source.body_bytes, bytes.length);
  assert.equal(data.source.body_encoding, 'utf8');
  assert.equal(data.source.sha256, createHash('sha256').update(bytes).digest('hex'));
  for (const chunks of [
    [Buffer.alloc(4 * 1024 * 1024, ' '), Buffer.from(JSON.stringify(feed()))],
    [
      bytes.subarray(0, split - 1),
      Buffer.from([255]),
      bytes.subarray(split - 1 + Buffer.byteLength('中')),
    ],
  ]) {
    const failed = run([...selection, '--output', 'comparison.json'], feed(), {
      oldOutput: 'original',
      chunks: chunks.map((chunk) => chunk.toString('base64')),
    });
    assert.notEqual(failed.status, 0);
    assert.equal(failed.stdout, '');
    assert.equal(readFileSync(join(failed.cwd, 'comparison.json'), 'utf8'), 'original');
  }
});

test('packed Claude helper exposes help without network access', () => {
  const result = succeeded(run(['--help'], feed(), {}, claudeComparer));
  assert.match(result.stdout, /--gpu-hourly-prices/u);
  assert.equal(result.requests.length, 0);
});

test('native fetch never follows a redirected feed or replaces old output', async () => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    if (request.url.startsWith('/api/v1/tco-feed?')) {
      response.writeHead(302, { Location: '/different-scope' });
      response.end();
    } else {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(feed()));
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const cwd = suite.project();
  const nativePreload = join(cwd, 'native-fetch.mjs');
  writeFileSync(
    nativePreload,
    `
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(input);
  return nativeFetch(new URL(url.pathname + url.search, 'http://127.0.0.1:${server.address().port}'), options);
};
`,
  );
  writeFileSync(join(cwd, 'comparison.json'), 'original');
  try {
    await assert.rejects(
      promisify(execFile)(
        process.execPath,
        [
          '--import',
          pathToFileURL(nativePreload).href,
          comparer,
          ...selection,
          '--output',
          'comparison.json',
        ],
        { cwd, env: suite.environment, timeout: 10_000 },
      ),
      { code: 1 },
    );
    assert.equal(requests.length, 1);
    assert.match(requests[0], /^\/api\/v1\/tco-feed\?/u);
    assert.equal(readFileSync(join(cwd, 'comparison.json'), 'utf8'), 'original');
  } finally {
    await new Promise((resolveClose) => {
      server.close(resolveClose);
    });
  }
});

test('a real closed stdout pipe exits nonzero without a successful export', async () => {
  const cwd = suite.project();
  const fixture = join(cwd, 'fixture.json');
  writeFileSync(fixture, JSON.stringify({ body: JSON.stringify(feed()) }));
  const child = spawn(
    process.execPath,
    ['--import', pathToFileURL(preload).href, comparer, ...selection],
    {
      cwd,
      env: {
        ...suite.environment,
        INFERENCEX_TEST_RESPONSE: fixture,
        INFERENCEX_TEST_REQUESTS: join(cwd, 'requests.jsonl'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    },
  );
  child.stdout.destroy();
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const code = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', resolveExit);
  });
  assert.equal(code, 1);
  assert.match(stderr, /compare-tco: .*EPIPE/u);
});
