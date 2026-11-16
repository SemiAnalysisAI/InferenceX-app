/**
 * Reads behind the SLA Targets view: the per-attempt data of a benchmark
 * point, and the benchmark commit and replayed dataset of each run.
 */

import type { SlaUnavailableReason } from '@semianalysisai/inferencex-constants';

import type { DbClient } from '../connection.js';
import {
  SLA_ATTEMPTS_VERSION,
  decodeSlaAttempts,
  slaAttemptsFromTimeline,
  type RequestRecordsUnavailableReason,
  type SlaAttemptsBlob,
} from '../etl/sla-attempts';

import { getRequestChartData } from './request-chart-data';

/**
 * Where the attempt data of a point comes from, and its content identity.
 * - `attempts`: the stored blob built from the original AgentX export.
 * - `request_records`: the stored blob built from the `request_records` block
 *   of a fixed-sequence result.
 * - `timeline`: no blob yet; the derived request timeline, whose outcomes are inferred.
 * - `unavailable`: the result carried per-request data that could not be
 *   stored as attempt data; `reason` and `detail` say why.
 * - `none`: no request-level data is stored for the point.
 */
export type SlaAttemptsSource =
  | {
      kind: 'attempts' | 'request_records' | 'timeline' | 'none';
      /** Changes whenever the stored data changes; part of the evaluation cache key. */
      identity: string;
    }
  | {
      kind: 'unavailable';
      identity: string;
      reason: SlaUnavailableReason;
      /** What ingest recorded, in the producer's own terms. */
      detail: string | null;
    };

/** Columns omitted for size is its own reason; every other stored reason is an unreadable block. */
export function slaUnavailableReason(stored: string): SlaUnavailableReason {
  const omitted: RequestRecordsUnavailableReason = 'columns_omitted';
  return stored === omitted ? 'request_columns_omitted' : 'request_records_unreadable';
}

type Feature = 'agentic_columns' | 'request_records_table';
const featurePresent = new WeakMap<object, Partial<Record<Feature, Promise<boolean>>>>();

/**
 * Whether migration 030 (attempt columns on `agentic_trace_replay`) or 031
 * (`benchmark_sla_attempts`) has been applied. Migrations are applied by
 * hand, so a deployment can run ahead of its database; until then AgentX
 * points read from the derived timeline and fixed-sequence points have no
 * request-level data.
 */
function hasFeature(sql: DbClient, feature: Feature): Promise<boolean> {
  const known = featurePresent.get(sql) ?? {};
  featurePresent.set(sql, known);
  known[feature] ??= (async () => {
    const rows =
      feature === 'agentic_columns'
        ? await sql`
            select 1 from information_schema.columns
            where table_name = 'agentic_trace_replay' and column_name = 'sla_attempts_gz'
            limit 1
          `
        : await sql`select 1 where to_regclass('public.benchmark_sla_attempts') is not null`;
    return rows.length > 0;
  })();
  // A failed probe is asked again next time, not remembered as an answer.
  known[feature].catch(() => {
    delete known[feature];
  });
  return known[feature];
}

interface SourceRow {
  id: number;
  attempts_sha: string | null;
  timeline_sha: string | null;
  has_timeline: boolean;
}

interface RequestRecordsRow {
  id: number;
  sha: string | null;
  version: number;
  unavailable_reason: string | null;
  unavailable_detail: string | null;
}

/** The attempt-data source of each benchmark point; unknown ids are absent. */
export async function getSlaAttemptsSources(
  sql: DbClient,
  benchmarkResultIds: readonly number[],
): Promise<Record<number, SlaAttemptsSource>> {
  if (benchmarkResultIds.length === 0) return {};
  const ids = [...benchmarkResultIds];
  const rows = ((await hasFeature(sql, 'agentic_columns'))
    ? await sql`
          select
            br.id::int as id,
            case when atr.sla_attempts_gz is not null
                and atr.sla_attempts_version = ${SLA_ATTEMPTS_VERSION}
              then encode(atr.sla_attempts_sha256, 'hex') end as attempts_sha,
            encode(atr.request_timeline_sha256, 'hex') as timeline_sha,
            coalesce(atr.request_timeline_gz is not null or atr.request_timeline is not null, false)
              as has_timeline
          from benchmark_results br
          left join agentic_trace_replay atr on atr.id = br.trace_replay_id
          where br.id = any(${ids}::bigint[])
        `
    : await sql`
          select
            br.id::int as id,
            null::text as attempts_sha,
            encode(atr.request_timeline_sha256, 'hex') as timeline_sha,
            coalesce(atr.request_timeline_gz is not null or atr.request_timeline is not null, false)
              as has_timeline
          from benchmark_results br
          left join agentic_trace_replay atr on atr.id = br.trace_replay_id
          where br.id = any(${ids}::bigint[])
        `) as unknown as SourceRow[];
  const records = ((await hasFeature(sql, 'request_records_table'))
    ? await sql`
          select
            benchmark_result_id::int as id,
            encode(sla_attempts_sha256, 'hex') as sha,
            sla_attempts_version::int as version,
            unavailable_reason,
            unavailable_detail
          from benchmark_sla_attempts
          where benchmark_result_id = any(${ids}::bigint[])
        `
    : []) as unknown as RequestRecordsRow[];
  const recordsById = new Map(records.map((row) => [row.id, row]));

  const sources: Record<number, SlaAttemptsSource> = {};
  for (const row of rows) {
    const stored = recordsById.get(row.id);
    if (stored && stored.unavailable_reason !== null) {
      sources[row.id] = {
        kind: 'unavailable',
        identity: `unavailable:${stored.unavailable_reason}`,
        reason: slaUnavailableReason(stored.unavailable_reason),
        detail: stored.unavailable_detail,
      };
    } else if (stored && stored.sha !== null && stored.version !== SLA_ATTEMPTS_VERSION) {
      // Built by another extraction version: never decoded on a guess.
      sources[row.id] = {
        kind: 'unavailable',
        identity: `unavailable:version:${stored.version}`,
        reason: 'request_records_unreadable',
        detail: `attempt data version ${stored.version}, this reader expects ${SLA_ATTEMPTS_VERSION}`,
      };
    } else if (stored && stored.sha !== null) {
      sources[row.id] = { kind: 'request_records', identity: `records:${stored.sha}` };
    } else if (row.attempts_sha !== null) {
      sources[row.id] = { kind: 'attempts', identity: `attempts:${row.attempts_sha}` };
    } else if (row.has_timeline) {
      sources[row.id] = {
        kind: 'timeline',
        identity: `timeline:${row.timeline_sha ?? 'legacy'}`,
      };
    } else {
      sources[row.id] = { kind: 'none', identity: 'none' };
    }
  }
  return sources;
}

/**
 * The attempt data of one benchmark point: the stored blob, or, when none is
 * stored, the same shape built from the derived request timeline. `null`
 * when the point has no request-level data at all.
 */
export async function getSlaAttempts(
  sql: DbClient,
  benchmarkResultId: number,
  kind: SlaAttemptsSource['kind'],
): Promise<SlaAttemptsBlob | null> {
  if (kind === 'none' || kind === 'unavailable') return null;
  if (kind === 'request_records') {
    const rows = (await sql`
      select encode(sla_attempts_gz, 'base64') as gz
      from benchmark_sla_attempts
      where benchmark_result_id = ${benchmarkResultId}
        and sla_attempts_version = ${SLA_ATTEMPTS_VERSION}
    `) as unknown as { gz: string | null }[];
    const gz = rows[0]?.gz;
    return gz ? decodeSlaAttempts(Buffer.from(gz, 'base64')) : null;
  }
  if (kind === 'attempts') {
    const rows = (await sql`
      select encode(atr.sla_attempts_gz, 'base64') as gz
      from benchmark_results br
      join agentic_trace_replay atr on atr.id = br.trace_replay_id
      where br.id = ${benchmarkResultId}
        and atr.sla_attempts_version = ${SLA_ATTEMPTS_VERSION}
    `) as unknown as { gz: string | null }[];
    const gz = rows[0]?.gz;
    if (gz) return decodeSlaAttempts(Buffer.from(gz, 'base64'));
  }
  const chart = await getRequestChartData(sql, benchmarkResultId);
  if (!chart) return null;
  return slaAttemptsFromTimeline(
    chart.requests.map(([, phase, startUs, endUs, ttftMs, tpotMs, , outputTokens, cancelled]) => ({
      phase: chart.phases[phase] ?? 'unknown',
      startUs,
      endUs,
      ttftMs,
      tpotMs,
      outputTokens,
      cancelled: cancelled === 1,
    })),
  );
}

export interface SlaRunProvenanceRow {
  github_run_id: string;
  /** Commit of the benchmark repository the run used. */
  head_sha: string | null;
  /** Slug of the dataset an AgentX run replayed. */
  dataset_slug: string | null;
}

/** Benchmark commit and replayed dataset of the latest attempt of each run. */
export async function getSlaRunProvenance(
  sql: DbClient,
  githubRunIds: readonly string[],
): Promise<SlaRunProvenanceRow[]> {
  if (githubRunIds.length === 0) return [];
  const rows = await sql`
    select wr.github_run_id::text as github_run_id, wr.head_sha, rd.dataset_slug
    from latest_workflow_runs wr
    left join run_datasets rd on rd.workflow_run_id = wr.id
    where wr.github_run_id = any(${[...githubRunIds]}::bigint[])
    order by wr.github_run_id
  `;
  return rows as unknown as SlaRunProvenanceRow[];
}

/**
 * Of the given benchmark points, those whose result carried a
 * `request_records` block: stored as attempt data, or stored with the reason
 * it could not be. Empty until migration 031 is applied.
 */
export async function getRequestRecordsPresence(
  sql: DbClient,
  benchmarkResultIds: readonly number[],
): Promise<number[]> {
  if (benchmarkResultIds.length === 0 || !(await hasFeature(sql, 'request_records_table'))) {
    return [];
  }
  const rows = (await sql`
    select benchmark_result_id::int as id
    from benchmark_sla_attempts
    where benchmark_result_id = any(${[...benchmarkResultIds]}::bigint[])
    order by benchmark_result_id
  `) as unknown as { id: number }[];
  return rows.map((row) => row.id);
}
