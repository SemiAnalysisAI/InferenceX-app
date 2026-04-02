export interface SubmissionSummaryRow {
  model: string;
  hardware: string;
  framework: string;
  precision: string;
  spec_method: string;
  disagg: boolean;
  first_date: string;
  latest_date: string;
  run_days: number;
  total_datapoints: number;
}

export interface SubmissionVolumeRow {
  date: string;
  hardware: string;
  datapoints: number;
}

export interface SubmissionsResponse {
  summary: SubmissionSummaryRow[];
  volume: SubmissionVolumeRow[];
}
