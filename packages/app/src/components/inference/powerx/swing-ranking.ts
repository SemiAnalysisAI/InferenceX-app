import type { InferenceData } from '@/components/inference/types';
import type { PowerTimelineTrace } from '@/components/inference/utils/powerTimeline';

import type { LoadSwingRow } from './load-swing-rows';
import { nearestByInteractivity } from './powerx-compare-at';
import type { PowerXRole } from './powerx-role';

/**
 * The Over time ranking beside the chart: one row per GPU series, read from the trace nearest
 * Compare at, valued by its Max 5 s swing (W per GPU) from the same `loadSwingRows` the
 * load-swings table prints, so a ranking value is always one of the table's Max Δ5s cells.
 * Lower is better. Under a GPU role a trace without prefill/decode pools stays listed as
 * aggregated, with no value (never 0).
 */
export interface PowerXSwingRankingRow {
  /** The GPU series (hardware key, or date and hardware key when comparing dates). */
  key: string;
  trace: PowerTimelineTrace;
  /** Max Δ5s in W per GPU; under Prefill vs decode the larger of the two pools. */
  value: number | null;
  /** Prefill vs decode: each pool's Max Δ5s. */
  pools: { prefill: number | null; decode: number | null } | null;
  aggregated: boolean;
  /** 1-based among the rows with a value; null for the rest. */
  rank: number | null;
  /** 'best', '+34%', or null (aggregated or no value). */
  delta: string | null;
}

/** Δ vs best: 'best' for the lowest value, otherwise the rounded excess, at least +1%. */
export function swingDeltaVsBest(value: number, best: number): string {
  if (!(best > 0) || value - best <= Math.abs(best) * 1e-9) return 'best';
  return `+${Math.max(1, Math.round((value / best - 1) * 100))}%`;
}

export function powerXSwingRanking(
  rows: readonly LoadSwingRow[],
  role: PowerXRole,
  {
    at,
    seriesOf,
    interactivityOf,
  }: {
    at: number;
    seriesOf: (point: InferenceData) => string;
    interactivityOf: (point: InferenceData) => number | null | undefined;
  },
): PowerXSwingRankingRow[] {
  const bySeries = new Map<string, Map<string, LoadSwingRow[]>>();
  for (const row of rows) {
    const series = seriesOf(row.trace.point);
    let traces = bySeries.get(series);
    if (!traces) bySeries.set(series, (traces = new Map()));
    const list = traces.get(row.trace.key);
    if (list) list.push(row);
    else traces.set(row.trace.key, [row]);
  }
  const ranked = [...bySeries].map(
    ([key, traces]): Omit<PowerXSwingRankingRow, 'rank' | 'delta'> => {
      const groups = [...traces.values()];
      const picked =
        nearestByInteractivity(groups, at, (group) => interactivityOf(group[0].trace.point) ?? 0) ??
        groups[0];
      const trace = picked[0].trace;
      const laneValue = (pool: 'prefill' | 'decode') =>
        picked.find((row) => row.lane?.kind === 'lane' && row.lane.role === pool)?.stats
          .maxDelta5s ?? null;
      const aggregated = picked.some((row) => row.lane?.kind === 'aggregated');
      if (role === 'all') {
        const value = picked.find((row) => !row.lane)?.stats.maxDelta5s ?? null;
        return { key, trace, value, pools: null, aggregated: false };
      }
      if (aggregated) return { key, trace, value: null, pools: null, aggregated };
      if (role === 'split') {
        const pools = { prefill: laneValue('prefill'), decode: laneValue('decode') };
        const values = [pools.prefill, pools.decode].filter((value) => value !== null);
        const value = values.length > 0 ? Math.max(...values) : null;
        return { key, trace, value, pools, aggregated };
      }
      return { key, trace, value: laneValue(role), pools: null, aggregated };
    },
  );
  const order = new Map(ranked.map((row, index) => [row.key, index]));
  ranked.sort(
    (a, b) =>
      Number(a.value === null) - Number(b.value === null) ||
      (a.value ?? 0) - (b.value ?? 0) ||
      order.get(a.key)! - order.get(b.key)!,
  );
  const best = ranked[0]?.value ?? null;
  let rank = 0;
  return ranked.map((row) => ({
    ...row,
    rank: row.value === null ? null : ++rank,
    delta: row.value === null || best === null ? null : swingDeltaVsBest(row.value, best),
  }));
}
