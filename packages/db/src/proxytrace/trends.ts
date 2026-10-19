import { type Kysely, sql } from 'kysely';
import type { Database } from './types';
import type { Harness } from './shared/harness';
import { requestsVisFilter, SESSION_HARNESS_SQL, sessionsVisFilter } from './operations';
import { assertRollupReady } from './stats';
import { NOW, TODAY_UTC_DATE, TODAY_UTC_START } from './as-of';
import { AS_OF_ISO } from './shared/as-of';
import { sanitizeModel } from './shared/pricing';

const TRENDS_CACHE_SCHEMA = 2;

export function trendsCacheKey(
  visibleClientIds: string[] | null,
  traceVersion: number | null,
): string {
  const scope = visibleClientIds === null ? 'all' : 'anon';
  return `tr:${TRENDS_CACHE_SCHEMA}:trends:${scope}:${traceVersion ?? 'all'}`;
}

function writeTrendsCache(_db: Kysely<Database>, _key: string, _data: unknown): Promise<void> {
  return Promise.resolve();
}

function rollupVisFilter(visibleClientIds: string[] | null, traceVersion: number | null) {
  const vis =
    visibleClientIds === null ? sql`TRUE` : sql`rollup_requests_daily.privacy_mode = 'anon'`;
  if (traceVersion === null) return vis;
  return sql`${vis} AND rollup_requests_daily.trace_version = ${traceVersion}`;
}

export interface DailyModelRow {
  day: string;
  model: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_write_tokens: number;
}

export async function dailyModelRollup(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
): Promise<DailyModelRow[]> {
  const [rollupRes, liveRes] = await Promise.all([
    sql<{
      day: Date;
      model: string;
      request_count: string;
      input_tokens: string;
      output_tokens: string;
      cache_read_input_tokens: string;
      cache_write_tokens: string;
    }>`
      SELECT
        day::timestamp AT TIME ZONE 'UTC' AS day,
        model,
        sum(request_count) AS request_count,
        sum(input_tokens) AS input_tokens,
        sum(output_tokens) AS output_tokens,
        sum(cache_read_input_tokens) AS cache_read_input_tokens,
        sum(cache_write_tokens) AS cache_write_tokens
      FROM rollup_requests_daily
      WHERE day < ${TODAY_UTC_DATE} AND model <> ''
        AND ${rollupVisFilter(vis, traceVersion)}
      GROUP BY day, model
    `.execute(db),
    sql<{
      day: Date;
      model: string;
      request_count: string;
      input_tokens: string;
      output_tokens: string;
      cache_read_input_tokens: string;
      cache_write_tokens: string;
    }>`
      SELECT
        date_trunc('day', requests.timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day,
        requests.model AS model,
        count(*) AS request_count,
        coalesce(sum(requests.input_tokens), 0) AS input_tokens,
        coalesce(sum(requests.output_tokens), 0) AS output_tokens,
        coalesce(sum(requests.cache_read_input_tokens), 0) AS cache_read_input_tokens,
        coalesce(sum(requests.cache_write_tokens), 0) AS cache_write_tokens
      FROM requests
      WHERE requests.timestamp >= ${TODAY_UTC_START}
        AND requests.model IS NOT NULL
        AND ${requestsVisFilter(vis, 'requests', traceVersion)}
      GROUP BY date_trunc('day', requests.timestamp AT TIME ZONE 'UTC'), requests.model
    `.execute(db),
  ]);

  const rows = [...rollupRes.rows, ...liveRes.rows].map((r) => ({
    instant: r.day instanceof Date ? r.day.getTime() : new Date(r.day).getTime(),
    day: String(r.day),
    model: String(r.model),
    request_count: Number(r.request_count),
    input_tokens: Number(r.input_tokens),
    output_tokens: Number(r.output_tokens),
    cache_read_input_tokens: Number(r.cache_read_input_tokens),
    cache_write_tokens: Number(r.cache_write_tokens),
  }));
  rows.sort(
    (a, b) => a.instant - b.instant || (a.model < b.model ? -1 : a.model > b.model ? 1 : 0),
  );
  return rows.map(({ instant: _instant, ...rest }) => rest);
}

export async function dailyModelLive(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
  days = 30,
): Promise<DailyModelRow[]> {
  const res = await sql<{
    day: Date;
    model: string;
    request_count: string;
    input_tokens: string;
    output_tokens: string;
    cache_read_input_tokens: string;
    cache_write_tokens: string;
  }>`
    SELECT
      date_trunc('day', requests.timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day,
      requests.model AS model,
      count(*) AS request_count,
      coalesce(sum(requests.input_tokens), 0) AS input_tokens,
      coalesce(sum(requests.output_tokens), 0) AS output_tokens,
      coalesce(sum(requests.cache_read_input_tokens), 0) AS cache_read_input_tokens,
      coalesce(sum(requests.cache_write_tokens), 0) AS cache_write_tokens
    FROM requests
    WHERE requests.timestamp >= ${NOW} - make_interval(days => ${days})
      AND requests.model IS NOT NULL
      AND ${requestsVisFilter(vis, 'requests', traceVersion)}
    GROUP BY date_trunc('day', requests.timestamp AT TIME ZONE 'UTC'), requests.model
    ORDER BY day, model
  `.execute(db);
  return res.rows.map((r) => ({
    day: String(r.day),
    model: String(r.model),
    request_count: Number(r.request_count),
    input_tokens: Number(r.input_tokens),
    output_tokens: Number(r.output_tokens),
    cache_read_input_tokens: Number(r.cache_read_input_tokens),
    cache_write_tokens: Number(r.cache_write_tokens),
  }));
}

export const COMPACTION_IDLE_GAP_MS = 30 * 60 * 1000;
export const COMPACTION_MIN_PREV_CACHE_READ = 1000;
export const COMPACTION_CLIFF_DROP_RATIO = 0.8;
export const COMPACTION_WINDOW_DAYS = 45;

export interface CompactionCandidateInputs {
  prevCacheRead: number | null;
  prevTotalContext: number | null;
  curCacheRead: number | null;
  curTotalContext: number;
  gapMs: number | null;
}

export function isCompactionCandidate(i: CompactionCandidateInputs): boolean {
  if (i.prevCacheRead === null || i.prevTotalContext === null || i.gapMs === null) return false;
  if (i.curCacheRead === null) return false;
  if (i.gapMs >= COMPACTION_IDLE_GAP_MS) return false;
  if (i.prevCacheRead < COMPACTION_MIN_PREV_CACHE_READ) return false;
  if (i.curCacheRead > i.prevCacheRead * (1 - COMPACTION_CLIFF_DROP_RATIO)) return false;
  if (i.curTotalContext >= i.prevTotalContext) return false;
  return true;
}

export interface DailyCompactionRow {
  day: string;
  request_count: number;
  session_count: number;
  candidate_count: number;
}

export async function dailyCompactionRate(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
  windowDays: number = COMPACTION_WINDOW_DAYS,
): Promise<DailyCompactionRow[]> {
  const res = await sql<{
    day: string;
    request_count: string;
    session_count: string;
    candidate_count: string;
  }>`
    WITH lagged AS (
      SELECT
        requests.session_id,
        requests.timestamp,
        requests.cache_read_input_tokens AS cache_read,
        (coalesce(requests.input_tokens, 0) + coalesce(requests.cache_read_input_tokens, 0)) AS total_context,
        LAG(requests.cache_read_input_tokens) OVER (
          PARTITION BY requests.session_id ORDER BY requests.timestamp
        ) AS prev_cache_read,
        LAG(coalesce(requests.input_tokens, 0) + coalesce(requests.cache_read_input_tokens, 0)) OVER (
          PARTITION BY requests.session_id ORDER BY requests.timestamp
        ) AS prev_total_context,
        (extract(epoch FROM (
          requests.timestamp - LAG(requests.timestamp) OVER (
            PARTITION BY requests.session_id ORDER BY requests.timestamp
          )
        )) * 1000) AS gap_ms
      FROM requests
      WHERE requests.timestamp >= ${NOW} - make_interval(days => ${windowDays})
        AND ${requestsVisFilter(vis, 'requests', traceVersion)}
    )
    SELECT
      date_trunc('day', timestamp AT TIME ZONE 'UTC')::date AS day,
      count(*) AS request_count,
      count(DISTINCT session_id) AS session_count,
      count(*) FILTER (
        WHERE prev_cache_read IS NOT NULL
          AND prev_total_context IS NOT NULL
          AND gap_ms IS NOT NULL
          AND gap_ms < ${COMPACTION_IDLE_GAP_MS}
          AND prev_cache_read >= ${COMPACTION_MIN_PREV_CACHE_READ}
          AND cache_read IS NOT NULL
          AND cache_read <= prev_cache_read * ${1 - COMPACTION_CLIFF_DROP_RATIO}::float8
          AND total_context < prev_total_context
      ) AS candidate_count
    FROM lagged
    GROUP BY 1
    ORDER BY 1
  `.execute(db);
  return res.rows.map((r) => ({
    day: String(r.day),
    request_count: Number(r.request_count),
    session_count: Number(r.session_count),
    candidate_count: Number(r.candidate_count),
  }));
}

export interface DailyCliVersionRow {
  day: string;
  cli_version: string | null;
  session_count: number;
}

export async function dailyCliVersionMix(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
): Promise<DailyCliVersionRow[]> {
  const res = await sql<{ day: string; cli_version: string | null; session_count: string }>`
    SELECT
      date_trunc('day', sessions.started_at AT TIME ZONE 'UTC')::date AS day,
      sessions.metadata ->> 'cliVersion' AS cli_version,
      count(*)::int AS session_count
    FROM sessions
    WHERE sessions.metadata IS NOT NULL
      AND ${sessionsVisFilter(vis, traceVersion)}
    GROUP BY date_trunc('day', sessions.started_at AT TIME ZONE 'UTC')::date,
      sessions.metadata ->> 'cliVersion'
    ORDER BY day
  `.execute(db);
  return res.rows.map((r) => ({
    day: String(r.day),
    cli_version: r.cli_version === null ? null : String(r.cli_version),
    session_count: Number(r.session_count),
  }));
}

export interface DailyHarnessVersionRow {
  day: string;
  harness: Harness;
  version: string | null;
  session_count: number;
}

export async function dailyHarnessVersionMix(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
): Promise<DailyHarnessVersionRow[]> {
  const res = await sql<{
    day: string;
    harness: Harness;
    version: string | null;
    session_count: string;
  }>`
    WITH classified AS (
      SELECT
        date_trunc('day', sessions.started_at AT TIME ZONE 'UTC')::date AS day,
        ${SESSION_HARNESS_SQL} AS harness,
        sessions.metadata ->> 'userAgent' AS user_agent,
        sessions.metadata ->> 'cliVersion' AS cli_version
      FROM sessions
      WHERE sessions.metadata IS NOT NULL
        AND ${sessionsVisFilter(vis, traceVersion)}
    )
    SELECT
      day::text AS day,
      harness,
      CASE harness
        WHEN 'claude-code' THEN coalesce(cli_version, substring(user_agent FROM '^claude-cli/([^ ]+)'))
        WHEN 'codex' THEN substring(user_agent FROM '^[^/]+/([^ ]+)')
        WHEN 'omp' THEN substring(user_agent FROM '^[^/]+/([^ ]+)')
        WHEN 'pi' THEN NULL
        ELSE nullif(left(regexp_replace(user_agent, ' [(].*$', ''), 40), '')
      END AS version,
      count(*)::int AS session_count
    FROM classified
    GROUP BY 1, 2, 3
    ORDER BY day
  `.execute(db);
  return res.rows.map((r) => ({
    day: String(r.day),
    harness: r.harness,
    version: r.version === null ? null : String(r.version),
    session_count: Number(r.session_count),
  }));
}

export const LATENCY_WINDOW_DAYS = 90;

export interface DailyLatencyRow {
  day: string;
  duration_p50: number;
  duration_p95: number;
  ttft_p50: number;
  sample_count: number;
  streaming_sample_count: number;
}

export async function dailyLatencyTrend(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
  windowDays: number = LATENCY_WINDOW_DAYS,
): Promise<DailyLatencyRow[]> {
  const res = await sql<{
    day: string;
    duration_p50: string | null;
    duration_p95: string | null;
    ttft_p50: string | null;
    sample_count: string;
    streaming_sample_count: string;
  }>`
    SELECT
      date_trunc('day', requests.timestamp AT TIME ZONE 'UTC')::date AS day,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY requests.duration_ms)
        FILTER (WHERE requests.duration_ms > 0) AS duration_p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY requests.duration_ms)
        FILTER (WHERE requests.duration_ms > 0) AS duration_p95,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY requests.ttft_ms)
        FILTER (WHERE requests.is_streaming AND requests.ttft_ms > 0) AS ttft_p50,
      count(*) FILTER (WHERE requests.duration_ms > 0) AS sample_count,
      count(*) FILTER (WHERE requests.is_streaming AND requests.ttft_ms > 0) AS streaming_sample_count
    FROM requests
    WHERE requests.timestamp >= ${NOW} - make_interval(days => ${windowDays})
      AND ${requestsVisFilter(vis, 'requests', traceVersion)}
    GROUP BY 1
    ORDER BY 1
  `.execute(db);
  return res.rows.map((r) => ({
    day: String(r.day),
    duration_p50: Number(r.duration_p50 ?? 0),
    duration_p95: Number(r.duration_p95 ?? 0),
    ttft_p50: Number(r.ttft_p50 ?? 0),
    sample_count: Number(r.sample_count),
    streaming_sample_count: Number(r.streaming_sample_count),
  }));
}

export interface TrendsPayload {
  dailyModel: DailyModelRow[];
  dailyCompaction: DailyCompactionRow[];
  dailyCliVersion: DailyCliVersionRow[];
  dailyLatency: DailyLatencyRow[];
  meta: {
    compactionWindowDays: number;
    latencyWindowDays: number;
    compactionIdleGapMs: number;
    compactionMinPrevCacheRead: number;
    compactionCliffDropRatio: number;
    generatedAt: string;
  };
}

export async function computeTrendsPayload(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
): Promise<TrendsPayload> {
  await assertRollupReady(db);
  const [dailyModel, dailyCompaction, dailyCliVersion, dailyLatency] = await Promise.all([
    dailyModelRollup(db, vis, traceVersion),
    dailyCompactionRate(db, vis, traceVersion),
    dailyCliVersionMix(db, vis, traceVersion),
    dailyLatencyTrend(db, vis, traceVersion),
  ]);
  return {
    dailyModel,
    dailyCompaction,
    dailyCliVersion,
    dailyLatency,
    meta: {
      compactionWindowDays: COMPACTION_WINDOW_DAYS,
      latencyWindowDays: LATENCY_WINDOW_DAYS,
      compactionIdleGapMs: COMPACTION_IDLE_GAP_MS,
      compactionMinPrevCacheRead: COMPACTION_MIN_PREV_CACHE_READ,
      compactionCliffDropRatio: COMPACTION_CLIFF_DROP_RATIO,
      generatedAt: AS_OF_ISO,
    },
  };
}

export function sanitizeTrendsPayload(payload: TrendsPayload): TrendsPayload {
  const merged = new Map<string, DailyModelRow>();
  for (const row of payload.dailyModel) {
    const model = sanitizeModel(row.model) ?? row.model;
    const key = `${row.day}\u0000${model}`;
    const prev = merged.get(key);
    merged.set(
      key,
      prev
        ? {
            ...prev,
            request_count: prev.request_count + row.request_count,
            input_tokens: prev.input_tokens + row.input_tokens,
            output_tokens: prev.output_tokens + row.output_tokens,
            cache_read_input_tokens: prev.cache_read_input_tokens + row.cache_read_input_tokens,
            cache_write_tokens: prev.cache_write_tokens + row.cache_write_tokens,
          }
        : { ...row, model },
    );
  }
  return { ...payload, dailyModel: [...merged.values()] };
}

export async function computeAndCacheTrends(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
): Promise<TrendsPayload> {
  const payload = await computeTrendsPayload(db, vis, traceVersion);
  await writeTrendsCache(db, trendsCacheKey(vis, traceVersion), payload);
  return payload;
}
