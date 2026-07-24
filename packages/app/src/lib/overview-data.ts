import { resolveFrameworkPartLabel } from '@semianalysisai/inferencex-constants';

import type { BenchmarkRow } from './api';
import { buildAvailabilityHwKey } from './chart-utils';
import { getHardwareConfig, getModelSortIndex } from './constants';
import { DEFAULT_MODELS, getModelLabel, Precision, type Model } from './data-mappings';
import { overviewConfigIdentityKey } from './overview-config-identity';
import { computeTcoFeed, type TcoTierBoundary } from './tco-feed';

export const OVERVIEW_WORKLOAD = { isl: 8192, osl: 1024 } as const;
export const OVERVIEW_TIERS = [30, 50, 75, 100] as const;
export type OverviewTier = (typeof OVERVIEW_TIERS)[number];
export const OVERVIEW_PRIMARY_TIER = 50;
export const OVERVIEW_HIGH_TIER = 100;

export function resolveOverviewTier(raw: string | string[] | undefined): OverviewTier {
  const candidate = Number(Array.isArray(raw) ? raw[0] : raw);
  return OVERVIEW_TIERS.find((tier) => tier === candidate) ?? OVERVIEW_PRIMARY_TIER;
}

export interface OverviewTierValue {
  tier: number;
  value: number | null;
  boundary: TcoTierBoundary;
  /** Bracketing frontier points when interpolated, the single point twice when
   *  clamped; always from this config's own frontier, never a sibling's. */
  evidenceDate: { from: string; to: string } | null;
}

/** One deployable serving configuration (exact topology identity); tier values
 *  come from its own Pareto frontier only, never blended across configs. */
export interface OverviewConfigResult {
  key: string;
  dbModel: string;
  hardware: string;
  hwKey: string;
  framework: string;
  frameworkLabel: string;
  specMethod: string;
  specLabel: string;
  disagg: boolean;
  precision: string;
  sourceRunUrls: string[];
  tierValues: OverviewTierValue[];
  latestDate: string;
}

export interface OverviewTierRead {
  tier: number;
  value: number | null;
  boundary: TcoTierBoundary | null;
  evidenceDate: { from: string; to: string } | null;
  config: OverviewConfigResult | null;
}

/** Why a member shows `∞`. The subtle pair: `cannot_reach_at_tier` = every
 *  speculative stack tops out below the tier; `no_exact_at_tier` = merely
 *  under-swept. */
export type OverviewMissingReason =
  | 'standard_decode_only'
  | 'int4_bf16_only'
  | 'no_8k1k_data'
  | 'cannot_reach_at_tier'
  | 'no_exact_at_tier';

export const OVERVIEW_HEADLINE_PAIR_DEFINITIONS = [
  { id: 'mi355x-vs-b200', candidateHardware: 'mi355x', baselineHardware: 'b200' },
  { id: 'b300-vs-b200', candidateHardware: 'b300', baselineHardware: 'b200' },
  { id: 'gb200-vs-b200', candidateHardware: 'gb200', baselineHardware: 'b200' },
  { id: 'gb300-vs-b200', candidateHardware: 'gb300', baselineHardware: 'b200' },
] as const;

export type OverviewHeadlinePairId = (typeof OVERVIEW_HEADLINE_PAIR_DEFINITIONS)[number]['id'];

export interface OverviewHeadlinePairMember {
  hardware: string;
  hardwareLabel: string;
  precision: string | null;
  dbModel: string | null;
  read: OverviewTierRead;
  /** The 100 view's own re-selected read, so the leader line can never disagree with ?tier=100. */
  highRead: OverviewTierRead;
  missingReason: OverviewMissingReason | null;
}

export interface OverviewHeadlinePairComparison {
  id: OverviewHeadlinePairId;
  label: string;
  precision: string | null;
  dbModel: string | null;
  candidate: OverviewHeadlinePairMember;
  baseline: OverviewHeadlinePairMember;
  /** Non-null only for exact reads sharing precision AND dbModel — never FP4
   *  vs FP8 or cross-release. */
  directDeltaPercent: number | null;
  deltaUnavailableReason: 'precision_mismatch' | 'version_mismatch' | null;
  highLeaderTransition: 'same_hardware' | 'changed_hardware' | null;
}

export interface OverviewModelSummary {
  model: Model;
  modelLabel: string;
  headlinePairs: OverviewHeadlinePairComparison[];
}

export interface OverviewPageData {
  models: OverviewModelSummary[];
  datasetThroughDate: string | null;
  tier: OverviewTier;
}

/** In preference order — FP4 wins ties. */
const OVERVIEW_PRECISIONS: readonly string[] = [Precision.FP4, Precision.FP8];

function overviewWorkloadRows(rows: readonly BenchmarkRow[]): BenchmarkRow[] {
  return rows.filter(
    (row) =>
      row.benchmark_type === 'single_turn' &&
      row.isl === OVERVIEW_WORKLOAD.isl &&
      row.osl === OVERVIEW_WORKLOAD.osl,
  );
}

/** Deliberately from raw rows, not retained winners: an unranked precision or
 *  engine still dates the dataset it was measured in. */
export function overviewDatasetThroughDate(rows: readonly BenchmarkRow[]): string | null {
  return overviewWorkloadRows(rows).reduce<string | null>(
    (latest, row) => (latest === null || row.date > latest ? row.date : latest),
    null,
  );
}

/** Speculative-only configs for one precision, grouped by exact deployment identity. */
function buildPrecisionConfigs(
  model: Model,
  workloadRows: readonly BenchmarkRow[],
  precision: string,
): OverviewConfigResult[] {
  const rowsByConfig = new Map<string, BenchmarkRow[]>();
  for (const row of workloadRows) {
    if (row.precision !== precision || row.spec_method === 'none') continue;
    const key = overviewConfigIdentityKey(row);
    const configRows = rowsByConfig.get(key);
    if (configRows) configRows.push(row);
    else rowsByConfig.set(key, [row]);
  }

  const configs: OverviewConfigResult[] = [];
  for (const [key, configRows] of rowsByConfig) {
    const config = buildConfigResult(model, precision, key, configRows);
    if (config) configs.push(config);
  }
  return configs;
}

function readConfigAtTier(config: OverviewConfigResult, tier: number): OverviewTierRead {
  const tierValue = config.tierValues.find((value) => value.tier === tier);
  return {
    tier,
    value: tierValue?.value ?? null,
    boundary: tierValue?.boundary ?? null,
    evidenceDate: tierValue?.evidenceDate ?? null,
    config,
  };
}

interface ConfigTierRead extends OverviewTierRead {
  config: OverviewConfigResult;
}

/** In-range reads only: a clamped/unreachable read is a coverage gap and never
 *  leads a tier or anchors a delta. */
const isExactTierRead = <T extends OverviewTierRead>(read: T): read is T & { value: number } =>
  read.value !== null && read.boundary === 'interpolated';

function compareTierReads(a: ConfigTierRead, b: ConfigTierRead): number {
  return (
    (b.value ?? -1) - (a.value ?? -1) ||
    getModelSortIndex(a.config.hardware) - getModelSortIndex(b.config.hardware) ||
    a.config.key.localeCompare(b.config.key)
  );
}

/** Best exact read per hardware; a hardware with no exact read keeps its best
 *  out-of-range read so it surfaces as a gap instead of disappearing. */
function readsByHardwareAtTier(
  configs: readonly OverviewConfigResult[],
  tier: number,
): Map<string, ConfigTierRead> {
  const reads = configs
    .map((config): ConfigTierRead => ({ ...readConfigAtTier(config, tier), config }))
    .toSorted(compareTierReads);

  const byHardware = new Map<string, ConfigTierRead>();
  for (const read of reads.filter(isExactTierRead)) {
    if (!byHardware.has(read.config.hardware)) byHardware.set(read.config.hardware, read);
  }
  for (const read of reads) {
    if (!byHardware.has(read.config.hardware)) byHardware.set(read.config.hardware, read);
  }
  return byHardware;
}

function nullTierRead(tier: number): OverviewTierRead {
  return { tier, value: null, boundary: null, evidenceDate: null, config: null };
}

function nonComparableAsMissing(
  read: OverviewTierRead | undefined,
  tier: number,
): OverviewTierRead {
  if (read === undefined) return nullTierRead(tier);
  return isExactTierRead(read) ? read : { ...read, value: null, evidenceDate: null };
}

interface OverviewHeadlinePairBucket {
  precision: string;
  dbModel: string;
  configs: OverviewConfigResult[];
  tierReads: Map<string, ConfigTierRead>;
  newestEvidence: string;
}

function buildHeadlinePairBuckets(
  configsByPrecision: ReadonlyMap<string, readonly OverviewConfigResult[]>,
  hardware: ReadonlySet<string>,
  tier: OverviewTier,
): OverviewHeadlinePairBucket[] {
  const buckets: OverviewHeadlinePairBucket[] = [];
  for (const precision of OVERVIEW_PRECISIONS) {
    const byDbModel = new Map<string, OverviewConfigResult[]>();
    for (const config of configsByPrecision.get(precision) ?? []) {
      if (!hardware.has(config.hardware)) continue;
      const configs = byDbModel.get(config.dbModel);
      if (configs) configs.push(config);
      else byDbModel.set(config.dbModel, [config]);
    }

    for (const [dbModel, configs] of byDbModel) {
      const tierReads = readsByHardwareAtTier(configs, tier);
      const exactReads = [...tierReads.values()].filter(isExactTierRead);
      buckets.push({
        precision,
        dbModel,
        configs,
        tierReads,
        newestEvidence: exactReads.reduce(
          (latest, read) =>
            read.evidenceDate !== null && read.evidenceDate.to > latest
              ? read.evidenceDate.to
              : latest,
          configs.reduce(
            (latest, config) => (config.latestDate > latest ? config.latestDate : latest),
            '',
          ),
        ),
      });
    }
  }
  return buckets;
}

function missingReasonForHeadlineMember(
  workloadRows: readonly BenchmarkRow[],
  hardware: string,
  read: OverviewTierRead,
  bucketReads: readonly OverviewTierRead[],
): OverviewMissingReason | null {
  if (isExactTierRead(read)) return null;
  const hardwareRows = workloadRows.filter((row) => row.hardware === hardware);
  if (hardwareRows.length === 0) return 'no_8k1k_data';
  const supportedRows = hardwareRows.filter((row) => OVERVIEW_PRECISIONS.includes(row.precision));
  if (supportedRows.length === 0) return 'int4_bf16_only';
  if (!supportedRows.some((row) => row.spec_method !== 'none')) return 'standard_decode_only';
  // `cannot reach` is a claim about the whole platform, so it holds only when
  // EVERY qualified speculative stack tops out below the tier — one merely
  // under-swept stack downgrades the gap to a missing exact read.
  return bucketReads.length > 0 && bucketReads.every((r) => r.boundary === 'unreachable')
    ? 'cannot_reach_at_tier'
    : 'no_exact_at_tier';
}

function headlineLeaderTransition(
  candidatePrimary: OverviewTierRead,
  baselinePrimary: OverviewTierRead,
  candidateHigh: OverviewTierRead,
  baselineHigh: OverviewTierRead,
): OverviewHeadlinePairComparison['highLeaderTransition'] {
  // A cross-precision or cross-release @100 pair carries no leader claim,
  // mirroring the delta rule.
  if (
    !isExactTierRead(candidatePrimary) ||
    !isExactTierRead(baselinePrimary) ||
    !isExactTierRead(candidateHigh) ||
    !isExactTierRead(baselineHigh) ||
    candidateHigh.config === null ||
    baselineHigh.config === null ||
    candidateHigh.config.precision !== baselineHigh.config.precision ||
    candidateHigh.config.dbModel !== baselineHigh.config.dbModel ||
    candidatePrimary.value === baselinePrimary.value ||
    candidateHigh.value === baselineHigh.value
  ) {
    return null;
  }
  const primaryLeaderIsCandidate = candidatePrimary.value > baselinePrimary.value;
  const highLeaderIsCandidate = candidateHigh.value > baselineHigh.value;
  return primaryLeaderIsCandidate === highLeaderIsCandidate ? 'same_hardware' : 'changed_hardware';
}

function buildHeadlinePairs(
  model: Model,
  workloadRows: readonly BenchmarkRow[],
  tier: OverviewTier,
): OverviewHeadlinePairComparison[] {
  const configsByPrecision = new Map(
    OVERVIEW_PRECISIONS.map(
      (precision) => [precision, buildPrecisionConfigs(model, workloadRows, precision)] as const,
    ),
  );
  // Per-platform best bucket (dbModel × precision): exact first, then value,
  // tie → FP4, newest evidence, lexical dbModel — one bucket per member so
  // point releases never blend within a read.
  const selectRead = (memberHardware: string, atTier: OverviewTier) => {
    const candidates = buildHeadlinePairBuckets(
      configsByPrecision,
      new Set([memberHardware]),
      atTier,
    ).map((memberBucket) => ({
      bucket: memberBucket,
      read: nonComparableAsMissing(memberBucket.tierReads.get(memberHardware), atTier),
    }));
    const best = candidates.toSorted(
      (a, b) =>
        Number(isExactTierRead(b.read)) - Number(isExactTierRead(a.read)) ||
        (b.read.value ?? -1) - (a.read.value ?? -1) ||
        OVERVIEW_PRECISIONS.indexOf(a.bucket.precision) -
          OVERVIEW_PRECISIONS.indexOf(b.bucket.precision) ||
        b.bucket.newestEvidence.localeCompare(a.bucket.newestEvidence) ||
        a.bucket.dbModel.localeCompare(b.bucket.dbModel),
    )[0];
    return {
      reads: candidates.map(({ read }) => read),
      bucket: best?.bucket ?? null,
      read: best?.read ?? nullTierRead(atTier),
    };
  };

  const buildMember = (memberHardware: string): OverviewHeadlinePairMember => {
    const primary = selectRead(memberHardware, tier);
    const high =
      tier === OVERVIEW_HIGH_TIER ? primary : selectRead(memberHardware, OVERVIEW_HIGH_TIER);
    return {
      hardware: memberHardware,
      hardwareLabel: getHardwareConfig(memberHardware, model).label,
      precision: primary.bucket?.precision ?? null,
      dbModel: primary.bucket?.dbModel ?? null,
      read: primary.read,
      highRead: high.read,
      missingReason: missingReasonForHeadlineMember(
        workloadRows,
        memberHardware,
        primary.read,
        primary.reads,
      ),
    };
  };

  return OVERVIEW_HEADLINE_PAIR_DEFINITIONS.map((definition) => {
    const candidate = buildMember(definition.candidateHardware);
    const baseline = buildMember(definition.baselineHardware);
    const bothExact = isExactTierRead(candidate.read) && isExactTierRead(baseline.read);
    const comparable =
      bothExact &&
      candidate.precision === baseline.precision &&
      candidate.dbModel === baseline.dbModel;
    return {
      id: definition.id,
      label: `${candidate.hardwareLabel} vs ${baseline.hardwareLabel}`,
      precision: comparable ? candidate.precision : null,
      dbModel: comparable ? candidate.dbModel : null,
      candidate,
      baseline,
      directDeltaPercent:
        comparable &&
        candidate.read.value !== null &&
        baseline.read.value !== null &&
        baseline.read.value > 0
          ? (candidate.read.value / baseline.read.value - 1) * 100
          : null,
      deltaUnavailableReason: bothExact
        ? candidate.precision === baseline.precision
          ? candidate.dbModel === baseline.dbModel
            ? null
            : 'version_mismatch'
          : 'precision_mismatch'
        : null,
      highLeaderTransition:
        comparable && tier !== OVERVIEW_HIGH_TIER
          ? headlineLeaderTransition(
              candidate.read,
              baseline.read,
              candidate.highRead,
              baseline.highRead,
            )
          : null,
    };
  });
}

function buildConfigResult(
  model: Model,
  precision: string,
  key: string,
  rows: BenchmarkRow[],
): OverviewConfigResult | null {
  const feed = computeTcoFeed(rows, [OVERVIEW_WORKLOAD], OVERVIEW_TIERS);
  if (feed.length === 0) return null;

  const first = rows[0];
  const { hardware, framework, spec_method: specMethod, disagg } = first;
  const sourceRunUrls = [
    ...new Set(rows.flatMap((row) => (row.run_url === null ? [] : [row.run_url]))),
  ].toSorted();
  return {
    key,
    dbModel: first.model,
    hardware,
    hwKey: buildAvailabilityHwKey(hardware, framework, specMethod, disagg),
    framework,
    frameworkLabel: resolveFrameworkPartLabel(model, framework),
    specMethod,
    specLabel: resolveFrameworkPartLabel(model, specMethod),
    disagg,
    precision,
    sourceRunUrls,
    tierValues: feed.map((row) => {
      const value =
        row.boundary === 'unreachable' && row.output_tput_per_gpu === 0
          ? null
          : row.output_tput_per_gpu;
      return {
        tier: row.tier,
        value,
        boundary: row.boundary,
        evidenceDate: value === null ? null : row.evidence_date,
      };
    }),
    latestDate: feed[0].latest_date,
  };
}

export function buildOverviewModelSummary(
  model: Model,
  rows: BenchmarkRow[],
  tier: OverviewTier = OVERVIEW_PRIMARY_TIER,
): OverviewModelSummary {
  return {
    model,
    modelLabel: getModelLabel(model),
    headlinePairs: buildHeadlinePairs(model, overviewWorkloadRows(rows), tier),
  };
}

/** DEFAULT_MODELS fixes the row order; a rowless model still renders four
 *  pairs with missing reasons. Live and fixture paths both feed this. */
export function assembleOverviewPageData(
  rowsByModel: Record<string, BenchmarkRow[]>,
  tier: OverviewTier = OVERVIEW_PRIMARY_TIER,
): OverviewPageData {
  const perModel = [...DEFAULT_MODELS].map((model) => ({ model, rows: rowsByModel[model] ?? [] }));
  return {
    models: perModel.map(({ model, rows }) => buildOverviewModelSummary(model, rows, tier)),
    datasetThroughDate: overviewDatasetThroughDate(perModel.flatMap(({ rows }) => rows)),
    tier,
  };
}
