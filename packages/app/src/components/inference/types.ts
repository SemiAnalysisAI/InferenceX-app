import type React from 'react';

import { HARDWARE_CONFIG } from '@/lib/constants';
import { Model, Sequence } from '@/lib/data-mappings';

/**
 * Represents an aggregated data entry, typically from a raw data source.
 * This interface contains various performance metrics.
 * @interface AggDataEntry
 * @property {string} hw - Hardware name.
 * @property {string} [mtp] - Multi-tenancy parameter, if applicable.
 * @property {keyof typeof HARDWARE_CONFIG} hwKey - Hardware key.
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
  hw: string;
  mtp?: string;
  hwKey: keyof typeof HARDWARE_CONFIG;
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
  p99_ttft: number;
  mean_tpot: number;
  mean_intvty: number;
  median_tpot: number;
  median_intvty: number;
  std_tpot: number;
  std_intvty: number;
  p99_tpot: number;
  p99_intvty: number;
  mean_itl: number;
  median_itl: number;
  std_itl: number;
  p99_itl: number;
  mean_e2el: number;
  median_e2el: number;
  std_e2el: number;
  p99_e2el: number;
  disagg: boolean;
  num_prefill_gpu: number;
  num_decode_gpu: number;
  spec_decoding: string;
  ep?: number;
  dp_attention?: boolean | string;
  is_multinode?: boolean;
  prefill_tp?: number;
  prefill_ep?: number;
  prefill_dp_attention?: boolean | string;
  prefill_num_workers?: number;
  decode_tp?: number;
  decode_ep?: number;
  decode_dp_attention?: boolean | string;
  decode_num_workers?: number;
  image?: string;
  date: string;
  /** Actual benchmark run date from the DB (before date-picker override). */
  actualDate?: string;
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
  hidden?: boolean;

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
  tpPerMw: { y: number; roof: boolean };
  inputTputPerMw?: { y: number; roof: boolean };
  outputTputPerMw?: { y: number; roof: boolean };
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
  powerUser?: { y: number; roof: boolean };

  // All-in provisioned Joules per token
  jTotal?: { y: number; roof: boolean };
  jOutput?: { y: number; roof: boolean };
  jInput?: { y: number; roof: boolean };
}

/**
 * Keys of InferenceData that have the roofline metric structure ({y, roof}).
 */
export type YAxisMetricKey =
  | 'tpPerGpu'
  | 'outputTputPerGpu'
  | 'inputTputPerGpu'
  | 'tpPerMw'
  | 'inputTputPerMw'
  | 'outputTputPerMw'
  | 'costh'
  | 'costn'
  | 'costr'
  | 'costhOutput'
  | 'costnOutput'
  | 'costrOutput'
  | 'costhi'
  | 'costni'
  | 'costri'
  | 'costUser'
  | 'powerUser'
  | 'jTotal'
  | 'jOutput'
  | 'jInput';

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
export interface ChartDefinition {
  chartType: string;
  heading: string;
  x: keyof AggDataEntry;
  x_label: string;
  y: keyof AggDataEntry;
  y_label?: string;
  y_tpPerGpu?: string;
  y_tpPerGpu_label?: string;
  y_tpPerGpu_title?: string;
  y_tpPerGpu_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_outputTputPerGpu?: string;
  y_outputTputPerGpu_label?: string;
  y_outputTputPerGpu_title?: string;
  y_outputTputPerGpu_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_inputTputPerGpu?: string;
  y_inputTputPerGpu_label?: string;
  y_inputTputPerGpu_title?: string;
  y_inputTputPerGpu_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_inputTputPerGpu_x?: string;
  y_inputTputPerGpu_x_label?: string;
  y_inputTputPerGpu_heading?: string;
  y_tpPerMw?: string;
  y_tpPerMw_label?: string;
  y_tpPerMw_title?: string;
  y_tpPerMw_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_inputTputPerMw?: string;
  y_inputTputPerMw_label?: string;
  y_inputTputPerMw_title?: string;
  y_inputTputPerMw_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_outputTputPerMw?: string;
  y_outputTputPerMw_label?: string;
  y_outputTputPerMw_title?: string;
  y_outputTputPerMw_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_costh?: string;
  y_costh_label?: string;
  y_costh_title?: string;
  y_costh_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_costn?: string;
  y_costn_label?: string;
  y_costn_title?: string;
  y_costn_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_costr?: string;
  y_costr_label?: string;
  y_costr_title?: string;
  y_costr_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  // Cost per million output tokens
  y_costhOutput?: string;
  y_costhOutput_label?: string;
  y_costhOutput_title?: string;
  y_costhOutput_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_costnOutput?: string;
  y_costnOutput_label?: string;
  y_costnOutput_title?: string;
  y_costnOutput_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_costrOutput?: string;
  y_costrOutput_label?: string;
  y_costrOutput_title?: string;
  y_costrOutput_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  // Cost per million input tokens
  y_costhi?: string;
  y_costhi_label?: string;
  y_costhi_title?: string;
  y_costhi_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_costni?: string;
  y_costni_label?: string;
  y_costni_title?: string;
  y_costni_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_costri?: string;
  y_costri_label?: string;
  y_costri_title?: string;
  y_costri_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  // All-in provisioned Joules per token
  y_jTotal?: string;
  y_jTotal_label?: string;
  y_jTotal_title?: string;
  y_jTotal_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_jOutput?: string;
  y_jOutput_label?: string;
  y_jOutput_title?: string;
  y_jOutput_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_jInput?: string;
  y_jInput_label?: string;
  y_jInput_title?: string;
  y_jInput_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
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
  /** Hardware configuration for the overlay data (may have different hardware types) */
  hardwareConfig: HardwareConfig;
  /** Label for the overlay (e.g., branch name) */
  label: string;
  /** URL to the workflow run */
  runUrl?: string;
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
export interface ModelConfig {
  [modelName: string]: {
    [sequence: string]: string[]; // Array of precisions
  };
}

/**
 * Represents information about a workflow run.
 * @interface WorkflowInfo
 * @property {string} runInfoBySequence - Object mapping sequence types to their run information.
 * @property {string} run_date - The date when the workflow was run.
 * @property {ModelConfig} modelConfig - Configuration details for models, sequences, and precisions.
 */
export interface WorkflowInfo {
  runInfoBySequence: {
    [sequence: string]: {
      runId: string;
      runDate: string;
      runUrl: string;
      changelog?: ChangelogMetadata;
    };
  };
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

/**
 * Defines the shape of the context object provided by `InferenceChartContext`.
 * @interface InferenceChartContextType
 * @property {Set<string>} activeHwTypes - A set of currently active hardware types for filtering.
 * @property {Set<string>} hwTypesWithData - A set of all hardware types present in the current dataset.
 * @property {(hw: string) => void} toggleHwType - Function to toggle the active state of a hardware type.
 * @property {typeof HARDWARE_CONFIG} hardwareConfig - The global hardware configuration object.
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
  selectAllActiveDates: () => void;
  activeDates: Set<string>;
  hwTypesWithData: Set<string>;
  toggleHwType: (hw: string) => void;
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
  setIsLegendExpanded: (metric: boolean) => void;
  isLegendExpanded: boolean;
  hideNonOptimal: boolean;
  setHideNonOptimal: (hide: boolean) => void;
  hidePointLabels: boolean;
  setHidePointLabels: (hide: boolean) => void;
  highContrast: boolean;
  setHighContrast: (highContrast: boolean) => void;
  colorShuffleSeed: number;
  shuffleColors: () => void;
  logScale: boolean;
  setLogScale: (logScale: boolean) => void;
  useAdvancedLabels: boolean;
  setUseAdvancedLabels: (useAdvancedLabels: boolean) => void;
  showGradientLabels: boolean;
  setShowGradientLabels: (showGradientLabels: boolean) => void;
  selectedGPUs: string[];
  setSelectedGPUs: (gpus: string[]) => void;
  availableGPUs: { value: string; label: string }[];
  selectedDates: string[];
  setSelectedDates: (dates: string[]) => void;
  selectedDateRange: { startDate: string; endDate: string };
  setSelectedDateRange: (dateRange: { startDate: string; endDate: string }) => void;
  userCosts: { [gpuKey: string]: number | undefined } | null;
  setUserCosts: (userCosts: { [gpuKey: string]: number | undefined } | null) => void;
  selectedRunDate: string;
  setSelectedRunDate: (date: string) => void;
  availableDates: string[];
  dateRangeAvailableDates: string[];
  isCheckingAvailableDates: boolean;
  availableRuns: { [runId: string]: RunInfo } | null;
  selectedRunId: string;
  setSelectedRunId: (runId: string) => void;
  availablePrecisions: string[];
  availableSequences: Sequence[];
  availableModels: string[];
  userPowers: { [gpuKey: string]: number | undefined } | null;
  setUserPowers: (userPowers: { [gpuKey: string]: number | undefined } | null) => void;
  trackedConfigs: TrackedConfig[];
  addTrackedConfig: (point: InferenceData, chartType: string) => void;
  removeTrackedConfig: (id: string) => void;
  clearTrackedConfigs: () => void;
  setHwFilter: (filter: string[] | null) => void;
  activePresetId: string | null;
  setActivePresetId: (id: string | null) => void;
  presetGuardRef: React.RefObject<boolean>;
}
export interface CalculateUserCostsRequest {
  model: string;
  sequence: string;
  precision: string;
  userCosts: {
    [gpuKey: string]: number | undefined;
  };
}

export interface CalculateUserCostsResponse {
  success: boolean;
  data?: InferenceData[][];
  error?: string;
}
export interface UserCostInputs {
  [gpuKey: string]: string | undefined;
}

export interface HardwareConfig {
  [key: string]: {
    name: string;
    label: string;
    suffix: string;
    gpu: string;
    color: string;
    framework?: string;
  };
}

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
  /** Display label e.g. "B200 (TRT) — TP4 conc=8 FP4" */
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
