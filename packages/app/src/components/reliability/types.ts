/**
 * @file types.ts
 * @description Defines TypeScript interfaces for reliability data structures and context types.
 */

/**
 * Represents the statistics for a specific run, including success count, total runs, and success rate.
 * @interface RunStats
 * @property {number} n_success - The number of successful runs.
 * @property {number} total - The total number of runs attempted.
 * @property {number} rate - The success rate, calculated as `n_success / total`.
 */
export interface RunStats {
  n_success: number;
  total: number;
  rate?: number;
}

/**
 * Represents the daily reliability data, including the date and run statistics for various models.
 * @interface DailyReliabilityData
 * @property {string} date - The date for which the reliability data is recorded (e.g., "YYYY-MM-DD").
 * @property {RunStats | string} [model: string] - Dynamically keyed properties for each model,
 *                                                storing either `RunStats` or a string (e.g., 'date').
 */
export interface DailyReliabilityData {
  date: string;
  [model: string]: RunStats | string;
}

/**
 * Represents the success rate statistics for a model in a date range.
 * @interface SuccessRateStats
 * @property {number} rate - The success rate percentage.
 * @property {number} total - The total number of runs.
 * @property {number} n_success - The number of successes.
 */
export interface SuccessRateStats {
  rate: number;
  total: number;
  n_success: number;
}

/**
 * Represents the success rate data for a model in a date range.
 * @interface ModelSuccessRateData
 * @property {string} model - The model name.
 * @property {number} successRate - The success rate percentage for this model.
 * @property {number} total - The total number of runs.
 * @property {number} n_success - The number of successes.
 */
export interface ModelSuccessRateData {
  model: string;
  successRate: number;
  total: number;
  n_success: number;
}

/**
 * Represents the date range success rate data structure.
 * @interface DateRangeSuccessRateData
 * @property {Record<string, SuccessRateStats>} [dateRange: string] - Date range keys (e.g., "last-7-days") mapping to model success rate statistics.
 */
export interface DateRangeSuccessRateData {
  [dateRange: string]: Record<string, SuccessRateStats>;
}

/**
 * Defines the shape of the context object provided by `ReliabilityChartContext`.
 * @interface ReliabilityChartContextType
 * @property {boolean} loading - Indicates if the reliability data is currently being loaded.
 * @property {string | null} error - Any error message encountered during data loading, or null if no error.
 * @property {DateRangeSuccessRateData} dateRangeSuccessRateData - The date range success rate data from the JSON file.
 * @property {ModelSuccessRateData[]} filteredReliabilityData - An array of model success rate data for the selected date range.
 * @property {(ModelSuccessRateData & { modelLabel: string })[]} chartData - Sorted and labeled model data ready for chart display.
 * @property {string[]} availableModels - An array of model names available in the reliability data.
 * @property {string} dateRange - The selected date range filter.
 * @property {(range: string) => void} setDateRange - Function to update the date range filter.
 */
export interface ReliabilityChartContextType {
  loading: boolean;
  error: string | null;
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
  isLegendExpanded: boolean;
  setIsLegendExpanded: (value: boolean) => void;
  modelsWithData: Set<string>;
  selectAllModels: () => void;
}
