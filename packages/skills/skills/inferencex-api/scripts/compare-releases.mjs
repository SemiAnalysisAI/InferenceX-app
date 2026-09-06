#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { link, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual, parseArgs } from 'node:util';

const PACKAGE_VERSION = '0.7.0';
const RESPONSE_BYTE_BUDGET = 16 * 1024 * 1024;
const PERFORMANCE_METRIC =
  /^(?:(?:median|mean|std|p75|p90|p95|p99|p99\.9)_(?:ttft|tpot|itl|e2el|intvty|qps)|(?:total|output|input)_tput_tps|(?:output_|input_)?tput_per_gpu)$/u;
const HELP = `compare-releases — investigate observed changes between explicit producer identities

Requires Node 24 or later.

Usage:
  node compare-releases.mjs --model <display-name> --hardware <raw-key> \\
    --framework <vllm|sglang> --isl <tokens> --osl <tokens> --metric <raw-key> \\
    --before-date <YYYY-MM-DD> --after-date <YYYY-MM-DD> \\
    --before-image <exact-image> --after-image <exact-image> [options]

Each side requires an exact image, an exact producer run URL, or both:
  --before-run-url <url> / --after-run-url <url>  Use the returned run_url, including attempt
  --before-image <text> / --after-image <text>   Match the returned image string exactly
  --raw-model <key>       Select one raw model within the requested display bucket
  --output <new-file>     Exclusively create a JSON file; default stdout
  --help                 Show help offline

Dates select original observation date, never curve_date. Makes one history request.
Reports one-to-one public-configuration matches and missing/ambiguous observations.
The full response is retained with a SHA-256; one 30s request, 16 MiB byte budget.
Image-to-release mapping and causal attribution remain unverified. See references/releases.md.
Select latency, interactivity or throughput metrics. Power/energy comparisons require PowerX validation.
`;
const CONFIG_FIELDS = [
  'model',
  'hardware',
  'framework',
  'precision',
  'spec_method',
  'benchmark_type',
  'isl',
  'osl',
  'conc',
  'offload_mode',
  'disagg',
  'is_multinode',
  'prefill_tp',
  'prefill_ep',
  'prefill_dp_attention',
  'prefill_num_workers',
  'decode_tp',
  'decode_ep',
  'decode_dp_attention',
  'decode_num_workers',
  'num_prefill_gpu',
  'num_decode_gpu',
];
// These producer configuration fields live in metrics JSONB, not BenchmarkRow columns.
const TOPOLOGY_METRICS = [
  'prefill_pp',
  'decode_pp',
  'dcp_size',
  'pcp_size',
  'prefill_dcp_size',
  'decode_dcp_size',
  'prefill_pcp_size',
  'decode_pcp_size',
];
const RUNTIME_METRICS = [
  'kv_offloading',
  'kv_offload_backend',
  'kv_offload_backend_version',
  'kv_p2p_transfer',
  'router_name',
  'router_version',
];
const CONFIG_METRICS = [...TOPOLOGY_METRICS, ...RUNTIME_METRICS];

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function identity(value) {
  return (
    (Number.isSafeInteger(value) && value > 0) ||
    (typeof value === 'string' && /^[1-9]\d*$/u.test(value))
  );
}

function runUrl(value) {
  return (
    typeof value === 'string' &&
    /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/[1-9]\d*(?:\/attempts\/[1-9]\d*)?$/u.test(
      value,
    )
  );
}

function timestamp(value) {
  if (value === null) return true;
  const match =
    typeof value === 'string' &&
    /^(?<date>\d{4}-\d{2}-\d{2})[T ](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/u.exec(
      value,
    );
  return Boolean(
    match &&
    match[0] === value &&
    validDate(match.groups.date) &&
    Number(match.groups.hour) < 24 &&
    Number(match.groups.minute) < 60 &&
    Number(match.groups.second) < 60 &&
    Number.isFinite(Date.parse(value)),
  );
}

function benchmarkRow(row) {
  return (
    object(row) &&
    identity(row.id) &&
    object(row.metrics) &&
    TOPOLOGY_METRICS.every(
      (key) =>
        row.metrics[key] === undefined ||
        row.metrics[key] === null ||
        (Number.isSafeInteger(row.metrics[key]) && row.metrics[key] >= 0),
    ) &&
    RUNTIME_METRICS.every(
      (key) =>
        row.metrics[key] === undefined ||
        row.metrics[key] === null ||
        (typeof row.metrics[key] === 'string' && row.metrics[key].trim().length > 0),
    ) &&
    ['model', 'hardware', 'framework', 'precision', 'benchmark_type', 'offload_mode'].every(
      (key) => typeof row[key] === 'string' && row[key].trim().length > 0,
    ) &&
    typeof row.spec_method === 'string' &&
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
    ].every((key) => Number.isSafeInteger(row[key]) && row[key] >= 0) &&
    Number.isSafeInteger(row.conc) &&
    row.conc > 0 &&
    ['isl', 'osl'].every(
      (key) => row[key] === null || (Number.isSafeInteger(row[key]) && row[key] >= 0),
    ) &&
    (row.image === null || (typeof row.image === 'string' && row.image.trim().length > 0)) &&
    (row.run_url === null || runUrl(row.run_url)) &&
    validDate(row.date) &&
    (row.recipe_fingerprint === undefined ||
      row.recipe_fingerprint === null ||
      typeof row.recipe_fingerprint === 'string') &&
    (row.curve_date === undefined || (validDate(row.curve_date) && row.curve_date >= row.date)) &&
    ['workflow_run_id', 'curve_workflow_run_id'].every(
      (key) => row[key] === undefined || identity(row[key]),
    ) &&
    ['run_started_at', 'curve_run_started_at'].every(
      (key) => row[key] === undefined || timestamp(row[key]),
    )
  );
}

function originalObservation(row) {
  return Object.fromEntries(
    Object.entries(row).filter(
      ([key]) => !['curve_date', 'curve_workflow_run_id', 'curve_run_started_at'].includes(key),
    ),
  );
}

function compareMetric(before, after, name) {
  const first = Object.hasOwn(before.metrics, name) ? before.metrics[name] : null;
  const second = Object.hasOwn(after.metrics, name) ? after.metrics[name] : null;
  const available = Number.isFinite(first) && Number.isFinite(second);
  const delta = available ? second - first : null;
  const percent = available && first !== 0 ? (delta / first) * 100 : null;
  return {
    name,
    before: first,
    after: second,
    delta: Number.isFinite(delta) ? delta : null,
    percent_change: Number.isFinite(percent) ? percent : null,
    status: available
      ? first === 0
        ? 'zero_baseline'
        : Number.isFinite(delta) && Number.isFinite(percent)
          ? 'observed_change'
          : 'arithmetic_not_finite'
      : Number.isFinite(first)
        ? 'missing_after'
        : Number.isFinite(second)
          ? 'missing_before'
          : 'missing_both',
  };
}

async function saveOutput(path, output) {
  if (path === undefined) {
    process.stdout.on('error', () => {});
    await new Promise((done, reject) => {
      process.stdout.write(output, (error) => (error ? reject(error) : done()));
    });
    return;
  }
  const target = resolve(path);
  const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, output, { flag: 'wx' });
    // Linking a complete sibling file installs it atomically and refuses existing targets/symlinks.
    await link(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function run() {
  const { values, tokens } = parseArgs({
    tokens: true,
    options: {
      ...Object.fromEntries(
        [
          'model',
          'hardware',
          'framework',
          'isl',
          'osl',
          'metric',
          'raw-model',
          'before-date',
          'after-date',
          'before-image',
          'after-image',
          'before-run-url',
          'after-run-url',
          'output',
        ].map((name) => [name, { type: 'string' }]),
      ),
      help: { type: 'boolean' },
    },
    allowPositionals: false,
    strict: true,
  });
  const options = tokens.filter((token) => token.kind === 'option').map((token) => token.name);
  if (new Set(options).size !== options.length) throw new Error('Specify each option only once');
  if (values.help) {
    await saveOutput(undefined, HELP);
    return;
  }
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' && !value.trim())
      throw new Error(`--${key} requires a nonempty value`);
  }
  for (const key of ['model', 'hardware', 'metric']) {
    if (!values[key]) throw new Error(`--${key} is required`);
  }
  if (!PERFORMANCE_METRIC.test(values.metric)) {
    throw new Error(
      'Choose a latency, interactivity or throughput metric; use the PowerX cookbook for validated power and energy',
    );
  }
  if (!['vllm', 'sglang'].includes(values.framework))
    throw new Error('--framework must be vllm or sglang');
  for (const key of ['isl', 'osl']) {
    if (
      !/^\d+$/u.test(values[key]) ||
      !Number.isSafeInteger(Number(values[key])) ||
      Number(values[key]) <= 0
    )
      throw new Error(`--${key} requires a positive integer`);
  }
  for (const side of ['before', 'after']) {
    if (!validDate(values[`${side}-date`]))
      throw new Error(`--${side}-date requires a valid YYYY-MM-DD date`);
    if (values[`${side}-image`] === undefined && values[`${side}-run-url`] === undefined)
      throw new Error(`Provide --${side}-image or --${side}-run-url`);
    if (values[`${side}-run-url`] !== undefined && !runUrl(values[`${side}-run-url`]))
      throw new Error(`--${side}-run-url requires an exact GitHub Actions run URL`);
  }
  if (values['before-date'] > values['after-date'])
    throw new Error('--before-date must not be after --after-date');
  const url = new URL('https://inferencex.semianalysis.com/api/v1/benchmarks/history');
  for (const name of ['model', 'isl', 'osl']) url.searchParams.set(name, values[name]);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (response.redirected || (response.url && response.url !== url.href))
    throw new Error('Unexpected history response URL');
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url.href}`);
  const chunks = [];
  let received = 0;
  for await (const chunk of response.body ?? []) {
    received += chunk.byteLength;
    if (received > RESPONSE_BYTE_BUDGET)
      throw new Error('Exceeded the 16 MiB response byte budget');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const evidence = [
    {
      operation: 'benchmark-history',
      url: url.href,
      http_status: response.status,
      retrieved_at: new Date().toISOString(),
      body_utf8: body,
      decoded_body_sha256: createHash('sha256').update(bytes).digest('hex'),
      checksum_covers: 'exact decoded UTF-8 response body',
    },
  ];
  const rows = JSON.parse(body.replace(/^\uFEFF/u, ''), (_key, value) => {
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new Error('Unexpected benchmark response: non-finite number');
    return value;
  });
  if (
    !Array.isArray(rows) ||
    rows.some(
      (row) =>
        !benchmarkRow(row) ||
        (Object.hasOwn(row.metrics, values.metric) &&
          row.metrics[values.metric] !== null &&
          !Number.isFinite(row.metrics[values.metric])),
    )
  ) {
    throw new Error(
      'Unexpected benchmark response: invalid identity, configuration, date, or metric',
    );
  }
  const originals = new Map();
  for (const row of rows) {
    const key = String(row.id);
    const original = originalObservation(row);
    if (originals.has(key) && !isDeepStrictEqual(originals.get(key), original))
      throw new Error(`Conflicting observation for result ID ${key}`);
    originals.set(key, original);
  }
  const scoped = rows.filter(
    (row) =>
      row.hardware === values.hardware &&
      row.framework === values.framework &&
      row.benchmark_type === 'single_turn' &&
      row.isl === Number(values.isl) &&
      row.osl === Number(values.osl) &&
      (values['raw-model'] === undefined || row.model === values['raw-model']),
  );
  const selection = {};
  const unique = {};
  for (const side of ['before', 'after']) {
    const selected = [];
    const excluded = [];
    for (const row of scoped.filter((candidate) => candidate.date === values[`${side}-date`])) {
      const reasons = [];
      if (values[`${side}-image`] !== undefined && row.image !== values[`${side}-image`])
        reasons.push(row.image === null ? 'missing_image_identity' : 'image_mismatch');
      if (values[`${side}-run-url`] !== undefined && row.run_url !== values[`${side}-run-url`])
        reasons.push(row.run_url === null ? 'missing_run_identity' : 'run_url_mismatch');
      if (reasons.length > 0) excluded.push({ row, reasons });
      else selected.push(row);
    }
    unique[side] = [...new Map(selected.map((row) => [String(row.id), row])).values()];
    selection[side] = {
      rows: selected,
      excluded,
      unique_observations: unique[side].length,
      snapshot_reuses: selected.length - unique[side].length,
    };
  }
  const groups = Object.fromEntries(
    ['before', 'after'].map((side) => [
      side,
      Map.groupBy(unique[side], (row) =>
        JSON.stringify([
          ...CONFIG_FIELDS.map((key) => row[key]),
          ...CONFIG_METRICS.map((key) => [Object.hasOwn(row.metrics, key), row.metrics[key]]),
        ]),
      ),
    ]),
  );
  const comparisons = [];
  const unmatched = { before: [], after: [] };
  for (const configKey of new Set([...groups.before.keys(), ...groups.after.keys()])) {
    const before = groups.before.get(configKey) ?? [];
    const after = groups.after.get(configKey) ?? [];
    const reason =
      before.length === 0 || after.length === 0
        ? 'no_matching_configuration'
        : before.length !== 1 || after.length !== 1
          ? 'ambiguous_configuration'
          : String(before[0].id) === String(after[0].id)
            ? 'reused_observation'
            : null;
    if (reason) {
      for (const [side, records] of [
        ['before', before],
        ['after', after],
      ]) {
        unmatched[side].push(...records.map((row) => ({ id: row.id, reason })));
      }
      continue;
    }
    const first = before[0];
    const second = after[0];
    const fingerprintMatch =
      first.recipe_fingerprint && second.recipe_fingerprint
        ? first.recipe_fingerprint === second.recipe_fingerprint
        : null;
    const unknownFields = CONFIG_METRICS.filter(
      (key) => first.metrics[key] === null || first.metrics[key] === undefined,
    ).map((key) => `metrics.${key}`);
    const confounders = [
      fingerprintMatch === false
        ? 'recipe_fingerprint_changed_includes_image_and_unexposed_config'
        : fingerprintMatch === null
          ? 'recipe_fingerprint_unavailable'
          : 'recipe_contents_not_independently_verified',
    ];
    if (first.image === null || second.image === null)
      confounders.push('image_identity_unavailable');
    if (first.run_url === null || second.run_url === null)
      confounders.push('producer_run_identity_unavailable');
    if (unknownFields.length > 0) confounders.push('optional_configuration_fields_unavailable');
    comparisons.push({
      before_id: first.id,
      after_id: second.id,
      configuration: Object.fromEntries(CONFIG_FIELDS.map((name) => [name, first[name]])),
      configuration_metrics: Object.fromEntries(
        CONFIG_METRICS.filter((key) => Object.hasOwn(first.metrics, key)).map((key) => [
          key,
          first.metrics[key],
        ]),
      ),
      configuration_verification: 'public_fields_only',
      configuration_completeness:
        unknownFields.length > 0 ? 'incomplete_optional_fields' : 'known_fields_present',
      configuration_unknown_fields: unknownFields,
      producer: {
        before: { image: first.image, run_url: first.run_url },
        after: { image: second.image, run_url: second.run_url },
      },
      recipe_fingerprint_match: fingerprintMatch,
      full_recipe_verified: false,
      confounders,
      metric: compareMetric(first, second, values.metric),
    });
  }
  const comparableValues = comparisons.filter(
    ({ metric }) => Number.isFinite(metric.before) && Number.isFinite(metric.after),
  ).length;
  const output = `${JSON.stringify(
    {
      schema_version: 1,
      metadata: {
        package_version: PACKAGE_VERSION,
        query_url: url.href,
        retrieved_at: evidence[0].retrieved_at,
        requested: values,
        ran_new_benchmark: false,
        returned_rows: rows.length,
        outside_requested_scope: rows.length - scoped.length,
        outside_selected_dates: scoped.filter(
          (row) => ![values['before-date'], values['after-date']].includes(row.date),
        ).length,
        date_field: 'date',
        metric_coverage: {
          comparable_values: comparableValues,
          missing_values: comparisons.length - comparableValues,
        },
        release_mapping: 'unknown',
        causal_attribution: 'not_established',
        statistical_verdict: 'not_established',
      },
      outcome: comparisons.length > 0 ? 'observed_comparisons' : 'no_comparable_pairs',
      limitations: [
        'Descriptive existing observations only; no causal or statistical regression verdict.',
        'Dates select original observations; history contains latest attempts and carried curve snapshots, not every historical attempt.',
        'Matching covers declared public configuration fields only; unavailable fields and recipe changes remain confounders.',
        'Image strings and run URLs do not independently establish immutable images or framework release versions.',
      ],
      selection,
      comparisons,
      unmatched,
      evidence,
    },
    null,
    2,
  )}\n`;
  await saveOutput(values.output, output);
}

run().catch((error) => {
  process.stderr.write(`compare-releases: ${error.message}\n`);
  process.exitCode = 1;
});
