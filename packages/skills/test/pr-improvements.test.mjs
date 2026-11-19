import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { before, test } from 'node:test';

import { packedSkillSuite } from './packed-skill.mjs';

const suite = packedSkillSuite();
let script;
before(() => {
  script = join(
    dirname(suite.install('codex')),
    'inferencex-pr-improvements/scripts/waterfall.mjs',
  );
});

function response({ agentic = false, cost = false } = {}) {
  const start = cost ? 4 : 10,
    end = cost ? 3 : 15;
  const source = {
    date: '2026-10-01',
    sources: [{ runUrl: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/100' }],
    prLinks: [],
    linksAvailable: true,
  };
  return {
    view: 'historical',
    params: {
      chart: 'waterfall',
      model: agentic ? 'DeepSeek-V4-Pro' : 'DeepSeek-R1-0528',
      sequence: agentic ? 'agentic-traces' : '8k/1k',
      precisions: ['fp8'],
      tcoBasis: 'internal',
    },
    metric: {
      label: cost ? 'Cost per Million Output Tokens ($)' : 'Output throughput (tok/s/chip)',
    },
    target: 35,
    interactivity: {
      statistic: agentic ? 'p90' : 'median',
      field: agentic ? 'p90_intvty' : 'median_intvty',
      unit: 'tok/s/user',
    },
    series: [
      {
        key: 'h200_sglang',
        label: 'H200 (SGLang)',
        hwKey: 'h200_sglang',
        excludedPointCount: 2,
        steps: [
          { ...source, kind: 'baseline', from: 0, to: start, delta: start },
          {
            ...source,
            date: '2026-10-02',
            kind: 'gain',
            from: start,
            to: end,
            delta: cost ? -1 : 5,
            prLinks: ['https://github.com/SemiAnalysisAI/InferenceX/pull/123'],
          },
          { ...source, date: '2026-10-02', kind: 'best', from: 0, to: end, delta: end },
        ],
      },
    ],
  };
}

function offline(data) {
  const project = suite.project();
  const input = join(project, 'input.json'),
    output = join(project, 'output');
  const bytes = `${JSON.stringify(data, null, 2)}\n`;
  writeFileSync(input, bytes);
  const result = suite.node([script, '--input', input, '--out', output]);
  return { ...result, input, output, bytes };
}

for (const example of [
  {
    name: 'throughput',
    options: {},
    result: '10 (2026-10-01) → 15 (2026-10-02); +50% change',
    statistic: 'MEDIAN',
    field: 'median_intvty',
  },
  {
    name: 'modeled cost',
    options: { cost: true },
    result: '4 (2026-10-01) → 3 (2026-10-02); -25% change',
    statistic: 'MEDIAN',
    field: 'median_intvty',
  },
  {
    name: 'AgentX',
    options: { agentic: true },
    result: '10 (2026-10-01) → 15 (2026-10-02); +50% change',
    statistic: 'P90',
    field: 'p90_intvty',
  },
]) {
  test(`installed PR improvements skill renders ${example.name} with exact capture and source links`, () => {
    const result = offline(response(example.options));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).steps, 3);
    const summary = readFileSync(join(result.output, 'summary.md'), 'utf8');
    assert.ok(summary.includes(example.result));
    assert.ok(summary.includes(`${example.statistic} interactivity 35 tok/s/user`));
    assert.ok(summary.includes('2 excluded date points'));
    assert.equal(readFileSync(join(result.output, 'response.json'), 'utf8'), result.bytes);
    const receipt = JSON.parse(readFileSync(join(result.output, 'request.json'), 'utf8'));
    assert.equal(receipt.mode, 'offline');
    assert.equal(receipt.sha256, createHash('sha256').update(result.bytes).digest('hex'));
    const csv = readFileSync(join(result.output, 'steps.csv'), 'utf8');
    assert.equal(csv.trimEnd().split('\r\n').length, 4);
    assert.ok(csv.includes(`"${example.field}"`));
    assert.ok(
      csv.includes(
        example.options.cost
          ? '"gain","2026-10-02","4","3","-1"'
          : '"gain","2026-10-02","10","15","5"',
      ),
    );
    const chart = readFileSync(join(result.output, 'chart.svg'), 'utf8');
    assert.ok(chart.includes('href="https://github.com/SemiAnalysisAI/InferenceX/pull/123"'));
    assert.ok(
      chart.includes('href="https://github.com/SemiAnalysisAI/InferenceX/actions/runs/100"'),
    );
  });
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: suite.environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('exit', (status) => resolve({ status, stdout, stderr }));
  });
}

async function serve(t, { waterfall = true, handleData } = {}) {
  const requests = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    requests.push({ method: req.method, url, headers: req.headers });
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/api/openapi.json') {
      res.end(
        JSON.stringify({
          paths: {
            '/api/v1/views/historical': {
              get: {
                parameters: [
                  { name: 'chart', schema: { enum: waterfall ? ['line', 'waterfall'] : ['line'] } },
                ],
              },
            },
          },
        }),
      );
    } else if (handleData) handleData(url, res);
    else {
      res.statusCode = 500;
      res.end('{"error":"Unexpected data request"}');
    }
  });
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
      }),
  );
  return { origin: `http://127.0.0.1:${server.address().port}`, requests };
}

test('installed live helper forwards selectors and captures the returned AgentX steps', async (t) => {
  const expected = {
    model: 'DeepSeek-V4-Pro',
    gpus: 'b200',
    frameworks: 'sglang',
    precisions: 'fp4',
    sequence: 'agentic-traces',
    metric: 'outputTputPerGpu',
    target: '35',
    chart: 'waterfall',
    format: 'json',
    tcoBasis: 'internal',
    extendToDate: '2026-10-19',
    start: '2026-10-01',
    end: '2026-10-19',
  };
  const data = response({ agentic: true });
  data.params.precisions = ['fp4'];
  data.series[0].key = 'b200_sglang';
  data.series[0].hwKey = 'b200_sglang';
  data.series[0].label = 'B200 (SGLang)';
  const { origin, requests } = await serve(t, {
    handleData(url, res) {
      if (
        url.pathname !== '/api/v1/views/historical' ||
        Object.keys(expected).some((key) => url.searchParams.get(key) !== expected[key])
      ) {
        res.statusCode = 422;
        res.end('{"error":"Wrong selection"}');
        return;
      }
      res.end(JSON.stringify(data));
    },
  });
  const output = join(suite.project(), 'live');
  const result = await run([
    '--model',
    'DeepSeek-V4-Pro',
    '--hardware',
    'B200',
    '--framework',
    'SGLang',
    '--precision',
    'FP4',
    '--sequence',
    'agentic-traces',
    '--metric',
    'outputTputPerGpu',
    '--target',
    '35',
    '--start',
    '2026-10-01',
    '--end',
    '2026-10-19',
    '--base-url',
    origin,
    '--out',
    output,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    requests.map((entry) => [entry.method, entry.url.pathname]),
    [
      ['GET', '/api/openapi.json'],
      ['GET', '/api/v1/views/historical'],
    ],
  );
  assert.ok(requests.every((entry) => entry.headers['x-inferencex-traffic'] === undefined));
  assert.deepEqual(Object.fromEntries(requests[1].url.searchParams), expected);
  const receipt = JSON.parse(readFileSync(join(output, 'request.json'), 'utf8'));
  assert.equal(receipt.mode, 'live');
  assert.equal(receipt.status, 200);
  assert.equal(receipt.url, requests[1].url.href.replace('http://localhost', origin));
  const summary = readFileSync(join(output, 'summary.md'), 'utf8');
  assert.ok(summary.includes('+50% change'));
  assert.ok(summary.includes('B200 (SGLang)'));
  assert.ok(summary.includes('P90 interactivity'));
});

test('unsupported deployments preserve capability receipt and receive no data query', async (t) => {
  const { origin, requests } = await serve(t, { waterfall: false });
  const output = join(suite.project(), 'unsupported');
  const result = await run([
    '--model',
    'DeepSeek-R1-0528',
    '--hardware',
    'h200_sglang',
    '--base-url',
    origin,
    '--out',
    output,
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not advertise historical waterfall support/u);
  assert.deepEqual(
    requests.map((entry) => entry.url.pathname),
    ['/api/openapi.json'],
  );
  assert.equal(JSON.parse(readFileSync(join(output, 'openapi-request.json'), 'utf8')).status, 200);
  assert.equal(existsSync(join(output, 'response.json')), false);
});

test('invalid calendar dates fail before making a request or creating output', async (t) => {
  const { origin, requests } = await serve(t);
  const output = join(suite.project(), 'invalid-date');
  const result = await run([
    '--model',
    'DeepSeek-R1-0528',
    '--hardware',
    'h200',
    '--start',
    '2026-02-30',
    '--base-url',
    origin,
    '--out',
    output,
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid --start date/u);
  assert.equal(requests.length, 0);
  assert.equal(existsSync(output), false);
});

test('empty selections stay explicit without inventing gains or CSV observations', () => {
  const data = response();
  data.series = [];
  const result = offline(data);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).steps, 0);
  assert.match(
    readFileSync(join(result.output, 'summary.md'), 'utf8'),
    /No series returned for this selection/u,
  );
  assert.equal(
    readFileSync(join(result.output, 'steps.csv'), 'utf8').trimEnd().split('\r\n').length,
    1,
  );
});

test('invalid response metadata is retained and rejected before rendering', () => {
  for (const [mutate, error] of [
    [
      (data) => {
        data.metric = {};
      },
      /Missing metric/u,
    ],
    [
      (data) => {
        data.interactivity.statistic = 'median';
      },
      /incompatible historical interactivity/u,
    ],
    [
      (data) => {
        data.params.chart = 'line';
      },
      /Expected a historical waterfall response/u,
    ],
    [
      (data) => {
        data.series[0].steps[1].prLinks = ['file:///untrusted-link'];
      },
      /Invalid source link/u,
    ],
  ]) {
    const data = response({ agentic: true });
    mutate(data);
    const result = offline(data);
    assert.equal(result.status, 1);
    assert.match(result.stderr, error);
    assert.equal(readFileSync(join(result.output, 'response.json'), 'utf8'), result.bytes);
    assert.equal(existsSync(join(result.output, 'chart.svg')), false);
  }
});

test('existing output is preserved rather than replaced by a new capture', () => {
  const project = suite.project();
  const input = join(project, 'input.json'),
    output = join(project, 'output');
  writeFileSync(input, JSON.stringify(response()));
  mkdirSync(output);
  writeFileSync(join(output, 'response.json'), 'original evidence');
  const result = suite.node([script, '--input', input, '--out', output]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Output directory already exists/u);
  assert.equal(readFileSync(join(output, 'response.json'), 'utf8'), 'original evidence');
  assert.equal(existsSync(join(output, 'chart.svg')), false);
});
