import { type Kysely, sql } from 'kysely';
import type { Database } from './types';
import { requestsVisFilter, sessionsVisFilter } from './operations';
import { assertRollupReady } from './stats';
import { NOW, TODAY_UTC_DATE, TODAY_UTC_START } from './as-of';
import { AS_OF_ISO } from './shared/as-of';
import { sanitizeModel } from './shared/pricing';

// ─────────────────────────────────────────────────────────────────────────
// "Behavior over time" trends layer — Wave 2B.
//
// Answers the dashboard-user question: "can we do things over time? I think
// they changed compaction and I have no way to see model changes / behavior
// under the hood." One cached JSON payload (`computeTrendsPayload`) backs the
// whole `/dashboard/trends` page and every one of its charts:
//
//   1. Model mix over time            — dailyModelRollup (full history)
//   2. Cache hit-rate trend           — dailyModelRollup (full history)
//   3. Context growth                 — dailyModelRollup (full history)
//   4. Compaction-rate proxy          — dailyCompactionRate (45-day floor, tuned — see below)
//   5. CLI-version mix over time      — dailyCliVersionMix (sessions, full history)
//   6. Latency trend ("E2E Latency")  — dailyLatencyTrend (90-day floor)
//
// Charts 1-3 share ONE query (`dailyModelRollup`, day x model granularity);
// the frontend derives request/token share, cache-hit ratio, and per-request
// context size from the same rows, mirroring how /dashboard/models derives
// cacheHitRatio/fastModePct client-side from raw totals.
//
// Mirrors packages/db/src/stats.ts's rollup+cache architecture exactly, but
// that file is Wave 1's and must not be edited. Its two cache primitives
// (`writeStatsCache`, `rollupVisFilter`) are private (not exported), so they
// are duplicated here in miniature under a disjoint cache-key namespace
// ('tr:' vs stats.ts's 'sc:') on the SAME generic `stats_cache` table.
// `readStatsCache` (from stats.ts) IS exported and fully generic — reused
// directly, no duplicate needed.
// ─────────────────────────────────────────────────────────────────────────

const TRENDS_CACHE_SCHEMA = 2;

/**
 * Cache key. Scope collapses the visibility filter the same way
 * `statsCacheKey` does: null => 'all' (admin), non-null => 'anon'.
 */
export function trendsCacheKey(
  visibleClientIds: string[] | null,
  traceVersion: number | null,
): string {
  const scope = visibleClientIds === null ? 'all' : 'anon';
  return `tr:${TRENDS_CACHE_SCHEMA}:trends:${scope}:${traceVersion ?? 'all'}`;
}

/** Read-only deployment: cache writes are no-ops (see stats.ts `writeStatsCache`). */
function writeTrendsCache(_db: Kysely<Database>, _key: string, _data: unknown): Promise<void> {
  return Promise.resolve();
}

/** Tiny duplicate of stats.ts's private `rollupVisFilter`. */
function rollupVisFilter(visibleClientIds: string[] | null, traceVersion: number | null) {
  const vis =
    visibleClientIds === null ? sql`TRUE` : sql`rollup_requests_daily.privacy_mode = 'anon'`;
  if (traceVersion === null) return vis;
  return sql`${vis} AND rollup_requests_daily.trace_version = ${traceVersion}`;
}

// ── 1-3: Daily per-model rollup (model mix, cache hit-rate, context growth) ─

export interface DailyModelRow {
  day: string;
  model: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_write_tokens: number;
}

/**
 * Full-history daily x model token/request counts. Historical UTC days come
 * from `rollup_requests_daily` (backfilled over all history, cron-refreshed —
 * cheap, thousands of rows); "today" comes from a live tail so it's exact
 * regardless of rollup refresh lag, same split as stats.ts's
 * `modelTimeSeriesFromRollup`. Powers charts 1-3 — the frontend derives
 * request/token share, cache-hit ratio, and avg context-per-request from
 * these raw sums.
 */
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

/**
 * Bounded live-only fallback for `dailyModelRollup`, used only when
 * `rollup_requests_daily` / `stats_cache` haven't been migrated in yet
 * (mirrors the `legacyModels()` fallback in `/api/models` — see
 * `readStatsCache`'s `'missing-table'` sentinel). Scans `requests` directly
 * with a day floor instead of scanning the whole table, so it degrades
 * gracefully (a shorter window) rather than repeating the old unbounded scan.
 */
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

// ── 4: Compaction-rate proxy (heuristic) ────────────────────────────────

/**
 * Anthropic doesn't mark compaction explicitly in any traced field, so this
 * is inferred: within a session lane, a compaction shows up as a sharp
 * cache-read cliff (the context window resets and has to be rebuilt from
 * scratch) that also shrinks total context, while the conversation
 * continues (not a session boundary or an idle-gap restart, which look
 * similar but aren't compaction). See `isCompactionCandidate` — the SQL in
 * `dailyCompactionRate` implements this exact predicate via a single
 * `LAG() OVER (PARTITION BY session_id ORDER BY timestamp)` pass; keep the
 * two in sync (cross-checked in packages/app/src/__tests__/trends.test.ts).
 */
export const COMPACTION_IDLE_GAP_MS = 30 * 60 * 1000;
export const COMPACTION_MIN_PREV_CACHE_READ = 1000;
export const COMPACTION_CLIFF_DROP_RATIO = 0.8;
// Benchmarked on the pooled driver against production-scale data:
// a 90-day floor measured p50 ~5.8s (scope=all) and spiked to ~8.6s (scope=anon) under
// jitter — over the <5s mandate. 45 days measured a consistent ~3.2-3.9s across
// scope x trace-version combos (>1s of margin), so the floor is tuned down to 45.
export const COMPACTION_WINDOW_DAYS = 45;

export interface CompactionCandidateInputs {
  /** `cache_read_input_tokens` of the previous request in the session lane, or null at a session boundary (LAG returns null). */
  prevCacheRead: number | null;
  /** `input_tokens + cache_read_input_tokens` of the previous request, or null at a session boundary. */
  prevTotalContext: number | null;
  /** `cache_read_input_tokens` of the current request. */
  curCacheRead: number | null;
  /** `input_tokens + cache_read_input_tokens` of the current request. */
  curTotalContext: number;
  /** Milliseconds since the previous request in the session lane, or null at a session boundary. */
  gapMs: number | null;
}

/**
 * Pure predicate mirroring the SQL `FILTER (WHERE ...)` clause in
 * `dailyCompactionRate` exactly. Excludes session boundaries (prev* null),
 * idle-gap restarts (gap >= 30 min — those look like a fresh context for an
 * unrelated reason), and requires both a sizeable prior context
 * (>= 1,000 cache-read tokens — otherwise "an 80% drop" is noise on a
 * near-empty context) and a genuine cliff (current cache-read <= 20% of
 * previous) confirmed by an overall context shrink (rules out a one-off
 * cache-write-only turn that happens to have low cache-read for other
 * reasons).
 */
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

/**
 * Daily compaction-candidate rate over a bounded trailing window (45 days by
 * default — tune via `windowDays`). A 90-day floor was tried first per the
 * original design but measured p50
 * ~5.8s on the pooled driver (spiking to ~8.6s under jitter on the anon
 * scope) — over the <5s budget — so the floor was tuned down to 45 days,
 * which measured a consistent ~3.2-3.9s across scope x trace-version combos.
 * Single pass over `requests` using `LAG() OVER (PARTITION BY session_id ORDER
 * BY timestamp)`, which rides `idx_requests_session_timestamp`. Runs behind
 * cache (cron + self-heal), never inline on a hot request path.
 *
 * `candidate_count` FILTER implements `isCompactionCandidate` above in SQL —
 * keep both in sync. Returns per-day `request_count` and `session_count`
 * (distinct sessions active that day) so the frontend can present the rate
 * as "per 1,000 requests" and/or "per active session".
 */
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

// ── 5: CLI-version mix over time ────────────────────────────────────────

export interface DailyCliVersionRow {
  day: string;
  cli_version: string | null;
  session_count: number;
}

/**
 * Daily new-session share by `cliVersion`. `sessions` is tiny (thousands of
 * rows) — cheap to scan live, full history, no floor needed.
 */
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

// ── 6: Latency trend ("E2E Latency" per AGENTS.md convention) ──────────

export const LATENCY_WINDOW_DAYS = 90;

export interface DailyLatencyRow {
  day: string;
  duration_p50: number;
  duration_p95: number;
  ttft_p50: number;
  sample_count: number;
  streaming_sample_count: number;
}

/**
 * Daily p50/p95 `duration_ms` ("E2E Latency" — AGENTS.md: never call this
 * TTFT/TPOT/Interactivity) plus p50 TTFT restricted to streaming rows.
 * Bounded to a trailing window (90 days default) via `idx_requests_timestamp`
 * — this is a request-shape metric, not additive, so it can't be rolled up
 * and must stay a live scan; the floor keeps it bounded. NOTE:
 * `idx_requests_stream_latency` (privacy_mode, trace_version) INCLUDE (...)
 * WHERE is_streaming carries no `timestamp` column, so it cannot serve a
 * day-bucketed, timestamp-floored query — this chart's cost comes entirely
 * from the `idx_requests_timestamp` range scan plus in-window aggregation.
 *
 */
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

// ── Public compute entry points ─────────────────────────────────────────

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

/** Build the whole `/api/trends` response object (pre-camelCase). */
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

/**
 * Replace unlisted model names with `other` (sanitizeModel) and merge rows that
 * collapse onto the same day. Applied on every read because cached payloads
 * were written by the main deployment with raw model names.
 */
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

/** Compute + upsert one trends cache combo (cron / self-heal / cache-miss). */
export async function computeAndCacheTrends(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
): Promise<TrendsPayload> {
  const payload = await computeTrendsPayload(db, vis, traceVersion);
  await writeTrendsCache(db, trendsCacheKey(vis, traceVersion), payload);
  return payload;
}
