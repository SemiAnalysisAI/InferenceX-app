import type { AggDataEntry, InferenceData } from '../types';
import { getHardwareConfig } from '@/lib/catalog/constants';
import { isPositive, powerBasisNormalization } from '@/lib/power/power-basis';
import { getDisplayLabel } from '@/lib/shared/utils';
import { runIdFromUrl } from './powerTimeline';
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
const derivedAxis = (field: string) => /^p\d+_e2e_norm_intvty$/u.test(field);
const roleAxisValue = (point: InferenceData, xField: keyof AggDataEntry) =>
  derivedAxis(xField) ? point.x : point[xField];
export const positiveOrNull = (value: unknown): number | null => (isPositive(value) ? value : null);
export const observedPoints = (points: readonly InferenceData[]) =>
  points.filter((point) => !point.hidden && !point.powerVariant);

const curveSnapshotId = (point: InferenceData): number | null =>
  point.curve_workflow_run_id ?? null;
const sourceDate = (point: InferenceData): string =>
  (curveSnapshotId(point) === null ? undefined : point.curve_date) ??
  point.actualDate ??
  point.date;

export function equalServiceSourceKey(point: InferenceData): string {
  const snapshot = curveSnapshotId(point);
  const attempt = 'run_attempt' in point ? point.run_attempt : null;
  return JSON.stringify([
    point.hwKey,
    point.model ?? null,
    point.framework ?? null,
    point.precision,
    point.benchmark_type ?? null,
    point.isl ?? null,
    point.osl ?? null,
    sourceDate(point),
    snapshot === null
      ? point.run_url || `unknown-run-point-${point.id ?? JSON.stringify(point)}`
      : `curve-${snapshot}`,
    snapshot === null ? attempt : null,
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
    snapshot === null ? (point.power_audit?.producer_sha ?? null) : null,
    snapshot === null ? (point.power_audit?.exporter_image_sha256 ?? null) : null,
  ]);
}

const SOURCE_LABEL_WORDS = {
  en: {
    point: 'Point',
    run: (id: string) => `Run #${id}`,
    attempt: (attempt: unknown) => `Attempt ${attempt}`,
    recipe: 'Recipe',
  },
  zh: {
    point: '数据点',
    run: (id: string) => `运行 #${id}`,
    attempt: (attempt: unknown) => `第 ${attempt} 次尝试`,
    recipe: '配方',
  },
};

function sourceLabels(points: readonly InferenceData[], locale: 'en' | 'zh'): string[] {
  const words = SOURCE_LABEL_WORDS[locale];
  const details: ((point: InferenceData, group: readonly InferenceData[]) => string | null)[] = [
    (point) => point.precision.toUpperCase(),
    (point, group) => topologyLabel(pointTopologyKey(point), locale, group.map(pointTopologyKey)),
    (point) => {
      const snapshot = curveSnapshotId(point);
      const runId = snapshot === null ? runIdFromUrl(point.run_url) : String(snapshot);
      return runId ? words.run(runId) : null;
    },
    (point) =>
      curveSnapshotId(point) === null && 'run_attempt' in point
        ? words.attempt(point.run_attempt)
        : null,
    (point) =>
      point.recipe_fingerprint ? `${words.recipe} ${point.recipe_fingerprint.slice(0, 8)}` : null,
    (point) => point.image ?? null,
    (point) => `${words.point} ${point.id ?? '?'}`,
  ];
  const labels = points.map((point) => {
    const hardware = getHardwareConfig(point.hwKey);
    return [
      hardware.name === 'unknown' ? point.hwKey : getDisplayLabel(hardware),
      sourceDate(point),
    ].join(' · ');
  });
  for (const detail of details) {
    const groups = new Map<string, number[]>();
    labels.forEach((label, index) => groups.set(label, [...(groups.get(label) ?? []), index]));
    for (const indices of groups.values()) {
      if (indices.length < 2) continue;
      const group = indices.map((index) => points[index]);
      const values = group.map((point) => detail(point, group));
      if (new Set(values).size < 2) continue;
      indices.forEach((index, position) => {
        if (values[position]) labels[index] += ` · ${values[position]}`;
      });
    }
  }
  return labels;
}

export function getEqualServiceSources(
  points: readonly InferenceData[],
  locale: 'en' | 'zh' = 'en',
): EqualServiceSource[] {
  const sources = [
    ...new Map(observedPoints(points).map((point) => [equalServiceSourceKey(point), point])),
  ].sort(([a], [b]) => a.localeCompare(b));
  const labels = sourceLabels(
    sources.map(([, point]) => point),
    locale,
  );
  return sources.map(([key], index) => ({ key, label: labels[index] }));
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
  const count = point.physicalChips ?? point.tp;
  return isPositive(count) && Number.isSafeInteger(count)
    ? point.output_tput_per_gpu * count
    : undefined;
}
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
  if (!serviceAxis(xField) && !derivedAxis(xField)) return [];
  return observedPoints(points)
    .flatMap((point) => {
      const x = roleAxisValue(point, xField);
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
  prefillWattsPerGpu: number | null;
  decodeWattsPerGpu: number | null;
  prefillJoulesPerInputToken: number | null;
  decodeJoulesPerOutputToken: number | null;
  energy: ReconstructedRoleEnergy | null;
}

export function getRolePoints(
  points: readonly InferenceData[],
  xField: keyof AggDataEntry,
): RolePoint[] {
  if (!serviceAxis(xField) && !derivedAxis(xField)) return [];
  return observedPoints(points)
    .flatMap((point): RolePoint[] => {
      const x = roleAxisValue(point, xField);
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
