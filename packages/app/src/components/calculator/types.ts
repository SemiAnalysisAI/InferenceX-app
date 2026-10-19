import type { BenchmarkRow } from '@/lib/api/api';

export type CalculatorMode = 'interactivity_to_throughput' | 'throughput_to_interactivity';

export type CostProvider = 'costh' | 'costr';

export type CostType = 'total' | 'input' | 'output';

export type BarMetric = 'throughput' | 'power' | 'cost';

export interface GPUDataPoint {
  sourceRow?: BenchmarkRow;
  hwKey: string;
  interactivity: number;
  ttft?: number;
  e2eLatency?: number;
  date?: string;
  throughput: number;
  outputThroughput: number;
  inputThroughput: number;
  cacheHitRate?: number;
  theoreticalCacheHitRate?: number;
  inputTokenShare?: number;
  concurrency: number;
  dp?: number;
  tp: number;
  precision: string;
  ep?: number;
  dp_attention?: boolean;
  disagg?: boolean;
  costh: number;
  costr: number;
  costhi: number;
  costri: number;
  costhOutput: number;
  costrOutput: number;
  tpPerMw: number;
  inputTpPerMw: number;
  outputTpPerMw: number;
}

export interface InterpolatedResult {
  hwKey: string;
  resultKey: string;
  precision?: string;
  value: number;
  outputTputValue: number;
  inputTputValue: number;
  cost: number;
  costInput: number;
  costOutput: number;
  tpPerMw: number;
  inputTpPerMw: number;
  outputTpPerMw: number;
  cacheHitRate?: number;
  theoreticalCacheHitRate?: number;
  inputTokenShare?: number;
  concurrency: number;
  nearestPoints: GPUDataPoint[];
  clamped?: boolean;
  clampedAbove?: boolean;
  clampedBelow?: boolean;
  isOverlay?: boolean;
  runIndex?: number;
  runLabel?: string;
  runUrl?: string;
}
