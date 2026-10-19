import {
  COLLECTIVEX_DEFAULT_VERSION,
  type CollectiveXDataset,
  type CollectiveXRunSummary,
  type CollectiveXVersion,
} from '@/components/collectivex/types';
import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';
import type { EvalRow } from '@semianalysisai/inferencex-db/queries/evaluations';

import type { SubmissionsResponse } from '../submissions/submissions-types';

export type { BenchmarkRow, EvalRow };

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
  append_only?: boolean;
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

export interface RunConfigRow {
  github_run_id: number;
  run_started_at: string | null;
  html_url: string | null;
  head_sha: string | null;
  model: string;
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
  runConfigs: RunConfigRow[];
}

export interface ReliabilityRow {
  hardware: string;
  date: string;
  n_success: number;
  total: number;
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
  runId?: string,
  exactRun?: boolean,
  view?: { type: 'calculator'; sequence: string },
) {
  const params = new URLSearchParams({ model });
  if (date) params.set('date', date);
  if (exact) params.set('exact', 'true');
  if (runId) params.set('runId', runId);
  if (exactRun) params.set('exactRun', 'true');
  if (view) {
    params.set('view', view.type);
    params.set('sequence', view.sequence);
  }
  return fetchJson<BenchmarkRow[]>(`/api/v1/benchmarks?${params}`, signal);
}

export function fetchBenchmarkHistory(
  model: string,
  isl: number,
  osl: number,
  signal?: AbortSignal,
  benchmarkType?: 'agentic_traces',
  view?: 'calculator',
) {
  const params = new URLSearchParams({
    model,
    isl: String(isl),
    osl: String(osl),
  });
  if (benchmarkType) params.set('benchmarkType', benchmarkType);
  if (view) params.set('view', view);
  return fetchJson<BenchmarkRow[]>(`/api/v1/benchmarks/history?${params}`, signal);
}

export function fetchWorkflowInfo(
  date: string,
  signal?: AbortSignal,
  benchmarkType?: 'agentic_traces',
) {
  const params = new URLSearchParams({ date });
  if (benchmarkType) params.set('benchmarkType', benchmarkType);
  return fetchJson<WorkflowInfoResponse>(`/api/v1/workflow-info?${params}`, signal);
}

export interface AvailabilityRow {
  model: string;
  isl: number | null;
  osl: number | null;
  precision: string;
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
  benchmark_type: string;
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
  response: string | null;
  rawResponse: string | null;
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
  offset?: number;
}

export type EvalSamplesFilter = 'all' | 'passed' | 'failed';

export function fetchEvalSamples(
  evalResultId: number,
  filter: EvalSamplesFilter,
  offset: number,
  limit: number,
  docId?: number | null,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    eval_result_id: String(evalResultId),
    filter,
    offset: String(offset),
    limit: String(limit),
  });
  if (docId !== null && docId !== undefined) params.set('doc_id', String(docId));
  return fetchJson<EvalSamplesResponse>(`/api/v1/eval-samples?${params}`, signal);
}

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

export function fetchCollectiveXRunList(
  version: CollectiveXVersion = COLLECTIVEX_DEFAULT_VERSION,
  signal?: AbortSignal,
) {
  return fetchJson<{
    version: CollectiveXVersion;
    runs: CollectiveXRunSummary[];
    discovery_complete: boolean;
  }>(`/api/v1/collectivex/runs?version=${version}`, signal);
}

export function fetchCollectiveXRun(
  version: CollectiveXVersion,
  runId: string,
  signal?: AbortSignal,
) {
  return fetchJson<CollectiveXDataset>(
    `/api/v1/collectivex/runs/${runId}?version=${version}`,
    signal,
  );
}

export async function deleteCollectiveXRun(runId: string, token: string): Promise<boolean> {
  const response = await fetch(`/api/v1/collectivex/runs/${runId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) return false;
  if (!response.ok) throw new Error(`CollectiveX delete failed (${response.status}).`);
  return true;
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

export interface LatestImageRow {
  model: string;
  hardware: string;
  framework: string;
  precision: string;
  spec_method: string;
  disagg: boolean;
  isl: number | null;
  osl: number | null;
  benchmark_type: string;
  image: string;
  date: string;
}

export function fetchLatestImages(signal?: AbortSignal) {
  return fetchJson<LatestImageRow[]>('/api/v1/latest-images', signal);
}

export type FrameworkReleases = Record<string, string | null>;

export function fetchFrameworkReleases(signal?: AbortSignal) {
  return fetchJson<FrameworkReleases>('/api/v1/framework-releases', signal);
}
