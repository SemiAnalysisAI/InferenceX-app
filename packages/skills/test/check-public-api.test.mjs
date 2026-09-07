import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkPublicApi, resolvePackage } from '../scripts/check-public-api.mjs';

const identity = {
  package: '@semianalysisai/inferencex-skills',
  version: '0.11.0',
  tarball: 'https://registry.npmjs.org/archive.tgz',
  integrity: 'sha512-example',
  shasum: 'a'.repeat(40),
};
const openapi = {
  info: { description: 'unrelated prose' },
  paths: {
    '/api/v1/benchmarks': {
      get: {
        parameters: [
          { name: 'model', in: 'query', required: true, schema: { enum: ['DeepSeek-V4-Pro'] } },
        ],
      },
    },
  },
};
const availability = [
  {
    model: 'dsv4',
    precision: 'fp4',
    hardware: 'b300',
    framework: 'sglang',
    spec_method: 'mtp',
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    disagg: false,
    date: '2026-09-01',
  },
];
const datasets = [
  {
    id: 'dataset-1',
    slug: 'example',
    label: 'Example',
    variant: 'default',
    ingested_at: '2026-09-01T00:00:00Z',
    description: null,
    hf_url: null,
    license: null,
    conversation_count: 1,
    summary: {},
  },
];
const benchmarks = [
  {
    id: '1',
    model: 'dsv4',
    hardware: 'b300',
    framework: 'sglang',
    precision: 'fp4',
    spec_method: 'mtp',
    benchmark_type: 'single_turn',
    offload_mode: 'off',
    disagg: false,
    is_multinode: false,
    prefill_dp_attention: false,
    decode_dp_attention: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    conc: 1,
    isl: 8192,
    osl: 1024,
    image: null,
    recipe_fingerprint: null,
    run_url: null,
    metrics: {},
    date: '2026-09-01',
  },
];

async function run(overrides = {}) {
  const values = { openapi, availability, datasets, benchmarks, ...overrides };
  const calls = [];
  const request = (url, options) => {
    calls.push({ url, options });
    options.signal.throwIfAborted();
    const key = url.includes('openapi')
      ? 'openapi'
      : url.includes('availability')
        ? 'availability'
        : url.includes('datasets')
          ? 'datasets'
          : 'benchmarks';
    const response = Response.json(values[key]);
    Object.defineProperty(response, 'url', { value: url });
    return response;
  };
  const result = await checkPublicApi({
    packageVersion: '0.11.0',
    packageResolver: () => identity,
    request,
  });
  return { result, calls };
}

test('resolver uses the published installer version command', () => {
  const calls = [];
  const resolved = resolvePackage('0.11.0', (file, args) => {
    calls.push({ file, args });
    return args[0] === 'exec'
      ? 'Installer version: 0.11.0\n'
      : JSON.stringify({
          name: identity.package,
          version: identity.version,
          dist: {
            tarball: identity.tarball,
            integrity: identity.integrity,
            shasum: identity.shasum,
          },
        });
  });
  assert.equal(resolved.version, '0.11.0');
  assert.deepEqual(calls[0].args.slice(-3), ['--', 'inferencex-skills', '--version']);
});

test('immutable published 0.11 fixture supports the installer version command', () => {
  const directory = mkdtempSync(join(tmpdir(), 'inferencex-0.11-version-'));
  try {
    const fixture = fileURLToPath(
      new URL('fixtures/semianalysisai-inferencex-skills-0.11.0.tgz', import.meta.url),
    );
    const version = execFileSync(
      'npm',
      ['exec', '--yes', '--offline', '--package', fixture, '--', 'inferencex-skills', '--version'],
      {
        cwd: directory,
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...process.env, npm_config_cache: join(directory, 'npm-cache') },
      },
    );
    assert.equal(version.trim(), 'Installer version: 0.11.0');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('monitor consumes exactly four shapes once under fixed ceilings', async () => {
  const { result, calls } = await run();
  assert.equal(result.status, 'passed');
  assert.equal(result.totals.api_gets, 4);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(({ options }) => options.method === 'GET' && options.redirect === 'error'));
  assert.deepEqual(result.limits, {
    api_gets: 4,
    attempts_per_get: 1,
    total_bytes: 10 * 1024 * 1024,
    timeout_ms: 60_000,
  });
  assert.match(calls.at(-1).url, /benchmarks\?model=DeepSeek-V4-Pro$/u);
});

test('monitor accepts an empty scoped benchmark response with reordered model enums', async () => {
  const reordered = structuredClone(openapi);
  reordered.paths['/api/v1/benchmarks'].get.parameters[0].schema.enum = [
    'Zeta-Model',
    'DeepSeek-V4-Pro',
  ];

  const { result, calls } = await run({ openapi: reordered, benchmarks: [] });

  assert.equal(result.consumed.benchmark_model_parameter.selector, 'DeepSeek-V4-Pro');
  assert.equal(result.consumed.benchmark_rows, 0);
  assert.equal(result.totals.api_gets, 4);
  assert.match(calls.at(-1).url, /benchmarks\?model=DeepSeek-V4-Pro$/u);
});

test('consumed OpenAPI changes fail while unrelated descriptions do not', async () => {
  const changed = structuredClone(openapi);
  changed.paths['/api/v1/benchmarks'].get.parameters[0].required = false;
  await assert.rejects(run({ openapi: changed }), /model parameter changed/u);
  const prose = structuredClone(openapi);
  prose.info.description = 'Completely different documentation wording';
  await run({ openapi: prose });
});

test('availability and datasets reject empties; all rows reject malformed shapes', async () => {
  for (const [key, malformed] of [
    ['availability', []],
    ['availability', [{ ...availability[0], disagg: 'false' }]],
    ['datasets', []],
    ['datasets', [{ ...datasets[0], conversation_count: -1 }]],
    ['benchmarks', [{ ...benchmarks[0], metrics: null }]],
  ])
    await assert.rejects(run({ [key]: malformed }), /response shape is (?:empty or )?invalid/u);
});

test('exact package identity, total bytes and deadline signals fail closed', async () => {
  await assert.rejects(
    checkPublicApi({
      packageVersion: '0.11.0',
      packageResolver: () => ({ ...identity, version: '0.10.0' }),
      request: assert.fail,
    }),
    /identity differs/u,
  );
  await assert.rejects(run({ openapi: 'x'.repeat(10 * 1024 * 1024) }), /10 MiB/u);
  const controller = new AbortController();
  controller.abort(new Error('deadline reached'));
  await assert.rejects(
    checkPublicApi({
      packageVersion: '0.11.0',
      packageResolver: () => identity,
      signal: controller.signal,
      request: (_url, options) => options.signal.throwIfAborted(),
    }),
    /deadline reached/u,
  );
  await assert.rejects(
    checkPublicApi({ packageVersion: 'latest', packageResolver: assert.fail }),
    /exact package version/u,
  );
});
