import { resolveFrameworkPartLabel } from '@semianalysisai/inferencex-constants';

import type { BenchmarkRow } from '../api/api';
import { rowToAggDataEntry } from '../benchmarks/benchmark-transform';
import { buildAvailabilityHwKey } from '../charts/chart-utils';
import { getGpuSpecs, getHardwareConfig } from '../catalog/constants';
import {
  DEFAULT_MODELS,
  DEPRECATED_MODELS,
  getModelCategory,
  getModelLabel,
  MAINTENANCE_MODELS,
  Model,
  Precision,
  type CategoryTag,
} from '../catalog/data-mappings';
import { frameworkFamily } from '../catalog/framework-family';
import {
  benchmarkCurveDate,
  benchmarkCurveRunStartedAt,
  benchmarkCurveWorkflowRunId,
} from '../benchmarks/benchmark-run-selection';
import {
  computeTierReads,
  singleTurnInteractivity,
  type TcoTierBoundary,
  type TcoTierPoint,
  type TcoTierRead,
} from '../calculator/tco-feed';

export const OVERVIEW_WORKLOAD = { isl: 8192, osl: 1024 } as const;
export const OVERVIEW_TIERS = [30, 50, 75, 100, 150, 200] as const;
export type OverviewTier = (typeof OVERVIEW_TIERS)[number];
export const OVERVIEW_PRIMARY_TIER = 50;
export const OVERVIEW_HARDWARE = ['b200', 'mi355x', 'b300', 'gb200', 'gb300'] as const;
export type OverviewReferenceHardware = (typeof OVERVIEW_HARDWARE)[number];
export const OVERVIEW_DEFAULT_REFERENCE_HARDWARE: OverviewReferenceHardware = 'b200';
export const OVERVIEW_ENGINE_SCOPES = ['all', 'community'] as const;
export type OverviewEngineScope = (typeof OVERVIEW_ENGINE_SCOPES)[number];
export const OVERVIEW_DEFAULT_ENGINE_SCOPE: OverviewEngineScope = 'community';
export const OVERVIEW_HISTORY_WINDOWS = ['7d', '30d', '60d', '90d'] as const;
export type OverviewHistoryWindowKey = (typeof OVERVIEW_HISTORY_WINDOWS)[number];
export const OVERVIEW_DEFAULT_HISTORY_WINDOW: OverviewHistoryWindowKey = '30d';
export const OVERVIEW_HISTORY_WINDOW_DAYS: Record<OverviewHistoryWindowKey, number> = {
  '7d': 7,
  '30d': 30,
  '60d': 60,
  '90d': 90,
};
export type OverviewComparisonMode = 'hardware' | OverviewHistoryWindowKey;
export const OVERVIEW_DEFAULT_COMPARISON_MODE: OverviewComparisonMode = 'hardware';
export type OverviewModelScope = 'default' | 'all';
export const OVERVIEW_DEFAULT_MODEL_SCOPE: OverviewModelScope = 'default';
export type OverviewRowScope = 'changed' | 'all';
export const OVERVIEW_DEFAULT_ROW_SCOPE: OverviewRowScope = 'all';
export type OverviewHardwareRowScope = 'priced' | 'all';
export const OVERVIEW_DEFAULT_HARDWARE_ROW_SCOPE: OverviewHardwareRowScope = 'all';
export type OverviewScenario = 'single_turn_8k1k' | 'agentx';
export const OVERVIEW_SCENARIOS = ['single_turn_8k1k', 'agentx'] as const;
export const OVERVIEW_SCENARIO_ROW_ORDER = ['agentx', 'single_turn_8k1k'] as const;

export function resolveOverviewEngineScope(
  raw: string | string[] | undefined,
): OverviewEngineScope {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  return candidate === 'all' ? 'all' : OVERVIEW_DEFAULT_ENGINE_SCOPE;
}

export function resolveOverviewReferenceHardware(
  raw: string | readonly string[] | undefined,
): OverviewReferenceHardware {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  return (
    OVERVIEW_HARDWARE.find((hardware) => hardware === candidate) ??
    OVERVIEW_DEFAULT_REFERENCE_HARDWARE
  );
}

export function resolveOverviewComparisonMode(
  raw: string | readonly string[] | undefined,
): OverviewComparisonMode {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  return (
    OVERVIEW_HISTORY_WINDOWS.find((window) => window === candidate) ??
    OVERVIEW_DEFAULT_COMPARISON_MODE
  );
}

export function resolveOverviewModelScope(
  raw: string | readonly string[] | undefined,
): OverviewModelScope {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  return candidate === 'all' ? 'all' : OVERVIEW_DEFAULT_MODEL_SCOPE;
}

export function resolveOverviewRowScope(
  raw: string | readonly string[] | undefined,
): OverviewRowScope {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  return candidate === 'changed' ? 'changed' : OVERVIEW_DEFAULT_ROW_SCOPE;
}

export function resolveOverviewHardwareRowScope(
  raw: string | readonly string[] | undefined,
): OverviewHardwareRowScope {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  return candidate === 'priced' ? 'priced' : OVERVIEW_DEFAULT_HARDWARE_ROW_SCOPE;
}

export function overviewModelsForScope(scope: OverviewModelScope): Model[] {
  return scope === 'all'
    ? [...DEFAULT_MODELS, ...MAINTENANCE_MODELS, ...DEPRECATED_MODELS]
    : [...DEFAULT_MODELS];
}

export function resolveOverviewTier(raw: string | string[] | undefined): OverviewTier {
  const candidate = Number(Array.isArray(raw) ? raw[0] : raw);
  return OVERVIEW_TIERS.find((tier) => tier === candidate) ?? OVERVIEW_PRIMARY_TIER;
}

export interface OverviewTierValue {
  tier: number;
  value: number | null;
  boundary: TcoTierBoundary;
  estimated: boolean;
  evidenceDate: { from: string; to: string } | null;
  evidenceTopologies: string[];
}

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
  isMultinode: boolean;
  precision: string;
  sourceRunUrls: string[];
  tierValues: OverviewTierValue[];
  latestDate: string;
}

export type OverviewConfigView = Omit<OverviewConfigResult, 'tierValues'>;

export interface OverviewTierRead {
  tier: number;
  value: number | null;
  boundary: TcoTierBoundary | null;
  estimated: boolean;
  evidenceDate: { from: string; to: string } | null;
  evidenceTopologies: string[];
  config: OverviewConfigView | null;
}

export type OverviewMissingReason =
  | 'int4_bf16_only'
  | 'no_scenario_data'
  | 'cannot_reach_at_tier'
  | 'no_exact_at_tier';

export type OverviewHistoricalStatus = 'comparable' | 'no_baseline' | 'no_newer_result';

export interface OverviewHistoricalComparison {
  status: OverviewHistoricalStatus;
  baselineCostPerMtok: number | null;
  costDeltaPct: number | null;
  baselineDate: string | null;
  baselineConfig: OverviewConfigView | null;
}

export interface OverviewPlatformResult {
  hardware: string;
  hardwareLabel: string;
  precision: string | null;
  read: OverviewTierRead;
  missingReason: OverviewMissingReason | null;
  costPerMtok: number | null;
  costVsReferencePct: number | null;
  historicalComparison: OverviewHistoricalComparison | null;
}

export interface OverviewModelSummary {
  model: Model;
  modelLabel: string;
  category: CategoryTag;
  scenario: OverviewScenario;
  platforms: OverviewPlatformResult[];
}

export interface OverviewPageData {
  models: OverviewModelSummary[];
  tier: OverviewTier;
  engineScope: OverviewEngineScope;
  comparisonMode: OverviewComparisonMode;
  referenceHardware: OverviewReferenceHardware;
  modelScope: OverviewModelScope;
  rowScope: OverviewRowScope;
  hardwareRowScope: OverviewHardwareRowScope;
  unchangedRowCount: number;
  emptyRowCount: number;
  historicalWindow: OverviewHistoricalWindow | null;
}

export interface OverviewHistoricalWindow {
  key: OverviewHistoryWindowKey;
  snapshotDate: string;
  targetDate: string;
  earliestDate: string;
}

function overviewScenarioOfRow(row: BenchmarkRow): OverviewScenario | null {
  if (row.benchmark_type === 'agentic_traces') return 'agentx';
  if (
    row.benchmark_type === 'single_turn' &&
    row.isl === OVERVIEW_WORKLOAD.isl &&
    row.osl === OVERVIEW_WORKLOAD.osl
  ) {
    return 'single_turn_8k1k';
  }
  return null;
}

function subtractUtcDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function overviewSnapshotDate(
  rowsByModel: Readonly<Record<string, readonly BenchmarkRow[]>>,
  engineScope: OverviewEngineScope = 'community',
): string | null {
  const dates = Object.entries(rowsByModel).flatMap(([modelKey, rows]) => {
    const scenarios = overviewScenariosForModel(modelKey as Model, rows);
    return overviewEngineRows(rows, engineScope)
      .filter((row) => {
        const scenario = overviewScenarioOfRow(row);
        return (
          (OVERVIEW_HARDWARE as readonly string[]).includes(row.hardware) &&
          scenario !== null &&
          scenarios.includes(scenario)
        );
      })
      .map(benchmarkCurveDate);
  });
  return dates.length === 0 ? null : (dates.toSorted().at(-1) ?? null);
}

export function overviewHistoricalWindow(
  snapshotDate: string,
  key: OverviewHistoryWindowKey = OVERVIEW_DEFAULT_HISTORY_WINDOW,
): OverviewHistoricalWindow {
  const days = OVERVIEW_HISTORY_WINDOW_DAYS[key];
  return {
    key,
    snapshotDate,
    targetDate: subtractUtcDays(snapshotDate, days),
    earliestDate: subtractUtcDays(snapshotDate, days * 2),
  };
}

const OVERVIEW_SLICE_PRIORITY = [
  { speculative: true, precision: Precision.FP4 },
  { speculative: true, precision: Precision.FP8 },
  { speculative: false, precision: Precision.FP4 },
  { speculative: false, precision: Precision.FP8 },
] as const;
const OVERVIEW_PRECISIONS: readonly string[] = [Precision.FP4, Precision.FP8];
export function overviewHardwareLabel(hardware: string, model?: Model): string {
  return getHardwareConfig(hardware, model).label;
}

const isSpeculativeDecode = (specMethod: string): boolean =>
  specMethod !== 'none' && specMethod !== '';

export function overviewScenarioForModel(
  model: Model,
  rows: readonly BenchmarkRow[] = [],
): OverviewScenario {
  if (
    rows.some(
      (row) =>
        row.benchmark_type === 'single_turn' &&
        row.isl === OVERVIEW_WORKLOAD.isl &&
        row.osl === OVERVIEW_WORKLOAD.osl,
    )
  ) {
    return 'single_turn_8k1k';
  }
  if (rows.some((row) => row.benchmark_type === 'agentic_traces')) return 'agentx';
  return model === Model.Kimi_K3 ||
    model === Model.GLM_5_2 ||
    model === Model.Qwen3_8_Flash_Next ||
    model === Model.MiniMax_M3 ||
    model === Model.DeepSeek_V4_Pro
    ? 'agentx'
    : 'single_turn_8k1k';
}

const OVERVIEW_MODEL_SCENARIOS: Partial<Record<Model, readonly OverviewScenario[]>> = {
  [Model.Muse_Spark_Open]: ['agentx'],
  [Model.DeepSeek_V4_Pro]: ['agentx'],
  [Model.MiniMax_M3]: ['agentx'],
  [Model.Qwen3_5]: ['single_turn_8k1k', 'agentx'],
  [Model.Kimi_K3]: ['agentx'],
  [Model.GLM_5_2]: ['agentx'],
  [Model.Qwen3_8_Flash_Next]: ['agentx'],
  [Model.DeepSeek_V4_1_Flash]: ['agentx'],
};

export function overviewScenariosForModel(
  model: Model,
  rows: readonly BenchmarkRow[] = [],
): OverviewScenario[] {
  const curated = OVERVIEW_MODEL_SCENARIOS[model];
  return curated === undefined
    ? [overviewScenarioForModel(model, rows)]
    : OVERVIEW_SCENARIOS.filter((scenario) => curated.includes(scenario));
}

export function overviewHeadlineScenarioForModel(
  model: Model,
  rows: readonly BenchmarkRow[] = [],
): OverviewScenario {
  const scenarios = overviewScenariosForModel(model, rows);
  return (
    scenarios.find((scenario) => rows.some((row) => overviewScenarioOfRow(row) === scenario)) ??
    scenarios[0]
  );
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

function overviewScenarioRows(
  scenario: OverviewScenario,
  rows: readonly BenchmarkRow[],
): BenchmarkRow[] {
  if (scenario === 'agentx') {
    return rows.filter((row) => row.benchmark_type === 'agentic_traces');
  }
  return rows.filter(
    (row) =>
      row.benchmark_type === 'single_turn' &&
      row.isl === OVERVIEW_WORKLOAD.isl &&
      row.osl === OVERVIEW_WORKLOAD.osl,
  );
}

export type OverviewServingSeriesRow = Pick<
  BenchmarkRow,
  'model' | 'hardware' | 'framework' | 'spec_method' | 'precision' | 'disagg' | 'is_multinode'
> & { offload_mode?: string | null; benchmark_type?: string };

export function overviewServingSeriesKey(row: OverviewServingSeriesRow): string {
  const specMethod = row.benchmark_type === 'agentic_traces' ? '' : row.spec_method;
  return JSON.stringify([
    row.model,
    row.hardware,
    row.framework,
    specMethod,
    row.precision,
    row.disagg,
    row.is_multinode,
    row.offload_mode ?? 'off',
  ]);
}

function buildConfigs(
  model: Model,
  scenario: OverviewScenario,
  scenarioRows: readonly BenchmarkRow[],
): OverviewConfigResult[] {
  const rowsByConfig = new Map<string, BenchmarkRow[]>();
  for (const row of scenarioRows) {
    if (!OVERVIEW_PRECISIONS.includes(row.precision)) continue;
    const key = overviewServingSeriesKey(row);
    const configRows = rowsByConfig.get(key);
    if (configRows) configRows.push(row);
    else rowsByConfig.set(key, [row]);
  }

  const configs: OverviewConfigResult[] = [];
  for (const [key, configRows] of rowsByConfig) {
    const latestDate = configRows.reduce(
      (latest, row) => (benchmarkCurveDate(row) > latest ? benchmarkCurveDate(row) : latest),
      benchmarkCurveDate(configRows[0]),
    );
    let latestRows = configRows.filter((row) => benchmarkCurveDate(row) === latestDate);
    if (
      scenario === 'agentx' &&
      latestRows.some((row) => benchmarkCurveWorkflowRunId(row) !== undefined)
    ) {
      const winningRow = latestRows.reduce((winner, row) => {
        const startedAt = benchmarkCurveRunStartedAt(row) ?? '';
        const winnerStartedAt = benchmarkCurveRunStartedAt(winner) ?? '';
        if (startedAt !== winnerStartedAt) return startedAt > winnerStartedAt ? row : winner;
        return (benchmarkCurveWorkflowRunId(row) ?? Number.NEGATIVE_INFINITY) >
          (benchmarkCurveWorkflowRunId(winner) ?? Number.NEGATIVE_INFINITY)
          ? row
          : winner;
      });
      latestRows = latestRows.filter(
        (row) => benchmarkCurveWorkflowRunId(row) === benchmarkCurveWorkflowRunId(winningRow),
      );
    }
    const config = buildConfigResult(model, scenario, latestRows[0].precision, key, latestRows);
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
  config: OverviewConfigView;
}

const isInRangeTierRead = <T extends OverviewTierRead>(read: T): read is T & { value: number } =>
  read.value !== null && read.boundary === 'interpolated';

export function overviewTierEvidenceDate(read: OverviewTierRead): string | null {
  return read.evidenceDate?.to ?? read.config?.latestDate ?? null;
}

function readFreshness(read: ConfigTierRead): string {
  return overviewTierEvidenceDate(read) ?? read.config.latestDate;
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
    : {
        ...read,
        value: null,
        estimated: false,
        evidenceDate: null,
        evidenceTopologies: [],
      };
}

function configPriorityIndex(config: OverviewConfigView): number {
  return OVERVIEW_SLICE_PRIORITY.findIndex(
    ({ speculative, precision }) =>
      speculative === isSpeculativeDecode(config.specMethod) && precision === config.precision,
  );
}

function selectPlatformRead(
  configs: readonly OverviewConfigResult[],
  hardware: string,
  tier: OverviewTier,
): OverviewTierRead {
  const reads = configs
    .filter((config) => config.hardware === hardware)
    .map((config): ConfigTierRead => {
      const { tierValues: _tierValues, ...view } = config;
      return { ...readConfigAtTier(config, tier), config: view };
    });

  for (const priority of OVERVIEW_SLICE_PRIORITY) {
    const exact = reads
      .filter(
        (read) =>
          read.config.precision === priority.precision &&
          isSpeculativeDecode(read.config.specMethod) === priority.speculative &&
          isInRangeTierRead(read),
      )
      .toSorted(compareTierReads)[0];
    if (exact) return exact;
  }

  const bestMissingRead = reads.toSorted(
    (a, b) =>
      configPriorityIndex(a.config) - configPriorityIndex(b.config) || compareTierReads(a, b),
  )[0];
  return bestMissingRead ? nonComparableAsMissing(bestMissingRead, tier) : nullTierRead(tier);
}

function missingReasonForPlatform(
  workloadRows: readonly BenchmarkRow[],
  hardware: string,
  read: OverviewTierRead,
  bucketReads: readonly OverviewTierRead[],
): OverviewMissingReason | null {
  if (isInRangeTierRead(read)) return null;
  const hardwareRows = workloadRows.filter((row) => row.hardware === hardware);
  if (hardwareRows.length === 0) return 'no_scenario_data';
  const supportedRows = hardwareRows.filter((row) => OVERVIEW_PRECISIONS.includes(row.precision));
  if (supportedRows.length === 0) return 'int4_bf16_only';
  if (bucketReads.length === 0) return 'no_scenario_data';
  return bucketReads.every((r) => r.boundary === 'unreachable')
    ? 'cannot_reach_at_tier'
    : 'no_exact_at_tier';
}

export function overviewCostPerMtok(
  hardware: string,
  totalTputPerGpu: number | null,
): number | null {
  if (totalTputPerGpu === null || totalTputPerGpu <= 0) return null;
  const costPerGpuHour = getGpuSpecs(hardware).costh;
  if (costPerGpuHour <= 0) return null;
  return (costPerGpuHour * 1_000_000) / (totalTputPerGpu * 3600);
}

function buildPlatformResults(
  model: Model,
  scenario: OverviewScenario,
  scenarioRows: readonly BenchmarkRow[],
  tier: OverviewTier,
  referenceHardware: OverviewReferenceHardware,
): OverviewPlatformResult[] {
  const configs = buildConfigs(model, scenario, scenarioRows);
  const readsForHardware = (hardware: string): OverviewTierRead[] =>
    configs
      .filter((config) => config.hardware === hardware)
      .map((config) => readConfigAtTier(config, tier));

  const platforms = OVERVIEW_HARDWARE.map((hardware) => {
    const read = selectPlatformRead(configs, hardware, tier);
    return {
      hardware,
      hardwareLabel: overviewHardwareLabel(hardware, model),
      precision: read.config?.precision ?? null,
      read,
      missingReason: missingReasonForPlatform(
        scenarioRows,
        hardware,
        read,
        readsForHardware(hardware),
      ),
      costPerMtok: overviewCostPerMtok(hardware, read.value),
    };
  });

  const referenceCost =
    platforms.find((platform) => platform.hardware === referenceHardware)?.costPerMtok ?? null;
  return platforms.map((platform) => ({
    ...platform,
    costVsReferencePct:
      platform.hardware === referenceHardware ||
      referenceCost === null ||
      platform.costPerMtok === null
        ? null
        : platform.costPerMtok / referenceCost - 1,
    historicalComparison: null,
  }));
}

function deployedGpuFactor(row: BenchmarkRow): number {
  const totalGpus = row.num_prefill_gpu + row.num_decode_gpu;
  return row.disagg && row.num_prefill_gpu > 0 && row.num_decode_gpu > 0 && totalGpus > 0
    ? row.num_decode_gpu / totalGpus
    : 1;
}

function topologyEvidence(row: BenchmarkRow): string | undefined {
  return row.disagg && row.num_prefill_gpu > 0 && row.num_decode_gpu > 0
    ? `${row.num_prefill_gpu}P+${row.num_decode_gpu}D`
    : undefined;
}

interface OverviewAgenticTierPoint extends TcoTierPoint {
  e2eLatency: number;
}

function buildAgenticTierReads(rows: readonly BenchmarkRow[]): TcoTierRead[] {
  const points = rows.flatMap((row): OverviewAgenticTierPoint[] => {
    const entry = rowToAggDataEntry(row);
    const factor = deployedGpuFactor(row);
    const interactivity = entry.p90_intvty;
    const e2eLatency = entry.p90_e2el;
    const totalThroughput = entry.tput_per_gpu * factor;
    if (
      !Number.isFinite(interactivity) ||
      interactivity <= 0 ||
      !Number.isFinite(e2eLatency) ||
      e2eLatency <= 0 ||
      !Number.isFinite(totalThroughput) ||
      totalThroughput <= 0
    ) {
      return [];
    }
    return [
      {
        interactivity,
        e2eLatency,
        throughput: totalThroughput,
        date: benchmarkCurveDate(row),
        evidenceLabel: topologyEvidence(row),
      },
    ];
  });
  return computeTierReads(points, OVERVIEW_TIERS);
}

function buildSingleTurnTierReads(rows: readonly BenchmarkRow[]): TcoTierRead[] {
  const points = rows.flatMap((row): TcoTierPoint[] => {
    const interactivity = singleTurnInteractivity(row.metrics);
    const totalTput = row.metrics.tput_per_gpu;
    if (interactivity === undefined || !Number.isFinite(totalTput) || totalTput <= 0) return [];
    return [
      {
        interactivity,
        throughput: totalTput * deployedGpuFactor(row),
        date: benchmarkCurveDate(row),
        evidenceLabel: topologyEvidence(row),
      },
    ];
  });
  return computeTierReads(points, OVERVIEW_TIERS);
}

function buildConfigResult(
  model: Model,
  scenario: OverviewScenario,
  precision: string,
  key: string,
  rows: BenchmarkRow[],
): OverviewConfigResult | null {
  const feed = scenario === 'agentx' ? buildAgenticTierReads(rows) : buildSingleTurnTierReads(rows);
  if (feed.length === 0) return null;

  const first = rows[0];
  const { hardware, framework, disagg, is_multinode: isMultinode } = first;
  const specMethods = [...new Set(rows.map((row) => row.spec_method))];
  const specMethod = specMethods.length === 1 ? specMethods[0] : 'mixed';
  const specLabel =
    specMethod === 'mixed'
      ? specMethods
          .map((method) =>
            method === 'none' || method === '' ? 'STP' : resolveFrameworkPartLabel(model, method),
          )
          .join(' + ')
      : resolveFrameworkPartLabel(model, specMethod);
  const sourceRunUrls = [
    ...new Set(rows.flatMap((row) => (row.run_url === null ? [] : [row.run_url]))),
  ].toSorted();
  return {
    key,
    dbModel: first.model,
    hardware,
    hwKey: buildAvailabilityHwKey(
      hardware,
      framework,
      specMethod,
      disagg,
      scenario === 'agentx' ? 'agentic_traces' : 'single_turn',
    ),
    framework,
    frameworkLabel: resolveFrameworkPartLabel(model, framework),
    specMethod,
    specLabel,
    disagg,
    isMultinode,
    precision,
    sourceRunUrls,
    tierValues: feed.map((row) => {
      const value =
        row.boundary === 'unreachable' && row.throughput_per_gpu === 0
          ? null
          : row.throughput_per_gpu;
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
  engineScope: OverviewEngineScope = 'community',
  scenario: OverviewScenario = overviewScenarioForModel(model, rows),
  referenceHardware: OverviewReferenceHardware = OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
): OverviewModelSummary {
  const scopedRows = overviewEngineRows(rows, engineScope);
  const scenarioRows = overviewScenarioRows(scenario, scopedRows);
  return {
    model,
    modelLabel: getModelLabel(model),
    category: getModelCategory(model),
    scenario,
    platforms: buildPlatformResults(model, scenario, scenarioRows, tier, referenceHardware),
  };
}

export function overviewHardwareTierReader(
  model: Model,
  rows: BenchmarkRow[],
  scenario: OverviewScenario = overviewScenarioForModel(model, rows),
  engineScope: OverviewEngineScope = 'community',
): (
  hardware: string,
  tier: OverviewTier,
) => { read: OverviewTierRead; costPerMtok: number | null } {
  const scopedRows = overviewEngineRows(rows, engineScope);
  const scenarioRows = overviewScenarioRows(scenario, scopedRows);
  const configs = buildConfigs(model, scenario, scenarioRows);
  return (hardware, tier) => {
    const read = selectPlatformRead(configs, hardware, tier);
    return { read, costPerMtok: overviewCostPerMtok(hardware, read.value) };
  };
}

const overviewCategoryRank = (category: CategoryTag): number =>
  category === 'default' ? 0 : category === 'maintenance' ? 1 : 2;
const overviewScenarioRank = (scenario: OverviewScenario): number =>
  OVERVIEW_SCENARIO_ROW_ORDER.indexOf(scenario);

function sortOverviewSummaries(summaries: OverviewModelSummary[]): OverviewModelSummary[] {
  return summaries.toSorted(
    (a, b) =>
      overviewCategoryRank(a.category) - overviewCategoryRank(b.category) ||
      overviewScenarioRank(a.scenario) - overviewScenarioRank(b.scenario),
  );
}

export function assembleOverviewPageData(
  rowsByModel: Record<string, BenchmarkRow[]>,
  tier: OverviewTier = OVERVIEW_PRIMARY_TIER,
  engineScope: OverviewEngineScope = 'community',
  referenceHardware: OverviewReferenceHardware = OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  modelScope: OverviewModelScope = OVERVIEW_DEFAULT_MODEL_SCOPE,
): OverviewPageData {
  const perModel = overviewModelsForScope(modelScope).map((model) => ({
    model,
    rows: rowsByModel[model] ?? [],
  }));
  return {
    models: sortOverviewSummaries(
      perModel.flatMap(({ model, rows }) =>
        overviewScenariosForModel(model, rows).map((scenario) =>
          buildOverviewModelSummary(model, rows, tier, engineScope, scenario, referenceHardware),
        ),
      ),
    ),
    tier,
    engineScope,
    comparisonMode: OVERVIEW_DEFAULT_COMPARISON_MODE,
    referenceHardware,
    modelScope,
    rowScope: 'all',
    hardwareRowScope: 'all',
    unchangedRowCount: 0,
    emptyRowCount: 0,
    historicalWindow: null,
  };
}

export function overviewRowHasHistoricalChange(model: OverviewModelSummary): boolean {
  return model.platforms.some((platform) => platform.historicalComparison?.status === 'comparable');
}

export function applyOverviewRowScope(
  data: OverviewPageData,
  rowScope: OverviewRowScope,
): OverviewPageData {
  if (data.comparisonMode === 'hardware') {
    return { ...data, rowScope, unchangedRowCount: 0 };
  }

  const changed = data.models.filter(overviewRowHasHistoricalChange);
  const unchangedRowCount = data.models.length - changed.length;
  if (changed.length === 0 || unchangedRowCount === 0) {
    return { ...data, rowScope: 'all', unchangedRowCount: 0 };
  }

  return rowScope === 'changed'
    ? { ...data, models: changed, rowScope: 'changed', unchangedRowCount }
    : { ...data, rowScope: 'all', unchangedRowCount };
}

export function overviewRowHasAnyCost(model: OverviewModelSummary): boolean {
  return model.platforms.some((platform) => platform.costPerMtok !== null);
}

export function applyOverviewHardwareRowScope(
  data: OverviewPageData,
  hardwareRowScope: OverviewHardwareRowScope,
): OverviewPageData {
  if (data.comparisonMode !== 'hardware') {
    return { ...data, hardwareRowScope, emptyRowCount: 0 };
  }

  const priced = data.models.filter(overviewRowHasAnyCost);
  const emptyRowCount = data.models.length - priced.length;
  if (priced.length === 0 || emptyRowCount === 0) {
    return { ...data, hardwareRowScope: 'all', emptyRowCount: 0 };
  }

  return hardwareRowScope === 'priced'
    ? { ...data, models: priced, hardwareRowScope: 'priced', emptyRowCount }
    : { ...data, hardwareRowScope: 'all', emptyRowCount };
}

function overviewPlatformKey(
  model: OverviewModelSummary,
  platform: OverviewPlatformResult,
): string {
  return `${model.model}|${model.scenario}|${platform.hardware}`;
}

export function assembleOverviewHistoricalPageData(
  currentRowsByModel: Record<string, BenchmarkRow[]>,
  baselineRowsByModel: Record<string, BenchmarkRow[]>,
  window: OverviewHistoricalWindow,
  tier: OverviewTier = OVERVIEW_PRIMARY_TIER,
  engineScope: OverviewEngineScope = 'community',
  referenceHardware: OverviewReferenceHardware = OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  modelScope: OverviewModelScope = OVERVIEW_DEFAULT_MODEL_SCOPE,
): OverviewPageData {
  const current = assembleOverviewPageData(
    currentRowsByModel,
    tier,
    engineScope,
    referenceHardware,
    modelScope,
  );
  const baseline = assembleOverviewPageData(
    baselineRowsByModel,
    tier,
    engineScope,
    referenceHardware,
    modelScope,
  );
  const baselineByKey = new Map(
    baseline.models.flatMap((model) =>
      model.platforms.map((platform) => [overviewPlatformKey(model, platform), platform] as const),
    ),
  );

  return {
    ...current,
    comparisonMode: window.key,
    historicalWindow: window,
    models: current.models.map((model) => ({
      ...model,
      platforms: model.platforms.map((platform) => {
        if (platform.costPerMtok === null) return platform;

        const previous = baselineByKey.get(overviewPlatformKey(model, platform));
        const currentDate = overviewTierEvidenceDate(platform.read);
        if (currentDate === null || currentDate <= window.targetDate) {
          return {
            ...platform,
            historicalComparison: {
              status: 'no_newer_result',
              baselineCostPerMtok: previous?.costPerMtok ?? null,
              costDeltaPct: null,
              baselineDate: previous === undefined ? null : overviewTierEvidenceDate(previous.read),
              baselineConfig: previous?.read.config ?? null,
            },
          };
        }

        if (previous === undefined || previous.costPerMtok === null) {
          return {
            ...platform,
            historicalComparison: {
              status: 'no_baseline',
              baselineCostPerMtok: null,
              costDeltaPct: null,
              baselineDate: null,
              baselineConfig: null,
            },
          };
        }

        return {
          ...platform,
          historicalComparison: {
            status: 'comparable',
            baselineCostPerMtok: previous.costPerMtok,
            costDeltaPct: platform.costPerMtok / previous.costPerMtok - 1,
            baselineDate: overviewTierEvidenceDate(previous.read),
            baselineConfig: previous.read.config,
          },
        };
      }),
    })),
  };
}
