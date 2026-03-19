export type CalculatorMode = 'interactivity_to_throughput' | 'throughput_to_interactivity';

export type CostProvider = 'costh' | 'costn' | 'costr';

export type CostType = 'total' | 'input' | 'output';

export type BarMetric = 'throughput' | 'power' | 'cost';

export interface GPUDataPoint {
  hwKey: string;
  interactivity: number; // tokens/sec/user (median_intvty = x in interactivity chart)
  throughput: number; // tokens/sec/gpu total (tput_per_gpu = y in interactivity chart)
  outputThroughput: number; // output tokens/sec/gpu
  inputThroughput: number; // input tokens/sec/gpu
  concurrency: number;
  tp: number;
  precision: string;
  ep?: number;
  dp_attention?: boolean;
  disagg?: boolean;
  costh: number; // cost per million total tokens (hyperscaler)
  costn: number; // cost per million total tokens (neocloud)
  costr: number; // cost per million total tokens (rental)
  costhi: number; // cost per million input tokens (hyperscaler)
  costni: number; // cost per million input tokens (neocloud)
  costri: number; // cost per million input tokens (rental)
  costhOutput: number; // cost per million output tokens (hyperscaler)
  costnOutput: number; // cost per million output tokens (neocloud)
  costrOutput: number; // cost per million output tokens (rental)
  tpPerMw: number; // total throughput per megawatt
  inputTpPerMw: number; // input throughput per megawatt
  outputTpPerMw: number; // output throughput per megawatt
}

export interface InterpolatedResult {
  hwKey: string; // hardware key for color/config lookup
  resultKey: string; // unique key (hwKey or hwKey__precision when multi-precision)
  precision?: string; // precision label when multiple precisions are selected
  value: number; // interpolated total throughput or interactivity
  outputTputValue: number; // interpolated output token throughput per GPU
  inputTputValue: number; // interpolated input token throughput per GPU
  cost: number; // cost per million total tokens at that operating point
  costInput: number; // cost per million input tokens at that operating point
  costOutput: number; // cost per million output tokens at that operating point
  tpPerMw: number; // total throughput per megawatt at that operating point
  inputTpPerMw: number; // input throughput per megawatt at that operating point
  outputTpPerMw: number; // output throughput per megawatt at that operating point
  concurrency: number; // concurrency at that operating point
  nearestPoints: GPUDataPoint[]; // the data points used for interpolation
}
