#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

const PACKAGE = '@semianalysisai/inferencex-skills';
const ORIGIN = 'https://inferencex.semianalysis.com';
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REQUESTS = 4;
const TIMEOUT_MS = 60_000;

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const date = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().startsWith(value);
};

export function resolvePackage(packageVersion, execute = execFileSync) {
  const directory = mkdtempSync(join(tmpdir(), 'inferencex-public-check-'));
  try {
    const spec = `${PACKAGE}@${packageVersion}`;
    const version = execute(
      'npm',
      ['exec', '--yes', '--package', spec, '--', 'inferencex-skills', '--version'],
      { cwd: directory, encoding: 'utf8', timeout: 30_000 },
    ).trim();
    if (version !== `Installer version: ${packageVersion}`) {
      throw new Error('Resolved executable version differs');
    }
    const metadata = JSON.parse(
      execute('npm', ['view', spec, 'name', 'version', 'dist', '--json'], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 30_000,
      }),
    );
    if (
      metadata.name !== PACKAGE ||
      metadata.version !== packageVersion ||
      !object(metadata.dist)
    ) {
      throw new Error('Resolved registry identity differs');
    }
    return {
      package: PACKAGE,
      version: packageVersion,
      tarball: metadata.dist.tarball,
      integrity: metadata.dist.integrity,
      shasum: metadata.dist.shasum,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function availabilityRow(row) {
  return (
    object(row) &&
    ['model', 'precision', 'hardware', 'framework', 'spec_method', 'benchmark_type'].every(
      (key) => typeof row[key] === 'string',
    ) &&
    ['isl', 'osl'].every((key) => row[key] === null || Number.isFinite(row[key])) &&
    typeof row.disagg === 'boolean' &&
    date(row.date)
  );
}

function datasetRow(row) {
  return (
    object(row) &&
    ['id', 'slug', 'label', 'variant', 'ingested_at'].every(
      (key) => typeof row[key] === 'string',
    ) &&
    ['description', 'hf_url', 'license'].every(
      (key) => row[key] === null || typeof row[key] === 'string',
    ) &&
    Number.isInteger(row.conversation_count) &&
    row.conversation_count >= 0 &&
    object(row.summary) &&
    Number.isFinite(Date.parse(row.ingested_at))
  );
}

function benchmarkRow(row) {
  return (
    object(row) &&
    ((typeof row.id === 'string' && /^[1-9]\d*$/u.test(row.id)) ||
      (Number.isSafeInteger(row.id) && row.id > 0)) &&
    [
      'model',
      'hardware',
      'framework',
      'precision',
      'spec_method',
      'benchmark_type',
      'offload_mode',
    ].every((key) => typeof row[key] === 'string') &&
    ['disagg', 'is_multinode', 'prefill_dp_attention', 'decode_dp_attention'].every(
      (key) => typeof row[key] === 'boolean',
    ) &&
    [
      'prefill_tp',
      'prefill_ep',
      'prefill_num_workers',
      'decode_tp',
      'decode_ep',
      'decode_num_workers',
      'num_prefill_gpu',
      'num_decode_gpu',
      'conc',
    ].every((key) => Number.isInteger(row[key])) &&
    ['isl', 'osl'].every((key) => row[key] === null || Number.isFinite(row[key])) &&
    ['image', 'recipe_fingerprint', 'run_url'].every(
      (key) => row[key] === null || typeof row[key] === 'string',
    ) &&
    object(row.metrics) &&
    date(row.date)
  );
}

async function readJson(url, state, request) {
  if (++state.requests > MAX_REQUESTS) throw new Error('Public API check exceeded four GETs');
  const response = await request(url, {
    method: 'GET',
    redirect: 'error',
    signal: state.signal,
    headers: { accept: 'application/json', 'accept-encoding': 'identity' },
  });
  if (response.redirected || (response.url && response.url !== url)) {
    throw new Error('Public API response URL changed');
  }
  if (response.status !== 200) throw new Error(`Public API returned HTTP ${response.status}`);
  const chunks = [];
  for await (const chunk of response.body ?? []) {
    state.bytes += chunk.byteLength;
    if (state.bytes > MAX_BYTES) throw new Error('Public API check exceeded 10 MiB');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  state.ledger.push({ url, status: response.status, decoded_bytes: bytes.length });
  return JSON.parse(text);
}

export async function checkPublicApi({
  packageVersion,
  request = fetch,
  packageResolver = resolvePackage,
  signal,
}) {
  if (!VERSION.test(packageVersion ?? '')) throw new Error('Require an exact package version');
  const resolved = await packageResolver(packageVersion);
  if (
    resolved?.package !== PACKAGE ||
    resolved?.version !== packageVersion ||
    typeof resolved.tarball !== 'string' ||
    !resolved.tarball.startsWith('https://registry.npmjs.org/') ||
    typeof resolved.integrity !== 'string' ||
    !resolved.integrity.startsWith('sha512-') ||
    !/^[a-f\d]{40}$/u.test(resolved.shasum ?? '')
  ) {
    throw new Error('Resolved package identity differs from the requested exact version');
  }
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const state = {
    requests: 0,
    bytes: 0,
    ledger: [],
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  };
  const openapi = await readJson(`${ORIGIN}/api/openapi.json`, state, request);
  const parameters = openapi.paths?.['/api/v1/benchmarks']?.get?.parameters;
  const model = Array.isArray(parameters)
    ? parameters.find((item) => item?.name === 'model' && item?.in === 'query')
    : null;
  const selectors = model?.schema?.enum;
  if (!model?.required || !Array.isArray(selectors) || selectors.length === 0) {
    throw new Error('Consumed OpenAPI benchmark model parameter changed');
  }
  if (selectors.some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new Error('Consumed OpenAPI benchmark selector values changed');
  }
  const availability = await readJson(`${ORIGIN}/api/v1/availability`, state, request);
  if (
    !Array.isArray(availability) ||
    availability.length === 0 ||
    !availability.every(availabilityRow)
  ) {
    throw new Error('Availability response shape is empty or invalid');
  }
  const datasets = await readJson(`${ORIGIN}/api/v1/datasets`, state, request);
  if (!Array.isArray(datasets) || datasets.length === 0 || !datasets.every(datasetRow)) {
    throw new Error('Datasets response shape is empty or invalid');
  }
  const selector = selectors[0];
  const benchmarkUrl = new URL('/api/v1/benchmarks', ORIGIN);
  benchmarkUrl.searchParams.set('model', selector);
  const benchmarks = await readJson(benchmarkUrl.href, state, request);
  if (!Array.isArray(benchmarks) || benchmarks.length === 0 || !benchmarks.every(benchmarkRow)) {
    throw new Error('Scoped benchmarks response shape is empty or invalid');
  }
  return {
    schema_version: 1,
    status: 'passed',
    package: resolved,
    checked_at: new Date().toISOString(),
    limits: {
      api_gets: MAX_REQUESTS,
      attempts_per_get: 1,
      total_bytes: MAX_BYTES,
      timeout_ms: TIMEOUT_MS,
    },
    consumed: {
      benchmark_model_parameter: { required: true, selector },
      availability_rows: availability.length,
      dataset_rows: datasets.length,
      benchmark_rows: benchmarks.length,
    },
    requests: state.ledger,
    totals: { api_gets: state.requests, decoded_bytes: state.bytes },
  };
}

async function main(args) {
  const { values } = parseArgs({
    args,
    options: {
      'package-version': { type: 'string' },
      'output-dir': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!values['package-version'] || !values['output-dir']) {
    throw new Error(
      'Usage: check-public-api.mjs --package-version <exact> --output-dir <new-directory>',
    );
  }
  const output = resolve(values['output-dir']);
  mkdirSync(output);
  try {
    const record = await checkPublicApi({ packageVersion: values['package-version'] });
    writeFileSync(join(output, 'check.json'), `${JSON.stringify(record, null, 2)}\n`, {
      flag: 'wx',
    });
    process.stdout.write(`${JSON.stringify(record)}\n`);
  } catch (error) {
    const failed = {
      schema_version: 1,
      status: 'failed',
      package_version: values['package-version'],
      checked_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
    writeFileSync(join(output, 'check.json'), `${JSON.stringify(failed, null, 2)}\n`, {
      flag: 'wx',
    });
    throw error;
  }
}

if (process.argv[1] === import.meta.filename) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
