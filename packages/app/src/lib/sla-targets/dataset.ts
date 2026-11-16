import type { SlaExclusionCategory, SlaLoadKind } from '@semianalysisai/inferencex-constants';
import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { hasRealPoolSplit } from '@semianalysisai/inferencex-db/etl/disagg-throughput';

import { runIdFromRunUrl } from '@/lib/benchmarks/known-issues';

export const SLA_AGENTIC_WORKLOAD = 'agentic-traces';

/** One tested load point of a serving configuration. */
export interface SlaTargetsPoint {
  /** Keys the attempt data of the point: `benchmark_results.id`, or a snapshot-local id. */
  id: number;
  /** Load setting: replay lanes (AgentX) or the request-concurrency limit (fixed sequence). */
  concurrency: number;
  /** Whether per-attempt data exists for this point. */
  hasRequestData: boolean;
  /** Name of the benchmark artifact the attempt data was read from, when known. */
  artifact: string | null;
  /** Attempt of the workflow run that produced the point, when known. */
  runAttempt: number | null;
}

/** A load the run tested that produced no measurement. */
export interface SlaExcludedPoint {
  concurrency: number;
  category: SlaExclusionCategory;
  /** What the load generator or the job recorded, in its own words. */
  reason: string;
  runAttempt: number | null;
  jobUrl: string | null;
  artifact: string | null;
  /** Failure classes in the partial export of an aborted run, by count. */
  observedFailures: Record<string, number> | null;
}

/**
 * One serving configuration in one workflow run: hardware, framework,
 * precision, speculative decoding, topology and KV offload mode. Points of
 * different offload modes or runs never share a configuration.
 */
export interface SlaTargetsConfig {
  key: string;
  /** `agentic-traces` or a fixed sequence such as `8k/1k`. */
  workload: string;
  /** What the load value means for this workload. */
  loadKind: SlaLoadKind;
  hardware: string;
  framework: string;
  precision: string;
  specMethod: string;
  disagg: boolean;
  isMultinode: boolean;
  offloadMode: string;
  numPrefillGpu: number;
  numDecodeGpu: number;
  /** GPUs billed for the configuration: both pools of a real prefill/decode split. */
  gpuCount: number;
  /** Prefill and decode pools of a real split, such as `4P+32D`; `null` for one shared pool. */
  poolSplit: string | null;
  date: string;
  runUrl: string | null;
  runId: string | null;
  image: string | null;
  /** Commit of the benchmark repository the run used; `null` when not known. */
  benchmarkCommit: string | null;
  /** Replayed dataset for AgentX runs; `null` when not known. */
  datasetSlug: string | null;
  /** Version of the load generator, when known. */
  harnessVersion: string | null;
  points: SlaTargetsPoint[];
  /** Tested loads without a measurement. Empty when the source records none. */
  excluded: SlaExcludedPoint[];
}

/** A workflow run a captured snapshot was read from. */
export interface SlaCapturedRun {
  runId: string;
  runUrl: string;
  title: string;
  headSha: string;
  createdAt: string;
}

export type SlaTargetsSnapshot =
  | { kind: 'live' }
  | {
      kind: 'captured';
      capturedAt: string;
      source: string;
      /** Extraction version of the captured attempt data. */
      attemptsVersion: number;
      runs: SlaCapturedRun[];
    };

export interface SlaTargetsDataset {
  /** Display model name, as in the dashboard model selector. */
  model: string;
  /** Models this dataset can serve. */
  models: string[];
  snapshot: SlaTargetsSnapshot;
  configs: SlaTargetsConfig[];
}

export interface SlaRunProvenance {
  benchmarkCommit: string | null;
  datasetSlug: string | null;
}

export type SlaConfigRow = Pick<
  BenchmarkRow,
  | 'id'
  | 'hardware'
  | 'framework'
  | 'precision'
  | 'spec_method'
  | 'disagg'
  | 'is_multinode'
  | 'prefill_tp'
  | 'prefill_ep'
  | 'prefill_dp_attention'
  | 'prefill_num_workers'
  | 'decode_tp'
  | 'decode_ep'
  | 'decode_dp_attention'
  | 'decode_num_workers'
  | 'num_prefill_gpu'
  | 'num_decode_gpu'
  | 'benchmark_type'
  | 'isl'
  | 'osl'
  | 'conc'
  | 'offload_mode'
  | 'image'
  | 'date'
  | 'run_url'
> & { run_started_at?: string | null };

function sequenceToken(tokens: number): string {
  return tokens % 1024 === 0 ? `${tokens / 1024}k` : String(tokens);
}

export function slaWorkloadOfRow(
  row: Pick<SlaConfigRow, 'benchmark_type' | 'isl' | 'osl'>,
): string {
  if (row.benchmark_type === 'agentic_traces') return SLA_AGENTIC_WORKLOAD;
  return `${sequenceToken(row.isl ?? 0)}/${sequenceToken(row.osl ?? 0)}`;
}

function configIdentity(row: SlaConfigRow): string {
  return [
    slaWorkloadOfRow(row),
    row.hardware,
    row.framework,
    row.precision,
    row.spec_method,
    row.disagg ? 'disagg' : 'agg',
    row.is_multinode ? 'multi' : 'single',
    `p${row.prefill_tp}x${row.prefill_ep}${row.prefill_dp_attention ? 'dpa' : ''}w${row.prefill_num_workers}g${row.num_prefill_gpu}`,
    `d${row.decode_tp}x${row.decode_ep}${row.decode_dp_attention ? 'dpa' : ''}w${row.decode_num_workers}g${row.num_decode_gpu}`,
    `offload-${row.offload_mode || 'off'}`,
  ].join('|');
}

function runOrder(row: SlaConfigRow): string {
  return `${row.date}|${row.run_started_at ?? ''}|${runIdFromRunUrl(row.run_url) ?? ''}`;
}

/**
 * Group benchmark rows into serving configurations. Each configuration keeps
 * the points of its latest workflow run only, so one series never mixes runs.
 */
export function buildSlaConfigs(
  rows: readonly SlaConfigRow[],
  hasRequestData: (id: number, agentic: boolean) => boolean,
  provenance: (runId: string | null) => SlaRunProvenance | undefined = () => undefined,
): SlaTargetsConfig[] {
  const latestRun = new Map<string, { order: string; rows: SlaConfigRow[] }>();
  for (const row of rows) {
    const identity = configIdentity(row);
    const order = runOrder(row);
    const group = latestRun.get(identity);
    if (!group || order > group.order) latestRun.set(identity, { order, rows: [row] });
    else if (order === group.order) group.rows.push(row);
  }

  return [...latestRun.entries()]
    .map(([key, { rows: runRows }]): SlaTargetsConfig => {
      const first = runRows[0];
      const split = hasRealPoolSplit(first);
      const gpuCount = split
        ? first.num_prefill_gpu + first.num_decode_gpu
        : Math.max(first.num_decode_gpu, first.num_prefill_gpu);
      const runId = runIdFromRunUrl(first.run_url);
      const run = provenance(runId);
      const isAgentic = first.benchmark_type === 'agentic_traces';
      return {
        key,
        workload: slaWorkloadOfRow(first),
        loadKind: isAgentic ? 'agentx_users' : 'request_concurrency',
        hardware: first.hardware,
        framework: first.framework,
        precision: first.precision,
        specMethod: first.spec_method,
        disagg: first.disagg,
        isMultinode: first.is_multinode,
        offloadMode: first.offload_mode || 'off',
        numPrefillGpu: first.num_prefill_gpu,
        numDecodeGpu: first.num_decode_gpu,
        gpuCount,
        poolSplit: split ? `${first.num_prefill_gpu}P+${first.num_decode_gpu}D` : null,
        date: first.date,
        runUrl: first.run_url,
        runId,
        image: first.image,
        benchmarkCommit: run?.benchmarkCommit ?? null,
        datasetSlug: isAgentic ? (run?.datasetSlug ?? null) : null,
        harnessVersion: null,
        points: runRows
          .map((row) => ({
            id: Number(row.id),
            concurrency: row.conc,
            hasRequestData: hasRequestData(Number(row.id), isAgentic),
            artifact: null,
            runAttempt: null,
          }))
          .toSorted((a, b) => a.concurrency - b.concurrency || a.id - b.id),
        excluded: [],
      };
    })
    .toSorted((a, b) => a.key.localeCompare(b.key));
}
