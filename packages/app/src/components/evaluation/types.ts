import { Model } from '@/lib/data-mappings';
import { HARDWARE_CONFIG } from '@/lib/constants';

/**
 * Represents a single eval data point for the chart
 */
export interface EvaluationChartData {
  configId: number;
  hwKey: keyof typeof HARDWARE_CONFIG;
  configLabel: string; // Display label like "H100 (vLLM)" or "B200 (TRT)"
  score: number; // eval benchmark score (midpoint when aggregated)
  scoreError?: number; // standard error of the score (or half range when aggregated)
  minScore?: number; // minimum score across all runs (when aggregated)
  maxScore?: number; // maximum score across all runs (when aggregated)
  errorMin?: number; // min of (score - SE) for error bars
  errorMax?: number; // max of (score + SE) for error bars
  model: string;
  benchmark: string;
  specDecode: string;
  date: string;
  datetime: string;
  precision: string;
  framework: string; // vllm, trt, etc.
  tp: number; // tensor parallelism
  ep: number; // expert parallelism
  dp_attention: boolean; // data parallel attention
  conc: number; // concurrency
}

export interface EvalChangelogEntry {
  benchmark: string;
  configs: string[];
}

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Context type for the Eval Chart
 */
export interface EvaluationChartContextType {
  loading: boolean;
  error: string | null;
  selectedBenchmark: string | undefined;
  setSelectedBenchmark: (benchmark: string) => void;
  selectedModel: string | undefined;
  setSelectedModel: (model: string) => void;
  selectedRunDate: string;
  setSelectedRunDate: (date: string) => void;
  availableBenchmarks: string[];
  availableModels: Model[];
  availableDates: string[];
  chartData: EvaluationChartData[];
  unfilteredChartData: EvaluationChartData[];
  enabledHardware: Set<string>;
  toggleHardware: (hwKey: string) => void;
  removeHardware: (hwKey: string) => void;
  highContrast: boolean;
  setHighContrast: (value: boolean) => void;
  showLabels: boolean;
  setShowLabels: (value: boolean) => void;
  isLegendExpanded: boolean;
  setIsLegendExpanded: (value: boolean) => void;
  hwTypesWithData: Set<string>;
  selectAllHwTypes: () => void;
  highlightedConfigs: Set<string>; // Configurations that have new data from selected run date
  changelogEntries: EvalChangelogEntry[];
  modelHasEvalData: boolean;
  selectedPrecisions: string[];
  setSelectedPrecisions: (precisions: string[]) => void;
  availablePrecisions: string[];
}
