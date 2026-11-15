/**
 * Reads behind the SLA Targets view: the per-attempt data of a benchmark
 * point, and the benchmark commit and replayed dataset of each run.
 */

import type { DbClient } from '../connection.js';
import {
  SLA_ATTEMPTS_VERSION,
  decodeSlaAttempts,
  slaAttemptsFromTimeline,
  type SlaAttemptsBlob,
} from '../etl/sla-attempts';

import { getRequestChartData } from './request-chart-data';

/**
 * Where the attempt data of a point comes from, and its content identity.
 * - `attempts`: the stored blob built from the original export.
 * - `timeline`: no blob yet; the derived request timeline, whose outcomes are inferred.
 * - `none`: no request-level data is stored for the point.
 */
export interface SlaAttemptsSource {
  kind: 'attempts' | 'timeline' | 'none';
  /** Changes whenever the stored data changes; part of the evaluation cache key. */
  identity: string;
}

const columnsPresent = new WeakMap<object, Promise<boolean>>();

/**
 * Whether migration 030 has been applied. Migrations are applied by hand, so
 * a deployment can run ahead of its database; until then every point reads
 * from the derived timeline.
 */
function hasSlaAttemptsColumns(sql: DbClient): Promise<boolean> {
  let present = columnsPresent.get(sql);
  if (!present) {
    present = (async () => {
      const rows = await sql`
        select 1 from information_schema.columns
        where table_name = 'agentic_trace_replay' and column_name = 'sla_attempts_gz'
        limit 1
      `;
      return rows.length > 0;
    })();
    columnsPresent.set(sql, present);
  }
  return present;
}

interface SourceRow {
  id: number;
  attempts_sha: string | null;
  timeline_sha: string | null;
  has_timeline: boolean;
}

/** The attempt-data source of each benchmark point; unknown ids are absent. */
export async function getSlaAttemptsSources(
  sql: DbClient,
  benchmarkResultIds: readonly number[],
): Promise<Record<number, SlaAttemptsSource>> {
  if (benchmarkResultIds.length === 0) return {};
  const ids = [...benchmarkResultIds];
  const rows = ((await hasSlaAttemptsColumns(sql))
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
  const sources: Record<number, SlaAttemptsSource> = {};
  for (const row of rows) {
    if (row.attempts_sha !== null) {
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
  if (kind === 'none') return null;
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
