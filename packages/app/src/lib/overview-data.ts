import { resolveFrameworkPartLabel } from '@semianalysisai/inferencex-constants';

import { parallelismLabel } from '@/components/inference/utils/parallelism-label';

import type { BenchmarkRow } from './api';
import { buildAvailabilityHwKey } from './chart-utils';
import { getHardwareConfig, getModelSortIndex } from './constants';
import {
  DEFAULT_MODELS,
  getModelExclusion,
  getModelLabel,
  Precision,
  type Model,
} from './data-mappings';
import { buildExclusion, type Exclusion } from './exclusion';
import { overviewConfigIdentityKey } from './overview-config-identity';
import { computeTcoFeed, type TcoTierBoundary } from './tco-feed';

export const OVERVIEW_WORKLOAD = { isl: 8192, osl: 1024 } as const;
export const OVERVIEW_TIERS = [30, 50, 75, 100] as const;
/** Headline service point every platform is ranked at. */
export const OVERVIEW_PRIMARY_TIER = 50;
/** High-interactivity capability read; also drives the high-tier leader transition. */
export const OVERVIEW_HIGH_TIER = 100;

export interface OverviewTierValue {
  tier: number;
  value: number | null;
  boundary: TcoTierBoundary;
  /**
   * Run dates of the frontier point(s) backing this value — the two bracketing
   * points when interpolated (from = earlier, to = later; equal on the same
   * day), the single point twice when clamped, null when `value` is null. Comes
   * only from this config's own frontier at this tier, never a sibling or cohort.
   */
  evidenceDate: { from: string; to: string } | null;
}

/**
 * One real deployable serving configuration, identified by its exact
 * deployment topology (model × hardware × framework × precision × spec_method ×
 * disagg × multinode × per-role parallelism × GPU counts × offload). Tier
 * values come from this configuration's own Pareto frontier only — never
 * blended across configurations.
 */
export interface OverviewConfigResult {
  key: string;
  dbModel: string;
  hardware: string;
  hardwareLabel: string;
  hwKey: string;
  framework: string;
  frameworkLabel: string;
  specMethod: string;
  specLabel: string;
  disagg: boolean;
  precision: string;
  offloadMode: string;
  isMultinode: boolean;
  numPrefillGpu: number;
  numDecodeGpu: number;
  /** Physical GPUs backing this config: one shared pool when aggregated, prefill
   * plus decode when disaggregated. */
  totalGpu: number;
  parallelism: string;
  image: string | null;
  sourceRunUrls: string[];
  tierValues: OverviewTierValue[];
  latestDate: string;
  oldestFrontierDate: string;
}

/** One hardware's frontier read at a single tier, with its backing config. */
export interface OverviewTierRead {
  tier: number;
  value: number | null;
  boundary: TcoTierBoundary | null;
  /** Copied from the backing config's tier value; null when there is no read. */
  evidenceDate: { from: string; to: string } | null;
  config: OverviewConfigResult | null;
}

/**
 * Why a hardware is or is not competing in the model's ranking. Coverage is
 * derived from the raw workload rows alone, so a hardware never disappears just
 * because a filter or a ranking excluded it:
 *
 *  - `comparable_spec` — speculative results at the selected precision, ranked;
 *  - `standard_only` — selected precision measured, but standard decode only;
 *  - `alternate_precision_only` — measured at the other FP4/FP8 precision;
 *  - `other_engine_group_only` — speculative, but only in an engine
 *    comparability group no other hardware here shares;
 *  - `unsupported_precision_only` — measured only outside FP4/FP8;
 *  - `no_workload_data` — no 8K/1K single-turn row for this model.
 */
export type OverviewCoverageKind =
  | 'comparable_spec'
  | 'standard_only'
  | 'alternate_precision_only'
  | 'other_engine_group_only'
  | 'unsupported_precision_only'
  | 'no_workload_data';

export interface OverviewHardwareCoverage {
  hardware: string;
  hardwareLabel: string;
  kind: OverviewCoverageKind;
  availablePrecisions: string[];
}

/** One hardware in the page-wide display order, which never encodes performance. */
export interface OverviewHardwareOrderEntry {
  hardware: string;
  hardwareLabel: string;
}

export interface OverviewHardwareStatus {
  hardware: string;
  hardwareLabel: string;
  coverage: OverviewHardwareCoverage;
  /**
   * Primary-tier read of this hardware's best configuration in the surrounding
   * config set — the same read the ranking used, so a row can never display a
   * number the ranking did not. Null read when the hardware has no ranked
   * configuration; `coverage.kind` says why.
   */
  primary: OverviewTierRead;
  /** High-tier read, taken from this hardware's own best config at that tier. */
  high: OverviewTierRead;
  isPrimaryLeader: boolean;
  /** Signed percentage against the primary leader; null for the leader itself
   * and whenever either side is not an exact in-range read. */
  primaryDeltaPercent: number | null;
}

/** Whether a cohort's throughput denominator is aggregated or disaggregated. */
export type OverviewDeploymentMode = 'aggregated' | 'disaggregated';

/**
 * Ranking state at one tier: `comparable` (≥2 exact hardware reads, gap
 * computable), `single_measured` (one exact read), or `insufficient_coverage`
 * (no exact read — every read is clamped or unreachable).
 */
export type OverviewRankingState = 'comparable' | 'single_measured' | 'insufficient_coverage';

export interface OverviewTierRanking {
  tier: number;
  state: OverviewRankingState;
  leader: OverviewConfigResult | null;
  runnerUp: OverviewConfigResult | null;
  gapPercent: number | null;
}

/**
 * One comparable cohort: exact configs that share an engine comparability group
 * (per the model's exclusion policy) and a deployment mode. Tiers are ranked
 * independently inside a cohort; configs never compare across cohorts.
 */
export interface OverviewComparisonGroup {
  id: string;
  dbModel: string;
  engineGroup: string | null;
  deploymentMode: OverviewDeploymentMode;
  hardwareStatuses: OverviewHardwareStatus[];
  primaryRanking: OverviewTierRanking;
  highRanking: OverviewTierRanking;
  /**
   * How the high-tier leader relates to the primary-tier leader: a new hardware
   * took the lead (`changed_hardware`), the same hardware held it
   * (`same_hardware`), there was no primary leader to compare against
   * (`no_primary_baseline`), or the high tier has no leader at all (`null`).
   */
  highLeaderTransition: 'same_hardware' | 'changed_hardware' | 'no_primary_baseline' | null;
}

export interface OverviewSecondaryPrecision {
  precision: string;
  /** 'ranked' → full rows render; 'coverage' → one compact line renders. */
  state: 'ranked' | 'coverage';
  /** Populated when state === 'ranked'; [] otherwise. Built by the SAME pipeline as the primary (cohorts, rankings, transitions) over the secondary precision's rows. */
  comparisonGroups: OverviewComparisonGroup[];
  hardwareStatuses: OverviewHardwareStatus[];
  /** Hardware labels measured at this precision (any decode mode), page order. Always populated. */
  measuredHardware: string[];
}

/**
 * Why a page hardware carries no visible value for a model. Derived from the
 * existing coverage kinds and ranking outcomes, never a parallel truth:
 *
 *  - `standard_decode_only` — from `standard_only`;
 *  - `other_precision_only` — from `alternate_precision_only` and unranked by
 *    the secondary block; the renderer prints 'FP8 only'/'FP4 only';
 *  - `int4_bf16_only` — from `unsupported_precision_only`;
 *  - `different_serving_cohort` — from `other_engine_group_only`;
 *  - `no_8k1k_data` — from `no_workload_data`;
 *  - `cannot_reach_at50` — comparable spec whose frontier tops out below 50;
 *  - `no_exact_at50` — comparable spec with no exact @50 read for any other reason.
 */
export type OverviewNotRankedReason =
  | 'standard_decode_only'
  | 'other_precision_only'
  | 'int4_bf16_only'
  | 'different_serving_cohort'
  | 'no_8k1k_data'
  | 'cannot_reach_at50'
  | 'no_exact_at50';

export interface OverviewNotRankedEntry {
  hardware: string;
  hardwareLabel: string;
  reason: OverviewNotRankedReason;
  /** FP4/FP8 precisions this hardware measured, for the 'FP8 only' style copy. */
  precisions: string[];
}

export interface OverviewModelSummary {
  model: Model;
  modelLabel: string;
  /**
   * Primary precision: whichever of FP4/FP8 covers more unique hardware with an
   * exact @50 speculative read; a tie (including 0-0 when FP4/FP8 rows exist)
   * goes to FP4. Null only when the model has no FP4/FP8 workload rows at all.
   */
  selectedPrecision: string | null;
  /**
   * Every page hardware's coverage and tier reads for this model, in the
   * page-wide order. Leadership is claimed here only when a single cohort
   * exists; with several cohorts the claim belongs to `comparisonGroups`.
   */
  hardwareStatuses: OverviewHardwareStatus[];
  /** Comparable cohorts, each ranked independently at the primary and high tiers. */
  comparisonGroups: OverviewComparisonGroup[];
  /** The other of FP4/FP8, or null when it has no workload rows. Ranks only
   * within itself — never against the primary precision. */
  secondary: OverviewSecondaryPrecision | null;
  /**
   * One entry per page hardware with no visible value — neither an exact @50
   * read in the primary block nor a ranked read in a `ranked` secondary. Every
   * page hardware is therefore accounted for per model: an exact value, or one
   * not-ranked reason.
   */
  notRanked: OverviewNotRankedEntry[];
  /**
   * Newest workload row measured for this model. Now that every visible result
   * carries its own `evidenceDate`, this exists ONLY to date a coverage-only
   * model with zero visible results. Null when the model has no workload row.
   */
  latestWorkloadDate: string | null;
  emptyReason: 'no_8k1k_single_turn_data' | 'no_fp4_fp8_data' | null;
}

export interface OverviewPageData {
  models: OverviewModelSummary[];
  hardwareOrder: { hardware: string; hardwareLabel: string }[];
  datasetThroughDate: string | null;
}

/** Precisions the overview may rank, in preference order. */
const OVERVIEW_PRECISIONS: readonly string[] = [Precision.FP4, Precision.FP8];

/** Rows measuring the fixed overview workload, before any other filter. */
function overviewWorkloadRows(rows: readonly BenchmarkRow[]): BenchmarkRow[] {
  return rows.filter(
    (row) =>
      row.benchmark_type === 'single_turn' &&
      row.isl === OVERVIEW_WORKLOAD.isl &&
      row.osl === OVERVIEW_WORKLOAD.osl,
  );
}

/**
 * Page-wide hardware display order: every base hardware with FP4/FP8 coverage
 * at the overview workload, in hardware-registry order. Built before precision
 * selection and before any ranking, so neither a precision fallback nor a
 * measurement change can reorder or drop a column.
 */
export function buildOverviewHardwareOrder(
  rows: readonly BenchmarkRow[],
): OverviewHardwareOrderEntry[] {
  const hardware = new Set(
    overviewWorkloadRows(rows)
      .filter((row) => OVERVIEW_PRECISIONS.includes(row.precision))
      .map((row) => row.hardware),
  );
  return [...hardware]
    .toSorted((a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b))
    .map((entry) => ({ hardware: entry, hardwareLabel: getHardwareConfig(entry).label }));
}

/**
 * Newest raw workload row across the page. Deliberately not derived from the
 * retained winners: a precision or engine the page never ranks still dates the
 * dataset it was measured in.
 */
export function overviewDatasetThroughDate(rows: readonly BenchmarkRow[]): string | null {
  return overviewWorkloadRows(rows).reduce<string | null>(
    (latest, row) => (latest === null || row.date > latest ? row.date : latest),
    null,
  );
}

/** Newest date among a model's own workload rows; null when it has none. */
function latestWorkloadDateOf(workloadRows: readonly BenchmarkRow[]): string | null {
  return workloadRows.reduce<string | null>(
    (latest, row) => (latest === null || row.date > latest ? row.date : latest),
    null,
  );
}

/**
 * Speculative configs for one precision, grouped by exact deployment identity.
 * Standard-decode rows never enter the pool, so a precision is ranked on its
 * speculative frontier alone.
 */
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

/** Unique hardware whose best @50 read is exact (in-range) among `configs`. */
function exactPrimaryHardware(configs: readonly OverviewConfigResult[]): Set<string> {
  return new Set(
    [...readsByHardwareAtTier(configs, OVERVIEW_PRIMARY_TIER).values()]
      .filter(isExactTierRead)
      .map((read) => read.config.hardware),
  );
}

/** Whichever precision covers more exact-@50 hardware; a tie (incl. 0-0) → FP4. */
function selectPrimaryFrom(
  configsByPrecision: ReadonlyMap<string, readonly OverviewConfigResult[]>,
): string {
  const exactCount = (precision: string) =>
    exactPrimaryHardware(configsByPrecision.get(precision) ?? []).size;
  return exactCount(Precision.FP8) > exactCount(Precision.FP4) ? Precision.FP8 : Precision.FP4;
}

/**
 * Primary precision by exact-@50 hardware coverage: FP4 and FP8 are built and
 * counted independently, the wider coverage wins, and a tie (including 0-0 when
 * FP4/FP8 rows exist) goes to FP4. Null only when no FP4/FP8 workload row exists
 * — coverage volume of one vendor's curves can shift which precision is primary,
 * but never which precisions are ranked.
 */
export function selectOverviewPrecision(
  model: Model,
  workloadRows: readonly BenchmarkRow[],
): string | null {
  if (!workloadRows.some((row) => OVERVIEW_PRECISIONS.includes(row.precision))) return null;
  const configsByPrecision = new Map(
    OVERVIEW_PRECISIONS.map(
      (precision) => [precision, buildPrecisionConfigs(model, workloadRows, precision)] as const,
    ),
  );
  return selectPrimaryFrom(configsByPrecision);
}

function tierValueAt(config: OverviewConfigResult, tier: number): number | null {
  return config.tierValues.find((value) => value.tier === tier)?.value ?? null;
}

export function overviewPrimaryValue(config: OverviewConfigResult): number | null {
  return tierValueAt(config, OVERVIEW_PRIMARY_TIER);
}

export function overviewHighValue(config: OverviewConfigResult): number | null {
  return tierValueAt(config, OVERVIEW_HIGH_TIER);
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

/** A tier read known to be backed by a configuration. */
interface ConfigTierRead extends OverviewTierRead {
  config: OverviewConfigResult;
}

/**
 * A tier read counts only when it lands inside the configuration's own measured
 * frontier. A clamped or unreachable read is a coverage gap, so it can never
 * lead a tier or anchor a percentage gap.
 */
const isExactTierRead = <T extends OverviewTierRead>(read: T): read is T & { value: number } =>
  read.value !== null && read.boundary === 'interpolated';

function compareTierReads(a: ConfigTierRead, b: ConfigTierRead): number {
  return (
    (b.value ?? -1) - (a.value ?? -1) ||
    getModelSortIndex(a.config.hardware) - getModelSortIndex(b.config.hardware) ||
    a.config.key.localeCompare(b.config.key)
  );
}

/**
 * One read per hardware at `tier`: its best exact in-range read, or — only when
 * the hardware has no exact read at all — its best out-of-range read, kept so
 * the hardware still surfaces as a coverage gap. Ranking and hardware rows both
 * consume this, so a row can never display a number the ranking did not use.
 */
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

/**
 * Classify one hardware's coverage from its raw workload rows. `comparable`
 * lists the hardware sharing an engine comparability group with at least one
 * other hardware; a platform whose only speculative results sit in an engine
 * family nobody else here uses is reported as coverage rather than a competitor.
 */
function coverageKindFor(
  hardwareRows: readonly BenchmarkRow[],
  selectedPrecision: string | null,
  hardware: string,
  comparable: ReadonlySet<string>,
): OverviewCoverageKind {
  if (hardwareRows.length === 0) return 'no_workload_data';
  const candidates = hardwareRows.filter((row) => OVERVIEW_PRECISIONS.includes(row.precision));
  if (candidates.length === 0) return 'unsupported_precision_only';
  const selected = candidates.filter((row) => row.precision === selectedPrecision);
  if (selected.length === 0) return 'alternate_precision_only';
  if (!selected.some((row) => row.spec_method !== 'none')) return 'standard_only';
  return comparable.size === 0 || comparable.has(hardware)
    ? 'comparable_spec'
    : 'other_engine_group_only';
}

/**
 * One status row per entry of `coverage`, which already carries the stable
 * hardware order. `configs` scopes the tier reads and the leader: the whole
 * model's ranked set at model level, one cohort's set inside a comparison group.
 */
function buildHardwareStatuses(
  coverage: readonly OverviewHardwareCoverage[],
  configs: readonly OverviewConfigResult[],
  withLeader: boolean,
): OverviewHardwareStatus[] {
  const primaryReads = readsByHardwareAtTier(configs, OVERVIEW_PRIMARY_TIER);
  const highReads = readsByHardwareAtTier(configs, OVERVIEW_HIGH_TIER);
  const leader = withLeader
    ? [...primaryReads.values()].filter(isExactTierRead).toSorted(compareTierReads)[0]
    : undefined;

  return coverage.map((hardwareCoverage) => {
    const { hardware, hardwareLabel } = hardwareCoverage;
    const primary = primaryReads.get(hardware) ?? nullTierRead(OVERVIEW_PRIMARY_TIER);
    const isPrimaryLeader = leader !== undefined && primary.config?.key === leader.config.key;
    return {
      hardware,
      hardwareLabel,
      coverage: hardwareCoverage,
      primary,
      high: highReads.get(hardware) ?? nullTierRead(OVERVIEW_HIGH_TIER),
      isPrimaryLeader,
      primaryDeltaPercent:
        leader !== undefined && !isPrimaryLeader && isExactTierRead(primary) && leader.value > 0
          ? (primary.value / leader.value - 1) * 100
          : null,
    };
  });
}

/**
 * Rank one comparable cohort at a single tier. Every configuration is read at
 * `tier`, each hardware contributes only its best exact read, and the surviving
 * hardware are ordered by that read — so each tier is ranked on its own
 * evidence and a 50 winner is never carried into the 100 ranking.
 */
function rankAtTier(configs: readonly OverviewConfigResult[], tier: number): OverviewTierRanking {
  const hardwareLeaders = [...readsByHardwareAtTier(configs, tier).values()]
    .filter(isExactTierRead)
    .toSorted(compareTierReads);

  const [leader, runnerUp] = hardwareLeaders;
  return {
    tier,
    state:
      hardwareLeaders.length >= 2
        ? 'comparable'
        : hardwareLeaders.length === 1
          ? 'single_measured'
          : 'insufficient_coverage',
    leader: leader?.config ?? null,
    runnerUp: runnerUp?.config ?? null,
    gapPercent:
      leader && runnerUp && runnerUp.value > 0 ? (leader.value / runnerUp.value - 1) * 100 : null,
  };
}

interface OverviewCohort {
  dbModel: string;
  engineGroup: string | null;
  deploymentMode: OverviewDeploymentMode;
  configs: OverviewConfigResult[];
}

/**
 * How a cohort's high-tier leader relates to its primary-tier leader. Compared
 * on hardware, not config identity: a same-hardware engine or precision swap
 * between tiers is not a hardware change, and a high tier with no primary
 * baseline to compare against says so rather than implying a change.
 */
function computeHighLeaderTransition(
  primaryRanking: OverviewTierRanking,
  highRanking: OverviewTierRanking,
): OverviewComparisonGroup['highLeaderTransition'] {
  if (highRanking.leader === null) return null;
  if (primaryRanking.leader === null) return 'no_primary_baseline';
  return highRanking.leader.hardware === primaryRanking.leader.hardware
    ? 'same_hardware'
    : 'changed_hardware';
}

function buildComparisonGroup(
  id: string,
  cohort: OverviewCohort,
  coverage: readonly OverviewHardwareCoverage[],
): OverviewComparisonGroup {
  const cohortHardware = new Set(cohort.configs.map(({ hardware }) => hardware));
  const primaryRanking = rankAtTier(cohort.configs, OVERVIEW_PRIMARY_TIER);
  const highRanking = rankAtTier(cohort.configs, OVERVIEW_HIGH_TIER);
  return {
    id,
    dbModel: cohort.dbModel,
    engineGroup: cohort.engineGroup,
    deploymentMode: cohort.deploymentMode,
    hardwareStatuses: buildHardwareStatuses(
      coverage.filter(({ hardware }) => cohortHardware.has(hardware)),
      cohort.configs,
      true,
    ),
    primaryRanking,
    highRanking,
    highLeaderTransition: computeHighLeaderTransition(primaryRanking, highRanking),
  };
}

/**
 * Partition configurations into cohorts that may actually be compared: only
 * configs sharing a db model (one display model spans several point releases,
 * which must never rank against each other), an engine comparability group (the
 * model's exclusion policy — DeepSeek MTP acceptance forcing differs per engine
 * family) and a throughput denominator (aggregated vs disaggregated) are ranked
 * against each other.
 */
function buildCohorts(
  exclusion: Exclusion,
  configs: readonly OverviewConfigResult[],
): Map<string, OverviewCohort> {
  const cohorts = new Map<string, OverviewCohort>();
  for (const config of configs) {
    const engineGroup = exclusion.groupOf(config.hwKey);
    const deploymentMode: OverviewDeploymentMode = config.disagg ? 'disaggregated' : 'aggregated';
    const id = `${config.dbModel}|${engineGroup ?? 'any'}|${deploymentMode}`;
    const cohort = cohorts.get(id);
    if (cohort) cohort.configs.push(config);
    else
      cohorts.set(id, { dbModel: config.dbModel, engineGroup, deploymentMode, configs: [config] });
  }
  return cohorts;
}

/**
 * Hardware sharing an engine comparability group with at least one other
 * platform. Partitioned by engine group alone, never by the ranking cohorts:
 * cohorts also split on deployment mode, so a platform measured only
 * disaggregated would look isolated while running the very engine family its
 * peers run — and `other_engine_group_only` would then assert a reason that is
 * false.
 */
function comparableHardware(
  exclusion: Exclusion,
  configs: readonly OverviewConfigResult[],
): Set<string> {
  const byEngineGroup = new Map<string | null, Set<string>>();
  for (const config of configs) {
    const group = exclusion.groupOf(config.hwKey);
    const groupHardware = byEngineGroup.get(group);
    if (groupHardware) groupHardware.add(config.hardware);
    else byEngineGroup.set(group, new Set([config.hardware]));
  }
  return new Set(
    [...byEngineGroup.values()]
      .filter((groupHardware) => groupHardware.size > 1)
      .flatMap((groupHardware) => [...groupHardware]),
  );
}

function buildComparisonGroups(
  cohorts: ReadonlyMap<string, OverviewCohort>,
  coverage: readonly OverviewHardwareCoverage[],
): OverviewComparisonGroup[] {
  const leadValue = (group: OverviewComparisonGroup): number =>
    group.primaryRanking.leader ? (overviewPrimaryValue(group.primaryRanking.leader) ?? -1) : -1;
  return [...cohorts.entries()]
    .map(([id, cohort]) => buildComparisonGroup(id, cohort, coverage))
    .toSorted((a, b) => leadValue(b) - leadValue(a) || a.id.localeCompare(b.id));
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
  const latestRow = rows.reduce((a, b) => (b.date > a.date ? b : a));
  const sourceRunUrls = [
    ...new Set(rows.flatMap((row) => (row.run_url === null ? [] : [row.run_url]))),
  ].toSorted();
  return {
    key,
    dbModel: first.model,
    hardware,
    hardwareLabel: getHardwareConfig(hardware, model).label,
    hwKey: buildAvailabilityHwKey(hardware, framework, specMethod, disagg),
    framework,
    frameworkLabel: resolveFrameworkPartLabel(model, framework),
    specMethod,
    specLabel: resolveFrameworkPartLabel(model, specMethod),
    disagg,
    precision,
    offloadMode: first.offload_mode ?? 'off',
    isMultinode: first.is_multinode,
    numPrefillGpu: first.num_prefill_gpu,
    numDecodeGpu: first.num_decode_gpu,
    totalGpu: disagg ? first.num_prefill_gpu + first.num_decode_gpu : first.num_decode_gpu,
    parallelism: parallelismLabel({
      tp: first.decode_tp,
      ep: first.decode_ep,
      dpAttention: first.decode_dp_attention,
      disagg: first.disagg,
      isMultinode: first.is_multinode,
      prefillTp: first.prefill_tp,
      prefillEp: first.prefill_ep,
      prefillDpAttention: first.prefill_dp_attention,
      prefillNumWorkers: first.prefill_num_workers,
      decodeTp: first.decode_tp,
      decodeEp: first.decode_ep,
      decodeDpAttention: first.decode_dp_attention,
      decodeNumWorkers: first.decode_num_workers,
    }),
    image: latestRow.image,
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
    oldestFrontierDate: feed[0].oldest_frontier_date,
  };
}

/**
 * Coverage for every hardware in `order`, derived from raw workload rows only.
 * Hardware the model never measured stays in the list as `no_workload_data`,
 * so a platform is never silently absent from one model's row.
 */
function buildCoverage(
  order: readonly OverviewHardwareOrderEntry[],
  workloadRows: readonly BenchmarkRow[],
  selectedPrecision: string | null,
  comparable: ReadonlySet<string>,
): OverviewHardwareCoverage[] {
  const rowsByHardware = new Map<string, BenchmarkRow[]>();
  for (const row of workloadRows) {
    const hardwareRows = rowsByHardware.get(row.hardware);
    if (hardwareRows) hardwareRows.push(row);
    else rowsByHardware.set(row.hardware, [row]);
  }

  return order.map(({ hardware, hardwareLabel }) => {
    const hardwareRows = rowsByHardware.get(hardware) ?? [];
    return {
      hardware,
      hardwareLabel,
      kind: coverageKindFor(hardwareRows, selectedPrecision, hardware, comparable),
      availablePrecisions: [...new Set(hardwareRows.map((row) => row.precision))].toSorted(),
    };
  });
}

interface OverviewPrecisionBlock {
  comparisonGroups: OverviewComparisonGroup[];
  hardwareStatuses: OverviewHardwareStatus[];
}

/**
 * Rank one precision's speculative configs: cohorts, per-tier rankings and the
 * page-wide hardware statuses. The primary and secondary precisions are both
 * built through here, so neither can rank against the other.
 */
function buildPrecisionBlock(
  model: Model,
  precision: string,
  configs: readonly OverviewConfigResult[],
  hardwareOrder: readonly OverviewHardwareOrderEntry[],
  workloadRows: readonly BenchmarkRow[],
): OverviewPrecisionBlock {
  const exclusion = buildExclusion(getModelExclusion(model));
  const cohorts = buildCohorts(exclusion, configs);
  const comparable = comparableHardware(exclusion, configs);
  const coverage = buildCoverage(hardwareOrder, workloadRows, precision, comparable);
  const comparisonGroups = buildComparisonGroups(cohorts, coverage);
  // Leadership is a claim against a comparable cohort. Across several cohorts
  // there is no model-global leader, so the model row asserts none.
  return {
    comparisonGroups,
    hardwareStatuses: buildHardwareStatuses(coverage, configs, comparisonGroups.length <= 1),
  };
}

/**
 * The other of FP4/FP8. `ranked` (full rows) iff it both ranks a comparable
 * cohort AND covers hardware the primary precision lacks; otherwise `coverage`
 * (one compact line, ranked rows suppressed). `measuredHardware` always lists
 * every hardware measured at this precision so it never disappears from the page.
 */
function buildSecondaryPrecision(
  model: Model,
  precision: string,
  configs: readonly OverviewConfigResult[],
  primaryExact: ReadonlySet<string>,
  hardwareOrder: readonly OverviewHardwareOrderEntry[],
  workloadRows: readonly BenchmarkRow[],
): OverviewSecondaryPrecision | null {
  const measuredSet = new Set(
    workloadRows.filter((row) => row.precision === precision).map((row) => row.hardware),
  );
  if (measuredSet.size === 0) return null;
  const measuredHardware = hardwareOrder
    .filter(({ hardware }) => measuredSet.has(hardware))
    .map(({ hardwareLabel }) => hardwareLabel);

  const block = buildPrecisionBlock(model, precision, configs, hardwareOrder, workloadRows);
  const addsCoverage = [...exactPrimaryHardware(configs)].some((hw) => !primaryExact.has(hw));
  const hasComparable = block.comparisonGroups.some(
    (group) => group.primaryRanking.state === 'comparable',
  );
  const ranked = hasComparable && addsCoverage;
  return {
    precision,
    state: ranked ? 'ranked' : 'coverage',
    comparisonGroups: ranked ? block.comparisonGroups : [],
    hardwareStatuses: ranked ? block.hardwareStatuses : [],
    measuredHardware,
  };
}

/** Map one non-ranked hardware's coverage and read to its not-ranked reason. */
function notRankedReasonFor(status: OverviewHardwareStatus): OverviewNotRankedReason {
  switch (status.coverage.kind) {
    case 'standard_only': {
      return 'standard_decode_only';
    }
    case 'alternate_precision_only': {
      return 'other_precision_only';
    }
    case 'unsupported_precision_only': {
      return 'int4_bf16_only';
    }
    case 'other_engine_group_only': {
      return 'different_serving_cohort';
    }
    case 'no_workload_data': {
      return 'no_8k1k_data';
    }
    case 'comparable_spec': {
      // Comparable-spec hardware reaches here only without an exact @50 read.
      // Classify by INTERACTIVITY direction, not the boundary name: 'unreachable'
      // = tier 50 above the frontier's max, i.e. even the fastest measured point
      // is < 50 tok/s/user (the config is too slow, ever) → cannot_reach_at50.
      // 'clamped_low' = tier below the frontier's min, i.e. every measured point
      // is > 50 tok/s/user — an under-swept sweep gap more concurrency would
      // cross, NOT incapability → no_exact_at50.
      return status.primary.boundary === 'unreachable' ? 'cannot_reach_at50' : 'no_exact_at50';
    }
  }
}

/**
 * One not-ranked entry per page hardware with no visible value — no exact @50
 * read in the primary block and no ranked read in a `ranked` secondary. Reads
 * the same coverage/status machinery the blocks use, so it is a derived view
 * rather than a parallel source of truth.
 */
function buildNotRanked(
  primaryStatuses: readonly OverviewHardwareStatus[],
  secondary: OverviewSecondaryPrecision | null,
): OverviewNotRankedEntry[] {
  const secondaryRanked =
    secondary?.state === 'ranked'
      ? new Set(
          secondary.hardwareStatuses
            .filter((status) => isExactTierRead(status.primary))
            .map((status) => status.hardware),
        )
      : new Set<string>();

  const entries: OverviewNotRankedEntry[] = [];
  for (const status of primaryStatuses) {
    if (isExactTierRead(status.primary) || secondaryRanked.has(status.hardware)) continue;
    entries.push({
      hardware: status.hardware,
      hardwareLabel: status.hardwareLabel,
      reason: notRankedReasonFor(status),
      precisions: status.coverage.availablePrecisions.filter((p) =>
        OVERVIEW_PRECISIONS.includes(p),
      ),
    });
  }
  return entries;
}

function emptyModelSummary(
  model: Model,
  emptyReason: NonNullable<OverviewModelSummary['emptyReason']>,
  order: readonly OverviewHardwareOrderEntry[],
  workloadRows: readonly BenchmarkRow[],
): OverviewModelSummary {
  const hardwareStatuses = buildHardwareStatuses(
    buildCoverage(order, workloadRows, null, new Set()),
    [],
    false,
  );
  return {
    model,
    modelLabel: getModelLabel(model),
    selectedPrecision: null,
    hardwareStatuses,
    comparisonGroups: [],
    secondary: null,
    notRanked: buildNotRanked(hardwareStatuses, null),
    latestWorkloadDate: latestWorkloadDateOf(workloadRows),
    emptyReason,
  };
}

export function buildOverviewModelSummary(
  model: Model,
  rows: BenchmarkRow[],
  hardwareOrder: readonly OverviewHardwareOrderEntry[] = buildOverviewHardwareOrder(rows),
): OverviewModelSummary {
  const workloadRows = overviewWorkloadRows(rows);
  if (workloadRows.length === 0) {
    return emptyModelSummary(model, 'no_8k1k_single_turn_data', hardwareOrder, workloadRows);
  }

  if (!workloadRows.some((row) => OVERVIEW_PRECISIONS.includes(row.precision))) {
    return emptyModelSummary(model, 'no_fp4_fp8_data', hardwareOrder, workloadRows);
  }

  // FP4 and FP8 speculative configs, built once and reused for selection, the
  // primary block and the secondary block — the two precisions never blend.
  const configsByPrecision = new Map(
    OVERVIEW_PRECISIONS.map(
      (precision) => [precision, buildPrecisionConfigs(model, workloadRows, precision)] as const,
    ),
  );
  const selectedPrecision = selectPrimaryFrom(configsByPrecision);
  const secondaryPrecision = OVERVIEW_PRECISIONS.find((p) => p !== selectedPrecision)!;
  const primaryConfigs = configsByPrecision.get(selectedPrecision)!;

  const primary = buildPrecisionBlock(
    model,
    selectedPrecision,
    primaryConfigs,
    hardwareOrder,
    workloadRows,
  );
  const secondary = buildSecondaryPrecision(
    model,
    secondaryPrecision,
    configsByPrecision.get(secondaryPrecision)!,
    exactPrimaryHardware(primaryConfigs),
    hardwareOrder,
    workloadRows,
  );

  return {
    model,
    modelLabel: getModelLabel(model),
    selectedPrecision,
    hardwareStatuses: primary.hardwareStatuses,
    comparisonGroups: primary.comparisonGroups,
    secondary,
    notRanked: buildNotRanked(primary.hardwareStatuses, secondary),
    latestWorkloadDate: latestWorkloadDateOf(workloadRows),
    emptyReason: null,
  };
}

/**
 * Assemble the whole page from rows already grouped by DISPLAY model. Iterating
 * DEFAULT_MODELS fixes the output order and renders every active model — a model
 * with no rows falls through to its coverage-only states, exactly as the live
 * path does. The page-wide hardware order and dataset date come from the union
 * of every model's rows. The live server path and the e2e fixture path feed this
 * same function; only the row source differs.
 */
export function assembleOverviewPageData(
  rowsByModel: Record<string, BenchmarkRow[]>,
): OverviewPageData {
  const perModel = [...DEFAULT_MODELS].map((model) => ({ model, rows: rowsByModel[model] ?? [] }));
  const allRows = perModel.flatMap(({ rows }) => rows);
  const hardwareOrder = buildOverviewHardwareOrder(allRows);
  return {
    models: perModel.map(({ model, rows }) =>
      buildOverviewModelSummary(model, rows, hardwareOrder),
    ),
    hardwareOrder,
    datasetThroughDate: overviewDatasetThroughDate(allRows),
  };
}
