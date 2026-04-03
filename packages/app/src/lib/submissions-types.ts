export interface SubmissionSummaryRow {
  model: string;
  hardware: string;
  framework: string;
  precision: string;
  spec_method: string;
  disagg: boolean;
  is_multinode: boolean;
  num_prefill_gpu: number;
  num_decode_gpu: number;
  prefill_tp: number;
  prefill_ep: number;
  decode_tp: number;
  decode_ep: number;
  date: string;
  total_datapoints: number;
  distinct_sequences: number;
  distinct_concurrencies: number;
  max_concurrency: number;
  image: string | null;
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
