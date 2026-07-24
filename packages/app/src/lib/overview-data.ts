import { resolveFrameworkPartLabel } from '@semianalysisai/inferencex-constants';

import type { BenchmarkRow } from './api';
import { buildAvailabilityHwKey } from './chart-utils';
import { getHardwareConfig } from './constants';
import { DEFAULT_MODELS, getModelLabel, Precision, type Model } from './data-mappings';
import { frameworkFamily } from './framework-family';
import { computeTcoFeed, type TcoTierBoundary } from './tco-feed';

export const OVERVIEW_WORKLOAD = { isl: 8192, osl: 1024 } as const;
export const OVERVIEW_TIERS = [30, 50, 75, 100] as const;
export type OverviewTier = (typeof OVERVIEW_TIERS)[number];
export const OVERVIEW_PRIMARY_TIER = 50;
export type OverviewEngineScope = 'all' | 'community';
export type OverviewDecodeMode = 'speculative' | 'standard';

export function resolveOverviewEngineScope(
  raw: string | string[] | undefined,
): OverviewEngineScope {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  return candidate === 'community' ? 'community' : 'all';
}

export function resolveOverviewTier(raw: string | string[] | undefined): OverviewTier {
  const candidate = Number(Array.isArray(raw) ? raw[0] : raw);
  return OVERVIEW_TIERS.find((tier) => tier === candidate) ?? OVERVIEW_PRIMARY_TIER;
}

export interface OverviewTierValue {
  tier: number;
  value: number | null;
  boundary: TcoTierBoundary;
  /** True only when the tier value falls between observed frontier knots. */
  estimated: boolean;
  /** Bracketing frontier points when estimated, one observed point when the
   *  tier lands on a knot, and the minimum point when clamped. */
  evidenceDate: { from: string; to: string } | null;
  /** P/D topology labels from the frontier knot(s) backing this tier read. */
  evidenceTopologies: string[];
}

/** One chart-equivalent serving series. Topology and GPU-count variants may
 *  contribute points, while release/framework/spec/precision/disagg stay exact. */
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
  estimated: boolean;
  evidenceDate: { from: string; to: string } | null;
  evidenceTopologies: string[];
  config: OverviewConfigResult | null;
}

/** Why a platform shows `∞`. `cannot_reach_at_tier` = every
 *  eligible serving series tops out below the tier; `no_exact_at_tier` = merely
 *  under-swept. */
export type OverviewMissingReason =
  | 'int4_bf16_only'
  | 'no_8k1k_data'
  | 'cannot_reach_at_tier'
  | 'no_exact_at_tier';

export const OVERVIEW_HARDWARE = ['b200', 'mi355x', 'b300', 'gb200', 'gb300'] as const;

export interface OverviewPlatformResult {
  hardware: string;
  hardwareLabel: string;
  precision: string | null;
  decodeMode: OverviewDecodeMode | null;
  read: OverviewTierRead;
  missingReason: OverviewMissingReason | null;
}

export interface OverviewModelSummary {
  model: Model;
  modelLabel: string;
  platforms: OverviewPlatformResult[];
}

export interface OverviewPageData {
  models: OverviewModelSummary[];
  datasetThroughDate: string | null;
  tier: OverviewTier;
  engineScope: OverviewEngineScope;
}

const OVERVIEW_SLICE_PRIORITY = [
  { decodeMode: 'speculative', precision: Precision.FP4 },
  { decodeMode: 'speculative', precision: Precision.FP8 },
  { decodeMode: 'standard', precision: Precision.FP4 },
  { decodeMode: 'standard', precision: Precision.FP8 },
] as const satisfies readonly {
  decodeMode: OverviewDecodeMode;
  precision: string;
}[];
const OVERVIEW_PRECISIONS: readonly string[] = [Precision.FP4, Precision.FP8];
const OVERVIEW_HARDWARE_LABELS: Readonly<Record<string, string>> = {
  gb200: 'GB200',
  gb300: 'GB300',
};

function overviewHardwareLabel(hardware: string, model: Model): string {
  return OVERVIEW_HARDWARE_LABELS[hardware] ?? getHardwareConfig(hardware, model).label;
}

function decodeModeForSpecMethod(specMethod: string): OverviewDecodeMode {
  return specMethod === 'none' || specMethod === '' ? 'standard' : 'speculative';
}

function overviewEngineRows(
  rows: readonly BenchmarkRow[],
  engineScope: OverviewEngineScope,
): BenchmarkRow[] {
  if (engineScope === 'all') return [...rows];
  return rows.filter((row) => {
    const family = frameworkFamily(row.framework);
    return family === 'vllm' || family === 'sglang';
  });
}

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
export function overviewDatasetThroughDate(
  rows: readonly BenchmarkRow[],
  engineScope: OverviewEngineScope = 'all',
): string | null {
  return overviewWorkloadRows(overviewEngineRows(rows, engineScope)).reduce<string | null>(
    (latest, row) => (latest === null || row.date > latest ? row.date : latest),
    null,
  );
}

function overviewServingSeriesKey(row: BenchmarkRow): string {
  return JSON.stringify([
    row.model,
    row.hardware,
    row.framework,
    row.spec_method,
    row.precision,
    row.disagg,
    row.offload_mode ?? 'off',
  ]);
}

/** Chart-equivalent serving series: topology variants are points on one curve. */
function buildConfigs(model: Model, workloadRows: readonly BenchmarkRow[]): OverviewConfigResult[] {
  const rowsByConfig = new Map<string, BenchmarkRow[]>();
  for (const row of workloadRows) {
    if (!OVERVIEW_PRECISIONS.includes(row.precision)) continue;
    const key = overviewServingSeriesKey(row);
    const configRows = rowsByConfig.get(key);
    if (configRows) configRows.push(row);
    else rowsByConfig.set(key, [row]);
  }

  const configs: OverviewConfigResult[] = [];
  for (const [key, configRows] of rowsByConfig) {
    const latestDate = configRows.reduce(
      (latest, row) => (row.date > latest ? row.date : latest),
      configRows[0].date,
    );
    const latestRows = configRows.filter((row) => row.date === latestDate);
    const config = buildConfigResult(model, latestRows[0].precision, key, latestRows);
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
    estimated: tierValue?.estimated ?? false,
    evidenceDate: tierValue?.evidenceDate ?? null,
    evidenceTopologies: tierValue?.evidenceTopologies ?? [],
    config,
  };
}

interface ConfigTierRead extends OverviewTierRead {
  config: OverviewConfigResult;
}

/** In-range reads only: a clamped or unreachable read remains a coverage gap. */
const isInRangeTierRead = <T extends OverviewTierRead>(read: T): read is T & { value: number } =>
  read.value !== null && read.boundary === 'interpolated';

function readFreshness(read: ConfigTierRead): string {
  return read.evidenceDate?.to ?? read.config.latestDate;
}

function compareTierReads(a: ConfigTierRead, b: ConfigTierRead): number {
  return (
    Number(isInRangeTierRead(b)) - Number(isInRangeTierRead(a)) ||
    (b.value ?? -1) - (a.value ?? -1) ||
    readFreshness(b).localeCompare(readFreshness(a)) ||
    b.config.latestDate.localeCompare(a.config.latestDate) ||
    a.config.key.localeCompare(b.config.key)
  );
}

function nullTierRead(tier: number): OverviewTierRead {
  return {
    tier,
    value: null,
    boundary: null,
    estimated: false,
    evidenceDate: null,
    evidenceTopologies: [],
    config: null,
  };
}

function nonComparableAsMissing(
  read: OverviewTierRead | undefined,
  tier: number,
): OverviewTierRead {
  if (read === undefined) return nullTierRead(tier);
  return isInRangeTierRead(read)
    ? read
    : { ...read, value: null, estimated: false, evidenceDate: null, evidenceTopologies: [] };
}

function configPriorityIndex(config: OverviewConfigResult): number {
  return OVERVIEW_SLICE_PRIORITY.findIndex(
    (priority) =>
      priority.precision === config.precision &&
      priority.decodeMode === decodeModeForSpecMethod(config.specMethod),
  );
}

function selectPlatformRead(
  configs: readonly OverviewConfigResult[],
  hardware: string,
  tier: OverviewTier,
): OverviewTierRead {
  const reads = configs
    .filter((config) => config.hardware === hardware)
    .map((config): ConfigTierRead => ({ ...readConfigAtTier(config, tier), config }));

  for (const priority of OVERVIEW_SLICE_PRIORITY) {
    const exact = reads
      .filter(
        (read) =>
          read.config.precision === priority.precision &&
          decodeModeForSpecMethod(read.config.specMethod) === priority.decodeMode &&
          isInRangeTierRead(read),
      )
      .toSorted(compareTierReads)[0];
    if (exact) return exact;
  }

  const fallback = reads.toSorted(
    (a, b) =>
      configPriorityIndex(a.config) - configPriorityIndex(b.config) || compareTierReads(a, b),
  )[0];
  return fallback ? nonComparableAsMissing(fallback, tier) : nullTierRead(tier);
}

function missingReasonForPlatform(
  workloadRows: readonly BenchmarkRow[],
  hardware: string,
  read: OverviewTierRead,
  bucketReads: readonly OverviewTierRead[],
): OverviewMissingReason | null {
  if (isInRangeTierRead(read)) return null;
  const hardwareRows = workloadRows.filter((row) => row.hardware === hardware);
  if (hardwareRows.length === 0) return 'no_8k1k_data';
  const supportedRows = hardwareRows.filter((row) => OVERVIEW_PRECISIONS.includes(row.precision));
  if (supportedRows.length === 0) return 'int4_bf16_only';
  // `cannot reach` is a claim about the whole platform, so it holds only when
  // EVERY qualified serving series tops out below the tier — one merely
  // under-swept stack downgrades the gap to a missing exact read.
  return bucketReads.length > 0 && bucketReads.every((r) => r.boundary === 'unreachable')
    ? 'cannot_reach_at_tier'
    : 'no_exact_at_tier';
}

function buildPlatformResults(
  model: Model,
  workloadRows: readonly BenchmarkRow[],
  tier: OverviewTier,
): OverviewPlatformResult[] {
  const configs = buildConfigs(model, workloadRows);
  const readsForHardware = (hardware: string): OverviewTierRead[] =>
    configs
      .filter((config) => config.hardware === hardware)
      .map((config) => readConfigAtTier(config, tier));

  return OVERVIEW_HARDWARE.map((hardware) => {
    const read = selectPlatformRead(configs, hardware, tier);
    return {
      hardware,
      hardwareLabel: overviewHardwareLabel(hardware, model),
      precision: read.config?.precision ?? null,
      decodeMode: read.config === null ? null : decodeModeForSpecMethod(read.config.specMethod),
      read,
      missingReason: missingReasonForPlatform(
        workloadRows,
        hardware,
        read,
        readsForHardware(hardware),
      ),
    };
  });
}

function buildConfigResult(
  model: Model,
  precision: string,
  key: string,
  rows: BenchmarkRow[],
): OverviewConfigResult | null {
  const feedRows = rows.map((row) => {
    const outputTputPerGpu = row.metrics.output_tput_per_gpu;
    const totalGpus = row.num_prefill_gpu + row.num_decode_gpu;
    const comparableOutputTputPerGpu =
      row.disagg &&
      row.num_prefill_gpu > 0 &&
      row.num_decode_gpu > 0 &&
      totalGpus > 0 &&
      Number.isFinite(outputTputPerGpu)
        ? (outputTputPerGpu * row.num_decode_gpu) / totalGpus
        : outputTputPerGpu;
    const evidenceLabel =
      row.disagg && row.num_prefill_gpu > 0 && row.num_decode_gpu > 0
        ? `${row.num_prefill_gpu}P+${row.num_decode_gpu}D`
        : undefined;
    return {
      ...row,
      metrics: {
        ...row.metrics,
        output_tput_per_gpu: comparableOutputTputPerGpu,
      },
      evidence_label: evidenceLabel,
    };
  });
  const feed = computeTcoFeed(feedRows, [OVERVIEW_WORKLOAD], OVERVIEW_TIERS);
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
        estimated: value !== null && row.is_interpolated,
        evidenceDate: value === null ? null : row.evidence_date,
        evidenceTopologies: value === null ? [] : (row.evidence_labels ?? []),
      };
    }),
    latestDate: feed[0].latest_date,
  };
}

export function buildOverviewModelSummary(
  model: Model,
  rows: BenchmarkRow[],
  tier: OverviewTier = OVERVIEW_PRIMARY_TIER,
  engineScope: OverviewEngineScope = 'all',
): OverviewModelSummary {
  const scopedRows = overviewEngineRows(rows, engineScope);
  return {
    model,
    modelLabel: getModelLabel(model),
    platforms: buildPlatformResults(model, overviewWorkloadRows(scopedRows), tier),
  };
}

/** DEFAULT_MODELS fixes the row order; a rowless model still renders all
 *  platforms with missing reasons. Live and fixture paths both feed this. */
export function assembleOverviewPageData(
  rowsByModel: Record<string, BenchmarkRow[]>,
  tier: OverviewTier = OVERVIEW_PRIMARY_TIER,
  engineScope: OverviewEngineScope = 'all',
): OverviewPageData {
  const perModel = [...DEFAULT_MODELS].map((model) => ({ model, rows: rowsByModel[model] ?? [] }));
  return {
    models: perModel.map(({ model, rows }) =>
      buildOverviewModelSummary(model, rows, tier, engineScope),
    ),
    datasetThroughDate: overviewDatasetThroughDate(
      perModel.flatMap(({ rows }) => rows),
      engineScope,
    ),
    tier,
    engineScope,
  };
}
