import type { InferenceData } from '@/components/inference/types';
import { poolPercentTdp } from '@/components/inference/utils/power-compare';
import { tracePools, type PowerTimelineTrace } from '@/components/inference/utils/powerTimeline';
import { getGpuSpecs } from '@/lib/catalog/constants';
import { modeledFacilityWattsPerGpu } from '@/lib/power/power-basis';

import { loadSwingRows } from './load-swing-rows';
import { defaultReadoutPoint } from './PowerXLayout';
import { hasPowerRoleData, type PowerXRole } from './powerx-role';
import type { PowerXView } from './powerx-views';

/** The two GPU pools of a disaggregated deployment, as fractions or per-pool values. */
export interface PoolPair {
  prefill: number;
  decode: number;
}

/**
 * The insight card's finding, computed live from the chart's visible rows at the point
 * nearest the readout's default interactivity. Copy is formatted by the card.
 * - `energy`: J per output token by pool; `share` is the prefill share of the measured
 *   J per output token (reconstructed prefill ÷ measured total), so the pools add up.
 * - `power`: average W per GPU by pool and each pool's % of TDP (null when TDP is unknown).
 * - `gpuLayer`: each pool's share of the measured GPU layer (pool W × pool GPUs), and the
 *   facility uplift (modeled facility W per GPU ÷ measured W per GPU) when modeled.
 * - `swing`: Over time under All GPUs, the largest 5 s change of the all-GPU mean trace
 *   (W per GPU, the load-swings table's Max Δ5s) across the visible disaggregated traces.
 */
export type PowerXInsightFinding =
  | { kind: 'energy'; joules: PoolPair; total: number; share: PoolPair }
  | { kind: 'power'; watts: PoolPair; percentTdp: PoolPair | null }
  | {
      kind: 'gpuLayer';
      watts: PoolPair;
      gpus: PoolPair;
      share: PoolPair;
      facilityUplift: number | null;
    }
  | { kind: 'swing'; trace: PowerTimelineTrace; deltaWatts: number; tdpWatts: number };

export interface PowerXInsight {
  view: PowerXView;
  role: PowerXRole;
  /** The row the numbers describe. */
  point: InferenceData;
  finding: PowerXInsightFinding;
  /**
   * Every visible chip config (hwKey) with prefill/decode telemetry, in first-seen order: rows
   * with per-pool power, or for the swing finding traces with prefill/decode GPU pools.
   */
  hardware: string[];
}

const finite = (value: number | undefined | null): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Visible, original (not role-cloned) rows that carry measured power per GPU pool. */
export function powerXRoleRows(points: readonly InferenceData[]): InferenceData[] {
  return points.filter((point) => !point.hidden && !point.powerVariant && hasPowerRoleData(point));
}

export function powerXRoleHardware(points: readonly InferenceData[]): string[] {
  return [...new Set(powerXRoleRows(points).map((point) => point.hwKey))];
}

function energyFinding(point: InferenceData): PowerXInsightFinding | null {
  const prefill = point.reconstructedPrefillJPerOutputToken?.y;
  const total = point.measuredJPerOutputToken?.y;
  if (!finite(prefill) || !finite(total) || !(total > 0)) return null;
  const decode = point.measuredDecodeJPerOutputToken?.y;
  const share = Math.min(1, Math.max(0, prefill / total));
  return {
    kind: 'energy',
    joules: { prefill, decode: finite(decode) ? decode : total - prefill },
    total,
    share: { prefill: share, decode: 1 - share },
  };
}

function poolWatts(point: InferenceData): PoolPair | null {
  const prefill = point.measuredPrefillAvgPower?.y;
  const decode = point.measuredDecodeAvgPower?.y;
  return finite(prefill) && finite(decode) ? { prefill, decode } : null;
}

function percentTdpOf(point: InferenceData, watts: number): number | null {
  const pct = poolPercentTdp(point, { y: watts, roof: false })?.y;
  if (finite(pct)) return pct;
  const tdp = getGpuSpecs(point.hwKey).tdp;
  return tdp > 0 ? (watts / tdp) * 100 : null;
}

function powerFinding(point: InferenceData): PowerXInsightFinding | null {
  const watts = poolWatts(point);
  if (!watts) return null;
  const prefill = percentTdpOf(point, watts.prefill);
  const decode = percentTdpOf(point, watts.decode);
  return {
    kind: 'power',
    watts,
    percentTdp: prefill !== null && decode !== null ? { prefill, decode } : null,
  };
}

function gpuLayerFinding(point: InferenceData): PowerXInsightFinding | null {
  const watts = poolWatts(point);
  const gpus = { prefill: point.num_prefill_gpu ?? 0, decode: point.num_decode_gpu ?? 0 };
  if (!watts || !(gpus.prefill > 0) || !(gpus.decode > 0)) return null;
  const prefillLayer = watts.prefill * gpus.prefill;
  const layer = prefillLayer + watts.decode * gpus.decode;
  if (!(layer > 0)) return null;
  const share = prefillLayer / layer;
  const facility = point.utilityModeledWatts?.y ?? modeledFacilityWattsPerGpu(point);
  const gpu = point.measuredAvgPower?.y;
  return {
    kind: 'gpuLayer',
    watts,
    gpus,
    share: { prefill: share, decode: 1 - share },
    facilityUplift: finite(facility) && finite(gpu) && gpu > 0 ? facility / gpu : null,
  };
}

const hasRolePools = (trace: PowerTimelineTrace) =>
  tracePools(trace.series).some((pool) => pool.role !== 'all');

/**
 * The 5 s load swing behind the Over time card under All GPUs, read from the same
 * `loadSwingRows` the load-swings table prints (so the card's figure is one of its Max Δ5s
 * cells). Only traces that split into prefill and decode pools count, since the card leads to
 * the role split; the largest swing among them wins, the first on a tie.
 */
export function powerXLoadSwingInsight(
  traces: readonly PowerTimelineTrace[],
): PowerXInsight | null {
  const split = traces.filter(hasRolePools);
  let best: ReturnType<typeof loadSwingRows>[number] | null = null;
  for (const row of loadSwingRows(split, 'all')) {
    if (row.stats.maxDelta5s > (best?.stats.maxDelta5s ?? 0)) best = row;
  }
  if (!best) return null;
  return {
    view: 'time',
    role: 'all',
    point: best.trace.point,
    finding: {
      kind: 'swing',
      trace: best.trace,
      deltaWatts: best.stats.maxDelta5s,
      tdpWatts: best.tdpWatts,
    },
    hardware: [...new Set(split.map((trace) => trace.point.hwKey))],
  };
}

/**
 * Which finding a view shows from the chart rows. All GPUs on Over time shows the 5 s load
 * swing, which lives in the power traces rather than the chart rows (`powerXLoadSwingInsight`);
 * under a role the Over time card states the pool's average draw.
 */
function findingFor(view: PowerXView, role: PowerXRole) {
  if (view === 'energy') return energyFinding;
  if (view === 'where') return gpuLayerFinding;
  if (view === 'draw') return powerFinding;
  return role === 'all' ? null : powerFinding;
}

/**
 * The insight for a view and role, or null when no visible row (or, for the Over time swing,
 * no visible trace) is disaggregated with per-pool telemetry (aggregated rows run prefill and
 * decode on the same GPUs).
 */
export function powerXInsight({
  view,
  role,
  points,
  traces,
}: {
  view: PowerXView;
  role: PowerXRole;
  points: readonly InferenceData[];
  /** Over time: the traces the load-swings table reads (the focused one when focused). */
  traces?: readonly PowerTimelineTrace[];
}): PowerXInsight | null {
  if (view === 'time' && role === 'all') return traces ? powerXLoadSwingInsight(traces) : null;
  const compute = findingFor(view, role);
  if (!compute) return null;
  const rows = powerXRoleRows(points);
  const usable = rows.filter((point) => compute(point) !== null);
  const point = defaultReadoutPoint(usable);
  if (!point) return null;
  const finding = compute(point);
  if (!finding) return null;
  return { view, role, point, finding, hardware: powerXRoleHardware(points) };
}
