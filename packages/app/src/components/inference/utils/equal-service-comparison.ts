import type { AggDataEntry, InferenceData } from '../types';
import { chipCounts } from '@/lib/chip-counts';
import { isPositive, powerBasisNormalization } from '@/lib/power-basis';
import { reconstructedRoleEnergy, type ReconstructedRoleEnergy } from './role-energy';
import { pointTopologyKey, topologyLabel } from './topology-filter';

export interface EqualServiceSource {
  key: string;
  label: string;
}
export interface EqualServiceEstimate {
  value: number;
  interpolated: boolean;
  endpoints: { x: number; value: number; point: InferenceData }[];
}
export type EqualServiceReason =
  | 'unsupported-axis'
  | 'invalid-target'
  | 'same-source'
  | 'unknown-source'
  | 'out-of-range'
  | 'ambiguous-x'
  | 'missing-metric';
export interface EqualServiceMetric {
  baseline: EqualServiceEstimate | null;
  comparator: EqualServiceEstimate | null;
  /** Comparator change relative to baseline; negative energy means less energy. */
  changePercent: number | null;
  reason?: EqualServiceReason;
}
export interface EqualServiceOptions {
  baseline: string;
  comparator: string;
  target: number;
  xField: keyof AggDataEntry;
}
export interface EqualServiceComparison {
  target: number;
  xField: keyof AggDataEntry;
  baseline: EqualServiceSource | null;
  comparator: EqualServiceSource | null;
  reason?: EqualServiceReason;
  metrics: Record<
    'meanWattsPerGpu' | 'outputTokensPerSecond' | 'joulesPerOutputToken',
    EqualServiceMetric
  >;
}
const serviceAxis = (field: string) =>
  field === 'mean_tpot_intvty' ||
  /^(?:mean|median|p\d+(?:\.\d+)?)_(?:intvty|tpot|ttft|e2el|itl)$/u.test(field);
/** A positive finite reading, or null: a missing value is never zero. */
export const positiveOrNull = (value: unknown): number | null => (isPositive(value) ? value : null);
/** Measured rows only: hidden rows and power-comparison clones are never sources. */
export const observedPoints = (points: readonly InferenceData[]) =>
  points.filter((point) => !point.hidden && !point.powerVariant);

/** Concurrency is excluded; unknown run identity must never join distinct rows. */
export function equalServiceSourceKey(point: InferenceData): string {
  const attempt = 'run_attempt' in point ? point.run_attempt : null;
  return JSON.stringify([
    point.hwKey,
    point.model ?? null,
    point.framework ?? null,
    point.precision,
    point.benchmark_type ?? null,
    point.isl ?? null,
    point.osl ?? null,
    point.actualDate ?? point.date,
    point.run_url || `unknown-run-point-${point.id ?? JSON.stringify(point)}`,
    attempt,
    pointTopologyKey(point),
    point.recipe_fingerprint ?? null,
    point.image ?? null,
    point.mtp ?? null,
    point.spec_decoding ?? null,
    point.kv_offloading ?? null,
    point.kv_offload_backend ?? null,
    point.kv_offload_backend_version ?? null,
    point.kv_p2p_transfer ?? null,
    point.router_name ?? null,
    point.router_version ?? null,
    point.power_audit?.producer_sha ?? null,
    point.power_audit?.exporter_image_sha256 ?? null,
  ]);
}

export function getEqualServiceSources(points: readonly InferenceData[]): EqualServiceSource[] {
  const sources = new Map(
    observedPoints(points).map((point) => [equalServiceSourceKey(point), point]),
  );
  const topologies = [...sources.values()].map(pointTopologyKey);
  return [...sources]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, point]) => ({
      key,
      label: [
        point.hwKey,
        point.precision.toUpperCase(),
        topologyLabel(pointTopologyKey(point), 'en', topologies),
        point.actualDate ?? point.date,
        point.run_url ?? `Point ${point.id ?? '?'}`,
        'run_attempt' in point ? `Attempt ${point.run_attempt}` : null,
        point.recipe_fingerprint ? `Recipe ${point.recipe_fingerprint}` : null,
        point.image ?? null,
      ]
        .filter(Boolean)
        .join(' · '),
    }));
}

function deploymentOutput(point: InferenceData): number | undefined {
  if (!isPositive(point.output_tput_per_gpu)) return undefined;
  if (point.disagg) {
    return (
      powerBasisNormalization({
        output_tput_per_gpu: point.output_tput_per_gpu,
        disagg: true,
        benchmark_type: point.benchmark_type,
        num_prefill_gpu: point.num_prefill_gpu ?? 0,
        num_decode_gpu: point.num_decode_gpu ?? 0,
      }).totalOutputTokPerSec ?? undefined
    );
  }
  const count = chipCounts(point, false).physical;
  return isPositive(count) && Number.isSafeInteger(count)
    ? point.output_tput_per_gpu * count
    : undefined;
}
/** The measured quantities every service panel compares, read from one point. */
export const serviceMetricValue = {
  meanWattsPerGpu: (point: InferenceData) => point.measuredAvgPower?.y,
  outputTokensPerSecond: deploymentOutput,
  joulesPerOutputToken: (point: InferenceData) => point.measuredJPerOutputToken?.y,
};

function estimate(
  points: readonly InferenceData[],
  field: keyof AggDataEntry,
  target: number,
  quantity: (point: InferenceData) => number | undefined,
): { estimate: EqualServiceEstimate | null; reason?: EqualServiceReason } {
  const rows = points
    .flatMap((point) => {
      const x = point[field];
      return isPositive(x) ? [{ point, x, value: quantity(point) }] : [];
    })
    .sort((a, b) => a.x - b.x || (a.point.id ?? 0) - (b.point.id ?? 0));
  const xs = [...new Set(rows.map((row) => row.x))];
  if (xs.length === 0 || target < xs[0] || target > xs.at(-1)!)
    return { estimate: null, reason: 'out-of-range' };
  const upper = xs.findIndex((x) => x >= target);
  const brackets = xs[upper] === target ? [target] : [xs[upper - 1], xs[upper]];
  const endpoints: EqualServiceEstimate['endpoints'] = [];
  for (const x of brackets) {
    const matches = rows.filter((row) => row.x === x);
    if (matches.some((row) => !Object.is(row.value, matches[0].value)))
      return { estimate: null, reason: 'ambiguous-x' };
    for (const row of matches) {
      if (!isPositive(row.value)) return { estimate: null, reason: 'missing-metric' };
      endpoints.push({ ...row, value: row.value });
    }
  }
  const left = endpoints[0],
    right = endpoints.at(-1)!;
  const value =
    brackets.length === 1
      ? left.value
      : left.value + (right.value - left.value) * ((target - left.x) / (right.x - left.x));
  return isPositive(value)
    ? { estimate: { value, interpolated: brackets.length === 2, endpoints } }
    : { estimate: null, reason: 'missing-metric' };
}

/** Numerical linear interpolation of raw quantities, then ratios; never extrapolation. */
export function buildEqualServiceComparison(
  points: readonly InferenceData[],
  options: EqualServiceOptions,
): EqualServiceComparison {
  const { baseline, comparator, target, xField } = options;
  const sources = getEqualServiceSources(points);
  const sourceA = sources.find((source) => source.key === baseline) ?? null;
  const sourceB = sources.find((source) => source.key === comparator) ?? null;
  let reason: EqualServiceReason | undefined;
  if (!serviceAxis(xField)) reason = 'unsupported-axis';
  else if (!isPositive(target)) reason = 'invalid-target';
  else if (baseline === comparator) reason = 'same-source';
  else if (!sourceA || !sourceB) reason = 'unknown-source';
  const rows = observedPoints(points);
  const a = rows.filter((point) => equalServiceSourceKey(point) === baseline);
  const b = rows.filter((point) => equalServiceSourceKey(point) === comparator);
  const compare = (quantity: (point: InferenceData) => number | undefined): EqualServiceMetric => {
    if (reason) return { baseline: null, comparator: null, changePercent: null, reason };
    const left = estimate(a, xField, target, quantity);
    const right = estimate(b, xField, target, quantity);
    const change =
      left.estimate && right.estimate
        ? 100 * (right.estimate.value / left.estimate.value - 1)
        : null;
    return {
      baseline: left.estimate,
      comparator: right.estimate,
      changePercent: change !== null && Number.isFinite(change) ? change : null,
      ...(left.reason || right.reason ? { reason: left.reason ?? right.reason } : {}),
    };
  };
  return {
    target,
    xField,
    baseline: sourceA,
    comparator: sourceB,
    ...(reason ? { reason } : {}),
    metrics: {
      meanWattsPerGpu: compare(serviceMetricValue.meanWattsPerGpu),
      outputTokensPerSecond: compare(serviceMetricValue.outputTokensPerSecond),
      joulesPerOutputToken: compare(serviceMetricValue.joulesPerOutputToken),
    },
  };
}

/** Knots are observed X values within both source ranges, not a fitted hardware model. */
export function getEqualServiceComparisonCurve(
  points: readonly InferenceData[],
  options: Omit<EqualServiceOptions, 'target'>,
): EqualServiceComparison[] {
  if (!serviceAxis(options.xField) || options.baseline === options.comparator) return [];
  const xs = (key: string) =>
    observedPoints(points)
      .filter((point) => equalServiceSourceKey(point) === key)
      .map((point) => point[options.xField])
      .filter(isPositive);
  const a = xs(options.baseline),
    b = xs(options.comparator);
  if (a.length === 0 || b.length === 0) return [];
  const lower = Math.max(Math.min(...a), Math.min(...b));
  const upper = Math.min(Math.max(...a), Math.max(...b));
  return [...new Set([...a, ...b])]
    .filter((x) => x >= lower && x <= upper)
    .sort((x, y) => x - y)
    .map((target) => buildEqualServiceComparison(points, { ...options, target }));
}

export function getPrefillSharePoints(
  points: readonly InferenceData[],
  xField: keyof AggDataEntry,
) {
  if (!serviceAxis(xField) && xField !== 'conc') return [];
  return observedPoints(points)
    .flatMap((point) => {
      const x = point[xField];
      const energy = reconstructedRoleEnergy(point);
      return isPositive(x) && energy
        ? [{ x, sourceKey: equalServiceSourceKey(point), point, ...energy }]
        : [];
    })
    .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey) || a.x - b.x);
}

export interface RolePoint {
  x: number;
  sourceKey: string;
  point: InferenceData;
  /** Mean board W/GPU inside each pool (role-local). */
  prefillWattsPerGpu: number | null;
  decodeWattsPerGpu: number | null;
  /** Role-local energy: each pool's joules over its own token count. */
  prefillJoulesPerInputToken: number | null;
  decodeJoulesPerOutputToken: number | null;
  /** Both pools on the output-token denominator, when reconstructable. */
  energy: ReconstructedRoleEnergy | null;
}

/**
 * Validated disaggregated rows with any role measurement (PowerX Figures
 * 12–14). Pool-local denominators stay separate from the additive
 * output-token reconstruction; a missing figure is null, never zero.
 */
export function getRolePoints(
  points: readonly InferenceData[],
  xField: keyof AggDataEntry,
): RolePoint[] {
  if (!serviceAxis(xField) && xField !== 'conc') return [];
  return observedPoints(points)
    .flatMap((point): RolePoint[] => {
      const x = point[xField];
      if (!point.disagg || !isPositive(x)) return [];
      const role: RolePoint = {
        x,
        sourceKey: equalServiceSourceKey(point),
        point,
        prefillWattsPerGpu: positiveOrNull(point.measuredPrefillAvgPower?.y),
        decodeWattsPerGpu: positiveOrNull(point.measuredDecodeAvgPower?.y),
        prefillJoulesPerInputToken: positiveOrNull(point.measuredPrefillJPerInputToken?.y),
        decodeJoulesPerOutputToken: positiveOrNull(point.measuredDecodeJPerOutputToken?.y),
        energy: reconstructedRoleEnergy(point) ?? null,
      };
      const measured =
        role.prefillWattsPerGpu !== null ||
        role.decodeWattsPerGpu !== null ||
        role.prefillJoulesPerInputToken !== null ||
        role.decodeJoulesPerOutputToken !== null ||
        role.energy !== null;
      return measured ? [role] : [];
    })
    .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey) || a.x - b.x);
}
