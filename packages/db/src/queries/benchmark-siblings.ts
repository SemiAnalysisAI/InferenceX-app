/**
 * Find all benchmark_results that share the same SKU (hardware + framework +
 * model + precision + spec_method + disagg + benchmark_type + workflow_run)
 * as the given point. Used by the detail page to render a "switch between
 * concs / parallelisms" navigator within a single run.
 */

import type { DbClient } from '../connection.js';

export interface BenchmarkSibling {
  id: number;
  conc: number;
  /** "on" | "off" | null. */
  offload_mode: string | null;
  /** Physical KV-cache tier selection reported by the benchmark runner. */
  kv_offloading: string | null;
  decode_tp: number;
  decode_ep: number;
  decode_pp: number | null;
  decode_dcp_size: number | null;
  decode_pcp_size: number | null;
  decode_dp_attention: boolean;
  decode_num_workers: number;
  prefill_tp: number;
  prefill_ep: number;
  prefill_pp: number | null;
  prefill_dcp_size: number | null;
  prefill_pcp_size: number | null;
  prefill_dp_attention: boolean;
  prefill_num_workers: number;
  num_prefill_gpu: number;
  num_decode_gpu: number;
  disagg: boolean;
  is_multinode: boolean;
  /** Throughput per GPU (tok/s/gpu) for this point; null if the metric is absent. */
  tput_per_gpu: number | null;
  /** P90 interactivity (tok/s/user), used by the AgentX Pareto navigator. */
  p90_intvty: number | null;
  /** P90 time to first token (s), used by the AgentX Pareto navigator. */
  p90_ttft: number | null;
  /**
   * Total requests for this point — `total_requests_completed` (aiperf runner)
   * falling back to the legacy `num_requests_total`; null if neither is present.
   */
  total_requests: number | null;
  /** True if this row IS the point passed in. */
  is_current: boolean;
  /** Whether the row has a stored trace_replay blob (for navigation hint). */
  has_trace: boolean;
}

export interface BenchmarkSku {
  hardware: string;
  framework: string;
  model: string;
  precision: string;
  spec_method: string;
  benchmark_type: string;
  /** Human-readable workflow_run summary so the page header can hint at provenance. */
  github_run_id: number;
  date: string;
  /** Slug of the source dataset this run replayed (run_datasets), or null. */
  dataset_slug: string | null;
}

export interface BenchmarkSiblings {
  sku: BenchmarkSku;
  siblings: BenchmarkSibling[];
}

export async function getBenchmarkSiblings(
  sql: DbClient,
  benchmarkResultId: number,
): Promise<BenchmarkSiblings | null> {
  // Step 1: resolve the SKU defining fields for the requested point.
  const seed = (await sql`
    select
      c.hardware, c.framework, c.model, c.precision, c.spec_method,
      br.benchmark_type, br.workflow_run_id, br.date::text,
      wr.github_run_id, rd.dataset_slug
    from benchmark_results br
    join configs c on c.id = br.config_id
    join workflow_runs wr on wr.id = br.workflow_run_id
    left join run_datasets rd on rd.workflow_run_id = br.workflow_run_id
    where br.id = ${benchmarkResultId}
  `) as unknown as {
    hardware: string;
    framework: string;
    model: string;
    precision: string;
    spec_method: string;
    benchmark_type: string;
    workflow_run_id: number;
    date: string;
    github_run_id: number;
    dataset_slug: string | null;
  }[];
  const root = seed[0];
  if (!root) return null;

  // Step 2: pull every sibling row sharing the SKU within the same workflow_run.
  const rows = (await sql`
    select
      br.id, br.conc, br.offload_mode,
      nullif(br.metrics->>'kv_offloading', '') as kv_offloading,
      c.decode_tp, c.decode_ep, (br.metrics->>'decode_pp')::int as decode_pp,
      coalesce(
        (br.metrics->>'decode_dcp_size')::int,
        (br.metrics->>'dcp_size')::int
      ) as decode_dcp_size,
      coalesce(
        (br.metrics->>'decode_pcp_size')::int,
        (br.metrics->>'pcp_size')::int
      ) as decode_pcp_size,
      c.decode_dp_attention, c.decode_num_workers,
      c.prefill_tp, c.prefill_ep, (br.metrics->>'prefill_pp')::int as prefill_pp,
      coalesce(
        (br.metrics->>'prefill_dcp_size')::int,
        (br.metrics->>'dcp_size')::int
      ) as prefill_dcp_size,
      coalesce(
        (br.metrics->>'prefill_pcp_size')::int,
        (br.metrics->>'pcp_size')::int
      ) as prefill_pcp_size,
      c.prefill_dp_attention, c.prefill_num_workers,
      c.num_prefill_gpu, c.num_decode_gpu, c.disagg, c.is_multinode,
      (br.metrics->>'tput_per_gpu')::float8 as tput_per_gpu,
      (br.metrics->>'p90_intvty')::float8 as p90_intvty,
      (br.metrics->>'p90_ttft')::float8 as p90_ttft,
      coalesce(
        (br.metrics->>'total_requests_completed')::float8,
        (br.metrics->>'num_requests_total')::float8
      ) as total_requests,
      (br.trace_replay_id is not null) as has_trace
    from benchmark_results br
    join configs c on c.id = br.config_id
    where br.workflow_run_id = ${root.workflow_run_id}
      and br.benchmark_type = ${root.benchmark_type}
      and c.hardware = ${root.hardware}
      and c.framework = ${root.framework}
      and c.model = ${root.model}
      and c.precision = ${root.precision}
      and c.spec_method = ${root.spec_method}
    order by c.decode_tp, c.decode_ep, br.offload_mode nulls first, br.conc
  `) as unknown as {
    id: number;
    conc: number;
    offload_mode: string | null;
    kv_offloading: string | null;
    decode_tp: number;
    decode_ep: number;
    decode_pp: number | null;
    decode_dcp_size: number | null;
    decode_pcp_size: number | null;
    decode_dp_attention: boolean;
    decode_num_workers: number;
    prefill_tp: number;
    prefill_ep: number;
    prefill_pp: number | null;
    prefill_dcp_size: number | null;
    prefill_pcp_size: number | null;
    prefill_dp_attention: boolean;
    prefill_num_workers: number;
    num_prefill_gpu: number;
    num_decode_gpu: number;
    disagg: boolean;
    is_multinode: boolean;
    tput_per_gpu: number | null;
    p90_intvty: number | null;
    p90_ttft: number | null;
    total_requests: number | null;
    has_trace: boolean;
  }[];

  const siblings: BenchmarkSibling[] = rows.map((r) => ({
    id: Number(r.id),
    conc: r.conc,
    offload_mode: r.offload_mode,
    kv_offloading: r.kv_offloading,
    decode_tp: r.decode_tp,
    decode_ep: r.decode_ep,
    decode_pp: r.decode_pp === null ? null : Number(r.decode_pp),
    decode_dcp_size: r.decode_dcp_size === null ? null : Number(r.decode_dcp_size),
    decode_pcp_size: r.decode_pcp_size === null ? null : Number(r.decode_pcp_size),
    decode_dp_attention: r.decode_dp_attention,
    decode_num_workers: r.decode_num_workers,
    prefill_tp: r.prefill_tp,
    prefill_ep: r.prefill_ep,
    prefill_pp: r.prefill_pp === null ? null : Number(r.prefill_pp),
    prefill_dcp_size: r.prefill_dcp_size === null ? null : Number(r.prefill_dcp_size),
    prefill_pcp_size: r.prefill_pcp_size === null ? null : Number(r.prefill_pcp_size),
    prefill_dp_attention: r.prefill_dp_attention,
    prefill_num_workers: r.prefill_num_workers,
    num_prefill_gpu: r.num_prefill_gpu,
    num_decode_gpu: r.num_decode_gpu,
    disagg: r.disagg,
    is_multinode: r.is_multinode,
    tput_per_gpu: r.tput_per_gpu === null ? null : Number(r.tput_per_gpu),
    p90_intvty: r.p90_intvty === null ? null : Number(r.p90_intvty),
    p90_ttft: r.p90_ttft === null ? null : Number(r.p90_ttft),
    total_requests: r.total_requests === null ? null : Number(r.total_requests),
    is_current: Number(r.id) === benchmarkResultId,
    has_trace: r.has_trace,
  }));

  return {
    sku: {
      hardware: root.hardware,
      framework: root.framework,
      model: root.model,
      precision: root.precision,
      spec_method: root.spec_method,
      benchmark_type: root.benchmark_type,
      github_run_id: Number(root.github_run_id),
      date: root.date,
      dataset_slug: root.dataset_slug ?? null,
    },
    siblings,
  };
}
