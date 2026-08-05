/**
 * Canonical AgentX interactivity over the complete client-observed response.
 *
 * New aggregate artifacts expose `full_response_itl` directly. Older runs can
 * reconstruct the same per-request value from the retained AIPerf profile:
 *
 *   (request_end - first_content) / (OSL - 1)
 *   = (request_end - request_start - TTFT) / (OSL - 1)
 *
 * All returned latency values are seconds/token. Interactivity is the inverse
 * of each matching latency statistic, preserving slow-tail percentile meaning.
 */

import { gunzipSync } from 'node:zlib';

import { meanOf, quantile, readNum } from '../queries/agentic-shared';

export const FULL_RESPONSE_STAT_KEYS = [
  'mean',
  'median',
  'p75',
  'p90',
  'p95',
  'p99',
  'p99.9',
] as const;

type FullResponseStat = (typeof FULL_RESPONSE_STAT_KEYS)[number];

interface MetricEnvelope {
  value?: unknown;
  unit?: unknown;
}

interface ProfileRecord {
  metadata?: {
    benchmark_phase?: string;
    request_start_ns?: number;
    request_end_ns?: number;
  };
  metrics?: Record<string, unknown>;
  error?: unknown;
}

function secondsFromMetric(value: unknown, defaultUnit: 'ms' | 's' = 'ms'): number | undefined {
  const numeric = readNum(value);
  if (numeric === undefined || !Number.isFinite(numeric)) return undefined;
  const rawUnit =
    value && typeof value === 'object' && 'unit' in value
      ? String((value as MetricEnvelope).unit ?? '').toLowerCase()
      : defaultUnit;
  if (['ns', 'nanosecond', 'nanoseconds'].includes(rawUnit)) return numeric / 1e9;
  if (['us', 'µs', 'microsecond', 'microseconds'].includes(rawUnit)) return numeric / 1e6;
  if (['s', 'sec', 'second', 'seconds'].includes(rawUnit)) return numeric;
  return numeric / 1e3;
}

function populationStd(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = meanOf([...values]);
  return Math.sqrt(meanOf(values.map((value) => (value - mean) ** 2)));
}

function percentileStats(values: readonly number[]): Record<FullResponseStat, number> {
  const sorted = [...values].toSorted((a, b) => a - b);
  return {
    mean: meanOf(sorted),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    'p99.9': quantile(sorted, 0.999),
  };
}

/** Return one full-response ITL sample in seconds/token, or undefined. */
export function fullResponseItlSample(record: ProfileRecord): number | undefined {
  if (record.error) return undefined;
  if (record.metadata?.benchmark_phase && record.metadata.benchmark_phase !== 'profiling') {
    return undefined;
  }

  const metrics = record.metrics ?? {};
  const explicit = secondsFromMetric(metrics.full_response_inter_token_latency);
  if (explicit !== undefined && explicit > 0) return explicit;

  const osl = readNum(metrics.output_sequence_length);
  if (osl === undefined || osl < 2) return undefined;

  const explicitDuration = secondsFromMetric(metrics.full_decode_duration);
  let decodeDuration = explicitDuration;
  if (decodeDuration === undefined) {
    const ttft = secondsFromMetric(metrics.time_to_first_token);
    if (ttft === undefined) return undefined;

    const startNs = record.metadata?.request_start_ns;
    const endNs = record.metadata?.request_end_ns;
    if (
      typeof startNs === 'number' &&
      Number.isFinite(startNs) &&
      typeof endNs === 'number' &&
      Number.isFinite(endNs)
    ) {
      decodeDuration = (endNs - startNs) / 1e9 - ttft;
    } else {
      const httpDuration = secondsFromMetric(metrics.http_req_duration);
      if (httpDuration !== undefined) decodeDuration = httpDuration - ttft;
    }
  }

  if (decodeDuration === undefined || !Number.isFinite(decodeDuration) || decodeDuration <= 0) {
    return undefined;
  }
  return decodeDuration / (osl - 1);
}

/**
 * Compute namespaced and canonical ITL/interactivity fields from a profile.
 * Empty/malformed profiles return an empty patch and never erase stored data.
 */
export function fullResponseMetricsFromProfile(jsonl: string): Record<string, number> {
  const samples: number[] = [];
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    try {
      const sample = fullResponseItlSample(JSON.parse(line) as ProfileRecord);
      if (sample !== undefined && Number.isFinite(sample) && sample > 0) samples.push(sample);
    } catch {
      // A malformed record does not invalidate the remaining profile.
    }
  }
  if (samples.length === 0) return {};

  const stats = percentileStats(samples);
  const patch: Record<string, number> = {};
  for (const stat of FULL_RESPONSE_STAT_KEYS) {
    const itl = stats[stat];
    patch[`${stat}_full_response_itl`] = itl;
    patch[`${stat}_full_response_intvty`] = 1 / itl;
  }
  patch.std_full_response_itl = populationStd(samples);
  patch.std_full_response_intvty = populationStd(samples.map((value) => 1 / value));
  return preferFullResponseMetrics(patch);
}

export function fullResponseMetricsFromGzip(blob: Buffer | null): Record<string, number> {
  if (!blob) return {};
  try {
    return fullResponseMetricsFromProfile(gunzipSync(blob).toString('utf8'));
  } catch {
    return {};
  }
}

/**
 * Replace canonical AgentX ITL/interactivity with namespaced full-response
 * values when present. Missing full-response percentiles delete their legacy
 * canonical counterparts so one row never mixes the two timing domains.
 */
export function preferFullResponseMetrics(metrics: Record<string, number>): Record<string, number> {
  const out = { ...metrics };
  const hasFullResponse = FULL_RESPONSE_STAT_KEYS.some(
    (stat) => typeof out[`${stat}_full_response_itl`] === 'number',
  );
  if (!hasFullResponse) return out;

  for (const stat of FULL_RESPONSE_STAT_KEYS) {
    delete out[`${stat}_itl`];
    delete out[`${stat}_intvty`];
    const itl = out[`${stat}_full_response_itl`];
    if (typeof itl === 'number' && Number.isFinite(itl) && itl > 0) {
      out[`${stat}_itl`] = itl;
      out[`${stat}_intvty`] = 1 / itl;
    }
  }
  delete out.std_itl;
  delete out.std_intvty;
  const stdItl = out.std_full_response_itl;
  const stdIntvty = out.std_full_response_intvty;
  if (typeof stdItl === 'number' && Number.isFinite(stdItl)) out.std_itl = stdItl;
  if (typeof stdIntvty === 'number' && Number.isFinite(stdIntvty)) out.std_intvty = stdIntvty;
  return out;
}
