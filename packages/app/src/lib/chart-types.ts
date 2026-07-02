/**
 * Data-layer chart types.
 *
 * These describe the benchmark-data pipeline (BenchmarkRow → AggDataEntry →
 * InferenceData → RenderableGraph) and the chart configuration schema. They
 * live in `lib/` so that runtime-compatible chart utilities (chart-utils.ts and
 * its sibling modules) can depend on them without importing UPWARD from the
 * component layer.
 *
 * `components/inference/types.ts` re-exports every symbol here, so existing
 * consumers that import these types from `@/components/inference/types` keep
 * working unchanged. Component-only types (context, props) stay in that file.
 */

import type { HardwareEntry } from '@/lib/constants';

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
 * Per-worker measured power entry emitted by the runner's aggregate_power.py
 * for multinode and disaggregated runs. The chart layer can use these to
 * surface a stacked breakdown of where energy is spent across worker types.
 *
 * `hosts` lists the node hostnames whose perfmon CSVs were rolled up into
 * this worker entry (a single-node worker has one host; a multinode decode
 * worker spanning 4 nodes has four). Optional because pre-multinode versions
 * of aggregate_power.py didn't emit it.
 *
 * `avg_temp_c`, `peak_temp_c`, `avg_util_pct`, `avg_mem_used_mb` mirror the
 * cluster-wide telemetry scalars and are only present when the perfmon CSVs
 * include the corresponding sample columns. Each is optional so callers can
 * distinguish "field absent from this run" from "field present and equal to 0".
 */
export interface WorkerPower {
  // `string` rather than `WorkerRole` so the type lines up with what we get
  // from the JSONB column without an unsafe cast at every boundary. Chart
  // code can still narrow on the literal values it understands.
  role: string;
  worker_idx: number;
  hosts?: string[];
  num_gpus: number;
  avg_power_w: number;
  avg_temp_c?: number;
  peak_temp_c?: number;
  avg_util_pct?: number;
  avg_mem_used_mb?: number;
}

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
  // Measured GPU telemetry (emitted by runner's aggregate_power.py).
  // Optional because historical runs predate the fields.
  avg_power_w?: number;
  joules_per_output_token?: number;
  joules_per_total_token?: number;
  // Multinode / disagg-only measured power. The aggregate_power.py runner
  // emits per-role energy splits when the deployment has separate prefill
  // and decode workers (single-node disagg or multinode disagg). Single-node
  // aggregated configs leave these undefined.
  // - prefill_avg_power_w / decode_avg_power_w: mean per-GPU draw (W) within each role
  // - joules_per_input_token: prefill_energy / total_input_tokens (prefill GPUs only)
  // The disagg decode-only J/output is carried by joules_per_output_token above
  // (the runner overrides it to decode_energy / total_output_tokens on disagg) —
  // there is no separate _decode field.
  prefill_avg_power_w?: number;
  decode_avg_power_w?: number;
  joules_per_input_token?: number;
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
  /** URL to the GitHub Actions workflow run that produced this data point. */
  run_url?: string;
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

  // Measured power / energy from runner GPU telemetry. Optional because
  // pre-aggregate_power.py runs (and runs with monitoring disabled) won't
  // emit these fields.
  measuredAvgPower?: { y: number; roof: boolean };
  measuredPrefillAvgPower?: { y: number; roof: boolean };
  measuredDecodeAvgPower?: { y: number; roof: boolean };
  measuredJPerOutputToken?: { y: number; roof: boolean };
  measuredJPerTotalToken?: { y: number; roof: boolean };
  measuredJPerInputToken?: { y: number; roof: boolean };
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
  | 'jInput'
  | 'measuredAvgPower'
  | 'measuredPrefillAvgPower'
  | 'measuredDecodeAvgPower'
  | 'measuredJPerOutputToken'
  | 'measuredJPerTotalToken'
  | 'measuredJPerInputToken';

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
  chartType: InferenceChartType;
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
  // Measured power / energy from runner GPU telemetry
  y_measuredAvgPower?: string;
  y_measuredAvgPower_label?: string;
  y_measuredAvgPower_title?: string;
  // Not explicitly set in the config — ScatterGraph falls back to lower_right
  // (matches "lower power at the same interactivity is more efficient").
  // The field stays in the type for parity with the other y_* metrics and
  // so a future config can override the default.
  y_measuredAvgPower_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_measuredPrefillAvgPower?: string;
  y_measuredPrefillAvgPower_label?: string;
  y_measuredPrefillAvgPower_title?: string;
  y_measuredPrefillAvgPower_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_measuredDecodeAvgPower?: string;
  y_measuredDecodeAvgPower_label?: string;
  y_measuredDecodeAvgPower_title?: string;
  y_measuredDecodeAvgPower_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_measuredJPerOutputToken?: string;
  y_measuredJPerOutputToken_label?: string;
  y_measuredJPerOutputToken_title?: string;
  y_measuredJPerOutputToken_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_measuredJPerInputToken?: string;
  y_measuredJPerInputToken_label?: string;
  y_measuredJPerInputToken_title?: string;
  y_measuredJPerInputToken_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
  y_measuredJPerTotalToken?: string;
  y_measuredJPerTotalToken_label?: string;
  y_measuredJPerTotalToken_title?: string;
  y_measuredJPerTotalToken_roofline?: 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';
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

export type HardwareConfig = Record<string, HardwareEntry>;
