/**
 * Helpers shared by the agentic per-point queries (`agentic-aggregates.ts`,
 * `derived-agentic-metrics.ts`): percentile math over aiperf samples,
 * the `{value, unit}` metric-envelope reader, and the single-round-trip
 * `aggregate_stats` fetch both fast paths start from.
 */

import type { DbClient } from '../connection.js';

export interface MetricPercentiles {
  mean: number;
  p50: number;
  p75: number;
  p90: number;
  p99: number;
  /** Sample count used to compute the percentiles. */
  n: number;
}

/** Linear-interpolated percentile (matches numpy's default linear method). */
export function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return Number.NaN;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo]!;
  return sortedAsc[lo]! + (sortedAsc[hi]! - sortedAsc[lo]!) * (pos - lo);
}

export function meanOf(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Compute the percentile bundle for an array of samples; null if empty. */
export function percentilesOf(samples: number[]): MetricPercentiles | null {
  const clean = samples.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return null;
  const sorted = [...clean].toSorted((a, b) => a - b);
  return {
    mean: meanOf(sorted),
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    p99: quantile(sorted, 0.99),
    n: sorted.length,
  };
}

/** Pull a numeric metric out of the {value, unit} envelope (or a bare number). */
export function readNum(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'value' in v) {
    const inner = (v as { value?: unknown }).value;
    if (typeof inner === 'number' && Number.isFinite(inner)) return inner;
  }
  return undefined;
}

/**
 * One round-trip fetch of the pre-computed `aggregate_stats` JSONB for a set
 * of benchmark_results ids (via their trace_replay link). Both agentic fast
 * paths read from this; ids without a trace_replay row simply don't appear.
 * `Stats` is the caller's view of the JSONB shape.
 */
export async function fetchAggregateStatsRows<Stats>(
  sql: DbClient,
  benchmarkResultIds: readonly number[],
): Promise<{ benchmark_result_id: number; stats: Stats | null }[]> {
  return (await sql`
    select
      br.id as benchmark_result_id,
      atr.aggregate_stats as stats
    from benchmark_results br
    join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where br.id = any(${benchmarkResultIds}::bigint[])
  `) as unknown as { benchmark_result_id: number; stats: Stats | null }[];
}
