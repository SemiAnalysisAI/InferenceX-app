import { useByIdQuery } from './benchmark-id-query';

export interface BenchmarkSibling {
  id: number;
  conc: number;
  offload_mode: string | null;
  decode_tp: number;
  decode_ep: number;
  decode_dp_attention: boolean;
  decode_num_workers: number;
  prefill_tp: number;
  prefill_ep: number;
  prefill_dp_attention: boolean;
  prefill_num_workers: number;
  num_prefill_gpu: number;
  num_decode_gpu: number;
  disagg: boolean;
  is_multinode: boolean;
  tput_per_gpu: number | null;
  total_requests: number | null;
  is_current: boolean;
  has_trace: boolean;
}

export interface BenchmarkSku {
  hardware: string;
  framework: string;
  model: string;
  precision: string;
  spec_method: string;
  benchmark_type: string;
  github_run_id: number;
  date: string;
  dataset_slug: string | null;
}

export interface BenchmarkSiblings {
  sku: BenchmarkSku;
  siblings: BenchmarkSibling[];
}

export function useBenchmarkSiblings(id: number | null) {
  return useByIdQuery<BenchmarkSiblings>('benchmark-siblings', id, id !== null && id > 0);
}
