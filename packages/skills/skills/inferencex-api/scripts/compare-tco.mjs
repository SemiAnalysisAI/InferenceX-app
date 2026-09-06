#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

// Installed skills run independently of package.json; release preparation updates this version.
const PACKAGE_VERSION = '0.7.0';
const HELP = `compare-tco — compare modeled GPU-hour cost at a fixed interactivity target

Requires Node 24 or later. Output is JSON with the consumed API response and coverage.
Uses single-turn median interactivity, with one request limited to 30 seconds / 4 MiB.

Usage:
  node compare-tco.mjs --model <key-or-display-name> --workloads <isl>x<osl>[,...] \\
    --target <output-tok/s/user> --gpu-hourly-prices <hardware>=<USD/GPU-hour>[,...]

Options:
  --date <YYYY-MM-DD>  As-of cutoff; omission selects latest available data
  --output <file>      Atomically replace this local file; default stdout
  --help              Show help without making a request

Price keys select exact, case-sensitive API hardware identifiers. Prices must be
user supplied. Costs use API output throughput; no local interpolation or ranking.
Clamped, unreachable, zero-throughput and missing points have null costs.
The feed combines configurations and is not a total ownership-cost model.
`;
const KEY = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
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

async function writeOutput(destination, bytes) {
  if (destination === undefined) {
    process.stdout.on('error', () => {});
    await new Promise((resolveWrite, reject) => {
      process.stdout.write(bytes, (error) => (error ? reject(error) : resolveWrite()));
    });
    return;
  }
  const target = resolve(destination);
  const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function run() {
  const { values, tokens } = parseArgs({
    tokens: true,
    options: {
      model: { type: 'string' },
      workloads: { type: 'string' },
      target: { type: 'string' },
      'gpu-hourly-prices': { type: 'string' },
      date: { type: 'string' },
      output: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  const options = tokens.filter((token) => token.kind === 'option').map((token) => token.name);
  if (new Set(options).size !== options.length) throw new Error('Specify each option only once');
  if (values.help) return writeOutput(undefined, HELP);
  if (!values.model || values.model.trim() !== values.model || /\p{Cc}/u.test(values.model)) {
    throw new Error('--model requires an exact API model key or display name');
  }
  if (values.date !== undefined && !validDate(values.date))
    throw new Error('--date requires a real YYYY-MM-DD date');
  if (values.output !== undefined && values.output.trim() === '')
    throw new Error('--output must name a file');
  const target = positiveDecimal(values.target, 'target');
  if (target > 10_000) throw new Error('--target must be at most 10000');
  const workloads = values.workloads?.split(',');
  if (
    !workloads ||
    workloads.length > 8 ||
    new Set(workloads).size !== workloads.length ||
    workloads.some((workload) => !/^[1-9]\d{0,6}x[1-9]\d{0,6}$/u.test(workload))
  ) {
    throw new Error('--workloads requires 1 to 8 distinct positive <isl>x<osl> token pairs');
  }
  if (!values['gpu-hourly-prices'])
    throw new Error('--gpu-hourly-prices requires explicit user prices');
  const priceEntries = values['gpu-hourly-prices'].split(',').map((pair) => {
    const [hardware, price] = pair.split('=');
    if (pair.split('=').length !== 2 || !KEY.test(hardware))
      throw new Error('Invalid hardware=price entry');
    return [hardware, positiveDecimal(price, 'gpu-hourly-prices')];
  });
  const prices = Object.fromEntries(priceEntries);
  if (Object.keys(prices).length !== priceEntries.length)
    throw new Error('Specify each hardware price only once');
  const url = new URL('/api/v1/tco-feed', 'https://inferencex.semianalysis.com');
  url.search = new URLSearchParams({
    model: values.model,
    workloads: values.workloads,
    tiers: String(target),
    view: 'points',
    format: 'json',
    ...(values.date ? { date: values.date } : {}),
  }).toString();
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  if (!/^application\/json(?:\s*;|$)/iu.test(response.headers.get('content-type') ?? '')) {
    throw new Error('Expected an application/json TCO response');
  }
  if (!response.body) throw new Error('Missing TCO response body');
  const chunks = [];
  let bodyBytes = 0;
  for await (const chunk of response.body) {
    bodyBytes += chunk.byteLength;
    if (bodyBytes > MAX_RESPONSE_BYTES) throw new Error('TCO response exceeds 4 MiB');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  // Fetch decodes HTTP compression. Strict UTF-8 keeps the recorded body reversible to these bytes.
  const body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const feed = JSON.parse(body);
  const points = validateFeed(feed, values, workloads, target);
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
      if (cost !== null && (!Number.isFinite(cost) || cost <= 0))
        throw new Error('Modeled token cost exceeds numeric range');
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
  const document = {
    schema_version: 1,
    metadata: {
      package_version: PACKAGE_VERSION,
      requested_model: values.model,
      db_model_keys: feed.db_model_keys,
      requested_date: values.date ?? null,
      date_selection: values.date ? 'as-of' : 'latest',
      benchmark_type: 'single_turn',
      workloads,
      target_output_tokens_per_second_per_user: target,
      interactivity_statistic: 'median',
      gpu_hourly_prices_usd: prices,
      price_source: 'user-supplied',
      cost_unit: 'USD per million output tokens',
      throughput_unit: 'output tokens per second per GPU',
      formula: 'USD/GPU-hour * 1000000 / (output tokens/second/GPU * 3600)',
      assumed_throughput_fraction: 1,
      cost_scope: 'Supplied GPU hourly rate only; not total purchase or ownership cost',
      frontier_scope:
        'API frontier across frameworks, precisions, speculative methods and deployment configurations; no observation IDs or matched-configuration proof',
    },
    source: {
      query_url: url.href,
      retrieved_at: new Date().toISOString(),
      http_status: response.status,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      body_encoding: 'utf8',
      body_bytes: bodyBytes,
      body,
    },
    coverage: {
      status: statusCounts.available === rows.length ? 'complete' : 'incomplete',
      requested_points: rows.length,
      returned_points: feed.rows.length,
      available_points: statusCounts.available,
      status_counts: statusCounts,
      returned_hardware: [...new Set(feed.rows.map((row) => row.hardware))].toSorted(),
    },
    rows,
  };
  await writeOutput(values.output, `${JSON.stringify(document, null, 2)}\n`);
}

run().catch((error) => {
  console.error(`compare-tco: ${error.message}`);
  process.exitCode = 1;
});
