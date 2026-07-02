import type React from 'react';

import type { Model, Sequence } from '@/lib/data-mappings';
import type {
  ChartDefinition,
  HardwareConfig,
  InferenceData,
  RenderableGraph,
} from '@/lib/chart-types';

// ---------------------------------------------------------------------------
// Data-layer types now live in @/lib/chart-types so that runtime chart utilities
// can depend on them without importing UPWARD from the component layer. They are
// re-exported here so existing consumers importing from
// `@/components/inference/types` keep working unchanged.
// ---------------------------------------------------------------------------
export type {
  AggDataEntry,
  ChartDefinition,
  HardwareConfig,
  InferenceChartType,
  InferenceData,
  RenderableGraph,
  WorkerPower,
  WorkerRole,
  YAxisMetricKey,
} from '@/lib/chart-types';

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
   * the regular interactive value (750). The replay panel passes 0 so frames
   * snap to interpolated positions instead of fighting a 750ms tween.
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
 * Props for the WorkflowInfoDisplay component.
 * @interface WorkflowInfoDisplayProps
 * @property {string} [runId] - The ID of the workflow run.
 * @property {string} [runUrl] - The URL to the workflow run details.
 * @property {string} [runDate] - The date of the workflow run.
 * @property {string} [runTimezone] - The timezone of the workflow run date.
 */
export interface WorkflowInfoDisplayProps {
  runId?: string;
  runUrl?: string;
  runDate?: string;
  runTimezone?: string;
}

/**
 * Represents the configuration of models, sequences, and precisions.
 * @interface ModelConfig
 * @property {object} [modelName: string] - An object where keys are model names.
 * @property {object} [modelName: string].[sequence: string] - An object where keys are sequence names.
 * @property {string[]} [modelName: string].[sequence: string] - An array of available precisions for the given model and sequence.
 */
export type ModelConfig = Record<string, Record<string, string[]>>;

/**
 * Represents information about a workflow run.
 * @interface WorkflowInfo
 * @property {string} runInfoBySequence - Object mapping sequence types to their run information.
 * @property {string} run_date - The date when the workflow was run.
 * @property {ModelConfig} modelConfig - Configuration details for models, sequences, and precisions.
 */
export interface WorkflowInfo {
  runInfoBySequence: Record<
    string,
    {
      runId: string;
      runDate: string;
      runUrl: string;
      changelog?: ChangelogMetadata;
    }
  >;
  run_date: string;
  modelConfig: ModelConfig;
  gpus: HardwareConfig;
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

/** Aggregation mode for the quick filters: aggregated vs disaggregated serving. */
export type DisaggMode = 'agg' | 'disagg';
/** Speculative-decoding mode for the quick filters: MTP vs standard token prediction. */
export type SpecMode = 'mtp' | 'stp';

/**
 * Coarse vendor / framework / aggregation / spec-decoding filters applied to the
 * chart point set. Empty array within a category = no constraint. Framework
 * values are engine-family keys ('vllm' | 'sglang' | 'trt' | 'atom'). See
 * `utils/quickFilters.ts`.
 */
export interface QuickFilters {
  vendors: string[];
  frameworks: string[];
  disagg: DisaggMode[];
  spec: SpecMode[];
}

/**
 * The quick-filter values that actually have data for the current model /
 * sequence / precision. Drives which pills are shown (frameworks) or disabled
 * (vendor / agg / spec). Same shape as {@link QuickFilters}.
 */
export type AvailableQuickFilters = QuickFilters;

/**
 * Defines the shape of the context object provided by `InferenceChartContext`.
 * @interface InferenceChartContextType
 * @property {Set<string>} activeHwTypes - A set of currently active hardware types for filtering.
 * @property {Set<string>} hwTypesWithData - A set of all hardware types present in the current dataset.
 * @property {(hw: string) => void} toggleHwType - Function to toggle the active state of a hardware type.
 * @property {HardwareConfig} hardwareConfig - The hardware configuration map.
 * @property {RenderableGraph[]} graphs - An array of graphs ready for rendering.
 * @property {string} selectedModel - The currently selected model.
 * @property {(model: string) => void} setSelectedModel - Function to set the selected model.
 * @property {string} selectedSequence - The currently selected sequence.
 * @property {(sequence: string) => void} setSelectedSequence - Function to set the selected sequence.
 * @property {string} selectedPrecision - The currently selected precision.
 * @property {(precision: string) => void} setSelectedPrecision - Function to set the selected precision.
 * @property {boolean} loading - Indicates if data is currently being loaded.
 * @property {string | null} error - Any error message encountered during data loading, or null if no error.
 * @property {WorkflowInfo | null} workflowInfo - Information about the workflow run, or null if not yet loaded.
 */
export interface InferenceChartContextType {
  activeHwTypes: Set<string>;
  toggleActiveDate: (date: string) => void;
  removeActiveDate: (date: string) => void;
  selectAllActiveDates: () => void;
  activeDates: Set<string>;
  hwTypesWithData: Set<string>;
  toggleHwType: (hw: string) => void;
  removeHwType: (hw: string) => void;
  selectAllHwTypes: () => void;
  hardwareConfig: HardwareConfig;
  graphs: RenderableGraph[];
  selectedModel: Model;
  setSelectedModel: (model: Model) => void;
  selectedSequence: Sequence;
  setSelectedSequence: (sequence: Sequence) => void;
  selectedPrecisions: string[];
  setSelectedPrecisions: (precisions: string[]) => void;
  loading: boolean;
  error: string | null;
  workflowInfo: any;
  selectedYAxisMetric: string;
  setSelectedYAxisMetric: (metric: string) => void;
  selectedXAxisMetric: string | null;
  setSelectedXAxisMetric: (metric: string | null) => void;
  selectedE2eXAxisMetric: string | null;
  setSelectedE2eXAxisMetric: (metric: string | null) => void;
  scaleType: 'auto' | 'linear' | 'log';
  setScaleType: (type: 'auto' | 'linear' | 'log') => void;
  /** Coarse vendor / framework / agg-disagg / mtp-stp filters applied to the chart point set. */
  quickFilters: QuickFilters;
  /** Quick-filter values that have data for the current model (drives pill enable/disable). */
  availableQuickFilters: AvailableQuickFilters;
  setQuickFilterVendors: (vendors: string[]) => void;
  setQuickFilterFrameworks: (frameworks: string[]) => void;
  setQuickFilterDisagg: (modes: DisaggMode[]) => void;
  setQuickFilterSpec: (modes: SpecMode[]) => void;
  setIsLegendExpanded: (metric: boolean) => void;
  isLegendExpanded: boolean;
  hideNonOptimal: boolean;
  setHideNonOptimal: (hide: boolean) => void;
  showPointLabels: boolean;
  setShowPointLabels: (show: boolean) => void;
  highContrast: boolean;
  setHighContrast: (highContrast: boolean) => void;
  logScale: boolean;
  setLogScale: (logScale: boolean) => void;
  useAdvancedLabels: boolean;
  setUseAdvancedLabels: (useAdvancedLabels: boolean) => void;
  showGradientLabels: boolean;
  setShowGradientLabels: (showGradientLabels: boolean) => void;
  showLineLabels: boolean;
  setShowLineLabels: (showLineLabels: boolean) => void;
  showSpeedOverlay: boolean;
  setShowSpeedOverlay: (showSpeedOverlay: boolean) => void;
  showMinecraftOverlay: boolean;
  setShowMinecraftOverlay: (showMinecraftOverlay: boolean) => void;
  selectedGPUs: string[];
  setSelectedGPUs: (gpus: string[]) => void;
  availableGPUs: { value: string; label: string }[];
  selectedDates: string[];
  /** Accepts a value or a state-updater fn (for safe rapid successive adds). */
  setSelectedDates: (dates: string[] | ((prev: string[]) => string[])) => void;
  selectedDateRange: { startDate: string; endDate: string };
  setSelectedDateRange: (dateRange: { startDate: string; endDate: string }) => void;
  userCosts: Record<string, number | undefined> | null;
  setUserCosts: (userCosts: Record<string, number | undefined> | null) => void;
  selectedRunDate: string;
  setSelectedRunDate: (date: string) => void;
  availableDates: string[];
  dateRangeAvailableDates: string[];
  isCheckingAvailableDates: boolean;
  availableRuns: Record<string, RunInfo> | null;
  selectedRunId: string;
  setSelectedRunId: (runId: string) => void;
  availablePrecisions: string[];
  availableSequences: Sequence[];
  availableModels: string[];
  userPowers: Record<string, number | undefined> | null;
  setUserPowers: (userPowers: Record<string, number | undefined> | null) => void;
  trackedConfigs: TrackedConfig[];
  addTrackedConfig: (point: InferenceData, chartType: string) => void;
  removeTrackedConfig: (id: string) => void;
  clearTrackedConfigs: () => void;
  setHwFilter: (filter: string[] | null) => void;
  activePresetId: string | null;
  setActivePresetId: (id: string | null) => void;
  presetGuardRef: React.RefObject<boolean>;
  /** Compare pages only: slug GPU pair used to filter benchmark series. */
  compareGpuPair: readonly [string, string] | null;
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

/**
 * Represents a tracked configuration for the "Performance Over Time" drill-down feature.
 * A user double-clicks a scatter chart data point to track that specific config across dates.
 */
export interface TrackedConfig {
  /** Unique identifier built from the config fields */
  id: string;
  hwKey: string;
  precision: string;
  tp: number;
  conc: number;
  /** Display label e.g. "B200 (TRTLLM) — TP4 conc=8 FP4" */
  label: string;
  /** Assigned color from d3.schemeTableau10 */
  color: string;
  /** The chart type this config was tracked from (e2e or interactivity) */
  chartType: string;
  /** Disaggregated inference fields for advanced matching */
  disagg?: boolean;
  num_prefill_gpu?: number;
  num_decode_gpu?: number;
}

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
  }[];
}
