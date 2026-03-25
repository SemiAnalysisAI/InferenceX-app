/**
 * API client functions for the v1 endpoints.
 * Each function is a thin fetch wrapper returning typed data.
 */

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
  decode_tp: number;
  decode_ep: number;
  decode_dp_attention: boolean;
  task: string;
  date: string;
  conc: number | null;
  metrics: Record<string, number>;
  timestamp: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export function fetchBenchmarks(model: string, date?: string, exact?: boolean) {
  const params = new URLSearchParams({ model });
  if (date) params.set('date', date);
  if (exact) params.set('exact', 'true');
  return fetchJson<BenchmarkRow[]>(`/api/v1/benchmarks?${params}`);
}

export function fetchBenchmarkHistory(model: string, isl: number, osl: number) {
  const params = new URLSearchParams({ model, isl: String(isl), osl: String(osl) });
  return fetchJson<BenchmarkRow[]>(`/api/v1/benchmarks/history?${params}`);
}

export function fetchWorkflowInfo(date: string) {
  return fetchJson<WorkflowInfoResponse>(`/api/v1/workflow-info?date=${encodeURIComponent(date)}`);
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

export function fetchAvailability() {
  return fetchJson<AvailabilityRow[]>('/api/v1/availability');
}

export function fetchReliability() {
  return fetchJson<ReliabilityRow[]>('/api/v1/reliability');
}

export function fetchEvaluations() {
  return fetchJson<EvalRow[]>('/api/v1/evaluations');
}

export interface GitHubStarsResponse {
  owner: string;
  repo: string;
  stars: number;
}

export function fetchGitHubStars() {
  return fetchJson<GitHubStarsResponse>('/api/v1/github-stars');
}
