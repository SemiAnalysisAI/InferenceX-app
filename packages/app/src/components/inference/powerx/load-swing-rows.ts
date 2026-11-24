import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import {
  poolSubsetSeries,
  traceLanes,
  type PowerLaneKind,
  type PowerPoolRole,
  type PowerTimelineTrace,
} from '@/components/inference/utils/powerTimeline';
import {
  loadSwingStatsFromSeries,
  NVL72_GPUS_PER_RACK,
  type LoadSwingStats,
} from '@/lib/power/load-swing-stats';

import type { PowerXRole } from './powerx-role';

export interface LoadSwingRow {
  key: string;
  trace: PowerTimelineTrace;
  /** Under a GPU role: the lane this row reads; absent under All GPUs. */
  lane?: { role: PowerPoolRole; kind: PowerLaneKind; gpuCount: number };
  stats: LoadSwingStats;
  /** The chip's TDP in W, or 0 when unknown. */
  tdpWatts: number;
}

/**
 * Statistics of every visible trace, one row per lane under a GPU role (the pool subset via
 * `poolSubsetSeries`, the same function the stats API uses); rows without samples are left out.
 */
export function loadSwingRows(
  traces: readonly PowerTimelineTrace[],
  role: PowerXRole,
): LoadSwingRow[] {
  return traces.flatMap((trace) =>
    traceLanes(trace.series, role).flatMap((lane) => {
      const series = lane.role === 'all' ? trace.series : poolSubsetSeries(trace.series, lane.role);
      const stats =
        series && loadSwingStatsFromSeries(series, trace.windowStartMs, trace.windowEndMs);
      if (!stats) return [];
      return [
        {
          key: role === 'all' ? trace.key : `${trace.key}:${lane.kind}:${lane.role}`,
          trace,
          lane:
            role === 'all'
              ? undefined
              : { role: lane.role, kind: lane.kind, gpuCount: lane.rows.length },
          stats,
          tdpWatts: HW_REGISTRY[trace.point.hwKey.split('_')[0]]?.tdp ?? 0,
        },
      ];
    }),
  );
}

/** A load-swing figure as the table prints it: W per GPU, or kW per NVL72 rack (× 72). */
export function formatLoadSwingWatts(watts: number | null, rack: boolean): string {
  if (watts === null) return '—';
  if (!rack) return `${Math.round(watts).toLocaleString('en-US')} W`;
  const kw = (watts * NVL72_GPUS_PER_RACK) / 1000;
  return `${Number(kw.toPrecision(3)).toLocaleString('en-US')} kW`;
}

/** A per-GPU swing as a whole-number % of the chip's TDP, or null when the TDP is unknown. */
export function loadSwingPercentTdp(watts: number, tdpWatts: number): number | null {
  return tdpWatts > 0 ? Math.round((watts / tdpWatts) * 100) : null;
}
