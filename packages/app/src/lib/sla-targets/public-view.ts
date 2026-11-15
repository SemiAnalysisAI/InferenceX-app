import {
  SLA_ACCOUNTING_POLICY,
  SLA_EVALUATOR_VERSION,
  SLA_EXAMPLE_TARGETS,
  SLA_SAMPLE_POLICY,
  type SlaAccounting,
  type SlaAccountingPolicy,
  type SlaExclusionCategory,
  type SlaObserved,
  type SlaPointCounts,
  type SlaQualification,
  type SlaSamplePolicy,
  type SlaSelections,
  type SlaStatus,
  type SlaTargets,
} from '@semianalysisai/inferencex-constants';

import { ViewsApiParamError } from '@/lib/views-api/errors';
import { parseEnumParam } from '@/lib/views-api/params';

import type { SlaTargetsConfig, SlaTargetsDataset, SlaTargetsSnapshot } from './dataset';
import { SLA_MAX_TARGET_MS, type SlaPointEvaluation, type SlaPointEvaluations } from './evaluation';
import {
  attainmentFraction,
  attainmentPercent,
  SLA_ATTAINMENT_PERCENT_RANGE,
  type SlaCostTier,
} from './state';
import {
  evaluateSlaTargetsView,
  slaWorkloads,
  type SlaConfigView,
  type SlaPointView,
} from './view';

/** The sentence every SLA Targets surface carries, in the page's exact words. */
export const SLA_TARGETS_DISCLAIMER =
  'Evaluates benchmark results against your service targets. Results apply to the tested workload and conditions; they do not guarantee production SLA compliance.';

export const SLA_COST_TIERS = ['hyperscaler', 'rental'] as const satisfies readonly SlaCostTier[];

/** Resolved selectors of the public view, as the response echoes them. */
export interface SlaPublicParams {
  model: string;
  sequence: string;
  /** Maximum TTFT, ms, as entered. */
  ttft: number;
  /** Maximum TPOT, ms, as entered. */
  tpot: number;
  /** Maximum end-to-end latency, s, as entered; `null` when the constraint is off. */
  e2e: number | null;
  /** Required attainment, percent. */
  attainment: number;
  cost: SlaCostTier;
}

function latencyParam(search: URLSearchParams, param: string, max: number): number | null {
  const raw = search.get(param);
  if (raw === null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > max) {
    // Never rounded, clamped or replaced: an unusable target is an error.
    throw new ViewsApiParamError(
      param,
      `Invalid ${param}: ${raw} (a positive number, at most ${max})`,
    );
  }
  return value;
}

/**
 * Read the latency targets, the required attainment and the price tier. A
 * selector that is left out takes the page's example value; one that cannot
 * be used is rejected.
 */
export function parseSlaPublicTargets(search: URLSearchParams): {
  targets: SlaTargets;
  cost: SlaCostTier;
} {
  const rawE2e = search.get('e2e');
  const { min, max } = SLA_ATTAINMENT_PERCENT_RANGE;
  const rawAttainment = search.get('attainment');
  let requiredAttainment = SLA_EXAMPLE_TARGETS.requiredAttainment;
  if (rawAttainment !== null && rawAttainment !== '') {
    const percent = Number(rawAttainment);
    if (!Number.isFinite(percent) || percent < min || percent > max) {
      throw new ViewsApiParamError(
        'attainment',
        `Invalid attainment: ${rawAttainment} (a percentage from ${min} to ${max})`,
      );
    }
    requiredAttainment = attainmentFraction(percent);
  }
  return {
    targets: {
      maxTtftMs: latencyParam(search, 'ttft', SLA_MAX_TARGET_MS) ?? SLA_EXAMPLE_TARGETS.maxTtftMs,
      maxTpotMs: latencyParam(search, 'tpot', SLA_MAX_TARGET_MS) ?? SLA_EXAMPLE_TARGETS.maxTpotMs,
      maxE2eS: rawE2e === 'off' ? null : latencyParam(search, 'e2e', SLA_MAX_TARGET_MS / 1000),
      requiredAttainment,
    },
    cost: parseEnumParam(search.get('cost'), 'cost', SLA_COST_TIERS, 'hyperscaler'),
  };
}

/** The workload of a dataset a `sequence` value selects; the first one when left out. */
export function resolveSlaSequence(dataset: SlaTargetsDataset, value: string | null): string {
  const workloads = slaWorkloads(dataset.configs);
  if (!value) return workloads[0] ?? '';
  if (workloads.includes(value)) return value;
  throw new ViewsApiParamError('sequence', `Unknown sequence: ${value}`, workloads);
}

/** One tested load of a configuration. */
export interface SlaPublicPoint {
  /** The load setting; its meaning is the configuration's `loadKind`. */
  load: number;
  /** Benchmark point behind the measurement; `null` for a load without one. */
  pointId: number | null;
  runAttempt: number | null;
  artifact: string | null;
  /** Where the attempt data came from; `null` without request-level data. */
  source: SlaPointEvaluation['source'] | null;
  /** Attempt accounting under the policy at the top of the response. */
  accounting: Omit<SlaAccounting, 'policy'> | null;
  /** Attempts within each target, before any qualification. */
  counts: SlaPointCounts | null;
  /** Observed attainment, goodput and achieved request rate. */
  observed: SlaObserved | null;
  /** The verdict and its reason, separate from what was observed. */
  qualification: SlaQualification;
  /** GPU cost of the whole accounting window, $. */
  windowCostUsd: number | null;
  costPer1kCompliantUsd: number | null;
  /** Set for a tested load that produced no measurement. */
  exclusion: {
    category: SlaExclusionCategory;
    reason: string;
    jobUrl: string | null;
    observedFailures: Record<string, number> | null;
  } | null;
}

export interface SlaPublicConfig extends Omit<SlaTargetsConfig, 'points' | 'excluded'> {
  hardwareLabel: string;
  servingLabel: string;
  status: SlaStatus;
  exploratory: boolean;
  /** $ per GPU-hour behind the cost estimate; 0 when the hardware has no price. */
  gpuHourUsd: number;
  /** A tested load below the highest passing one did not meet the targets. */
  lowerLoadMissed: boolean;
  /** Index into `points` of the point behind each headline value; `null` when none qualifies. */
  selections: Record<keyof SlaSelections, number | null>;
  /** Index into `points` of the highest observed attainment; `null` without observations. */
  bestObserved: number | null;
  points: SlaPublicPoint[];
}

export interface SlaPublicView {
  view: 'sla-targets';
  apiVersion: 'v1';
  params: SlaPublicParams;
  disclaimer: string;
  contract: {
    evaluatorVersion: number;
    accountingPolicy: SlaAccountingPolicy;
    samplePolicy: SlaSamplePolicy;
  };
  /** Whether the data is the live database or a captured snapshot, with its runs. */
  source: SlaTargetsSnapshot;
  models: string[];
  sequences: string[];
  /** Keys of the configurations that meet the targets, cheapest first. */
  qualifying: string[];
  /** Qualifying configurations first, then misses, then those without a verdict. */
  configs: SlaPublicConfig[];
}

function publicPoint(view: SlaPointView): SlaPublicPoint {
  const { point, excluded, evaluation } = view;
  // The view API evaluates every point before it responds, so a result is always present.
  const result = view.result!;
  const { policy: _policy, ...accounting } = result.accounting ?? { policy: null };
  return {
    load: view.concurrency,
    pointId: point?.id ?? null,
    runAttempt: point?.runAttempt ?? excluded?.runAttempt ?? null,
    artifact: point?.artifact ?? excluded?.artifact ?? null,
    source: evaluation?.source ?? null,
    accounting: result.accounting === null ? null : (accounting as Omit<SlaAccounting, 'policy'>),
    counts: evaluation?.counts ?? null,
    observed: result.observed,
    qualification: result.qualification,
    windowCostUsd: result.windowCostUsd,
    costPer1kCompliantUsd: result.costPer1kCompliantUsd,
    exclusion: excluded
      ? {
          category: excluded.category,
          reason: excluded.reason,
          jobUrl: excluded.jobUrl,
          observedFailures: excluded.observedFailures,
        }
      : null,
  };
}

function publicConfig(row: SlaConfigView): SlaPublicConfig {
  const { points: _points, excluded: _excluded, ...config } = row.config;
  const index = (view: SlaPointView | null): number | null =>
    view === null ? null : row.points.indexOf(view);
  return {
    ...config,
    hardwareLabel: row.hardwareLabel,
    servingLabel: row.servingLabel,
    // Every point is evaluated before projection, so no row is still loading.
    status: row.status as SlaStatus,
    exploratory: row.exploratory,
    gpuHourUsd: row.gpuHourUsd,
    lowerLoadMissed: row.lowerLoadMissed,
    selections: {
      highestPassingLoad: index(row.selections.highestPassingLoad),
      highestGoodput: index(row.selections.highestGoodput),
      lowestCost: index(row.selections.lowestCost),
    },
    bestObserved: index(row.bestObserved),
    points: row.points.map(publicPoint),
  };
}

/**
 * The public read-only projection of the SLA Targets page. It runs the page's
 * own `evaluateSlaTargetsView` on the same inputs, so the two cannot disagree,
 * and only reshapes the result: selections become indexes, and the accounting
 * policy is stated once instead of on every point.
 *
 * `evaluations` must hold every point of the selected workload that has
 * request-level data.
 */
export function buildSlaPublicView(
  dataset: SlaTargetsDataset,
  sequence: string,
  evaluations: SlaPointEvaluations,
  targets: SlaTargets,
  cost: SlaCostTier,
): SlaPublicView {
  const configs = dataset.configs.filter((config) => config.workload === sequence);
  const view = evaluateSlaTargetsView(
    configs,
    dataset.model,
    evaluations,
    targets.requiredAttainment,
    cost,
  );
  return {
    view: 'sla-targets',
    apiVersion: 'v1',
    params: {
      model: dataset.model,
      sequence,
      ttft: targets.maxTtftMs,
      tpot: targets.maxTpotMs,
      e2e: targets.maxE2eS,
      attainment: attainmentPercent(targets.requiredAttainment),
      cost,
    },
    disclaimer: SLA_TARGETS_DISCLAIMER,
    contract: {
      evaluatorVersion: SLA_EVALUATOR_VERSION,
      accountingPolicy: SLA_ACCOUNTING_POLICY,
      samplePolicy: SLA_SAMPLE_POLICY,
    },
    source: dataset.snapshot,
    models: dataset.models,
    sequences: slaWorkloads(dataset.configs),
    qualifying: view.qualifying.map((row) => row.config.key),
    configs: view.rows.map(publicConfig),
  };
}
