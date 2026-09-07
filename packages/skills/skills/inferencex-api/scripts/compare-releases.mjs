import process from 'node:process';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { argumentError, isMain, responseError } from './cli-contract.mjs';

// History omits mean/std latency and interactivity; QPS statistics are retained.
const PERFORMANCE_METRIC =
  /^(?:(?:median|p75|p90|p95|p99|p99\.9)_(?:ttft|tpot|itl|e2el|intvty|qps)|(?:mean|std)_qps|(?:total|output|input)_tput_tps|(?:output_|input_)?tput_per_gpu)$/u;
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

function positiveInteger(value, option) {
  const number = Number(value);
  if (!value || !/^\d+$/u.test(String(value)) || !Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`--${option} requires a positive integer`);
  }
  return number;
}

const CANONICAL_KEYS = [
  'model',
  'hardware',
  'framework',
  'isl',
  'osl',
  'metric',
  'raw_model',
  'before_date',
  'after_date',
  'before_image',
  'after_image',
  'before_run_url',
  'after_run_url',
];

// The closed canonical object is replayed from the manifest during offline verification.
export function normalizeArgs(args) {
  try {
    let values;
    if (Array.isArray(args)) {
      const parsed = parseArgs({
        args,
        tokens: true,
        options: Object.fromEntries(
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
          ].map((name) => [name, { type: 'string' }]),
        ),
        strict: true,
        allowPositionals: false,
      });
      const seen = new Set();
      for (const token of parsed.tokens.filter(({ kind }) => kind === 'option')) {
        if (seen.has(token.name)) throw new Error(`Duplicate option --${token.name}`);
        seen.add(token.name);
      }
      values = {
        model: parsed.values.model,
        hardware: parsed.values.hardware,
        framework: parsed.values.framework,
        isl: positiveInteger(parsed.values.isl, 'isl'),
        osl: positiveInteger(parsed.values.osl, 'osl'),
        metric: parsed.values.metric,
        raw_model: parsed.values['raw-model'] ?? null,
        before_date: parsed.values['before-date'],
        after_date: parsed.values['after-date'],
        before_image: parsed.values['before-image'] ?? null,
        after_image: parsed.values['after-image'] ?? null,
        before_run_url: parsed.values['before-run-url'] ?? null,
        after_run_url: parsed.values['after-run-url'] ?? null,
      };
    } else {
      if (
        !object(args) ||
        Object.keys(args).length !== CANONICAL_KEYS.length ||
        CANONICAL_KEYS.some((key) => !Object.hasOwn(args, key))
      ) {
        throw new Error('Invalid saved release comparison options');
      }
      values = { ...args };
    }

    for (const key of ['model', 'hardware', 'metric']) {
      if (typeof values[key] !== 'string' || !values[key].trim()) {
        throw new Error(`--${key} requires a nonempty value`);
      }
    }
    if (!PERFORMANCE_METRIC.test(values.metric)) {
      throw new Error(
        'Choose a metric retained by benchmark history (see --help); use PowerX for validated power and energy',
      );
    }
    if (!['vllm', 'sglang'].includes(values.framework)) {
      throw new Error('--framework must be vllm or sglang');
    }
    for (const key of ['isl', 'osl']) {
      if (!Number.isSafeInteger(values[key]) || values[key] <= 0) {
        throw new Error(`--${key} requires a positive integer`);
      }
    }
    if (
      values.raw_model !== null &&
      (typeof values.raw_model !== 'string' || !values.raw_model.trim())
    ) {
      throw new Error('--raw-model requires a nonempty value');
    }
    for (const side of ['before', 'after']) {
      if (!validDate(values[`${side}_date`])) {
        throw new Error(`--${side}-date requires a valid YYYY-MM-DD date`);
      }
      const image = values[`${side}_image`];
      const producerRun = values[`${side}_run_url`];
      if (image !== null && (typeof image !== 'string' || !image.trim())) {
        throw new Error(`--${side}-image requires a nonempty value`);
      }
      if (producerRun !== null && !runUrl(producerRun)) {
        throw new Error(`--${side}-run-url requires an exact GitHub Actions run URL`);
      }
      if (image === null && producerRun === null) {
        throw new Error(`Provide --${side}-image or --${side}-run-url`);
      }
    }
    if (values.before_date > values.after_date) {
      throw new Error('--before-date must not be after --after-date');
    }
    return Object.fromEntries(CANONICAL_KEYS.map((key) => [key, values[key]]));
  } catch (error) {
    throw argumentError(error.message, error);
  }
}

function validateRows(rows, metric) {
  if (
    !Array.isArray(rows) ||
    rows.some(
      (row) =>
        !benchmarkRow(row) ||
        (Object.hasOwn(row.metrics, metric) &&
          row.metrics[metric] !== null &&
          !Number.isFinite(row.metrics[metric])),
    )
  ) {
    throw responseError(
      'Unexpected benchmark response: invalid identity, configuration, date, or metric',
    );
  }
}

function buildReleaseComparison({ scope, rows, source, packageVersion }) {
  const resultId = String;
  validateRows(rows, scope.metric);
  const originals = new Map();
  for (const row of rows) {
    const key = String(row.id);
    const original = originalObservation(row);
    if (originals.has(key) && !isDeepStrictEqual(originals.get(key), original)) {
      throw responseError(`Conflicting observation for result ID ${key}`);
    }
    originals.set(key, original);
  }

  const scoped = rows.filter(
    (row) =>
      row.hardware === scope.hardware &&
      row.framework === scope.framework &&
      row.benchmark_type === 'single_turn' &&
      row.isl === scope.isl &&
      row.osl === scope.osl &&
      (scope.raw_model === null || row.model === scope.raw_model),
  );
  const selection = {};
  const unique = {};
  for (const side of ['before', 'after']) {
    const selected = [];
    const excluded = [];
    for (const row of scoped.filter((candidate) => candidate.date === scope[`${side}_date`])) {
      const reasons = [];
      if (scope[`${side}_image`] !== null && row.image !== scope[`${side}_image`]) {
        reasons.push(row.image === null ? 'missing_image_identity' : 'image_mismatch');
      }
      if (scope[`${side}_run_url`] !== null && row.run_url !== scope[`${side}_run_url`]) {
        reasons.push(row.run_url === null ? 'missing_run_identity' : 'run_url_mismatch');
      }
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
        unmatched[side].push(...records.map((row) => ({ id: resultId(row.id), reason })));
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
    if (first.run_url === null || second.run_url === null) {
      confounders.push('producer_run_identity_unavailable');
    }
    if (unknownFields.length > 0) confounders.push('optional_configuration_fields_unavailable');
    comparisons.push({
      before_id: resultId(first.id),
      after_id: resultId(second.id),
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
      metric: compareMetric(first, second, scope.metric),
    });
  }

  const comparablePairs = comparisons.filter(
    ({ metric }) => Number.isFinite(metric.before) && Number.isFinite(metric.after),
  ).length;
  const selectedRecords =
    selection.before.unique_observations + selection.after.unique_observations;
  const unmatchedRecords = unmatched.before.length + unmatched.after.length;
  const missingMetrics = comparisons.length - comparablePairs;
  const result = {
    schema_version: 1,
    metadata: {
      package_version: packageVersion,
      query_url: source.url,
      retrieved_at: source.retrievedAt,
      requested: scope,
      ran_new_benchmark: false,
      returned_rows: rows.length,
      outside_requested_scope: rows.length - scoped.length,
      outside_selected_dates: scoped.filter(
        (row) => ![scope.before_date, scope.after_date].includes(row.date),
      ).length,
      date_field: 'date',
      metric_coverage: {
        comparable_values: comparablePairs,
        missing_values: missingMetrics,
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
    sources: [
      {
        operation: 'benchmark-history',
        response_id: source.responseId,
        status: source.status,
        retrieved_at: source.retrievedAt,
        url: source.url,
      },
    ],
  };
  return {
    result,
    coverage: {
      status:
        selectedRecords === 0
          ? 'empty'
          : unmatchedRecords > 0 || missingMetrics > 0 || comparisons.length === 0
            ? 'partial'
            : 'complete',
      selected_records: selectedRecords,
      comparable_pairs: comparablePairs,
      hardware: [{ hardware: scope.hardware, valid_records: comparablePairs }],
      reasons: [
        ...(unmatchedRecords > 0
          ? [{ code: 'unmatched_configuration', count: unmatchedRecords }]
          : []),
        ...(missingMetrics > 0 ? [{ code: 'missing_metric', count: missingMetrics }] : []),
      ],
    },
  };
}

export async function collect(options, context) {
  const scope = normalizeArgs(options);
  const url = new URL('https://inferencex.semianalysis.com/api/v1/benchmarks/history');
  url.searchParams.set('model', scope.model);
  url.searchParams.set('isl', String(scope.isl));
  url.searchParams.set('osl', String(scope.osl));
  const saved = await context.get({
    operation: 'benchmark-history',
    url: url.href,
    allowedStatuses: [200],
  });
  const built = buildReleaseComparison({
    scope,
    rows: saved.body,
    source: {
      responseId: saved.id,
      status: saved.status,
      retrievedAt: saved.retrievedAt,
      url: url.href,
    },
    packageVersion: context.producerVersion,
  });
  return {
    format: 'json',
    bytes: Buffer.from(`${JSON.stringify(built.result, null, 2)}\n`),
    coverage: built.coverage,
  };
}

if (isMain(import.meta.url)) {
  process.stderr.write(
    'compare-releases.mjs is internal. Use inferencex releases compare instead.\n',
  );
  process.exitCode = 2;
}
