import type React from 'react';
import type { WorkerPower } from '@semianalysisai/inferencex-db/queries/benchmarks';

import type { HardwareEntry } from '@/lib/constants';
import type { Model, Sequence } from '@/lib/data-mappings';
import type { PowerTier } from '@/lib/power-tier';
import type { MetricKey } from './metric-registry';

export type { WorkerPower };

/**
 * Role of a single worker process in a multinode / disaggregated deployment.
 * - `prefill` / `decode`: the two halves of a disaggregated serving setup
 * - `agg`: an aggregated (non-disagg) worker that handles both phases
 * - `frontend`: a router / load-balancer process (typically zero GPUs)
 *
 * Carried on `WorkerPower.role` as `string` (not the literal union) because
 * the runner emits the role at the JSONB boundary — we can't statically
 * guarantee the value at the type system level. Consumers that switch on the
 * role should narrow via `if (role === 'prefill') ...` or a `WorkerRole`
 * cast at the point of use.
 */
export type WorkerRole = 'prefill' | 'decode' | 'agg' | 'frontend';

/**
 * Represents an aggregated data entry, typically from a raw data source.
 * This interface contains various performance metrics.
 * @interface AggDataEntry
 * @property {string} hw - Hardware name.
 * @property {string} [mtp] - Multi-tenancy parameter, if applicable.
 * @property {string} hwKey - Hardware key.
 * @property {number} tp - Throughput.
 * @property {number} conc - Concurrency.
 * @property {string} model - Model name.
 * @property {number} tput_per_gpu - Throughput per GPU.
 * @property {number} mean_ttft - Mean Time To First Token.
 * @property {number} median_ttft - Median Time To First Token.
 * @property {number} std_ttft - Standard deviation of Time To First Token.
 * @property {number} p99_ttft - 99th percentile of Time To First Token.
 * @property {number} mean_tpot - Mean Time Per Output Token.
 * @property {number} mean_intvty - Mean Interactivity.
 * @property {number} median_tpot - Median Time Per Output Token.
 * @property {number} median_intvty - Median Interactivity.
 * @property {number} std_tpot - Standard deviation of Time Per Output Token.
 * @property {number} std_intvty - Standard deviation of Interactivity.
 * @property {number} p99_tpot - 99th percentile of Time Per Output Token.
 * @property {number} p99_intvty - 99th percentile of Interactivity.
 * @property {number} mean_itl - Mean Inter-Token Latency.
 * @property {number} median_itl - Median Inter-Token Latency.
 * @property {number} std_itl - Standard deviation of Inter-Token Latency.
 * @property {number} p99_itl - 99th percentile of Inter-Token Latency.
 * @property {number} mean_e2el - Mean End-to-End Latency.
 * @property {number} median_e2el - Median End-to-End Latency.
 * @property {number} std_e2el - Standard deviation of End-to-End Latency.
 * @property {number} p99_e2el - 99th percentile of End-to-End Latency.
 */
export interface AggDataEntry {
  /** Metric keys present in the source row before missing values are normalized to zero. */
  rawMetricKeys?: string[];
  /** Stable per-point id from benchmark_results — for trace_replay lookups. */
  id?: number;
  /** Stable identity for recipe variants that share topology and concurrency. */
  recipe_fingerprint?: string;
  hw: string;
  mtp?: string;
  hwKey: string;
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
  // Measured GPU telemetry (emitted by runner's aggregate_power.py).
  // Optional because historical runs predate the fields.
  power_valid?: number;
  power_metric_schema_version?: number;
  /**
   * Certification tier for the measured power telemetry, derived by
   * `resolvePowerTier` in the transform: `certified` for producer-validated
   * rows (with whole-deployment energy semantics where applicable), `legacy`
   * for telemetry that predates the validation contract, absent when no
   * measured telemetry survives gating.
   */
  power_tier?: PowerTier;
  avg_power_w?: number;
  joules_per_successful_query?: number;
  joules_per_output_token?: number;
  joules_per_total_token?: number;
  // Multinode / disagg-only measured power. The aggregate_power.py runner
  // emits per-role energy splits when the deployment has separate prefill
  // and decode workers (single-node disagg or multinode disagg). Single-node
  // aggregated configs leave these undefined.
  // - prefill_avg_power_w / decode_avg_power_w: mean per-GPU draw (W) within each role
  // Unprefixed joules fields are whole-deployment metrics in schema version 2.
  // Explicit prefill/decode keys retain role-local energy breakdowns.
  prefill_avg_power_w?: number;
  decode_avg_power_w?: number;
  joules_per_input_token?: number;
  prefill_joules_per_input_token?: number;
  decode_joules_per_output_token?: number;
  // Cluster-wide GPU telemetry beyond power (temperature, utilization, memory).
  // Emitted by aggregate_power.py when the perfmon CSVs include the matching
  // sample columns. Optional because older runs (and runs without the relevant
  // perfmon samples) leave them unset — the chart layer must distinguish "no
  // measurement" from "0".
  avg_temp_c?: number;
  peak_temp_c?: number;
  avg_util_pct?: number;
  avg_mem_used_mb?: number;
  // Per-worker measured power breakdown. Each entry is one worker process
  // (a prefill, decode, agg, or frontend role). Optional because pre-multinode
  // and pre-aggregate_power.py runs don't emit it.
  workers?: WorkerPower[];
  disagg: boolean;
  num_prefill_gpu: number;
  num_decode_gpu: number;
  spec_decoding: string;
  ep?: number;
  /**
   * Pipeline parallelism (decode-side, mirroring how `ep` mirrors decode_ep).
   * Sourced from the metrics JSONB (`decode_pp`) — the configs table has no
   * pp columns — so it's only present on rows whose artifacts emitted it
   * (2026-07+). Undefined ⇒ treated as pp=1 everywhere (no label suffix).
   */
  pp?: number;
  dp_attention?: boolean | string;
  is_multinode?: boolean;
  prefill_tp?: number;
  prefill_ep?: number;
  /** Prefill-side pipeline parallelism — see {@link AggDataEntry.pp}. */
  prefill_pp?: number;
  prefill_dp_attention?: boolean | string;
  prefill_num_workers?: number;
  decode_tp?: number;
  decode_ep?: number;
  /** Decode-side pipeline parallelism — see {@link AggDataEntry.pp}. */
  decode_pp?: number;
  /** Prefill worker's decode-context parallel width, when emitted by the runtime. */
  prefill_dcp_size?: number;
  /** Decode worker's decode-context parallel width, when emitted by the runtime. */
  decode_dcp_size?: number;
  /** Prefill worker's prefill-context parallel width, when emitted by the runtime. */
  prefill_pcp_size?: number;
  /** Decode worker's prefill-context parallel width, when emitted by the runtime. */
  decode_pcp_size?: number;
  decode_dp_attention?: boolean | string;
  decode_num_workers?: number;
  image?: string;
  date: string;
  /** Actual benchmark run date from the DB (before date-picker override). */
  actualDate?: string;
  /** URL to the GitHub Actions workflow run that produced this data point. */
  run_url?: string;
  /** Benchmark scenario: `single_turn` (fixed-seq isl/osl) or `agentic_traces`. */
  benchmark_type?: string;
  /** ISL in tokens — null for agentic_traces. */
  isl?: number | null;
  /** OSL in tokens — null for agentic_traces. */
  osl?: number | null;
  // ── Runtime cache metadata (populated from metrics JSONB when emitted) ──
  /** "on" | "off" — whether KV cache offload to CPU was enabled. */
  offload_mode?: string;
  /** Offload tier/type, for example `dram` or `none`. */
  kv_offloading?: string;
  /** Offload implementation, for example `mooncake`, `lmcache`, or `hicache`. */
  kv_offload_backend?: string;
  /** Optional version independently declared for the offload backend. */
  kv_offload_backend_version?: string;
  /** P2P engine used to move KV state between workers on multinode runs. */
  kv_p2p_transfer?: string;
  /** Request router implementation, for example `vllm-router` or `sglang-router`. */
  router_name?: string;
  /** Version independently declared for the request router. */
  router_version?: string;
  /** Actual server-observed GPU prefix-cache hit rate (0..1). */
  server_gpu_cache_hit_rate?: number;
  /** Actual server-observed external/router prefix-cache hit rate (0..1). */
  server_external_cache_hit_rate?: number;
  /** Actual server-observed CPU prefix-cache hit rate (0..1). */
  server_cpu_cache_hit_rate?: number;
  /** Infinite-cache theoretical hit rate (0..1) computed from trace. */
  theoretical_cache_hit_rate?: number;
  /** Total requests attempted during the window. */
  num_requests_total?: number;
  /** Requests that completed successfully. */
  num_requests_successful?: number;
  /** Total prompt tokens served. */
  total_prompt_tokens?: number;
  /** Total generated (output) tokens. */
  total_generation_tokens?: number;
}

/**
 * Fields from AggDataEntry that need type overrides in InferenceData.
 */
type AggDataConflictKeys =
  | 'hwKey'
  | 'dp_attention'
  | 'prefill_dp_attention'
  | 'decode_dp_attention'
  | 'disagg'
  | 'num_prefill_gpu'
  | 'num_decode_gpu';

/**
 * Represents a single data point on a scatter plot.
 * Extends AggDataEntry (via Partial) so all raw benchmark fields flow through
 * automatically, plus adds chart-specific derived fields (x/y coordinates,
 * roofline metrics, cost calculations).
 */
export interface InferenceData extends Partial<Omit<AggDataEntry, AggDataConflictKeys>> {
  // Chart-specific derived fields
  x: number;
  y: number;
  roof?: boolean;
  hidden?: boolean;
  /**
   * Whether this point sits on the canonical
   * (E2E Normalized Interactivity, y-metric) Pareto frontier. Every agentic
   * x-axis reuses this exact winner set, so E2E latency, Interactivity, and
   * TTFT cannot introduce a locally-optimal point or remove a north-star
   * winner. Undefined for fixed-sequence data and y metrics without a
   * declared Pareto direction.
   */
  isOnNormalizedInteractivityFrontier?: boolean;

  // Overridden fields with narrower types
  hwKey: string;
  dp_attention?: boolean;
  prefill_dp_attention?: boolean;
  decode_dp_attention?: boolean;
  disagg?: boolean;
  num_prefill_gpu?: number;
  num_decode_gpu?: number;

  // Required fields (override Partial to keep required)
  date: string;
  tp: number;
  conc: number;
  precision: string;

  // Roofline metric fields
  tpPerGpu: { y: number; roof: boolean };
  outputTputPerGpu?: { y: number; roof: boolean };
  inputTputPerGpu?: { y: number; roof: boolean };
  /** Cache-aware gross token revenue using normalized or OpenRouter prices. */
  tokenRevenuePerGpuHour?: { y: number; roof: boolean };
  /** Gross token revenue scaled to one all-in utility MW running for a year. */
  tokenRevenuePerMwYear?: { y: number; roof: boolean };
  /** Token revenue minus tier TCO per all-in utility MW-year; may be negative. */
  tokenProfitPerMwYearH?: { y: number; roof: boolean };
  tokenProfitPerMwYearN?: { y: number; roof: boolean };
  tokenProfitPerMwYearR?: { y: number; roof: boolean };
  /** Total tokens produced per dollar of modeled infrastructure spend. */
  tokensPerDollarH?: { y: number; roof: boolean };
  tokensPerDollarN?: { y: number; roof: boolean };
  tokensPerDollarR?: { y: number; roof: boolean };
  tpPerMw: { y: number; roof: boolean };
  inputTputPerMw?: { y: number; roof: boolean };
  outputTputPerMw?: { y: number; roof: boolean };
  // Cost per million tokens.
  costh: { y: number; roof: boolean };
  costn: { y: number; roof: boolean };
  costr: { y: number; roof: boolean };
  costhOutput?: { y: number; roof: boolean };
  costnOutput?: { y: number; roof: boolean };
  costrOutput?: { y: number; roof: boolean };
  costhi: { y: number; roof: boolean };
  costni: { y: number; roof: boolean };
  costri: { y: number; roof: boolean };
  costUser?: { y: number; roof: boolean };
  // Tokens purchasable per $1.
  outputTokensPerDollarH?: { y: number; roof: boolean };
  outputTokensPerDollarN?: { y: number; roof: boolean };
  outputTokensPerDollarR?: { y: number; roof: boolean };
  inputTokensPerDollarH?: { y: number; roof: boolean };
  inputTokensPerDollarN?: { y: number; roof: boolean };
  inputTokensPerDollarR?: { y: number; roof: boolean };
  // Tokens purchasable per ¥1 — the $ metrics converted at USD_TO_CNY.
  tokensPerRmbH?: { y: number; roof: boolean };
  tokensPerRmbN?: { y: number; roof: boolean };
  tokensPerRmbR?: { y: number; roof: boolean };
  outputTokensPerRmbH?: { y: number; roof: boolean };
  outputTokensPerRmbN?: { y: number; roof: boolean };
  outputTokensPerRmbR?: { y: number; roof: boolean };
  inputTokensPerRmbH?: { y: number; roof: boolean };
  inputTokensPerRmbN?: { y: number; roof: boolean };
  inputTokensPerRmbR?: { y: number; roof: boolean };
  tokensPerDollarUser?: { y: number; roof: boolean };
  powerUser?: { y: number; roof: boolean };

  // All-in provisioned Joules per token
  jTotal?: { y: number; roof: boolean };
  jOutput?: { y: number; roof: boolean };
  jInput?: { y: number; roof: boolean };

  // Measured power / energy from runner GPU telemetry. Optional because
  // pre-aggregate_power.py runs (and runs with monitoring disabled) won't
  // emit these fields.
  measuredAvgPower?: { y: number; roof: boolean };
  measuredPrefillAvgPower?: { y: number; roof: boolean };
  measuredDecodeAvgPower?: { y: number; roof: boolean };
  measuredJPerOutputToken?: { y: number; roof: boolean };
  measuredJPerTotalToken?: { y: number; roof: boolean };
  measuredJPerInputToken?: { y: number; roof: boolean };
  measuredJPerSuccessfulQuery?: { y: number; roof: boolean };
  measuredWhPerSuccessfulQuery?: { y: number; roof: boolean };
  measuredPowerPercentTdp?: { y: number; roof: boolean };
}

/** Why a chart-ready point was intentionally excluded from the visible plot. */
export type ChartClipReason = 'cost' | 'latency';

/**
 * A filtered point retained only so the chart can explain that its Pareto
 * curve continues beyond an intentional display limit.
 */
export interface ClippedInferenceData {
  point: InferenceData;
  reasons: ChartClipReason[];
}

/**
 * Keys of InferenceData that have the roofline metric structure ({y, roof}).
 */
export type YAxisMetricKey = MetricKey;

export type TokenRevenuePriceSource = 'normalized' | 'openrouter';

export interface TokenRevenuePricing {
  source: TokenRevenuePriceSource;
  /** Published or assumed fresh input-token sale price, $/M tok. */
  inputPerMillion: number;
  /** Published or assumed cached input-token sale price, $/M tok. */
  cachedInputPerMillion?: number;
  /** Published or assumed output-token sale price, $/M tok. */
  outputPerMillion: number;
  /** Exact OpenRouter catalog id when `source` is `openrouter`. */
  openRouterModelId?: string;
}

/**
 * Defines the configuration and labels for a specific chart.
 * @interface ChartDefinition
 * @property {string} chartType - The type of chart (e.g., "scatter").
 * @property {string} heading - The main heading or title for the chart.
 * @property {keyof AggDataEntry} x - The key from `AggDataEntry` to be used for the x-axis data.
 * @property {string} x_label - The label for the x-axis.
 * @property {keyof AggDataEntry} y - The key from `AggDataEntry` to be used for the y-axis data.
 * @property {string} y_label - The label for the y-axis.
 * @property {'up' | 'down'} roofline - Specifies the direction of the roofline calculation (e.g., "up" for higher is better, "down" for lower is better).
 */
export type InferenceChartType = 'e2e' | 'interactivity';

export interface ChartDefinition {
  [key: string]: string | number | undefined;
  chartType: InferenceChartType;
  heading: string;
  x: keyof AggDataEntry;
  /** Resolved field represented by `InferenceData.x`; stable across locales. */
  x_scale_field: string;
  x_label: string;
  x_labelZh: string;
  y: keyof AggDataEntry;
  y_label?: string;

  y_cost_limit?: number;
  y_latency_limit?: number;
}

/**
 * Represents a graph that is ready to be rendered, containing its model, sequence,
 * chart definition, and the processed scatter data.
 * @interface RenderableGraph
 * @property {Model} model - The model associated with this graph.
 * @property {Sequence} sequence - The sequence associated with this graph.
 * @property {ChartDefinition} chartDefinition - The definition of the chart to be rendered.
 * @property {InferenceData[]} data - An array of `InferenceData` points to be plotted.
 */
export interface RenderableGraph {
  model: string;
  sequence: string;
  chartDefinition: ChartDefinition;
  data: InferenceData[];
  clippedData?: ClippedInferenceData[];
}
/**
 * Props for the {@link ScatterGraph} component.
 * @interface ScatterGraphProps
 * @property {string} modelLabel - The label for the model displayed on the graph.
 * @property {InferenceData[]} data - An array of `InferenceData` points to render.
 * @property {string} xLabel - The label for the x-axis of the graph.
 * @property {string} yLabel - The label for the y-axis of the graph.
 * @property {string} roofline - The identifier for the roofline to be displayed on the graph.
 */
/**
 * Represents overlay data for unofficial runs that should be displayed on top of official charts.
 */
export interface OverlayData {
  /** The data points to overlay */
  data: InferenceData[];
  /** Overlay points hidden by the same display limits as official data. */
  clippedData?: ClippedInferenceData[];
  /** Hardware configuration for the overlay data (may have different hardware types) */
  hardwareConfig: HardwareConfig;
  /** Fallback label — branch of the first loaded run. Used when {@link getRunForRow} is absent
   *  or returns undefined (legacy single-run callers). */
  label: string;
  /** Fallback URL — workflow URL of the first loaded run. */
  runUrl?: string;
  /**
   * Per-point run lookup. Returns `{ branch, url }` of the run that produced
   * the given overlay point. When multiple runs are loaded each point still
   * shows its own branch/URL in the tooltip rather than the first run's.
   */
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
  /**
   * When true, show all hardware types from the data without filtering by activeHwTypes.
   * Used for unofficial run visualization where hardware types may differ from official data.
   */
  showAllHardwareTypes?: boolean;
  /**
   * Optional hardware configuration override. When provided, this is used instead of the context's
   * hardwareConfig. Used for unofficial run visualization where hardware types may differ.
   */
  hardwareConfigOverride?: HardwareConfig;
  /**
   * Optional overlay data for unofficial runs. When provided, this data is rendered
   * on top of the official chart data with a distinct visual style (triangles).
   */
  overlayData?: OverlayData;
  /**
   * D3 transition duration in ms used when data or scales change. Defaults to
   * the regular 300ms interactive value. The replay panel passes 0 so frames
   * snap to interpolated positions instead of fighting an in-flight tween.
   */
  transitionDuration?: number;
  /**
   * Apply `.nice()` to x/y scale domains. Defaults to true. Replay disables
   * this so the domain endpoints shift continuously between frames instead of
   * snapping to rounded tick values (which produces visible "jumps" mid
   * playback).
   */
  niceAxes?: boolean;
  /**
   * Pin each line label to a stable anchor along its roofline so it tracks the
   * line smoothly instead of re-running the per-frame greedy placement (which
   * makes labels teleport between candidate positions as the lines animate).
   * Defaults to false. The replay panel passes true so labels keep a positional
   * "affinity" across frames. Trades the static chart's per-frame de-overlap for
   * positional stability — appropriate while the chart is animating.
   */
  pinLineLabels?: boolean;
  /**
   * Fixed x/y data extents `[min, max]` to base the axes on, instead of fitting
   * to the currently rendered points. The normal domain padding (and log /
   * zero-baseline handling) is still applied on top. Replay passes the whole
   * run's extent so the axes stay constant across the animation and you can see
   * the frontier expand toward them over time.
   */
  xExtentOverride?: [number, number];
  yExtentOverride?: [number, number];
  /**
   * Stable run numbering (entry string `date~rRunId` → 1-based number) shared with
   * the comparison changelog so legend labels match it exactly. Numbers index ALL
   * of a date's runs (not just the ones on the chart), so a removed run leaves a
   * gap that lines up with the changelog's still-listed "Add to chart" run. When
   * omitted, GPUGraph falls back to gap-free numbering of the on-chart series.
   */
  runNumbering?: Map<string, number>;
}
/**
 * @file types.ts
 * @description Defines TypeScript interfaces for inference performance data structures,
 * chart configurations, and context types used throughout the application.
 */

/**
 * Props for the {@link LegendItem} component.
 * @interface LegendItemProps
 * @property {string} hwKey - The unique key for the hardware type.
 * @property {string} hwName - The display name of the hardware.
 * @property {string} hwConfigColor - The color associated with the hardware configuration.
 * @property {string} gpuTitle - The title of the GPU.
 * @property {boolean} isActive - Indicates if the legend item is currently active/selected.
 * @property {(key: string) => void} onClick - Callback function when the legend item is clicked.
 */
export interface LegendItemProps {
  hwKey: string;
  hwName: string;
  hwConfigColor: string;
  gpuTitle: string;
  isActive: boolean;
  onClick: (key: string) => void;
}

/**
 * Represents information about a single workflow run by sequence.
 * @interface RunInfo
 * @property {string} runId - The unique identifier for the workflow run.
 * @property {string} runDate - The date when the workflow was run.
 * @property {string} runUrl - The URL where the workflow run details can be viewed.
 */
export interface RunInfo {
  runId: string;
  runDate: string;
  runUrl: string;
  conclusion: string | null;
  changelog?: ChangelogMetadata;
}

/** Deployment mode for quick filters. Multinode aggregate is not disaggregated serving. */
export type DeploymentMode = 'single-node' | 'multi-node' | 'disagg';
/** Speculative-decoding mode for the quick filters: MTP vs standard token prediction. */
export type SpecMode = 'mtp' | 'stp';

/**
 * Coarse vendor / framework / deployment / spec-decoding filters applied to the
 * chart point set. Empty array within a category = no constraint. Framework
 * values are engine-family keys ('vllm' | 'sglang' | 'trt' | 'atom'). See
 * `utils/quickFilters.ts`.
 */
export interface QuickFilters {
  vendors: string[];
  frameworks: string[];
  deployment: DeploymentMode[];
  spec: SpecMode[];
  /** Measured-power certification tiers (see `@/lib/power-tier`). */
  power: PowerTier[];
}

/**
 * The quick-filter values that actually have data for the current model /
 * sequence / precision. Drives which pills are shown (frameworks) or disabled
 * (vendor / deployment / spec). Same shape as {@link QuickFilters}.
 */
export type AvailableQuickFilters = QuickFilters;

/** Fetched and derived benchmark data shared by inference consumers. */
export interface InferenceDataContextType {
  hwTypesWithData: Set<string>;
  hardwareConfig: HardwareConfig;
  graphs: RenderableGraph[];
  loading: boolean;
  /** True while `graphs` shows previous-key data (placeholder) or a background
   *  refetch is in flight — i.e. content is visible but about to update. */
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

/** Inference-only workflow, filter, and date selection state. */
export interface InferenceFiltersContextType {
  activeHwTypes: Set<string>;
  bestPerSku: boolean;
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
}

/** Axis choices and visual presentation state. */
export interface InferenceDisplayContextType {
  selectedYAxisMetric: string;
  tokenRevenuePriceSource: TokenRevenuePriceSource;
  tokenRevenuePricing: TokenRevenuePricing | null;
  openRouterModelId: string | null;
  openRouterPricingLoading: boolean;
  openRouterPricingError: string | null;
  selectedPercentile: string;
  selectedXAxisMetric: string | null;
  selectedE2eXAxisMetric: string | null;
  selectedXAxisMode: 'ttft' | 'e2e' | 'interactivity' | 'e2e-normalized-interactivity';
  scaleType: 'auto' | 'linear' | 'log';
  isLegendExpanded: boolean;
  hideNonOptimal: boolean;
  showPointLabels: boolean;
  highContrast: boolean;
  logScale: boolean;
  useAdvancedLabels: boolean;
  showConcurrencyLabels: boolean;
  showGradientLabels: boolean;
  showLineLabels: boolean;
}

/** Stable commands that mutate inference state. */
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
  setSelectedPercentile: (percentile: string) => void;
  setSelectedXAxisMetric: (metric: string | null) => void;
  setSelectedXAxisMode: (
    mode: 'ttft' | 'e2e' | 'interactivity' | 'e2e-normalized-interactivity',
  ) => void;
  setScaleType: (type: 'auto' | 'linear' | 'log') => void;
  setQuickFilterVendors: (vendors: string[]) => void;
  setQuickFilterFrameworks: (frameworks: string[]) => void;
  setQuickFilterDeployment: (modes: DeploymentMode[]) => void;
  setQuickFilterSpec: (modes: SpecMode[]) => void;
  setQuickFilterPower: (tiers: PowerTier[]) => void;
  setIsLegendExpanded: (expanded: boolean) => void;
  setHideNonOptimal: (hide: boolean) => void;
  setShowPointLabels: (show: boolean) => void;
  setHighContrast: (highContrast: boolean) => void;
  setLogScale: (logScale: boolean) => void;
  setUseAdvancedLabels: (useAdvancedLabels: boolean) => void;
  setShowConcurrencyLabels: (showConcurrencyLabels: boolean) => void;
  setShowGradientLabels: (showGradientLabels: boolean) => void;
  setShowLineLabels: (showLineLabels: boolean) => void;
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

/**
 * Represents a single data point on a trend line (one date's metric value).
 */
export interface TrendDataPoint {
  date: string;
  value: number;
  /** The original x-axis value for tooltip context */
  x: number;
  /** True for synthetic points (e.g. carry-forward to today). Hidden from dots/tooltips. */
  synthetic?: boolean;
}

/**
 * Lightweight config descriptor for rendering trend chart lines.
 * Used to assign colors and labels to each line in TrendChart.
 */
export interface TrendLineConfig {
  /** Unique identifier matching the key in trendLines Map */
  id: string;
  hwKey: string;
  /** Display label for this line */
  label: string;
  /** CSS color for this line */
  color: string;
  /** Precision for shape rendering (circle=fp4, square=fp8, triangle=bf16, diamond=int4) */
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
