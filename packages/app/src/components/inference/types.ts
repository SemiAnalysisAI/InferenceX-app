import type React from 'react';
import type { PowerAudit, WorkerPower } from '@semianalysisai/inferencex-db/queries/benchmarks';

import type { HardwareEntry } from '@/lib/catalog/constants';
import type { Model, Sequence } from '@/lib/catalog/data-mappings';
import type { PowerTier } from '@/lib/power/power-tier';
import type { SystemPowerEstimate } from '@/lib/power/modeled-system-power';
import type { MetricKey } from './metric-registry';
import type { FixedSequenceStatistic } from './utils/resolveXAxisField';
import type { BlockedComparisonToggle } from './utils/comparison-exclusion';
import type { XAxisMode } from './hooks/chart-data-core';
import type { PowerBasis } from '@/lib/power/power-basis';
import type { TokenBasis } from '@/lib/benchmarks/benchmark-transform';

export type { WorkerPower };

export type WorkerRole = 'prefill' | 'decode' | 'agg' | 'frontend';

export interface AggDataEntry {
  trendSource?: TrendSource;
  rawMetricKeys?: string[];
  id?: number;
  recipe_fingerprint?: string;
  hw: string;
  mtp?: string;
  hwKey: string;
  physicalChips?: number;
  dp?: number;
  tp: number;
  conc: number;
  model: string;
  framework: string;
  precision: string;
  tput_per_gpu: number;
  output_tput_per_gpu: number;
  input_tput_per_gpu: number;
  mean_ttft: number;
  median_ttft: number;
  std_ttft: number;
  p75_ttft: number;
  p90_ttft: number;
  p95_ttft: number;
  p99_ttft: number;
  'p99.9_ttft': number;
  mean_tpot: number;
  mean_intvty: number;
  mean_tpot_intvty?: number;
  median_tpot: number;
  median_intvty: number;
  std_tpot: number;
  std_intvty: number;
  p75_tpot: number;
  p75_intvty: number;
  p90_tpot: number;
  p90_intvty: number;
  p95_tpot: number;
  p95_intvty: number;
  p99_tpot: number;
  p99_intvty: number;
  'p99.9_tpot': number;
  'p99.9_intvty': number;
  mean_itl: number;
  median_itl: number;
  std_itl: number;
  p75_itl: number;
  p90_itl: number;
  p95_itl: number;
  p99_itl: number;
  'p99.9_itl': number;
  mean_e2el: number;
  median_e2el: number;
  std_e2el: number;
  p75_e2el: number;
  p90_e2el: number;
  p95_e2el: number;
  p99_e2el: number;
  'p99.9_e2el': number;
  p75_e2e_norm_intvty?: number;
  p90_e2e_norm_intvty?: number;
  power_valid?: number;
  power_invalid_reasons?: string[];
  power_audit?: PowerAudit;
  power_metric_schema_version?: number;
  power_tier?: PowerTier;
  avg_power_w?: number;
  p75_power_w?: number;
  p90_power_w?: number;
  modeledSystemPower?: SystemPowerEstimate;
  joules_per_successful_query?: number;
  joules_per_output_token?: number;
  joules_per_total_token?: number;
  prefill_avg_power_w?: number;
  decode_avg_power_w?: number;
  joules_per_input_token?: number;
  prefill_joules_per_input_token?: number;
  decode_joules_per_output_token?: number;
  avg_temp_c?: number;
  peak_temp_c?: number;
  avg_util_pct?: number;
  avg_mem_used_mb?: number;
  workers?: WorkerPower[];
  disagg: boolean;
  num_prefill_gpu: number;
  num_decode_gpu: number;
  spec_decoding: string;
  ep?: number;
  pp?: number;
  dp_attention?: boolean | string;
  is_multinode?: boolean;
  prefill_tp?: number;
  prefill_ep?: number;
  prefill_pp?: number;
  prefill_dp_attention?: boolean | string;
  prefill_num_workers?: number;
  decode_tp?: number;
  decode_ep?: number;
  decode_pp?: number;
  prefill_dcp_size?: number;
  decode_dcp_size?: number;
  prefill_pcp_size?: number;
  prefill_dwdp_size?: number;
  decode_pcp_size?: number;
  decode_dp_attention?: boolean | string;
  decode_num_workers?: number;
  image?: string;
  date: string;
  actualDate?: string;
  run_url?: string;
  curve_date?: string;
  curve_workflow_run_id?: number;
  benchmark_type?: string;
  isl?: number | null;
  osl?: number | null;
  offload_mode?: string;
  kv_offloading?: string;
  kv_offload_backend?: string;
  kv_offload_backend_version?: string;
  kv_p2p_transfer?: string;
  router_name?: string;
  router_version?: string;
  server_gpu_cache_hit_rate?: number;
  server_external_cache_hit_rate?: number;
  server_cpu_cache_hit_rate?: number;
  theoretical_cache_hit_rate?: number;
  num_requests_total?: number;
  num_requests_successful?: number;
  total_prompt_tokens?: number;
  total_generation_tokens?: number;
}

type AggDataConflictKeys =
  | 'hwKey'
  | 'dp_attention'
  | 'prefill_dp_attention'
  | 'decode_dp_attention'
  | 'disagg'
  | 'num_prefill_gpu'
  | 'num_decode_gpu';

export interface InferenceData extends Partial<Omit<AggDataEntry, AggDataConflictKeys>> {
  x: number;
  y: number;
  roof?: boolean;
  hidden?: boolean;
  isOnNormalizedInteractivityFrontier?: boolean;

  hwKey: string;
  dp_attention?: boolean;
  prefill_dp_attention?: boolean;
  decode_dp_attention?: boolean;
  disagg?: boolean;
  num_prefill_gpu?: number;
  num_decode_gpu?: number;

  date: string;
  tp: number;
  conc: number;
  precision: string;

  tpPerGpu: { y: number; roof: boolean };
  outputTputPerGpu?: { y: number; roof: boolean };
  inputTputPerGpu?: { y: number; roof: boolean };
  tokenRevenuePerGpuHour?: { y: number; roof: boolean };
  tokensPerDollarH?: { y: number; roof: boolean };
  tokensPerDollarR?: { y: number; roof: boolean };
  tpPerMw: { y: number; roof: boolean };
  inputTputPerMw?: { y: number; roof: boolean };
  outputTputPerMw?: { y: number; roof: boolean };
  costh: { y: number; roof: boolean };
  costr: { y: number; roof: boolean };
  costhOutput?: { y: number; roof: boolean };
  costrOutput?: { y: number; roof: boolean };
  costhi: { y: number; roof: boolean };
  costri: { y: number; roof: boolean };
  costUser?: { y: number; roof: boolean };
  outputTokensPerDollarH?: { y: number; roof: boolean };
  outputTokensPerDollarR?: { y: number; roof: boolean };
  inputTokensPerDollarH?: { y: number; roof: boolean };
  inputTokensPerDollarR?: { y: number; roof: boolean };
  tokensPerDollarUser?: { y: number; roof: boolean };
  powerUser?: { y: number; roof: boolean };

  jTotal?: { y: number; roof: boolean };
  jOutput?: { y: number; roof: boolean };
  jInput?: { y: number; roof: boolean };

  measuredAvgPower?: { y: number; roof: boolean };
  measuredP75Power?: { y: number; roof: boolean };
  measuredP90Power?: { y: number; roof: boolean };
  measuredPrefillAvgPower?: { y: number; roof: boolean };
  measuredDecodeAvgPower?: { y: number; roof: boolean };
  measuredJPerOutputToken?: { y: number; roof: boolean };
  measuredJPerTotalToken?: { y: number; roof: boolean };
  measuredJPerInputToken?: { y: number; roof: boolean };
  measuredPrefillJPerInputToken?: { y: number; roof: boolean };
  measuredDecodeJPerOutputToken?: { y: number; roof: boolean };
  measuredJPerSuccessfulQuery?: { y: number; roof: boolean };
  measuredWhPerSuccessfulQuery?: { y: number; roof: boolean };
  measuredPowerPercentTdp?: { y: number; roof: boolean };
  measuredPowerTimeline?: { y: number; roof: boolean };
  reconstructedPrefillJPerOutputToken?: { y: number; roof: boolean };
  powerVariant?: PowerVariant;

  gpuProvisionedJPerOutputToken?: { y: number; roof: boolean };
  gpuProvisionedJPerTotalToken?: { y: number; roof: boolean };
  utilityProvisionedJPerOutputToken?: { y: number; roof: boolean };
  utilityProvisionedJPerTotalToken?: { y: number; roof: boolean };
  itModeledWatts?: { y: number; roof: boolean };
  itModeledJPerOutputToken?: { y: number; roof: boolean };
  itModeledJPerTotalToken?: { y: number; roof: boolean };
  utilityModeledWatts?: { y: number; roof: boolean };
  utilityModeledJPerOutputToken?: { y: number; roof: boolean };
  utilityModeledJPerTotalToken?: { y: number; roof: boolean };
}

/**
 * `boundaries`: GPU only, IT (no PUE) and Facility. `all`: also the two rated provisioned
 * bounds. `roles`: prefill vs decode GPUs. `breakdown`: the PowerX Where the power goes
 * view (per-chip stacks at one interactivity); it overlays no series on the chart.
 */
export type PowerCompare = 'none' | 'boundaries' | 'provisioned' | 'all' | 'roles' | 'breakdown';
export type PowerRole = 'all' | 'prefill' | 'decode';
export type PowerVariant = { kind: 'basis'; id: PowerBasis } | { kind: 'role'; id: PowerRole };

export type PowerBasisFieldKey =
  | 'gpuProvisionedJPerOutputToken'
  | 'gpuProvisionedJPerTotalToken'
  | 'utilityProvisionedJPerOutputToken'
  | 'utilityProvisionedJPerTotalToken'
  | 'itModeledWatts'
  | 'itModeledJPerOutputToken'
  | 'itModeledJPerTotalToken'
  | 'utilityModeledWatts'
  | 'utilityModeledJPerOutputToken'
  | 'utilityModeledJPerTotalToken';

export type { PowerBasis } from '@/lib/power/power-basis';

export type ChartClipReason = 'cost' | 'latency';

export interface ClippedInferenceData {
  point: InferenceData;
  reasons: ChartClipReason[];
}

export type YAxisMetricKey = MetricKey;

export type TokenRevenuePriceSource = 'normalized' | 'openrouter';

export interface TokenRevenuePricing {
  source: TokenRevenuePriceSource;
  inputPerMillion: number;
  cachedInputPerMillion?: number;
  outputPerMillion: number;
  openRouterModelId?: string;
}

export type InferenceChartType = 'e2e' | 'interactivity';

export interface ChartDefinition {
  [key: string]: string | number | undefined;
  chartType: InferenceChartType;
  heading: string;
  x: keyof AggDataEntry;
  x_scale_field: string;
  x_label: string;
  x_labelZh: string;
  y: keyof AggDataEntry;
  y_label?: string;

  y_cost_limit?: number;
  y_latency_limit?: number;
}

export interface RenderableGraph {
  model: string;
  sequence: string;
  chartDefinition: ChartDefinition;
  data: InferenceData[];
  tableData?: InferenceData[];
  clippedData?: ClippedInferenceData[];
}
export interface OverlayData {
  data: InferenceData[];
  tableData?: InferenceData[];
  clippedData?: ClippedInferenceData[];
  hardwareConfig: HardwareConfig;
  label: string;
  runUrl?: string;
  getRunForRow?: (row: InferenceData) => { branch: string; url: string } | undefined;
}

export interface ScatterGraphProps {
  chartId: string;
  modelLabel: string;
  data: InferenceData[];
  clippedData?: ClippedInferenceData[];
  xLabel: string;
  yLabel: string;
  chartDefinition: ChartDefinition;
  caption?: React.ReactNode;
  footer?: React.ReactNode;
  onShowTable?: () => void;
  showAllHardwareTypes?: boolean;
  hardwareConfigOverride?: HardwareConfig;
  overlayData?: OverlayData;
  transitionDuration?: number;
  niceAxes?: boolean;
  pinLineLabels?: boolean;
  xExtentOverride?: [number, number];
  yExtentOverride?: [number, number];
  runNumbering?: Map<string, number>;
  /** Plot height in px; the default is the shared 600 px chart height. */
  plotHeight?: number;
}

export interface LegendItemProps {
  hwKey: string;
  hwName: string;
  hwConfigColor: string;
  gpuTitle: string;
  isActive: boolean;
  onClick: (key: string) => void;
}

export interface RunInfo {
  runId: string;
  runDate: string;
  runUrl: string;
  conclusion: string | null;
  changelog?: ChangelogMetadata;
}

export type DeploymentMode = 'single-node' | 'multi-node' | 'disagg';
export type SpecMode = 'mtp' | 'stp';

export interface QuickFilters {
  vendors: string[];
  frameworks: string[];
  deployment: DeploymentMode[];
  spec: SpecMode[];
  power: PowerTier[];
  topologies?: string[];
}

export type AvailableQuickFilters = QuickFilters;

export interface InferenceDataContextType {
  hwTypesWithData: Set<string>;
  hardwareConfig: HardwareConfig;
  graphs: RenderableGraph[];
  selectionPoints: InferenceData[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  availableQuickFilters: AvailableQuickFilters;
  availableGPUs: { value: string; label: string }[];
  availableDates: string[];
  dateRangeAvailableDates: string[];
  isCheckingAvailableDates: boolean;
  availableRuns: Record<string, RunInfo>;
  availablePrecisions: string[];
  availableSequences: Sequence[];
  availableModels: string[];
}

export interface InferenceFiltersContextType {
  activeHwTypes: Set<string>;
  bestPerSku: boolean;
  /** Inactive hardware keys whose legend toggle the engine exclusion blocks. */
  blockedHwToggles: ReadonlyMap<string, BlockedComparisonToggle>;
  selectedModel: Model;
  selectedSequence: Sequence;
  selectedPrecisions: string[];
  quickFilters: QuickFilters;
  selectedGPUs: string[];
  selectedDates: string[];
  selectedDateRange: { startDate: string; endDate: string };
  activeDates: Set<string>;
  userCosts: Record<string, number | undefined> | null;
  selectedRunDate: string;
  selectedRunId: string;
  userPowers: Record<string, number | undefined> | null;
  activePresetId: string | null;
  presetGuardRef: React.RefObject<boolean>;
  compareGpuPair: readonly [string, string] | null;
  lockedFrameworks: readonly string[] | null;
  minimalChrome: boolean;
}

export interface InferenceDisplayContextType {
  selectedYAxisMetric: string;
  tokenRevenuePriceSource: TokenRevenuePriceSource;
  tokenRevenuePricing: TokenRevenuePricing | null;
  openRouterModelId: string | null;
  openRouterPricingLoading: boolean;
  openRouterPricingError: string | null;
  selectedPercentile: string;
  fixedSequenceStatistic: FixedSequenceStatistic;
  tokenBasis: TokenBasis;
  selectedXAxisMetric: string | null;
  selectedE2eXAxisMetric: string | null;
  selectedXAxisMode: XAxisMode;
  defaultXAxisMode: XAxisMode;
  scaleType: 'auto' | 'linear' | 'log';
  powerCompare: PowerCompare;
  isLegendExpanded: boolean;
  hideNonOptimal: boolean;
  showPointLabels: boolean;
  highContrast: boolean;
  logScale: boolean;
  useAdvancedLabels: boolean;
  showConcurrencyLabels: boolean;
  showOffloadingLabel: boolean;
  showGradientLabels: boolean;
  showLineLabels: boolean;
  showParetoFrontier: boolean;
  paretoFrontierPlayful: boolean;
}

export interface InferenceActionsContextType {
  toggleActiveDate: (date: string) => void;
  removeActiveDate: (date: string) => void;
  selectAllActiveDates: () => void;
  toggleHwType: (hw: string) => void;
  removeHwType: (hw: string) => void;
  selectAllHwTypes: () => void;
  setBestPerSku: (enabled: boolean, options?: { applySelection?: boolean }) => void;
  resolveComparisonSelection: (
    proposed: Set<string>,
    prev?: Set<string>,
  ) => { result: Set<string>; keptGroup: string | null; droppedGroups: string[] };
  toggleComparisonSelection: (
    prev: Set<string>,
    item: string,
    allItems: Set<string>,
  ) => Set<string> | null;
  setSelectedModel: (model: Model) => void;
  setSelectedSequence: (sequence: Sequence) => void;
  setSelectedPrecisions: (precisions: string[]) => void;
  setSelectedYAxisMetric: (metric: string) => void;
  setTokenRevenuePriceSource: (source: TokenRevenuePriceSource) => void;
  setFixedSequenceStatistic: (statistic: FixedSequenceStatistic) => void;
  setTokenBasis: (basis: TokenBasis) => void;
  setSelectedXAxisMetric: (metric: string | null) => void;
  setSelectedXAxisMode: (mode: XAxisMode) => void;
  setScaleType: (type: 'auto' | 'linear' | 'log') => void;
  setPowerCompare: (mode: PowerCompare) => void;
  setQuickFilterVendors: (vendors: string[]) => void;
  setQuickFilterFrameworks: (frameworks: string[]) => void;
  setQuickFilterDeployment: (modes: DeploymentMode[]) => void;
  setQuickFilterSpec: (modes: SpecMode[]) => void;
  setQuickFilterPower: (tiers: PowerTier[]) => void;
  setQuickFilterTopologies: (topologies: string[]) => void;
  setIsLegendExpanded: (expanded: boolean) => void;
  setHideNonOptimal: (hide: boolean) => void;
  setShowPointLabels: (show: boolean) => void;
  setHighContrast: (highContrast: boolean) => void;
  setLogScale: (logScale: boolean) => void;
  setUseAdvancedLabels: (useAdvancedLabels: boolean) => void;
  setShowConcurrencyLabels: (showConcurrencyLabels: boolean) => void;
  setShowOffloadingLabel: (show: boolean) => void;
  setShowGradientLabels: (showGradientLabels: boolean) => void;
  setShowLineLabels: (showLineLabels: boolean) => void;
  setShowParetoFrontier: (show: boolean) => void;
  setSelectedGPUs: (gpus: string[]) => void;
  setSelectedDates: (dates: string[] | ((prev: string[]) => string[])) => void;
  setSelectedDatesFromRunExpansion: (dates: string[] | ((prev: string[]) => string[])) => void;
  setSelectedDateRange: (dateRange: { startDate: string; endDate: string }) => void;
  setUserCosts: (userCosts: Record<string, number | undefined> | null) => void;
  setSelectedRunDate: (date: string) => void;
  setSelectedRunId: (runId: string) => void;
  setUserPowers: (userPowers: Record<string, number | undefined> | null) => void;
  setHwFilter: (filter: string[] | null) => void;
  setActivePresetId: (id: string | null) => void;
}
export interface CalculateUserCostsRequest {
  model: string;
  sequence: string;
  precision: string;
  userCosts: Record<string, number | undefined>;
}

export interface CalculateUserCostsResponse {
  success: boolean;
  data?: InferenceData[][];
  error?: string;
}
export type UserCostInputs = Record<string, string | undefined>;

export type HardwareConfig = Record<string, HardwareEntry>;

export interface TrendSource {
  date: string;
  runId: number;
  runUrl: string;
  model: string;
  precision: string;
  hwKey: string;
  benchmarkType: 'single_turn' | 'agentic_traces';
}

export interface TrendDataPoint {
  date: string;
  value: number;
  x: number;
  synthetic?: boolean;
  sources?: TrendSource[];
  /** False when a legacy fallback would make a waterfall comparison ambiguous. */
  waterfallEligible?: boolean;
}

export interface TrendLineConfig {
  id: string;
  hwKey: string;
  label: string;
  color: string;
  precision?: string;
}

export interface ChangelogMetadata {
  base_ref?: string;
  head_ref?: string;
  entries: {
    config_keys: string[];
    description: string;
    pr_link: string | null;
    head_ref?: string;
    evals_only?: boolean;
    append_only?: boolean;
  }[];
}
