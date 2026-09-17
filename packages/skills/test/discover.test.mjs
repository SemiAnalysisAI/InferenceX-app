import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { discover, normalizeArgs } from '../skills/inferencex-api/scripts/discover.mjs';
import { packedSkillSuite, succeeded } from './packed-skill.mjs';

const suite = packedSkillSuite();

function snapshot(root) {
  return readdirSync(root, { recursive: true })
    .map((path) => {
      const fullPath = join(root, path);
      const entry = lstatSync(fullPath);
      return entry.isFile()
        ? {
            path,
            mode: entry.mode,
            size: entry.size,
            sha256: createHash('sha256').update(readFileSync(fullPath)).digest('hex'),
          }
        : { path, mode: entry.mode, directory: entry.isDirectory() };
    })
    .toSorted((left, right) => left.path.localeCompare(right.path));
}

const availability = [
  {
    model: 'future-model',
    isl: null,
    osl: null,
    precision: 'bf16',
    hardware: 'b200',
    framework: 'sglang',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'agentic_traces',
    date: '2026-09-06',
  },
  {
    model: 'dsv4',
    isl: 8192,
    osl: 1024,
    precision: 'fp8',
    hardware: 'h200_sxm',
    framework: 'vllm',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'single_turn',
    date: '2026-09-07',
  },
];

function saved(body, id = 'a'.repeat(64)) {
  const bytes = Buffer.from(JSON.stringify(body));
  return {
    id,
    status: 200,
    retrievedAt: '2026-09-07T12:00:00.000Z',
    bytes,
    body,
  };
}

function benchmark(id, overrides = {}) {
  return {
    id,
    hardware: 'h200_sxm',
    framework: 'vllm',
    model: 'dsv4',
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
    isl: 8192,
    osl: 1024,
    conc: 32,
    offload_mode: 'off',
    image: 'vllm/vllm-openai:v0.10.2',
    recipe_fingerprint: 'recipe-1',
    metrics: {},
    date: '2026-09-07',
    workflow_run_id: '900719925474099399999',
    run_started_at: '2026-09-07T10:00:00Z',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/900719925474099399999',
    ...overrides,
  };
}

const openapi = {
  paths: {
    '/api/v1/benchmarks': {
      get: {
        parameters: [
          {
            name: 'model',
            in: 'query',
            required: true,
            schema: { type: 'string', enum: ['DeepSeek-V4-Pro', 'GLM-5'] },
          },
        ],
      },
    },
  },
};

test('models and dates project validated availability rows without inventing selectors', async () => {
  const requests = [];
  const get = (spec) => {
    requests.push(spec);
    return saved(availability);
  };
  const models = await discover(normalizeArgs(['models']), { get });
  assert.deepEqual(models.items, [{ raw_model: 'dsv4' }, { raw_model: 'future-model' }]);
  const dates = await discover(normalizeArgs(['dates', '--model', 'dsv4']), { get });
  assert.deepEqual(dates.items, [{ date: '2026-09-07' }]);
  assert.equal(
    requests.every(({ operation }) => operation === 'availability'),
    true,
  );
});

test('normalization accepts argv and canonical objects and rejects ambiguous scope', () => {
  const canonical = {
    resource: 'configs',
    model: 'DeepSeek-V4-Pro',
    date: '2026-09-07',
    limit: 1,
    offset: 2,
  };
  assert.deepEqual(
    normalizeArgs([
      'configs',
      '--model',
      'DeepSeek-V4-Pro',
      '--date=2026-09-07',
      '--limit',
      '1',
      '--offset=2',
    ]),
    canonical,
  );
  assert.deepEqual(normalizeArgs(canonical), canonical);
  for (const input of [
    ['dates'],
    ['models', '--model', 'dsv4'],
    ['datasets', '--date', '2026-09-07'],
    ['configs', '--model', 'x', '--limit', '0'],
    ['configs', '--model', 'x', '--model', 'y'],
    ['configs', '--model', 'x', '--date', '2026-02-30'],
    { ...canonical, unknown: true },
  ]) {
    assert.throws(() => normalizeArgs(input), { code: 'INVALID_ARGUMENT' });
  }
});

test('availability is fully validated before local pagination', async () => {
  const get = () => saved([...availability, { ...availability[0], disagg: 'false' }]);
  await assert.rejects(discover(normalizeArgs(['models', '--limit', '1']), { get }), {
    code: 'INVALID_RESPONSE',
  });

  const valid = await discover(normalizeArgs(['models', '--limit', '1']), {
    get: () => saved(availability),
  });
  assert.equal(valid.items.length, 1);
  assert.deepEqual(valid.coverage, {
    complete_for_scope: false,
    returned_items: 1,
    available_items: 2,
    limit: 1,
    offset: 0,
    limitations: [
      'Items are sliced locally from one fetched snapshot; this is not stable server pagination.',
    ],
  });
});

test('configs preserve observed combinations, exact IDs, source scope, and unknown trace state', async () => {
  const rows = [
    benchmark('900719925474099312345'),
    benchmark('900719925474099312346', {
      hardware: 'b200',
      precision: 'bf16',
      framework: 'sglang',
      benchmark_type: 'agentic_traces',
      isl: null,
      osl: null,
      conc: 1,
      metrics: { power_valid: 1, power_metric_schema_version: 2 },
    }),
  ];
  const requests = [];
  const get = (spec) => {
    requests.push(spec);
    return saved(spec.operation === 'openapi' ? openapi : rows, String(requests.length).repeat(64));
  };
  const document = await discover(
    normalizeArgs(['configs', '--model', 'DeepSeek-V4-Pro', '--date', '2026-09-07']),
    { get },
  );
  assert.deepEqual(
    document.items.map(({ hardware, precision }) => [hardware, precision]),
    [
      ['b200', 'bf16'],
      ['h200_sxm', 'fp8'],
    ],
  );
  assert.equal(document.items[0].result_id, '900719925474099312346');
  assert.deepEqual(document.items[0].workload, {
    benchmark_type: 'agentic_traces',
    input_tokens: null,
    output_tokens: null,
  });
  assert.equal(document.items[0].power.strict_v2, 'eligible');
  assert.equal(document.items[1].power.strict_v2, 'unknown');
  assert.equal(
    document.items.every(({ trace }) => trace.availability === 'unknown'),
    true,
  );
  assert.equal(document.coverage.complete_for_scope, true);
  assert.equal(document.sources.length > 0, true);
  assert.deepEqual(
    requests.map(({ operation }) => operation),
    ['openapi', 'benchmarks'],
  );
  assert.equal(
    requests.some(({ operation }) => operation.includes('trace')),
    false,
  );
  assert.deepEqual(document.scope, {
    requested_model: 'DeepSeek-V4-Pro',
    model_selector: 'DeepSeek-V4-Pro',
    requested_date: '2026-09-07',
    date_selection: 'as-of',
  });
  assert.deepEqual(document.sources[1].scope, document.scope);

  const limitedOptions = normalizeArgs(['configs', '--model', 'DeepSeek-V4-Pro', '--limit', '1']);
  const fixtureGet = (spec) => saved(spec.operation === 'openapi' ? openapi : rows);
  const limited = await discover(limitedOptions, { get: fixtureGet });
  assert.equal(limited.coverage.complete_for_scope, false);
  assert.equal(limited.coverage.available_items, 2);

  const malformed = [...rows, { ...rows[0], conc: '32' }];
  await assert.rejects(
    discover(limitedOptions, {
      get: (spec) => saved(spec.operation === 'openapi' ? openapi : malformed),
    }),
    { code: 'INVALID_RESPONSE' },
  );
});

test('an unmappable model key is reported without a benchmark request', async () => {
  const requests = [];
  const document = await discover(normalizeArgs(['configs', '--model', 'future-model']), {
    get: (spec) => {
      requests.push(spec);
      return saved(openapi);
    },
  });
  assert.deepEqual(
    requests.map(({ operation }) => operation),
    ['openapi'],
  );
  assert.deepEqual(document.items, []);
  assert.equal(document.scope.model_selector, null);
  assert.equal(document.coverage.complete_for_scope, false);
  assert.equal(document.coverage.available_items, null);
  assert.match(document.coverage.limitations.join(' '), /future-model.*public model selector/u);
});

test('datasets return only the validated registry and never crawl conversations', async () => {
  const rows = [
    {
      id: 'two',
      slug: 'zeta',
      label: 'Zeta',
      variant: 'default',
      description: null,
      hf_url: null,
      license: null,
      conversation_count: 0,
      summary: {},
      ingested_at: '2026-09-07T10:00:00Z',
    },
    {
      id: 'one',
      slug: 'alpha',
      label: 'Alpha',
      variant: 'default',
      description: 'Agent traces',
      hf_url: 'https://huggingface.co/datasets/example/alpha',
      license: 'Apache-2.0',
      conversation_count: 2,
      summary: { totalIn: 10 },
      ingested_at: '2026-09-06T10:00:00Z',
    },
  ];
  const requests = [];
  const document = await discover(normalizeArgs(['datasets']), {
    get: (spec) => {
      requests.push(spec);
      return saved(rows);
    },
  });
  assert.deepEqual(
    document.items.map(({ slug }) => slug),
    ['alpha', 'zeta'],
  );
  assert.deepEqual(
    requests.map(({ operation }) => operation),
    ['datasets'],
  );
});

test('capabilities come from installed command and schema registries without HTTP', async () => {
  const document = await discover(normalizeArgs(['capabilities']), {
    get: () => assert.fail('capability discovery must stay offline'),
  });
  assert.equal(
    document.items.some((item) => item.type === 'command' && item.command === 'discover'),
    true,
  );
  assert.equal(
    document.items.some((item) => item.type === 'schema' && item.name === 'error'),
    true,
  );
  assert.equal(
    document.sources.every(({ kind }) => kind === 'local_registry'),
    true,
  );
  assert.equal(document.coverage.complete_for_scope, true);
});

test('packed CLI discovers without artifacts, then exports and verifies one PowerX slice', () => {
  const project = suite.project('discovery milestone-');
  const installed = suite.install('codex', project);
  const fixturePath = join(suite.temporaryRoot, 'discover-fixture.json');
  const requestsPath = join(suite.temporaryRoot, 'discover-requests.txt');
  const preload = join(suite.temporaryRoot, 'discover-responses.mjs');
  const offline = join(suite.temporaryRoot, 'discover-offline.mjs');
  const rows = [
    benchmark('900719925474099312345', {
      metrics: { power_valid: 1, power_metric_schema_version: 2, avg_power_w: 678.5 },
    }),
    benchmark('900719925474099312346', {
      hardware: 'b200',
      precision: 'bf16',
      framework: 'sglang',
      metrics: { power_valid: 1, power_metric_schema_version: 2, avg_power_w: 610 },
    }),
  ];
  writeFileSync(fixturePath, JSON.stringify({ openapi, rows }));
  writeFileSync(
    preload,
    `
import { appendFileSync, readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(process.env.INFERENCEX_DISCOVER_FIXTURE, 'utf8'));
globalThis.fetch = (input) => {
  const url = new URL(input.url ?? input);
  appendFileSync(process.env.INFERENCEX_DISCOVER_REQUESTS, url.href + '\\n');
  if (url.pathname === '/api/openapi.json') return Response.json(fixture.openapi);
  if (url.pathname === '/api/v1/benchmarks') return Response.json(fixture.rows);
  throw new Error('Unexpected request: ' + url.href);
};
`,
  );
  writeFileSync(
    offline,
    `globalThis.fetch = () => { throw new Error('offline verification attempted HTTP'); };\n`,
  );
  const environment = {
    ...suite.environment,
    INFERENCEX_DISCOVER_FIXTURE: fixturePath,
    INFERENCEX_DISCOVER_REQUESTS: requestsPath,
  };
  const cli = join(installed, 'scripts/inferencex.mjs');
  const before = snapshot(project);
  const discovery = succeeded(
    suite.node(
      [
        '--import',
        pathToFileURL(preload).href,
        cli,
        'discover',
        'configs',
        '--model',
        'DeepSeek-V4-Pro',
        '--date',
        '2026-09-07',
      ],
      { cwd: project, env: environment },
    ),
  );
  assert.deepEqual(snapshot(project), before);
  const document = JSON.parse(discovery.stdout);
  assert.deepEqual(
    document.items.map(({ hardware, precision }) => [hardware, precision]),
    [
      ['b200', 'bf16'],
      ['h200_sxm', 'fp8'],
    ],
  );
  assert.equal(discovery.stderr, '');

  const directory = join(project, 'powerx-run-001');
  const exported = succeeded(
    suite.node(
      [
        '--import',
        pathToFileURL(preload).href,
        cli,
        'powerx',
        'export',
        '--model',
        'DeepSeek-V4-Pro',
        '--isl',
        '8192',
        '--osl',
        '1024',
        '--output-dir',
        directory,
      ],
      { cwd: project, env: environment },
    ),
  );
  assert.equal(JSON.parse(exported.stdout).validity, 'valid');
  const verified = succeeded(
    suite.node(['--import', pathToFileURL(offline).href, cli, 'verify', directory], {
      cwd: project,
      env: suite.environment,
    }),
  );
  assert.equal(JSON.parse(verified.stdout).validity, 'valid');
  const requests = readFileSync(requestsPath, 'utf8').trimEnd().split('\n');
  assert.equal(
    requests.some((url) => url.includes('trace')),
    false,
  );
  assert.equal(requests.filter((url) => url.includes('/api/openapi.json')).length, 1);
});
