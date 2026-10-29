import type { Model } from '@/lib/catalog/data-mappings';

export interface EvaluationChartData {
  evalResultId: number;
  configId: number;
  hwKey: string;
  hardware: string;
  configLabel: string;
  score: number;
  scoreError?: number;
  minScore?: number;
  maxScore?: number;
  errorMin?: number;
  errorMax?: number;
  model: string;
  benchmark: string;
  specDecode: string;
  date: string;
  datetime: string;
  precision: string;
  framework: string;
  physicalChips?: number;
  dp?: number;
  tp: number;
  ep: number;
  dp_attention: boolean;
  conc: number;
  disagg: boolean;
  isMultinode: boolean;
  prefillTp: number;
  prefillEp: number;
  prefillDpAttention: boolean;
  prefillNumWorkers: number;
  decodeNumWorkers: number;
  numPrefillGpu: number;
  numDecodeGpu: number;
  runUrl?: string;
}

export interface EvalChangelogEntry {
  benchmark: string;
  configs: string[];
}

export interface EvaluationChartContextType {
  loading: boolean;
  isEvaluationDataSettled: boolean;
  error: string | null;
  isError: boolean;
  isAvailabilityError: boolean;
  isEvaluationDataError: boolean;
  retry: () => void;
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
  unofficialChartData: EvaluationChartData[];
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
  highlightedConfigs: Set<string>;
  changelogEntries: EvalChangelogEntry[];
  modelHasEvalData: boolean;
  selectedPrecisions: string[];
  setSelectedPrecisions: (precisions: string[]) => void;
  availablePrecisions: string[];
}
