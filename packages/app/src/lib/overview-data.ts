import { resolveFrameworkPartLabel } from '@semianalysisai/inferencex-constants';

import { restrictAgenticPointsToE2eFrontier } from './agentic-frontier';
import type { BenchmarkRow } from './api';
import { rowToAggDataEntry } from './benchmark-transform';
import { buildAvailabilityHwKey } from './chart-utils';
import { getGpuSpecs, getHardwareConfig } from './constants';
import {
  DEFAULT_MODELS,
  DEPRECATED_MODELS,
  getModelCategory,
  getModelLabel,
  MAINTENANCE_MODELS,
  Model,
  Precision,
  type CategoryTag,
} from './data-mappings';
import { frameworkFamily } from './framework-family';
import {
  computeTierReads,
  singleTurnInteractivity,
  type TcoTierBoundary,
  type TcoTierPoint,
  type TcoTierRead,
} from './tco-feed';

export const OVERVIEW_WORKLOAD = { isl: 8192, osl: 1024 } as const;
export const OVERVIEW_TIERS = [30, 50, 75, 100, 150, 200] as const;
export type OverviewTier = (typeof OVERVIEW_TIERS)[number];
export const OVERVIEW_PRIMARY_TIER = 50;
export const OVERVIEW_HARDWARE = ['b200', 'mi355x', 'b300', 'gb200', 'gb300'] as const;
export type OverviewReferenceHardware = (typeof OVERVIEW_HARDWARE)[number];
export const OVERVIEW_DEFAULT_REFERENCE_HARDWARE: OverviewReferenceHardware = 'b200';
export type OverviewEngineScope = 'all' | 'community';
export const OVERVIEW_HISTORY_WINDOWS = ['7d', '30d', '60d', '90d'] as const;
export type OverviewHistoryWindowKey = (typeof OVERVIEW_HISTORY_WINDOWS)[number];
export const OVERVIEW_DEFAULT_HISTORY_WINDOW: OverviewHistoryWindowKey = '30d';
export const OVERVIEW_HISTORY_WINDOW_DAYS: Record<OverviewHistoryWindowKey, number> = {
  '7d': 7,
  '30d': 30,
  '60d': 60,
  '90d': 90,
};
/** A history mode IS its window key, so `?compare=<key>` alone determines the
 *  payload and every href/caching path threads the window with no extra param. */
export type OverviewComparisonMode = 'hardware' | OverviewHistoryWindowKey;
export const OVERVIEW_DEFAULT_COMPARISON_MODE: OverviewComparisonMode = 'hardware';
export type OverviewModelScope = 'default' | 'all';
export const OVERVIEW_DEFAULT_MODEL_SCOPE: OverviewModelScope = 'default';
export type OverviewScenario = 'single_turn_8k1k' | 'agentx';
/** Row order within a model: the single-turn workload first, AgentX below it. */
export const OVERVIEW_SCENARIOS = ['single_turn_8k1k', 'agentx'] as const;

export function resolveOverviewEngineScope(
  raw: string | string[] | undefined,
): OverviewEngineScope {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  return candidate === 'all' ? 'all' : 'community';
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

// Note (wenyao): row order is a contract — defaults, then maintenance, then
// deprecated, each in MODEL_CONFIG declaration order; the overview e2e asserts
// inactive rows always sit below the default rows.
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
  /** Total (input + output) tok/s per DEPLOYED GPU on the frontier at `tier` —
   *  the overview's cost basis; null when the tier is not comparable. */
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
 *  contribute points, while release/framework/spec/precision/deployment stay exact. */
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

/** What actually reaches the client. `tierValues` is the interpolation input —
 *  the server reads it to produce a tier's value and nothing renders it, so it
 *  is stripped before serialization rather than shipped and ignored. */
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

/** Why a platform shows `∞`. `cannot_reach_at_tier` = every
 *  eligible serving series tops out below the tier; `no_exact_at_tier` = merely
 *  under-swept. */
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
  /** Exact serving envelope that produced the historical value. */
  baselineConfig: OverviewConfigView | null;
}

export interface OverviewPlatformResult {
  hardware: string;
  hardwareLabel: string;
  precision: string | null;
  read: OverviewTierRead;
  missingReason: OverviewMissingReason | null;
  /** $ per million TOTAL (input + output) tokens at the hyperscaler $/GPU/hr
   *  tier (`HW_REGISTRY.costh`). */
  costPerMtok: number | null;
  /** Cost delta vs this row's selected reference cell; negative = cheaper.
   *  Null on the reference cell itself and whenever either cost is unavailable. */
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
      .map((row) => row.date);
  });
  return dates.length === 0 ? null : (dates.toSorted().at(-1) ?? null);
}

/** Baseline band is one window-width wide ([snapshot−2w, snapshot−w]): wide
 *  enough that a benchmark cadence sparser than the window still finds a
 *  baseline, without ever reaching into results newer than the window. */
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
/** The registry label verbatim, rack SKU included — the matrix says
 *  "GB200 NVL72", not "GB200", so a rack part is never read as a board. */
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
  return model === Model.Kimi_K3 || model === Model.GLM_5_2 ? 'agentx' : 'single_turn_8k1k';
}

/**
 * Which scenarios each model is shown under, curated rather than derived: a
 * model can hold rows for a scenario the overview does not want to headline
 * for it, so presence of data alone must not add a row. Models listed with
 * both get one matrix row each, in OVERVIEW_SCENARIOS order.
 */
const OVERVIEW_MODEL_SCENARIOS: Partial<Record<Model, readonly OverviewScenario[]>> = {
  [Model.DeepSeek_V4_Pro]: ['single_turn_8k1k', 'agentx'],
  [Model.MiniMax_M3]: ['single_turn_8k1k', 'agentx'],
  [Model.Qwen3_5]: ['single_turn_8k1k', 'agentx'],
  [Model.Kimi_K3]: ['agentx'],
  [Model.GLM_5_2]: ['agentx'],
};

/** The scenarios this model gets a row for. Unlisted models keep the single
 *  data-derived scenario, so a new model renders one row until curated. */
export function overviewScenariosForModel(
  model: Model,
  rows: readonly BenchmarkRow[] = [],
): OverviewScenario[] {
  const curated = OVERVIEW_MODEL_SCENARIOS[model];
  return curated === undefined
    ? [overviewScenarioForModel(model, rows)]
    : // Normalized through OVERVIEW_SCENARIOS so row order stays single-turn
      // first however an entry above happens to be written.
      OVERVIEW_SCENARIOS.filter((scenario) => curated.includes(scenario));
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

/** Stable identity for one Overview serving envelope across topology points. */
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

/** Chart-equivalent serving series: topology variants are points on one curve. */
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
      (latest, row) => (row.date > latest ? row.date : latest),
      configRows[0].date,
    );
    let latestRows = configRows.filter((row) => row.date === latestDate);
    if (scenario === 'agentx' && latestRows.some((row) => row.workflow_run_id !== undefined)) {
      const winningRow = latestRows.reduce((winner, row) => {
        const startedAt = row.run_started_at ?? '';
        const winnerStartedAt = winner.run_started_at ?? '';
        if (startedAt !== winnerStartedAt) return startedAt > winnerStartedAt ? row : winner;
        return (row.workflow_run_id ?? Number.NEGATIVE_INFINITY) >
          (winner.workflow_run_id ?? Number.NEGATIVE_INFINITY)
          ? row
          : winner;
      });
      latestRows = latestRows.filter((row) => row.workflow_run_id === winningRow.workflow_run_id);
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

/** In-range reads only: a clamped or unreachable read remains a coverage gap. */
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
    : { ...read, value: null, estimated: false, evidenceDate: null, evidenceTopologies: [] };
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
  // `cannot reach` is a claim about the whole platform, so it holds only when
  // EVERY qualified serving series tops out below the tier — one merely
  // under-swept stack downgrades the gap to a missing exact read.
  return bucketReads.every((r) => r.boundary === 'unreachable')
    ? 'cannot_reach_at_tier'
    : 'no_exact_at_tier';
}

/**
 * The overview's cost contract:
 *
 *   $ / 1M total tokens = HW_REGISTRY.costh × 1,000,000
 *                       ÷ (total tok/s per deployed GPU × 3,600)
 *
 * `costh` is the HYPERSCALER $/GPU/hr tier (not neocloud `costn` or retail
 * `costr`), and the denominator counts TOTAL (input + output) tokens over
 * every deployed GPU — prefill + decode for disaggregated serving.
 */
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

/** AgentX: the tier axis stays P90 interactivity (the chart's SLA contract);
 *  the throughput read at the tier is total tok/s per deployed GPU. */
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
        date: row.date,
        evidenceLabel: topologyEvidence(row),
      },
    ];
  });
  return computeTierReads(restrictAgenticPointsToE2eFrontier(points), OVERVIEW_TIERS);
}

/** Single-turn 8K/1K: frontier points at the chart's stored interactivity,
 *  valued in total (input + output) tok/s per DEPLOYED GPU. Rows without a
 *  usable total-throughput metric are dropped — the overview cannot price
 *  them, so they must not shape the frontier either. */
function buildSingleTurnTierReads(rows: readonly BenchmarkRow[]): TcoTierRead[] {
  const points = rows.flatMap((row): TcoTierPoint[] => {
    const interactivity = singleTurnInteractivity(row.metrics);
    const totalTput = row.metrics.tput_per_gpu;
    if (interactivity === undefined || !Number.isFinite(totalTput) || totalTput <= 0) return [];
    return [
      {
        interactivity,
        throughput: totalTput * deployedGpuFactor(row),
        date: row.date,
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

/** DEFAULT_MODELS fixes the row order, and a model benchmarked on both
 *  scenarios contributes one row per scenario; a rowless model still renders
 *  all platforms with missing reasons. Live and fixture paths both feed this.
 *  Scenario presence reads the unscoped rows so switching the engine scope
 *  changes cell contents, never the shape of the matrix. */
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
    models: perModel.flatMap(({ model, rows }) =>
      overviewScenariosForModel(model, rows).map((scenario) =>
        buildOverviewModelSummary(model, rows, tier, engineScope, scenario, referenceHardware),
      ),
    ),
    tier,
    engineScope,
    comparisonMode: OVERVIEW_DEFAULT_COMPARISON_MODE,
    referenceHardware,
    modelScope,
    historicalWindow: null,
  };
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
