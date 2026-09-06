#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { link, lstat, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

// Installed skills run independently of package.json; release preparation updates this version.
const PACKAGE_VERSION = '0.8.0';
const ORIGIN = 'https://inferencex.semianalysis.com';
const VERSION = 1;
const BYTE_BUDGET = 32 * 1024 * 1024;
const PERCENTILES = ['p50', 'p90', 'p95', 'p99'];
const HELP = `compare-collectivex — compare two existing public communication sweeps

Requires Node 24+. No credentials or new benchmarks. JSON output only.

Usage:
  node compare-collectivex.mjs [--left <run-id> --right <run-id>] [--output <new-file>]

With no IDs, read the run list once and select its two newest measured runs by
numeric run ID (older = left). This is a bounded example selection, not history.
Explicit IDs must be distinct positive decimal strings. Contract version: 1.
At most four GETs: OpenAPI, optional run list, and two run details. No retries.
Responses share a 32 MiB decoded-body budget; each request times out after 30s.
--output creates a new file atomically and refuses to replace an existing path.
Without --output, print JSON after all reads and validation succeed.
--help makes no requests. See references/collectivex.md for matching and units.
`;

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const id = (value) => typeof value === 'string' && /^[1-9]\d*$/u.test(value);
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const canonical = (value) =>
  JSON.stringify(value, (_key, item) => {
    if (
      typeof item === 'number' &&
      (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item)))
    ) {
      throw new Error('Comparison identity contains an unrepresentable number');
    }
    return object(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item;
  });

function validTimestamp(value) {
  const match =
    typeof value === 'string' &&
    /^(?<date>\d{4}-\d{2}-\d{2})[T ](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.exec(
      value,
    );
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const date = new Date(`${match.groups.date}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === match.groups.date &&
    Number(match.groups.hour) < 24 &&
    Number(match.groups.minute) < 60 &&
    Number(match.groups.second) < 60
  );
}

function runIdentity(run) {
  return (
    object(run) &&
    id(run.run_id) &&
    positive(run.run_attempt) &&
    validTimestamp(run.generated_at) &&
    (run.conclusion === null || typeof run.conclusion === 'string')
  );
}

function topologyIssues(topology) {
  if (!object(topology)) return ['missing_topology'];
  const issues = [];
  for (const key of ['ep_size', 'nodes', 'gpus_per_node', 'scale_up_domain']) {
    if (!positive(topology[key])) issues.push(`missing_or_invalid_${key}`);
  }
  for (const key of ['scale_up_transport', 'topology_class']) {
    if (!text(topology[key])) issues.push(`missing_or_invalid_${key}`);
  }
  if (!(topology.scale_out_transport === null || text(topology.scale_out_transport))) {
    issues.push('missing_or_invalid_scale_out_transport');
  }
  return issues;
}

function metric(value) {
  if (value === undefined) return { status: 'missing' };
  if (value === null) return { status: 'null', value: null };
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(
      'Invalid metric: expected a finite nonnegative number, null, or an omitted field',
    );
  }
  return { status: 'value', value };
}

function percentiles(target, name, unit, values, keys = PERCENTILES) {
  if (values !== undefined && values !== null && !object(values)) {
    throw new Error(`Invalid ${name} percentile object`);
  }
  for (const key of keys) {
    target.push({
      name: `${name}.${key}`,
      unit,
      ...metric(values === null ? null : values?.[key]),
    });
  }
}

function epRows(dataset, responseIndex) {
  const rows = [];
  dataset.series.forEach((series, seriesIndex) => {
    if (!object(series) || !Array.isArray(series.points)) throw new Error('Invalid EP series');
    const { points, ...configuration } = series;
    const issues = topologyIssues(series.system);
    for (const key of ['series_id', 'phase', 'mode', 'precision', 'backend']) {
      if (!text(series[key])) issues.push(`missing_or_invalid_${key}`);
    }
    if (!text(series.system?.sku) || !['nvidia', 'amd'].includes(series.system?.vendor)) {
      issues.push('missing_hardware_identity');
    }
    points.forEach((point, pointIndex) => {
      if (!object(point) || !object(point.components)) throw new Error('Invalid EP point');
      const {
        components: _components,
        roundtrip_token_rate_at_latency_percentile: _rate,
        ...pointConfiguration
      } = point;
      for (const operation of ['dispatch', 'stage', 'combine', 'roundtrip']) {
        const component = point.components[operation];
        if (component !== undefined && component !== null && !object(component)) {
          throw new Error('Invalid EP component');
        }
        const problems = [...issues];
        if (!positive(point.tokens_per_rank) || !positive(point.global_tokens)) {
          problems.push('missing_or_invalid_token_counts');
        }
        if (!component) problems.push('unavailable_component');
        if (!count(component?.payload_bytes)) problems.push('missing_or_invalid_payload_bytes');
        const metrics = [];
        percentiles(metrics, 'latency_us', 'us', component?.latency_us);
        percentiles(
          metrics,
          'activation_data_rate_gbps_at_latency_percentile',
          'GB/s aggregate activation',
          component?.activation_data_rate_gbps_at_latency_percentile,
        );
        percentiles(
          metrics,
          'payload_data_rate_gbps_at_latency_percentile',
          'GB/s per GPU payload',
          component?.payload_data_rate_gbps_at_latency_percentile,
        );
        if (operation === 'roundtrip') {
          percentiles(
            metrics,
            'roundtrip_token_rate_at_latency_percentile',
            'tokens/s aggregate',
            point.roundtrip_token_rate_at_latency_percentile,
          );
        }
        rows.push({
          identity: {
            suite: 'ep',
            configuration,
            operation,
            ...pointConfiguration,
            payload_bytes: component?.payload_bytes,
          },
          issues: problems,
          metrics,
          source: {
            response_index: responseIndex,
            json_pointer: `/series/${seriesIndex}/points/${pointIndex}/components/${operation}`,
          },
        });
      }
    });
  });
  return rows;
}

function kvRows(dataset, responseIndex) {
  return (dataset.kv ?? []).flatMap((kase, caseIndex) => {
    if (!object(kase) || !Array.isArray(kase.rows)) throw new Error('Invalid KV case');
    const {
      rows,
      label: _label,
      disposition: _disposition,
      outcome: _outcome,
      reason: _reason,
      detail: _detail,
      ...configuration
    } = kase;
    const issues = topologyIssues(kase.topology);
    for (const key of ['case_id', 'sku', 'backend', 'fabric', 'workload', 'precision']) {
      if (!text(kase[key])) issues.push(`missing_or_invalid_${key}`);
    }
    if (!['nvidia', 'amd'].includes(kase.vendor)) issues.push('missing_hardware_identity');
    if (kase.outcome !== 'success' || kase.disposition !== 'runnable')
      issues.push('kv_case_not_successful');
    return rows.map((row, rowIndex) => {
      if (!object(row)) throw new Error('Invalid KV row');
      const problems = [...issues];
      // Unknown future row fields remain part of identity rather than silently broadening a match.
      const {
        prep_ms: _prep,
        latency_ms: _latency,
        request_ms: _request,
        gbps_p50: _gbps,
        gbps_p50_incl_prep: _coldGbps,
        verify_passed: _verified,
        ...identity
      } = row;
      if (!['paged', 'bulk'].includes(row.kind) || !['push', 'pull'].includes(row.op)) {
        problems.push('missing_or_invalid_kv_operation');
      }
      for (const key of ['isl', 'batch', 'descs', 'req_bytes']) {
        if (!(key === 'req_bytes' ? count(row[key]) : positive(row[key]))) {
          problems.push(`missing_or_invalid_${key}`);
        }
      }
      if (!((row.page_tokens === null && row.kind === 'bulk') || positive(row.page_tokens))) {
        problems.push('missing_or_invalid_page_tokens');
      }
      if (row.verify_passed !== true) problems.push('kv_verification_not_passed');
      const metrics = [];
      for (const [key, unit] of [
        ['latency_ms', 'ms per burst'],
        ['request_ms', 'ms per request'],
      ]) {
        percentiles(metrics, key, unit, row[key], ['p50', 'p95', 'min', 'max']);
        metrics.push({
          name: `${key}.n`,
          unit: 'samples',
          ...metric(row[key] === null ? null : row[key]?.n),
        });
      }
      for (const [key, unit] of [
        ['prep_ms', 'ms per burst'],
        ['gbps_p50', 'GB/s'],
        ['gbps_p50_incl_prep', 'GB/s including prep'],
      ]) {
        metrics.push({ name: key, unit, ...metric(row[key]) });
      }
      return {
        identity: { suite: 'kv', configuration, row: identity },
        issues: problems,
        metrics,
        source: {
          response_index: responseIndex,
          json_pointer: `/kv/${caseIndex}/rows/${rowIndex}`,
        },
      };
    });
  });
}

function compare(left, right) {
  const groups = new Map();
  for (const [side, rows] of [
    ['left', left],
    ['right', right],
  ]) {
    for (const row of rows) {
      const key = canonical(row.identity);
      if (!groups.has(key)) groups.set(key, { identity: row.identity, left: [], right: [] });
      groups.get(key)[side].push(row);
    }
  }
  return [...groups.values()].map(({ identity, left: a, right: b }) => {
    const issues = [...new Set([...a, ...b].flatMap((row) => row.issues))];
    const status =
      a.length > 1 || b.length > 1
        ? 'ambiguous'
        : issues.length > 0
          ? 'incomparable'
          : a.length === 0
            ? 'only_right'
            : b.length === 0
              ? 'only_left'
              : 'matched';
    const metrics =
      status === 'matched'
        ? a[0].metrics.map(({ name, unit, ...leftValue }, index) => {
            const { name: _name, unit: _unit, ...rightValue } = b[0].metrics[index];
            const numeric = leftValue.status === 'value' && rightValue.status === 'value';
            const difference = numeric ? rightValue.value - leftValue.value : null;
            const ratio =
              numeric && leftValue.value !== 0 ? rightValue.value / leftValue.value : null;
            return {
              name,
              unit,
              left: leftValue,
              right: rightValue,
              difference_right_minus_left: Number.isFinite(difference) ? difference : null,
              ratio_right_over_left: Number.isFinite(ratio) ? ratio : null,
            };
          })
        : [];
    return {
      identity,
      status,
      issues,
      left: a.map((row) => row.source),
      right: b.map((row) => row.source),
      metrics,
    };
  });
}

async function outputJson(output, path) {
  const bytes = `${JSON.stringify(output, null, 2)}\n`;
  if (path === null) {
    await new Promise((resolveWrite, reject) => {
      process.stdout.once('error', reject);
      process.stdout.write(bytes, (error) => (error ? reject(error) : resolveWrite()));
    });
    return;
  }
  const staging = await mkdtemp(join(dirname(path), '.collectivex-'));
  try {
    const file = join(staging, 'export.json');
    await writeFile(file, bytes, { flag: 'wx' });
    await link(file, path); // Atomic publication; a racing file or symlink is never replaced.
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      left: { type: 'string' },
      right: { type: 'string' },
      output: { type: 'string' },
      help: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  const explicit = values.left !== undefined || values.right !== undefined;
  if (explicit && (!id(values.left) || !id(values.right) || values.left === values.right)) {
    throw new Error('--left and --right require two distinct positive decimal run-ID strings');
  }
  if (values.output !== undefined && !text(values.output))
    throw new Error('--output needs a new file path');
  const outputPath = values.output === undefined ? null : resolve(values.output);
  if (outputPath !== null) {
    if (
      await lstat(outputPath).catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      })
    ) {
      throw new Error('--output already exists; choose a new file');
    }
    const parent = await stat(dirname(outputPath));
    if (!parent.isDirectory()) throw new Error('--output parent must be a directory');
  }

  const responses = [];
  let remaining = BYTE_BUDGET;
  async function read(path) {
    const query_url = new URL(path, ORIGIN).href;
    const response = await fetch(query_url, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    if (response.redirected || (response.url && response.url !== query_url)) {
      throw new Error('Unexpected CollectiveX response URL');
    }
    const chunks = [];
    for await (const chunk of response.body ?? []) {
      remaining -= chunk.byteLength;
      if (remaining < 0) throw new Error('CollectiveX reads exceeded the 32 MiB response budget');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    const body_text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${query_url}`);
    const body = JSON.parse(body_text);
    const index = responses.length;
    responses.push({
      query_url,
      retrieved_at: new Date().toISOString(),
      http_status: response.status,
      decoded_body_sha256: createHash('sha256').update(bytes).digest('hex'),
      body_text,
    });
    return { body, index };
  }
  const { body: schema } = await read('/api/openapi.json');
  for (const path of ['/api/v1/collectivex/runs', '/api/v1/collectivex/runs/{runId}']) {
    const operation = schema.paths?.[path]?.get;
    if (
      !operation?.parameters
        ?.find((parameter) => parameter.name === 'version')
        ?.schema?.enum?.includes(VERSION) ||
      operation.parameters.some(
        (parameter) => parameter.required && !['version', 'runId'].includes(parameter.name),
      )
    ) {
      throw new Error(
        'Inspect the current CollectiveX OpenAPI operations before using this version-1 helper',
      );
    }
  }
  let runIds = explicit ? [values.left, values.right] : [];
  let discovery = null;
  if (!explicit) {
    const { body: list, index } = await read('/api/v1/collectivex/runs?version=1');
    if (
      !object(list) ||
      list.version !== VERSION ||
      typeof list.discovery_complete !== 'boolean' ||
      !Array.isArray(list.runs) ||
      list.runs.some((run) => !runIdentity(run) || !count(run.measured_cases)) ||
      new Set(list.runs.map((run) => run.run_id)).size !== list.runs.length
    ) {
      throw new Error('Invalid CollectiveX run list; discovery coverage is unknown');
    }
    runIds = list.runs
      .filter((run) => run.measured_cases > 0)
      .toSorted((a, b) => (BigInt(a.run_id) < BigInt(b.run_id) ? 1 : -1))
      .slice(0, 2)
      .map((run) => run.run_id)
      .toReversed();
    discovery = {
      response_index: index,
      returned_runs: list.runs.length,
      discovery_complete: list.discovery_complete,
      history_complete: false,
    };
  }
  const datasets = [];
  if (runIds.length === 2) {
    for (const runId of runIds) {
      const response = await read(`/api/v1/collectivex/runs/${runId}?version=1`);
      const data = response.body;
      if (
        !object(data) ||
        data.version !== VERSION ||
        !runIdentity(data.run) ||
        data.run.run_id !== runId ||
        !text(data.run.source_sha) ||
        !Array.isArray(data.coverage) ||
        !Array.isArray(data.series) ||
        (data.kv !== undefined && !Array.isArray(data.kv))
      ) {
        throw new Error('Invalid or mismatched CollectiveX run dataset');
      }
      datasets.push(response);
    }
  }
  const comparisons =
    datasets.length === 2
      ? compare(
          [
            ...epRows(datasets[0].body, datasets[0].index),
            ...kvRows(datasets[0].body, datasets[0].index),
          ],
          [
            ...epRows(datasets[1].body, datasets[1].index),
            ...kvRows(datasets[1].body, datasets[1].index),
          ],
        )
      : [];
  const summary = Object.fromEntries(
    ['matched', 'only_left', 'only_right', 'ambiguous', 'incomparable'].map((status) => [
      status,
      comparisons.filter((row) => row.status === status).length,
    ]),
  );
  await outputJson(
    {
      schema_version: 1,
      package_version: PACKAGE_VERSION,
      selection: {
        mode: explicit ? 'explicit_run_ids' : 'newest_two_measured_from_one_list',
        run_ids: runIds,
      },
      outcome:
        datasets.length < 2
          ? 'fewer_than_two_measured_runs'
          : summary.matched
            ? 'compared'
            : 'no_comparable_rows',
      discovery,
      comparison_scope: {
        contract_version: VERSION,
        basis: 'exact_public_identity',
        source_sha_equal:
          datasets.length === 2
            ? datasets[0].body.run.source_sha === datasets[1].body.run.source_sha
            : null,
      },
      runs: datasets.map(({ body, index }) => ({ run: body.run, response_index: index })),
      summary,
      comparisons,
      responses,
      observation_context: 'Existing observations were read; no new benchmark was run.',
    },
    outputPath,
  );
}

main().catch((error) => {
  process.stderr.write(`compare-collectivex: ${error.message}\n`);
  process.exitCode = 1;
});
