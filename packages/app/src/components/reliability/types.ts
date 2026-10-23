export interface RunStats {
  n_success: number;
  total: number;
  rate?: number;
}

export interface DailyReliabilityData {
  date: string;
  [model: string]: RunStats | string;
}

export interface SuccessRateStats {
  rate: number;
  total: number;
  n_success: number;
}

export interface ModelSuccessRateData {
  model: string;
  successRate: number;
  total: number;
  n_success: number;
}

export type DateRangeSuccessRateData = Record<string, Record<string, SuccessRateStats>>;

export interface ReliabilityChartContextType {
  loading: boolean;
  error: string | null;
  refetch: () => Promise<unknown>;
  dateRangeSuccessRateData: DateRangeSuccessRateData;
  filteredReliabilityData: ModelSuccessRateData[];
  chartData: (ModelSuccessRateData & { modelLabel: string })[];
  availableModels: string[];
  dateRange: string;
  setDateRange: (range: string) => void;
  showPercentagesOnBars: boolean;
  setShowPercentagesOnBars: (value: boolean) => void;
  highContrast: boolean;
  setHighContrast: (value: boolean) => void;
  enabledModels: Set<string>;
  toggleModel: (model: string) => void;
  removeModel: (model: string) => void;
  isLegendExpanded: boolean;
  setIsLegendExpanded: (value: boolean) => void;
  modelsWithData: Set<string>;
  selectAllModels: () => void;
}
