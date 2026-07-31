import { resolveFrameworkPartLabel } from '@semianalysisai/inferencex-constants';

import { restrictAgenticPointsToE2eFrontier } from './agentic-frontier';
import type { BenchmarkRow } from './api';
import { rowToAggDataEntry } from './benchmark-transform';
import { buildAvailabilityHwKey } from './chart-utils';
import { getGpuSpecs, getHardwareConfig } from './constants';
import { DEFAULT_MODELS, getModelLabel, Model, Precision } from './data-mappings';
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
export type OverviewEngineScope = 'all' | 'community';
export type OverviewScenario = 'single_turn_8k1k' | 'agentx';
/** Row order within a model: the single-turn workload first, AgentX below it. */
export const OVERVIEW_SCENARIOS = ['single_turn_8k1k', 'agentx'] as const;

export function resolveOverviewEngineScope(
  raw: string | string[] | undefined,
): OverviewEngineScope {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  return candidate === 'all' ? 'all' : 'community';
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
  | 'no_scenario_data'
  | 'cannot_reach_at_tier'
  | 'no_exact_at_tier';

export const OVERVIEW_HARDWARE = ['b200', 'mi355x', 'b300', 'gb200', 'gb300'] as const;

export interface OverviewPlatformResult {
  hardware: string;
  hardwareLabel: string;
  precision: string | null;
  read: OverviewTierRead;
  missingReason: OverviewMissingReason | null;
  /** $ per million TOTAL (input + output) tokens at the hyperscaler $/GPU/hr
   *  tier (`HW_REGISTRY.costh`). */
  costPerMtok: number | null;
  /** Cost delta vs this row's B200 cell; negative = cheaper. Null on the B200
   *  cell itself and whenever either cost is unavailable. */
  costVsB200Pct: number | null;
}

export interface OverviewModelSummary {
  model: Model;
  modelLabel: string;
  scenario: OverviewScenario;
  platforms: OverviewPlatformResult[];
}

export interface OverviewPageData {
  models: OverviewModelSummary[];
  tier: OverviewTier;
  engineScope: OverviewEngineScope;
}

const OVERVIEW_SLICE_PRIORITY = [
  { speculative: true, precision: Precision.FP4 },
  { speculative: true, precision: Precision.FP8 },
  { speculative: false, precision: Precision.FP4 },
  { speculative: false, precision: Precision.FP8 },
] as const;
const OVERVIEW_PRECISIONS: readonly string[] = [Precision.FP4, Precision.FP8];
const OVERVIEW_HARDWARE_LABELS: Readonly<Record<string, string>> = {
  gb200: 'GB200',
  gb300: 'GB300',
};

function overviewHardwareLabel(hardware: string, model: Model): string {
  return OVERVIEW_HARDWARE_LABELS[hardware] ?? getHardwareConfig(hardware, model).label;
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
  [Model.Kimi_K2_5]: ['single_turn_8k1k'],
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

function overviewServingSeriesKey(row: BenchmarkRow): string {
  return JSON.stringify([
    row.model,
    row.hardware,
    row.framework,
    row.spec_method,
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
    const latestRows = configRows.filter((row) => row.date === latestDate);
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
    .map((config): ConfigTierRead => ({ ...readConfigAtTier(config, tier), config }));

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

  const b200Cost = platforms.find((platform) => platform.hardware === 'b200')?.costPerMtok ?? null;
  return platforms.map((platform) => ({
    ...platform,
    costVsB200Pct:
      platform.hardware === 'b200' || b200Cost === null || platform.costPerMtok === null
        ? null
        : platform.costPerMtok / b200Cost - 1,
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
  const { hardware, framework, spec_method: specMethod, disagg, is_multinode: isMultinode } = first;
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
): OverviewModelSummary {
  const scopedRows = overviewEngineRows(rows, engineScope);
  const scenarioRows = overviewScenarioRows(scenario, scopedRows);
  return {
    model,
    modelLabel: getModelLabel(model),
    scenario,
    platforms: buildPlatformResults(model, scenario, scenarioRows, tier),
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
): OverviewPageData {
  const perModel = [...DEFAULT_MODELS].map((model) => ({ model, rows: rowsByModel[model] ?? [] }));
  return {
    models: perModel.flatMap(({ model, rows }) =>
      overviewScenariosForModel(model, rows).map((scenario) =>
        buildOverviewModelSummary(model, rows, tier, engineScope, scenario),
      ),
    ),
    tier,
    engineScope,
  };
}
