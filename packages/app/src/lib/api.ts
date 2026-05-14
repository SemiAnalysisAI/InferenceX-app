/**
 * API client functions for the v1 endpoints.
 * Each function is a thin fetch wrapper returning typed data.
 */

import type { SubmissionsResponse } from './submissions-types';

export interface BenchmarkRow {
  /**
   * Natural-key halves identifying the (run, config) this row was produced
   * by. Together they key `benchmark_environments` and any future
   * per-(run, config) endpoint. Optional because unofficial-run rows
   * (synthesized client-side from GHA artifacts) have no DB row.
   */
  workflow_run_id?: number;
  config_id?: number;
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
  id: number;
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

export interface EvalSampleRow {
  docId: number;
  prompt: string | null;
  target: string | null;
  /** Filtered answer that was actually scored against `target`. */
  response: string | null;
  /**
   * Full unfiltered model output. Often identical to `response`, but for failed
   * samples (degenerate output, control bytes, repetition loops) this is where
   * the real signal lives — the filter may strip it down to nothing.
   */
  rawResponse: string | null;
  /**
   * Few-shot demonstrations parsed server-side from lm-eval `arguments.gen_args_0.arg_0`.
   * Handles both the multi-turn chat-array shape and the pre-concatenated
   * single-message shape. `null` when the task isn't 5-shot or the prompt format
   * doesn't match either known shape — the bare `prompt` field is sufficient there.
   */
  demonstrations: { question: string; answer: string }[] | null;
  passed: boolean | null;
  score: number | null;
  metrics: Record<string, number>;
}

export interface EvalSamplesResponse {
  samples: EvalSampleRow[];
  total: number;
  passedTotal: number;
  failedTotal: number;
  source: 'db' | 'github_artifact';
}

export type EvalSamplesFilter = 'all' | 'passed' | 'failed';

export function fetchEvalSamples(
  evalResultId: number,
  filter: EvalSamplesFilter,
  offset: number,
  limit: number,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    eval_result_id: String(evalResultId),
    filter,
    offset: String(offset),
    limit: String(limit),
  });
  return fetchJson<EvalSamplesResponse>(`/api/v1/eval-samples?${params}`, signal);
}

/** Identifying fields used by the live route to locate the right eval artifact. */
export interface EvalSamplesLiveContext {
  runId: string;
  task: string;
  model: string;
  framework: string;
  hardware: string;
  precision: string;
  specMethod: string;
  disagg: boolean;
  conc: number | null;
}

/**
 * Live-fetch variant for unofficial runs — same response shape as `fetchEvalSamples`,
 * but the server reads samples from the workflow's GHA artifact rather than the DB.
 */
export function fetchEvalSamplesLive(
  ctx: EvalSamplesLiveContext,
  filter: EvalSamplesFilter,
  offset: number,
  limit: number,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    run_id: ctx.runId,
    task: ctx.task,
    model: ctx.model,
    framework: ctx.framework,
    hardware: ctx.hardware,
    precision: ctx.precision,
    spec_method: ctx.specMethod,
    disagg: String(ctx.disagg),
    filter,
    offset: String(offset),
    limit: String(limit),
  });
  if (ctx.conc !== null) params.set('conc', String(ctx.conc));
  return fetchJson<EvalSamplesResponse>(`/api/v1/eval-samples-live?${params}`, signal);
}

export function fetchSubmissions(signal?: AbortSignal) {
  return fetchJson<SubmissionsResponse>('/api/v1/submissions', signal);
}

export interface FeedbackListRow {
  id: string;
  created_at: string;
  doing_well_ciphertext: string | null;
  doing_poorly_ciphertext: string | null;
  want_to_see_ciphertext: string | null;
  user_agent_ciphertext: string | null;
  page_path_ciphertext: string | null;
}

export function fetchFeedbackList(signal?: AbortSignal) {
  return fetchJson<{ rows: FeedbackListRow[] }>('/api/v1/feedback/list', signal);
}

/** Environment metadata for a single benchmark row, served by /api/v1/run-environment. */
export interface BenchmarkEnvironment {
  /** Provenance: 'env_json' = authoritative, 'log_parse' = best-effort fallback. */
  source: 'env_json' | 'log_parse';
  image: string | null;
  framework_version: string | null;
  framework_sha: string | null;
  torch_version: string | null;
  python_version: string | null;
  cuda_version: string | null;
  rocm_version: string | null;
  driver_version: string | null;
  gpu_sku: string | null;
  extra: Record<string, unknown>;
}

export interface RunEnvironmentResponse {
  workflow_run_id: number;
  config_id: number;
  environment: BenchmarkEnvironment;
}

export function fetchRunEnvironment(workflowRunId: number, configId: number, signal?: AbortSignal) {
  const params = new URLSearchParams({
    workflow_run_id: String(workflowRunId),
    config_id: String(configId),
  });
  return fetchJson<RunEnvironmentResponse>(`/api/v1/run-environment?${params}`, signal);
}
