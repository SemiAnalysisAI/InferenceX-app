export interface SuccessRateStats {
  rate: number;
  total: number;
  n_success: number;
}

export type DateRangeSuccessRateData = Record<string, Record<string, SuccessRateStats>>;
