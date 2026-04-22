/**
 * API client functions for the v1 endpoints.
 * Each function is a thin fetch wrapper returning typed data.
 */

import type { SubmissionsResponse } from './submissions-types';

export interface BenchmarkRow {
  hardware: string;
  framework: string;
  model: string;
  precision: string;
  spec_method: string;
  disagg: boolean;
  is_multinode: boolean;
  prefill_tp: number;
  prefill_ep: number;
  prefill_dp_attention: boolean;
  prefill_num_workers: number;
  decode_tp: number;
  decode_ep: number;
  decode_dp_attention: boolean;
  decode_num_workers: number;
  num_prefill_gpu: number;
  num_decode_gpu: number;
  isl: number;
  osl: number;
  conc: number;
  image: string | null;
  metrics: Record<string, number>;
  date: string;
  run_url: string | null;
}

export interface WorkflowRunRow {
  github_run_id: number;
  name: string;
  conclusion: string | null;
  run_attempt: number;
  html_url: string | null;
  created_at: string;
  date: string;
}

export interface ChangelogRow {
  workflow_run_id: number;
  date: string;
  base_ref: string;
  head_ref: string;
  config_keys: string[];
  description: string;
  pr_link: string | null;
}

export interface DateConfigRow {
  model: string;
  isl: number;
  osl: number;
  precision: string;
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
}

export interface WorkflowInfoResponse {
  runs: WorkflowRunRow[];
  changelogs: ChangelogRow[];
  configs: DateConfigRow[];
}

export interface ReliabilityRow {
  hardware: string;
  date: string;
  n_success: number;
  total: number;
}

export interface EvalRow {
  config_id: number;
  hardware: string;
  framework: string;
  model: string;
  precision: string;
  spec_method: string;
  disagg: boolean;
  is_multinode: boolean;
  prefill_tp: number;
  prefill_ep: number;
  prefill_dp_attention: boolean;
  prefill_num_workers: number;
  decode_tp: number;
  decode_ep: number;
  decode_dp_attention: boolean;
  decode_num_workers: number;
  num_prefill_gpu: number;
  num_decode_gpu: number;
  task: string;
  date: string;
  conc: number | null;
  metrics: Record<string, number>;
  timestamp: string;
  run_url: string | null;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export function fetchBenchmarks(
  model: string,
  date?: string,
  exact?: boolean,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ model });
  if (date) params.set('date', date);
  if (exact) params.set('exact', 'true');
  return fetchJson<BenchmarkRow[]>(`/api/v1/benchmarks?${params}`, signal);
}

export function fetchBenchmarkHistory(
  model: string,
  isl: number,
  osl: number,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ model, isl: String(isl), osl: String(osl) });
  return fetchJson<BenchmarkRow[]>(`/api/v1/benchmarks/history?${params}`, signal);
}

export function fetchWorkflowInfo(date: string, signal?: AbortSignal) {
  return fetchJson<WorkflowInfoResponse>(
    `/api/v1/workflow-info?date=${encodeURIComponent(date)}`,
    signal,
  );
}

export interface AvailabilityRow {
  model: string;
  isl: number;
  osl: number;
  precision: string;
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
  date: string;
}

export function fetchAvailability(signal?: AbortSignal) {
  return fetchJson<AvailabilityRow[]>('/api/v1/availability', signal);
}

export function fetchReliability(signal?: AbortSignal) {
  return fetchJson<ReliabilityRow[]>('/api/v1/reliability', signal);
}

export function fetchEvaluations(signal?: AbortSignal) {
  return fetchJson<EvalRow[]>('/api/v1/evaluations', signal);
}

export function fetchSubmissions(signal?: AbortSignal) {
  return fetchJson<SubmissionsResponse>('/api/v1/submissions', signal);
}
