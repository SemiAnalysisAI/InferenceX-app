import {
  evaluateSlaConfig,
  HW_REGISTRY,
  rankQualifying,
  resolveFrameworkPartLabel,
  SLA_SAMPLE_POLICY,
  type SlaConfigResult,
  type SlaPointInput,
  type SlaPointResult,
  type SlaSamplePolicy,
  type SlaSelections,
  type SlaStatus,
} from '@semianalysisai/inferencex-constants';

import { getGpuSpecs } from '@/lib/catalog/constants';
import type { Locale } from '@/lib/i18n/i18n';

import {
  SLA_AGENTIC_WORKLOAD,
  type SlaExcludedPoint,
  type SlaTargetsConfig,
  type SlaTargetsPoint,
} from './dataset';
import {
  isSlaPointEvaluation,
  type SlaPointEvaluation,
  type SlaPointEvaluations,
} from './evaluation';
import type { SlaCostTier } from './state';

export type SlaRowStatus = SlaStatus | 'loading';

/** One tested load of a configuration: a measured point or a load that produced none. */
export interface SlaPointView {
  concurrency: number;
  /** The measured point; `null` for a load the run tested without a measurement. */
  point: SlaTargetsPoint | null;
  /** The failed or excluded load, when this is one. */
  excluded: SlaExcludedPoint | null;
  /** Server evaluation of the point; `null` when it has none or is still loading. */
  evaluation: SlaPointEvaluation | null;
  /** `null` while the evaluation of the point is still loading. */
  result: SlaPointResult | null;
}

/** One serving configuration evaluated against the targets. */
export interface SlaConfigView {
  config: SlaTargetsConfig;
  hardwareLabel: string;
  /** Framework, precision, speculative decoding, topology and offload mode. */
  servingLabel: string;
  status: SlaRowStatus;
  /** No verdict, and the observed values cannot support one. */
  exploratory: boolean;
  /** $ per GPU-hour used for the cost estimate; 0 when the hardware has no cost. */
  gpuHourUsd: number;
  /** Measured points by load, then loads without a measurement. */
  points: SlaPointView[];
  /** The point behind each headline value; `null` when no point qualifies. */
  selections: Record<keyof SlaSelections, SlaPointView | null>;
  /** The point shown when nothing qualifies: the highest observed attainment. */
  bestObserved: SlaPointView | null;
  lowerLoadMissed: boolean;
}

export interface SlaTargetsView {
  /** Qualifying rows first, cheapest first; then misses; then rows without a verdict. */
  rows: SlaConfigView[];
  /** Qualifying rows in ranking order. Exploratory rows are never in it. */
  qualifying: SlaConfigView[];
}

export function slaServingLabel(config: SlaTargetsConfig, model: string, locale: Locale): string {
  const spec =
    config.specMethod === 'none' || config.specMethod === ''
      ? null
      : resolveFrameworkPartLabel(model, config.specMethod);
  return [
    resolveFrameworkPartLabel(model, config.framework),
    config.precision.toUpperCase(),
    spec,
    config.poolSplit ??
      (locale === 'zh'
        ? `${config.gpuCount} 张 GPU`
        : `${config.gpuCount} ${config.gpuCount === 1 ? 'GPU' : 'GPUs'}`),
    config.offloadMode === 'on' ? 'KV offload' : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

export function slaHardwareLabel(hardware: string): string {
  return HW_REGISTRY[hardware]?.label ?? hardware.toUpperCase();
}

export function slaGpuHourUsd(hardware: string, costTier: SlaCostTier): number {
  const specs = getGpuSpecs(hardware);
  return costTier === 'rental' ? specs.costr : specs.costh;
}

function bestObserved(points: SlaPointView[]): SlaPointView | null {
  let best: SlaPointView | null = null;
  for (const view of points) {
    const attainment = view.result?.observed?.attainment ?? null;
    if (attainment === null) continue;
    if (best === null || attainment > (best.result?.observed?.attainment ?? -1)) best = view;
  }
  return best;
}

function evaluateConfig(
  config: SlaTargetsConfig,
  model: string,
  evaluations: SlaPointEvaluations,
  requiredAttainment: number,
  costTier: SlaCostTier,
  locale: Locale,
  samplePolicy: SlaSamplePolicy,
): SlaConfigView & { result: SlaConfigResult | null } {
  const gpuHourUsd = slaGpuHourUsd(config.hardware, costTier);
  const cost = gpuHourUsd > 0 ? { gpuHourUsd, gpuCount: config.gpuCount } : null;
  const base = {
    config,
    hardwareLabel: slaHardwareLabel(config.hardware),
    servingLabel: slaServingLabel(config, model, locale),
    gpuHourUsd,
  };
  const entries: Omit<SlaPointView, 'result'>[] = [
    ...config.points.map((point) => {
      const evaluation = evaluations[point.id];
      return {
        concurrency: point.concurrency,
        point,
        excluded: null,
        evaluation: isSlaPointEvaluation(evaluation) ? evaluation : null,
      };
    }),
    ...config.excluded.map((excluded) => ({
      concurrency: excluded.concurrency,
      point: null,
      excluded,
      evaluation: null,
    })),
  ];
  const loading = config.points.some(
    (point) => point.hasRequestData && evaluations[point.id] === undefined,
  );
  if (loading) {
    return {
      ...base,
      status: 'loading',
      exploratory: false,
      points: entries.map((entry) => ({ ...entry, result: null })),
      selections: { highestPassingLoad: null, highestGoodput: null, lowestCost: null },
      bestObserved: null,
      lowerLoadMissed: false,
      result: null,
    };
  }

  const inputs = entries.map((entry): SlaPointInput => {
    const load = { kind: config.loadKind, value: entry.concurrency };
    if (entry.excluded) {
      const { category, reason } = entry.excluded;
      return { load, data: { kind: 'excluded', category, reason }, cost };
    }
    if (entry.evaluation === null) {
      const stored = entry.point ? evaluations[entry.point.id] : undefined;
      return {
        load,
        data:
          stored !== undefined && 'unavailable' in stored
            ? { kind: 'unavailable', reason: stored.unavailable, detail: stored.detail ?? null }
            : { kind: 'unavailable', reason: 'no_request_level_data' },
        cost,
      };
    }
    const { accounting, counts } = entry.evaluation;
    return { load, data: { kind: 'measured', accounting, counts }, cost };
  });
  const result = evaluateSlaConfig(inputs, requiredAttainment, samplePolicy);
  const points = entries.map((entry, index) => ({ ...entry, result: result.points[index] }));
  const at = (index: number | null) => (index === null ? null : points[index]);
  return {
    ...base,
    status: result.status,
    exploratory: result.exploratory,
    points,
    selections: {
      highestPassingLoad: at(result.selections.highestPassingLoad),
      highestGoodput: at(result.selections.highestGoodput),
      lowestCost: at(result.selections.lowestCost),
    },
    bestObserved: bestObserved(points),
    lowerLoadMissed: result.lowerLoadMissed,
    result,
  };
}

const STATUS_ORDER: Record<SlaRowStatus, number> = {
  meets: 0,
  misses: 1,
  loading: 2,
  insufficient_data: 3,
};

/**
 * Evaluate the configurations of one workload. The page and the public view
 * API both call this, so they cannot disagree. A configuration whose point
 * evaluations have not all arrived is `loading`, never judged on partial data.
 */
export function evaluateSlaTargetsView(
  configs: readonly SlaTargetsConfig[],
  model: string,
  evaluations: SlaPointEvaluations,
  requiredAttainment: number,
  costTier: SlaCostTier,
  locale: Locale = 'en',
  samplePolicy: SlaSamplePolicy = SLA_SAMPLE_POLICY,
): SlaTargetsView {
  const evaluated = configs.map((config) =>
    evaluateConfig(config, model, evaluations, requiredAttainment, costTier, locale, samplePolicy),
  );
  const ranked = rankQualifying(
    evaluated.flatMap((row) => (row.result === null ? [] : [{ row, result: row.result }])),
    'cost',
  ).map(({ row }) => row);
  const rank = new Map(ranked.map((row, index) => [row.config.key, index]));
  const rows = evaluated
    .toSorted(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        (rank.get(a.config.key) ?? 0) - (rank.get(b.config.key) ?? 0) ||
        (b.bestObserved?.result?.observed?.attainment ?? -1) -
          (a.bestObserved?.result?.observed?.attainment ?? -1) ||
        a.config.key.localeCompare(b.config.key),
    )
    .map(({ result: _result, ...row }) => row);
  const byKey = new Map(rows.map((row) => [row.config.key, row]));
  return { rows, qualifying: ranked.map((row) => byKey.get(row.config.key)!) };
}

/** Workloads present in a dataset, AgentX first, then fixed sequences. */
export function slaWorkloads(configs: readonly SlaTargetsConfig[]): string[] {
  return [...new Set(configs.map((config) => config.workload))].toSorted(
    (a, b) =>
      Number(a !== SLA_AGENTIC_WORKLOAD) - Number(b !== SLA_AGENTIC_WORKLOAD) || a.localeCompare(b),
  );
}

/** Ids of the points whose evaluations the page has to request. */
export function slaEvaluationIds(configs: readonly SlaTargetsConfig[]): number[] {
  return configs
    .flatMap((config) => config.points.filter((point) => point.hasRequestData))
    .map((point) => point.id)
    .toSorted((a, b) => a - b);
}
