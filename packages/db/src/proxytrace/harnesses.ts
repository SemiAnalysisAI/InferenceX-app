import { type Kysely, sql } from 'kysely';
import type { Harness } from './shared/harness';
import { requestsVisFilter, SESSION_HARNESS_SQL, sessionsVisFilter } from './operations';
import type { Database } from './types';

/**
 * Share of `requests` heap blocks (TABLESAMPLE SYSTEM) behind the per-request
 * harness comparisons. A full pass over `requests` takes ~30 s; a fixed-seed
 * 0.5% block sample (~14k requests) reads a few seconds cold and returns the
 * same rows on every call.
 */
export const HARNESS_SAMPLE_PERCENT = 0.5;
const HARNESS_SAMPLE_SEED = 7;

/** Requests per log10 token bucket: bucket `b` covers [10^(b/10), 10^((b+1)/10)). */
export const HARNESS_BUCKETS_PER_DECADE = 10;

export interface HarnessTotals {
  harness: Harness;
  /** Sampled requests. */
  requests: number;
  /** Sampled requests sent by the main agent (no subagent label). */
  mainRequests: number;
  /** Tool calls across the sampled requests. */
  toolCalls: number;
  /** Prompt tokens (input + cache read + cache write) across the sampled requests. */
  promptTokens: number;
  /** Output tokens across the sampled requests. */
  outputTokens: number;
}

/** Exact per-session figures over every session with recorded prompt tokens. */
export interface HarnessSessions {
  harness: Harness;
  sessions: number;
  requestsP50: number;
  requestsP90: number;
  promptP50: number;
  promptP90: number;
  outputP50: number;
  outputP90: number;
  /** Session prompt tokens divided by its request count. */
  promptPerRequestP50: number;
  outputPerRequestP50: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface HarnessBucket {
  harness: Harness;
  bucket: number;
  count: number;
}

export type SessionMetric = 'prompt' | 'output' | 'requests' | 'promptPerRequest';

/** Log buckets per decade for each session metric; request counts are small integers. */
export const SESSION_METRIC_PER_DECADE: Record<SessionMetric, number> = {
  prompt: HARNESS_BUCKETS_PER_DECADE,
  output: HARNESS_BUCKETS_PER_DECADE,
  requests: 5,
  promptPerRequest: HARNESS_BUCKETS_PER_DECADE,
};

export interface HarnessSessionBucket extends HarnessBucket {
  metric: SessionMetric;
}

export interface HarnessShare {
  harness: Harness;
  key: string | null;
  count: number;
}

export interface HarnessProfile {
  samplePercent: number;
  totals: HarnessTotals[];
  sessions: HarnessSessions[];
  /** Sessions per log bucket of each session metric. */
  sessionBuckets: HarnessSessionBucket[];
  /** Main-agent prompt size (input + cache read + cache write), log buckets. */
  contextBuckets: HarnessBucket[];
  /** Output tokens per response, log buckets; zero-token responses land in bucket -1. */
  outputBuckets: HarnessBucket[];
  /** Main-agent responses by tool calls emitted (`key` is '0'..'3' or '4+'). */
  toolCallsPerResponse: HarnessShare[];
}

/**
 * Everything the Harnesses page compares, in one round trip. Per-session
 * figures are exact, from `session_summary`; per-request distributions come
 * from one fixed block sample of `requests` (tool calls read from the small
 * inline `metadata.toolUses`, which mirrors `request_stats.tool_uses`, to
 * avoid a second random-access pass).
 */
export async function getHarnessProfile(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
): Promise<HarnessProfile> {
  const res = await sql<{
    totals: HarnessTotals[] | null;
    sessions: HarnessSessions[] | null;
    session_buckets: HarnessSessionBucket[] | null;
    context_buckets: HarnessBucket[] | null;
    output_buckets: HarnessBucket[] | null;
    tool_calls: HarnessShare[] | null;
  }>`
    WITH sample AS MATERIALIZED (
      SELECT
        ${SESSION_HARNESS_SQL} AS harness,
        r.subagent_label IS NULL AS main,
        coalesce(r.input_tokens, 0)
          + coalesce(r.cache_read_input_tokens, 0)
          + coalesce(r.cache_write_tokens, 0) AS context_tokens,
        r.output_tokens,
        CASE WHEN jsonb_typeof(r.metadata -> 'toolUses') = 'array'
          THEN r.metadata -> 'toolUses' ELSE '[]'::jsonb END AS tool_uses
      FROM requests r TABLESAMPLE SYSTEM (${sql.lit(HARNESS_SAMPLE_PERCENT)})
        REPEATABLE (${sql.lit(HARNESS_SAMPLE_SEED)})
      JOIN sessions ON sessions.id = r.session_id
      WHERE ${requestsVisFilter(vis, 'r', traceVersion)}
    ),
    sess AS MATERIALIZED (
      SELECT
        ${SESSION_HARNESS_SQL} AS harness,
        ss.request_count::float8 AS requests,
        (ss.total_input + ss.total_cache_read + ss.total_cache_write)::float8 AS prompt,
        ss.total_output::float8 AS output,
        ss.total_input::float8 AS input,
        ss.total_cache_read::float8 AS cache_read,
        ss.total_cache_write::float8 AS cache_write
      FROM session_summary ss
      JOIN sessions ON sessions.id = ss.session_id
      WHERE ss.request_count > 0
        AND ss.total_input + ss.total_cache_read + ss.total_cache_write > 0
        AND ${sessionsVisFilter(vis)}
        AND ${
          traceVersion === null
            ? sql`TRUE`
            : sql`ss.min_trace_version = ${traceVersion} AND ss.max_trace_version = ${traceVersion}`
        }
    )
    SELECT
      (SELECT json_agg(t) FROM (
        SELECT
          harness,
          count(*)::int AS "requests",
          count(*) FILTER (WHERE main)::int AS "mainRequests",
          sum(jsonb_array_length(tool_uses))::int AS "toolCalls",
          sum(context_tokens)::float8 AS "promptTokens",
          coalesce(sum(output_tokens), 0)::float8 AS "outputTokens"
        FROM sample
        GROUP BY harness
      ) t) AS totals,
      (SELECT json_agg(t) FROM (
        SELECT
          harness,
          count(*)::int AS "sessions",
          percentile_cont(0.5) WITHIN GROUP (ORDER BY requests) AS "requestsP50",
          percentile_cont(0.9) WITHIN GROUP (ORDER BY requests) AS "requestsP90",
          percentile_cont(0.5) WITHIN GROUP (ORDER BY prompt) AS "promptP50",
          percentile_cont(0.9) WITHIN GROUP (ORDER BY prompt) AS "promptP90",
          percentile_cont(0.5) WITHIN GROUP (ORDER BY output) AS "outputP50",
          percentile_cont(0.9) WITHIN GROUP (ORDER BY output) AS "outputP90",
          percentile_cont(0.5) WITHIN GROUP (ORDER BY prompt / requests) AS "promptPerRequestP50",
          percentile_cont(0.5) WITHIN GROUP (ORDER BY output / requests) AS "outputPerRequestP50",
          sum(input) AS "inputTokens",
          sum(cache_read) AS "cacheReadTokens",
          sum(cache_write) AS "cacheWriteTokens"
        FROM sess
        GROUP BY harness
      ) t) AS sessions,
      (SELECT json_agg(t) FROM (
        SELECT metric, harness, bucket, count(*)::int AS count
        FROM sess
        CROSS JOIN LATERAL (VALUES
          ('prompt', floor(log(prompt) * ${HARNESS_BUCKETS_PER_DECADE})),
          ('output', CASE WHEN output > 0
            THEN floor(log(output) * ${HARNESS_BUCKETS_PER_DECADE}) END),
          ('requests', floor(log(requests) * ${SESSION_METRIC_PER_DECADE.requests})),
          ('promptPerRequest', floor(log(prompt / requests) * ${HARNESS_BUCKETS_PER_DECADE}))
        ) AS m(metric, bucket)
        WHERE bucket IS NOT NULL
        GROUP BY 1, 2, 3
      ) t) AS session_buckets,
      (SELECT json_agg(t) FROM (
        SELECT harness, floor(log(context_tokens) * ${HARNESS_BUCKETS_PER_DECADE})::int AS bucket,
          count(*)::int AS count
        FROM sample
        WHERE main AND context_tokens > 0
        GROUP BY 1, 2
      ) t) AS context_buckets,
      (SELECT json_agg(t) FROM (
        SELECT harness,
          CASE WHEN output_tokens = 0 THEN -1
            ELSE floor(log(output_tokens) * ${HARNESS_BUCKETS_PER_DECADE})::int END AS bucket,
          count(*)::int AS count
        FROM sample
        WHERE output_tokens IS NOT NULL
        GROUP BY 1, 2
      ) t) AS output_buckets,
      (SELECT json_agg(t) FROM (
        SELECT harness,
          CASE WHEN jsonb_array_length(tool_uses) >= 4 THEN '4+'
            ELSE jsonb_array_length(tool_uses)::text END AS key,
          count(*)::int AS count
        FROM sample WHERE main GROUP BY 1, 2
      ) t) AS tool_calls
  `.execute(db);
  const row = res.rows[0];
  return {
    samplePercent: HARNESS_SAMPLE_PERCENT,
    totals: row?.totals ?? [],
    sessions: row?.sessions ?? [],
    sessionBuckets: row?.session_buckets ?? [],
    contextBuckets: row?.context_buckets ?? [],
    outputBuckets: row?.output_buckets ?? [],
    toolCallsPerResponse: row?.tool_calls ?? [],
  };
}
