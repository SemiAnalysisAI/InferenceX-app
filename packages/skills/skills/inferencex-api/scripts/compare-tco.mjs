import process from 'node:process';
import { parseArgs } from 'node:util';
import { argumentError, isMain, responseError } from './cli-contract.mjs';

const KEY = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;
const TCO_UNITS = Object.freeze({
  gpu_hourly_price: 'USD per GPU-hour',
  target_output_throughput: 'output tokens per second per user',
  gpu_output_throughput: 'output tokens per second per GPU',
  modeled_cost: 'USD per million output tokens',
});
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const sameArray = (actual, expected) =>
  Array.isArray(actual) &&
  actual.length === expected.length &&
  actual.every((value, i) => value === expected[i]);

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function positiveDecimal(value, option) {
  const number = Number(value);
  if (
    typeof value !== 'string' ||
    !DECIMAL.test(value) ||
    !Number.isFinite(number) ||
    number <= 0
  ) {
    throw new Error(`--${option} requires a positive finite decimal number`);
  }
  return number;
}

function workloadsFrom(value) {
  const workloads = value?.split(',');
  if (
    !workloads ||
    workloads.length > 8 ||
    new Set(workloads).size !== workloads.length ||
    workloads.some((workload) => !/^[1-9]\d{0,6}x[1-9]\d{0,6}$/u.test(workload))
  ) {
    throw new Error('--workloads requires 1 to 8 distinct positive <isl>x<osl> token pairs');
  }
  return workloads;
}

function priceEntriesFrom(value) {
  if (!value) throw new Error('--gpu-hourly-prices requires explicit user prices');
  const entries = value.split(',').map((pair) => {
    const [hardware, price] = pair.split('=');
    if (pair.split('=').length !== 2 || !KEY.test(hardware)) {
      throw new Error('Invalid hardware=price entry');
    }
    return [hardware, positiveDecimal(price, 'gpu-hourly-prices')];
  });
  if (new Set(entries.map(([hardware]) => hardware)).size !== entries.length) {
    throw new Error('Specify each hardware price only once');
  }
  return entries;
}

function validateModel(model) {
  if (typeof model !== 'string' || !model || model.trim() !== model || /\p{Cc}/u.test(model)) {
    throw new Error('--model requires an exact API model key or display name');
  }
  return model;
}

function exactObject(value, keys) {
  return (
    object(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function validateCanonical(values) {
  const keys = [
    'model',
    'date',
    'workloads',
    'target_output_tokens_per_second_per_user',
    'gpu_hourly_prices_usd',
    'units',
  ];
  if (!exactObject(values, keys)) throw new Error('Invalid saved TCO options');
  const model = validateModel(values.model);
  if (values.date !== null && !validDate(values.date)) {
    throw new Error('--date requires a real YYYY-MM-DD date');
  }
  if (
    !Array.isArray(values.workloads) ||
    values.workloads.length === 0 ||
    values.workloads.length > 8 ||
    new Set(values.workloads).size !== values.workloads.length ||
    values.workloads.some((workload) => !/^[1-9]\d{0,6}x[1-9]\d{0,6}$/u.test(workload))
  ) {
    throw new Error('Invalid saved TCO workloads');
  }
  const target = values.target_output_tokens_per_second_per_user;
  if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0 || target > 10_000) {
    throw new Error('Invalid saved TCO target');
  }
  const priceKeys = object(values.gpu_hourly_prices_usd)
    ? Object.keys(values.gpu_hourly_prices_usd)
    : [];
  if (
    priceKeys.length === 0 ||
    priceKeys.some(
      (hardware) =>
        !KEY.test(hardware) ||
        typeof values.gpu_hourly_prices_usd[hardware] !== 'number' ||
        !Number.isFinite(values.gpu_hourly_prices_usd[hardware]) ||
        values.gpu_hourly_prices_usd[hardware] <= 0,
    )
  ) {
    throw new Error('Invalid saved TCO GPU prices');
  }
  const unitKeys = Object.keys(TCO_UNITS);
  if (
    !exactObject(values.units, unitKeys) ||
    unitKeys.some((key) => values.units[key] !== TCO_UNITS[key])
  ) {
    throw new Error('Invalid saved TCO units');
  }
  return {
    model,
    date: values.date,
    workloads: [...values.workloads],
    target_output_tokens_per_second_per_user: target,
    gpu_hourly_prices_usd: Object.fromEntries(
      priceKeys
        .toSorted((left, right) => left.localeCompare(right, 'en'))
        .map((hardware) => [hardware, values.gpu_hourly_prices_usd[hardware]]),
    ),
    units: { ...TCO_UNITS },
  };
}

// The closed canonical object is saved in the manifest and revalidated during replay.
export function normalizeArgs(args) {
  try {
    if (!Array.isArray(args)) return validateCanonical(args);
    const parsed = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      tokens: true,
      options: {
        model: { type: 'string' },
        workloads: { type: 'string' },
        target: { type: 'string' },
        'gpu-hourly-prices': { type: 'string' },
        date: { type: 'string' },
      },
    });
    const options = parsed.tokens
      .filter((token) => token.kind === 'option')
      .map((token) => token.name);
    if (new Set(options).size !== options.length) throw new Error('Specify each option only once');
    const target = positiveDecimal(parsed.values.target, 'target');
    if (target > 10_000) throw new Error('--target must be at most 10000');
    const prices = priceEntriesFrom(parsed.values['gpu-hourly-prices']).toSorted(
      ([left], [right]) => left.localeCompare(right, 'en'),
    );
    return validateCanonical({
      model: validateModel(parsed.values.model),
      date: parsed.values.date ?? null,
      workloads: workloadsFrom(parsed.values.workloads),
      target_output_tokens_per_second_per_user: target,
      gpu_hourly_prices_usd: Object.fromEntries(prices),
      units: { ...TCO_UNITS },
    });
  } catch (error) {
    if (error?.code === 'INVALID_ARGUMENT') throw error;
    throw argumentError(error.message, error);
  }
}

function comparisonUrl(scope) {
  const url = new URL('/api/v1/tco-feed', 'https://inferencex.semianalysis.com');
  url.search = new URLSearchParams({
    model: scope.model,
    workloads: scope.workloads.join(','),
    tiers: String(scope.target_output_tokens_per_second_per_user),
    view: 'points',
    format: 'json',
    ...(scope.date ? { date: scope.date } : {}),
  }).toString();
  return url;
}

function calculateRows(priceEntries, workloads, points) {
  const statusCounts = {
    available: 0,
    missing_point: 0,
    clamped_low: 0,
    unreachable: 0,
    zero_throughput: 0,
  };
  const rows = priceEntries.flatMap(([hardware, price]) =>
    workloads.map((workload) => {
      const point = points.get(`${hardware}/${workload}`) ?? null;
      const status =
        point === null
          ? 'missing_point'
          : point.boundary === 'interpolated'
            ? point.output_tput_per_gpu === 0
              ? 'zero_throughput'
              : 'available'
            : point.boundary;
      const cost =
        status === 'available' ? (price * 1e6) / (point.output_tput_per_gpu * 3600) : null;
      if (cost !== null && (!Number.isFinite(cost) || cost <= 0)) {
        throw new Error('Modeled token cost exceeds numeric range');
      }
      statusCounts[status] += 1;
      return {
        hardware,
        workload,
        status,
        usd_per_gpu_hour: price,
        usd_per_million_output_tokens: cost,
        point,
      };
    }),
  );
  return { rows, statusCounts };
}

function comparisonMetadata({ producerVersion, scope, feed, contractVersion }) {
  return {
    package_version: producerVersion,
    contract_version: contractVersion,
    requested_model: scope.model,
    db_model_keys: feed.db_model_keys,
    requested_date: scope.date,
    date_selection: scope.date ? 'as-of' : 'latest',
    benchmark_type: 'single_turn',
    workloads: scope.workloads,
    target_output_tokens_per_second_per_user: scope.target_output_tokens_per_second_per_user,
    interactivity_statistic: 'median',
    gpu_hourly_prices_usd: scope.gpu_hourly_prices_usd,
    price_source: 'user-supplied',
    cost_unit: TCO_UNITS.modeled_cost,
    throughput_unit: TCO_UNITS.gpu_output_throughput,
    formula: 'USD/GPU-hour * 1000000 / (output tokens/second/GPU * 3600)',
    assumed_throughput_fraction: 1,
    cost_scope:
      'Supplied GPU hourly rate applied to API-reported output throughput; GPU divisor may be role-specific or unverified; not verified whole-deployment GPU rental cost or total ownership cost',
    frontier_scope:
      'API frontier across frameworks, precisions, speculative methods and deployment configurations on API-reported throughput bases; no observation IDs, verified whole-deployment GPU denominator or matched-configuration proof',
    offline_verification_scope:
      'Saved API interpolation is an input; offline verification recalculates costs from saved points and does not independently revalidate benchmark frontier interpolation methodology.',
  };
}

function domainCoverage(rows, feed, statusCounts) {
  return {
    status: statusCounts.available === rows.length ? 'complete' : 'incomplete',
    requested_points: rows.length,
    returned_points: feed.rows.length,
    available_points: statusCounts.available,
    status_counts: statusCounts,
    returned_hardware: [...new Set(feed.rows.map((row) => row.hardware))].toSorted(),
  };
}

export async function collect(options, context) {
  const scope = normalizeArgs(options);
  const url = comparisonUrl(scope);
  const saved = await context.get({ operation: 'tco-feed', url: url.href, allowedStatuses: [200] });
  let points;
  let comparison;
  try {
    points = validateFeed(
      saved.body,
      scope,
      scope.workloads,
      scope.target_output_tokens_per_second_per_user,
    );
    comparison = calculateRows(
      Object.entries(scope.gpu_hourly_prices_usd),
      scope.workloads,
      points,
    );
  } catch (error) {
    throw responseError(error.message, error);
  }
  const { rows, statusCounts } = comparison;
  const output = {
    schema_version: 1,
    kind: 'tco',
    metadata: comparisonMetadata({
      producerVersion: context.producerVersion,
      scope,
      feed: saved.body,
      contractVersion: 1,
    }),
    units: { ...TCO_UNITS },
    source: {
      response_id: saved.id,
      query_url: url.href,
      retrieved_at: saved.retrievedAt,
      http_status: saved.status,
      sha256: saved.id,
      body_encoding: 'utf8',
      body_bytes: saved.bytes.length,
    },
    coverage: domainCoverage(rows, saved.body, statusCounts),
    rows,
  };
  const hardware = Object.keys(scope.gpu_hourly_prices_usd).map((key) => ({
    hardware: key,
    valid_records: rows.filter((row) => row.hardware === key && row.status === 'available').length,
  }));
  return {
    format: 'json',
    bytes: Buffer.from(`${JSON.stringify(output, null, 2)}\n`),
    coverage: {
      status:
        rows.length === 0
          ? 'empty'
          : statusCounts.available === rows.length
            ? 'complete'
            : 'partial',
      selected_records: rows.length,
      comparable_pairs: null,
      hardware,
      reasons: Object.entries(statusCounts)
        .filter(([status, count]) => status !== 'available' && count > 0)
        .map(([code, count]) => ({ code, count })),
    },
  };
}

function validateFeed(feed, values, workloads, target) {
  if (
    !object(feed) ||
    feed.model !== values.model ||
    feed.date !== (values.date ?? null) ||
    !Array.isArray(feed.db_model_keys) ||
    feed.db_model_keys.length === 0 ||
    feed.db_model_keys.some((key) => typeof key !== 'string' || !KEY.test(key)) ||
    new Set(feed.db_model_keys).size !== feed.db_model_keys.length ||
    !sameArray(feed.workloads, workloads) ||
    !sameArray(feed.tiers, [target]) ||
    ['alpha', 'weights', 'workload_weights'].some((key) => Object.hasOwn(feed, key)) ||
    !Array.isArray(feed.rows)
  ) {
    throw new Error('Invalid or mismatched TCO points response envelope');
  }
  const points = new Map();
  for (const point of feed.rows) {
    if (
      !object(point) ||
      typeof point.hardware !== 'string' ||
      !KEY.test(point.hardware) ||
      !workloads.includes(point.workload) ||
      point.tier !== target ||
      !nonnegative(point.output_tput_per_gpu) ||
      !['interpolated', 'clamped_low', 'unreachable'].includes(point.boundary) ||
      typeof point.is_interpolated !== 'boolean' ||
      !Number.isSafeInteger(point.frontier_points) ||
      point.frontier_points < 1 ||
      !nonnegative(point.frontier_min_interactivity) ||
      !nonnegative(point.frontier_max_interactivity) ||
      point.frontier_min_interactivity > point.frontier_max_interactivity ||
      !validDate(point.latest_date) ||
      !validDate(point.oldest_frontier_date) ||
      point.oldest_frontier_date > point.latest_date ||
      (values.date && point.latest_date > values.date) ||
      (Object.hasOwn(point, 'evidence_labels') &&
        (!Array.isArray(point.evidence_labels) ||
          point.evidence_labels.some((label) => typeof label !== 'string')))
    ) {
      throw new Error('Invalid TCO frontier point or date');
    }
    if (
      point.frontier_points === 1 &&
      (point.frontier_min_interactivity !== point.frontier_max_interactivity ||
        point.oldest_frontier_date !== point.latest_date)
    ) {
      throw new Error('Inconsistent single-knot TCO frontier');
    }
    // Feed bounds are rounded to three decimals; the boundary flag uses unrounded knots.
    const tolerance = 0.0005;
    const evidence = point.evidence_date;
    if (point.boundary === 'unreachable') {
      if (
        point.output_tput_per_gpu !== 0 ||
        evidence !== null ||
        point.is_interpolated ||
        target < point.frontier_max_interactivity - tolerance
      ) {
        throw new Error('Inconsistent unreachable TCO point');
      }
    } else {
      if (
        !object(evidence) ||
        !validDate(evidence.from) ||
        !validDate(evidence.to) ||
        evidence.from > evidence.to ||
        evidence.from < point.oldest_frontier_date ||
        evidence.to > point.latest_date ||
        (!point.is_interpolated && evidence.from !== evidence.to)
      ) {
        throw new Error('Invalid TCO evidence dates');
      }
      if (point.boundary === 'clamped_low') {
        if (point.is_interpolated || target > point.frontier_min_interactivity + tolerance) {
          throw new Error('Inconsistent clamped TCO point');
        }
      } else if (
        target < point.frontier_min_interactivity - tolerance ||
        target > point.frontier_max_interactivity + tolerance ||
        (point.is_interpolated && point.frontier_points < 2)
      ) {
        throw new Error('Inconsistent in-range TCO point');
      }
      if (
        point.frontier_points === 2 &&
        ((point.is_interpolated &&
          (evidence.from !== point.oldest_frontier_date || evidence.to !== point.latest_date)) ||
          (target > point.frontier_min_interactivity + tolerance &&
            target < point.frontier_max_interactivity - tolerance &&
            !point.is_interpolated))
      ) {
        throw new Error('Inconsistent two-knot TCO evidence');
      }
    }
    const key = `${point.hardware}/${point.workload}`;
    if (points.has(key)) throw new Error(`Duplicate TCO point: ${key}`);
    points.set(key, point);
  }
  return points;
}

if (isMain(import.meta.url)) {
  process.stderr.write('compare-tco.mjs is internal. Use inferencex tco compare instead.\n');
  process.exitCode = 2;
}
