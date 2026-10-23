import { type Kysely, sql } from 'kysely';
import {
  computeCostBreakdown,
  LONG_CONTEXT_PRICING_MODELS,
  LONG_CONTEXT_TOKEN_THRESHOLD,
  sanitizeModels,
} from './shared/pricing';
import { CURRENT_TRACE_VERSION } from './shared/trace';
import { getDb } from './connection';
import { computeSessionReusePayload } from './session-reuse';
import type { Database } from './types';
import {
  modelFilter,
  requestsVisFilter,
  sessionsVisFilter,
  getCacheStats,
  getDailyCacheEfficiency,
  getCacheByModel,
  getCacheByClient,
  getTrafficStats,
  getDailyTraffic,
  getHourlyHeatmap,
  getStreamingBreakdown,
  getErrorReach,
  getErrorStats,
  getWebSearchStats,
  getPlatformStats,
  getPlatformTimeSeries,
  getCostSummary,
  getDailyCosts,
  getCostByModel,
  getCostByClient,
  getPricingCoverage,
  getTokensByModel,
  getSessionInsights,
  getGlobalRequestStats,
  getGlobalSessionAggregates,
  getWallClockBreakdown,
  getHourlyTokenCounts,
  getTTFTDistribution,
  getTPOTDistribution,
  getPrefillSpeedDistribution,
  getPrefillDecodePairedDistribution,
  getTokensPerChunkDistribution,
  getCpuGpuPairedDistribution,
  getPrefillDecodePairedByModelFastMode,
  getSessionDurationDistribution,
  getSubagentStatsPerSessionDistribution,
  getWeeklySessionsByHarness,
  getLatencyStats,
  getLatencyDistribution,
  getHourlyLatency,
  getLatencyByModel,
  getCacheReadVsLatency,
  getCacheHeatmap,
  getCacheHeatmapByOutput,
  getCacheHeatmapTTFT,
  getCacheHeatmapPrefillSpeed,
  getCacheTotalVsOutputInteractivity,
  getTTFTDistributionAndStats,
  getTPOTDistributionAndStats,
  getPrefillSpeedDistributionAndStats,
  getStreamingStats,
  getDailyStreamingRatio,
  getStreamingByModel,
} from './operations';
import { NOW, TODAY_UTC_DATE, TODAY_UTC_START } from './as-of';

const STATS_CACHE_SCHEMA = 1;
const GRAPHS_STATS_CACHE_SCHEMA = 4;
const ROLLUP_BACKED_STATS_CACHE_SCHEMA = 3;
const COSTS_STATS_CACHE_SCHEMA = 2;
const ERRORS_STATS_CACHE_SCHEMA = 2;

const LONG_CONTEXT_MODEL_NAMES = Object.keys(LONG_CONTEXT_PRICING_MODELS);
export const ROLLUP_REFRESH_LAG_DAYS = 3;

export type StatsCacheKind =
  | 'overview'
  | 'models'
  | 'cache'
  | 'traffic'
  | 'errors'
  | 'web-search'
  | 'platform'
  | 'costs'
  | 'session-insights'
  | 'session-reuse'
  | 'performance'
  | 'fast-mode'
  | 'graphs';

export function statsCacheKey(
  kind: StatsCacheKind,
  visibleClientIds: string[] | null,
  traceVersion: number | null,
): string {
  const scope = visibleClientIds === null ? 'all' : 'anon';
  const schema =
    kind === 'overview' || kind === 'models'
      ? ROLLUP_BACKED_STATS_CACHE_SCHEMA
      : kind === 'costs'
        ? COSTS_STATS_CACHE_SCHEMA
        : kind === 'errors'
          ? ERRORS_STATS_CACHE_SCHEMA
          : kind === 'graphs'
            ? GRAPHS_STATS_CACHE_SCHEMA
            : STATS_CACHE_SCHEMA;
  return `sc:${schema}:${kind}:${scope}:${traceVersion ?? 'all'}`;
}

export async function readStatsCache(
  key: string,
  dbOverride?: Kysely<Database>,
): Promise<{ data: unknown; cachedAt: Date } | 'missing-table' | null> {
  const db = dbOverride ?? getDb();
  try {
    const row = await db
      .selectFrom('stats_cache')
      .select(['data', 'cached_at'])
      .where('key', '=', key)
      .executeTakeFirst();
    if (!row) return null;
    return { data: row.data, cachedAt: new Date(row.cached_at) };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01')
      return 'missing-table';
    throw error;
  }
}

function writeStatsCache(_db: Kysely<Database>, _key: string, _data: unknown): Promise<void> {
  return Promise.resolve();
}

export function patchStatsCache(
  _db: Kysely<Database>,
  _key: string,
  _patch: Record<string, unknown>,
): Promise<void> {
  return Promise.resolve();
}

const ROLLUP_READY_KEY = 'rollup:1:full-history';

const MAX_STATS_CACHE_METADATA_KEYS = 60;

export interface StatsCacheMetadataEntry {
  key: string;
  cachedAt: Date;
  payloadBytes: number;
}

export async function readStatsCacheMetadata(
  keys: readonly string[],
  dbOverride?: Kysely<Database>,
): Promise<{ entries: StatsCacheMetadataEntry[]; rollupReady: boolean }> {
  const expectedKeys = [...new Set(keys)];
  if (expectedKeys.length + 1 > MAX_STATS_CACHE_METADATA_KEYS) {
    throw new RangeError(
      `stats cache metadata is limited to ${MAX_STATS_CACHE_METADATA_KEYS - 1} cache keys`,
    );
  }

  const db = dbOverride ?? getDb();
  const rows = await db
    .selectFrom('stats_cache')
    .select(['key', 'cached_at', sql<number>`pg_column_size(data)`.as('payload_bytes')])
    .where('key', 'in', [...expectedKeys, ROLLUP_READY_KEY])
    .execute();

  return {
    entries: rows
      .filter((row) => row.key !== ROLLUP_READY_KEY)
      .map((row) => ({
        key: row.key,
        cachedAt: new Date(row.cached_at),
        payloadBytes: Number(row.payload_bytes),
      })),
    rollupReady: rows.some((row) => row.key === ROLLUP_READY_KEY),
  };
}

export class RollupNotReadyError extends Error {
  readonly code = 'ROLLUP_NOT_READY';

  constructor(requestCount: string, rollupCount: string) {
    super(
      `rollup_requests_daily is incomplete: ${rollupCount} historical rows rolled up, ${requestCount} required`,
    );
    this.name = 'RollupNotReadyError';
  }
}

export function isRollupNotReadyError(error: unknown): error is RollupNotReadyError {
  return (
    error instanceof RollupNotReadyError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ROLLUP_NOT_READY')
  );
}

export async function assertRollupReady(db: Kysely<Database>): Promise<void> {
  const marker = await db
    .selectFrom('stats_cache')
    .select('key')
    .where('key', '=', ROLLUP_READY_KEY)
    .executeTakeFirst();
  if (marker) return;

  const result = await sql<{ request_count: string; rollup_count: string }>`
    SELECT
      (SELECT count(*)::text
       FROM requests
       WHERE timestamp < ${TODAY_UTC_START}) AS request_count,
      (SELECT coalesce(sum(request_count), 0)::text
       FROM rollup_requests_daily
       WHERE day < ${TODAY_UTC_DATE}) AS rollup_count
  `.execute(db);
  const coverage = result.rows[0];
  if (!coverage) throw new Error('rollup coverage query returned no row');
  if (coverage.request_count !== coverage.rollup_count) {
    throw new RollupNotReadyError(coverage.request_count, coverage.rollup_count);
  }

  await writeStatsCache(db, ROLLUP_READY_KEY, {
    complete: true,
    historicalRequestCount: coverage.request_count,
  });
}

function rollupVisFilter(visibleClientIds: string[] | null, traceVersion: number | null) {
  const vis =
    visibleClientIds === null ? sql`TRUE` : sql`rollup_requests_daily.privacy_mode = 'anon'`;
  if (traceVersion === null) return vis;
  return sql`${vis} AND rollup_requests_daily.trace_version = ${traceVersion}`;
}

interface Totals {
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_input_tokens: number;
  cost_usd: number;
}

async function overviewTotals(
  db: Kysely<Database>,
  vis: string[] | null,
  model: string | null,
  traceVersion: number | null,
): Promise<Totals> {
  const rollupModel = model === null ? sql`TRUE` : sql`rollup_requests_daily.model = ${model}`;
  const [rollupRes, liveRes] = await Promise.all([
    sql<Record<string, string>>`
      SELECT
        coalesce(sum(request_count), 0) AS request_count,
        coalesce(sum(input_tokens), 0) AS input_tokens,
        coalesce(sum(output_tokens), 0) AS output_tokens,
        coalesce(sum(cache_write_tokens), 0) AS cache_write_tokens,
        coalesce(sum(cache_read_input_tokens), 0) AS cache_read_input_tokens,
        coalesce(sum(cost_usd), 0) AS cost_usd
      FROM rollup_requests_daily
      WHERE day < ${TODAY_UTC_DATE} AND ${rollupVisFilter(vis, traceVersion)} AND ${rollupModel}
    `.execute(db),
    sql<Record<string, string>>`
      SELECT
        count(*) AS request_count,
        coalesce(sum(input_tokens), 0) AS input_tokens,
        coalesce(sum(output_tokens), 0) AS output_tokens,
        coalesce(sum(cache_write_tokens), 0) AS cache_write_tokens,
        coalesce(sum(cache_read_input_tokens), 0) AS cache_read_input_tokens,
        coalesce(sum(cost_usd::double precision), 0) AS cost_usd
      FROM requests
      WHERE timestamp >= ${TODAY_UTC_START}
        AND ${requestsVisFilter(vis, 'requests', traceVersion)} AND ${modelFilter(model)}
    `.execute(db),
  ]);
  const r = rollupRes.rows[0];
  const l = liveRes.rows[0];
  const add = (k: keyof Totals) => Number(r[k]) + Number(l[k]);
  return {
    request_count: add('request_count'),
    input_tokens: add('input_tokens'),
    output_tokens: add('output_tokens'),
    cache_write_tokens: add('cache_write_tokens'),
    cache_read_input_tokens: add('cache_read_input_tokens'),
    cost_usd: add('cost_usd'),
  };
}

export interface TokensByModelRow {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_write_tokens: number;
  fast_mode_count: number;
  fast_input_tokens: number;
  fast_output_tokens: number;
  fast_cache_read_input_tokens: number;
  fast_cache_write_tokens: number;
  long_input_tokens: number;
  long_output_tokens: number;
  long_cache_read_input_tokens: number;
  long_cache_write_tokens: number;
}

async function tokensByModelFromRollup(
  db: Kysely<Database>,
  vis: string[] | null,
  model: string | null,
  traceVersion: number | null,
): Promise<TokensByModelRow[]> {
  const rollupModel = model === null ? sql`TRUE` : sql`rollup_requests_daily.model = ${model}`;
  const [rollupRes, liveRes] = await Promise.all([
    sql<Record<string, string>>`
      SELECT
        model,
        sum(input_tokens) AS input_tokens,
        sum(output_tokens) AS output_tokens,
        sum(cache_read_input_tokens) AS cache_read_input_tokens,
        sum(cache_write_tokens) AS cache_write_tokens,
        coalesce(sum(request_count) FILTER (WHERE is_fast_mode), 0) AS fast_mode_count,
        coalesce(sum(input_tokens) FILTER (WHERE is_fast_mode), 0) AS fast_input_tokens,
        coalesce(sum(output_tokens) FILTER (WHERE is_fast_mode), 0) AS fast_output_tokens,
        coalesce(sum(cache_read_input_tokens) FILTER (WHERE is_fast_mode), 0) AS fast_cache_read_input_tokens,
        coalesce(sum(cache_write_tokens) FILTER (WHERE is_fast_mode), 0) AS fast_cache_write_tokens,
        coalesce(sum(long_input_tokens), 0) AS long_input_tokens,
        coalesce(sum(long_output_tokens), 0) AS long_output_tokens,
        coalesce(sum(long_cache_read_input_tokens), 0) AS long_cache_read_input_tokens,
        coalesce(sum(long_cache_write_tokens), 0) AS long_cache_write_tokens
      FROM rollup_requests_daily
      WHERE day < ${TODAY_UTC_DATE} AND ${rollupVisFilter(vis, traceVersion)}
        AND model <> '' AND ${rollupModel}
      GROUP BY model
    `.execute(db),
    sql<Record<string, string>>`
      SELECT
        requests.model AS model,
        coalesce(sum(requests.input_tokens), 0) AS input_tokens,
        coalesce(sum(requests.output_tokens), 0) AS output_tokens,
        coalesce(sum(requests.cache_read_input_tokens), 0) AS cache_read_input_tokens,
        coalesce(sum(requests.cache_write_tokens), 0) AS cache_write_tokens,
        count(*) FILTER (WHERE requests.is_fast_mode) AS fast_mode_count,
        coalesce(sum(requests.input_tokens) FILTER (WHERE requests.is_fast_mode), 0) AS fast_input_tokens,
        coalesce(sum(requests.output_tokens) FILTER (WHERE requests.is_fast_mode), 0) AS fast_output_tokens,
        coalesce(sum(requests.cache_read_input_tokens) FILTER (WHERE requests.is_fast_mode), 0) AS fast_cache_read_input_tokens,
        coalesce(sum(requests.cache_write_tokens) FILTER (WHERE requests.is_fast_mode), 0) AS fast_cache_write_tokens,
        coalesce(sum(requests.input_tokens) FILTER (
          WHERE requests.model = ANY(${LONG_CONTEXT_MODEL_NAMES}::text[])
            AND coalesce(requests.input_tokens, 0) + coalesce(requests.cache_read_input_tokens, 0) > ${LONG_CONTEXT_TOKEN_THRESHOLD}
        ), 0) AS long_input_tokens,
        coalesce(sum(requests.output_tokens) FILTER (
          WHERE requests.model = ANY(${LONG_CONTEXT_MODEL_NAMES}::text[])
            AND coalesce(requests.input_tokens, 0) + coalesce(requests.cache_read_input_tokens, 0) > ${LONG_CONTEXT_TOKEN_THRESHOLD}
        ), 0) AS long_output_tokens,
        coalesce(sum(requests.cache_read_input_tokens) FILTER (
          WHERE requests.model = ANY(${LONG_CONTEXT_MODEL_NAMES}::text[])
            AND coalesce(requests.input_tokens, 0) + coalesce(requests.cache_read_input_tokens, 0) > ${LONG_CONTEXT_TOKEN_THRESHOLD}
        ), 0) AS long_cache_read_input_tokens,
        coalesce(sum(requests.cache_write_tokens) FILTER (
          WHERE requests.model = ANY(${LONG_CONTEXT_MODEL_NAMES}::text[])
            AND coalesce(requests.input_tokens, 0) + coalesce(requests.cache_read_input_tokens, 0) > ${LONG_CONTEXT_TOKEN_THRESHOLD}
        ), 0) AS long_cache_write_tokens
      FROM requests
      WHERE requests.timestamp >= ${TODAY_UTC_START}
        AND requests.model IS NOT NULL
        AND ${requestsVisFilter(vis, 'requests', traceVersion)} AND ${modelFilter(model)}
      GROUP BY requests.model
    `.execute(db),
  ]);

  const NUM_KEYS: Exclude<keyof TokensByModelRow, 'model'>[] = [
    'input_tokens',
    'output_tokens',
    'cache_read_input_tokens',
    'cache_write_tokens',
    'fast_mode_count',
    'fast_input_tokens',
    'fast_output_tokens',
    'fast_cache_read_input_tokens',
    'fast_cache_write_tokens',
    'long_input_tokens',
    'long_output_tokens',
    'long_cache_read_input_tokens',
    'long_cache_write_tokens',
  ];
  const merged = new Map<string, TokensByModelRow>();
  for (const src of [rollupRes.rows, liveRes.rows]) {
    for (const row of src) {
      const key = String(row.model);
      let acc = merged.get(key);
      if (!acc) {
        acc = {
          model: key,
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_write_tokens: 0,
          fast_mode_count: 0,
          fast_input_tokens: 0,
          fast_output_tokens: 0,
          fast_cache_read_input_tokens: 0,
          fast_cache_write_tokens: 0,
          long_input_tokens: 0,
          long_output_tokens: 0,
          long_cache_read_input_tokens: 0,
          long_cache_write_tokens: 0,
        };
        merged.set(key, acc);
      }
      for (const k of NUM_KEYS) acc[k] += Number(row[k]);
    }
  }
  return [...merged.values()];
}

export interface ModelTimeSeriesRow {
  day: string;
  model: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
}

async function modelTimeSeriesFromRollup(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
): Promise<ModelTimeSeriesRow[]> {
  const [rollupRes, liveRes] = await Promise.all([
    sql<{
      day: Date;
      model: string;
      request_count: string;
      input_tokens: string;
      output_tokens: string;
    }>`
      SELECT
        day::timestamp AT TIME ZONE 'UTC' AS day,
        model,
        sum(request_count) AS request_count,
        sum(input_tokens) AS input_tokens,
        sum(output_tokens) AS output_tokens
      FROM rollup_requests_daily
      WHERE day >= ${TODAY_UTC_DATE} - 30 AND day < ${TODAY_UTC_DATE}
        AND model <> ''
        AND ${rollupVisFilter(vis, traceVersion)}
      GROUP BY day, model
    `.execute(db),
    sql<{
      day: Date;
      model: string;
      request_count: string;
      input_tokens: string;
      output_tokens: string;
    }>`
      SELECT
        date_trunc('day', requests.timestamp AT TIME ZONE 'UTC') AS day,
        requests.model AS model,
        count(*) AS request_count,
        coalesce(sum(requests.input_tokens), 0) AS input_tokens,
        coalesce(sum(requests.output_tokens), 0) AS output_tokens
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
  }));
  rows.sort(
    (a, b) => a.instant - b.instant || (a.model < b.model ? -1 : a.model > b.model ? 1 : 0),
  );
  return rows.map((r) => ({
    day: r.day,
    model: r.model,
    request_count: r.request_count,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
  }));
}

interface UsageBucketRow {
  hour: string;
  requestCount: number;
  totalTokens: number;
  totalCost: number;
  newSessions: number;
}
interface DailyBucketRow {
  day: string;
  requestCount: number;
  totalTokens: number;
  totalCost: number;
  newSessions: number;
}

async function sessionRequestCounts(
  db: Kysely<Database>,
  vis: string[] | null,
  model: string | null,
  traceVersion: number | null,
): Promise<{ ids: string[]; counts: number[] }> {
  const res = await sql<{ session_id: string; cnt: string }>`
    SELECT session_id, count(*) AS cnt FROM requests
    WHERE ${requestsVisFilter(vis, 'requests', traceVersion)} AND ${modelFilter(model)}
    GROUP BY session_id
  `.execute(db);
  return {
    ids: res.rows.map((r) => String(r.session_id)),
    counts: res.rows.map((r) => Number(r.cnt)),
  };
}

export function percentileCont(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  if (n === 1) return sortedAsc[0];
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  if (lo === h) return sortedAsc[lo];
  return sortedAsc[lo] + (h - lo) * (sortedAsc[lo + 1] - sortedAsc[lo]);
}

export function percentiles5(values: number[]): {
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p99: number;
} {
  const sorted = [...values].toSorted((a, b) => a - b);
  return {
    p25: percentileCont(sorted, 0.25),
    p50: percentileCont(sorted, 0.5),
    p75: percentileCont(sorted, 0.75),
    p90: percentileCont(sorted, 0.9),
    p99: percentileCont(sorted, 0.99),
  };
}

function newSessionsJoin(
  vis: string[] | null,
  traceVersion: number | null,
  eligible: string[],
  bucketExpr: ReturnType<typeof sql>,
  windowCond: ReturnType<typeof sql>,
) {
  const eligibleCond =
    eligible.length === 0 ? sql`FALSE` : sql`sessions.id = ANY(${sql.val(eligible)}::text[])`;
  return sql`
    LEFT JOIN (
      SELECT ${bucketExpr} AS bucket, count(*) AS new_sessions
      FROM sessions
      WHERE ${windowCond}
        AND ${sessionsVisFilter(vis, traceVersion)}
        AND ${eligibleCond}
      GROUP BY ${bucketExpr}
    ) s ON r.bucket = s.bucket
  `;
}

async function hourlyUsageCounts(
  db: Kysely<Database>,
  vis: string[] | null,
  model: string | null,
  traceVersion: number | null,
  eligible: string[],
): Promise<UsageBucketRow[]> {
  const res = await sql<Record<string, unknown>>`
    SELECT r.bucket AS hour, r.request_count, r.total_tokens, r.total_cost,
      coalesce(s.new_sessions, 0) AS new_sessions
    FROM (
      SELECT date_trunc('hour', requests.timestamp) AS bucket,
        count(*) AS request_count,
        coalesce(sum(requests.input_tokens), 0) + coalesce(sum(requests.output_tokens), 0)
          + coalesce(sum(requests.cache_read_input_tokens), 0) + coalesce(sum(requests.cache_write_tokens), 0) AS total_tokens,
        coalesce(sum(requests.cost_usd), 0) AS total_cost
      FROM requests
      WHERE requests.timestamp > ${NOW} - interval '24 hours'
        AND ${requestsVisFilter(vis, 'requests', traceVersion)} AND ${modelFilter(model)}
      GROUP BY date_trunc('hour', requests.timestamp)
    ) r
    ${newSessionsJoin(
      vis,
      traceVersion,
      eligible,
      sql`date_trunc('hour', sessions.started_at)`,
      sql`sessions.started_at > ${NOW} - interval '24 hours'`,
    )}
    ORDER BY r.bucket
  `.execute(db);
  return res.rows.map(mapUsageRow);
}

async function hourlyUsageCountsForUtcDay(
  db: Kysely<Database>,
  vis: string[] | null,
  model: string | null,
  traceVersion: number | null,
  eligible: string[],
  dayOffset: number,
): Promise<UsageBucketRow[]> {
  const offset = Math.max(0, Math.floor(dayOffset));
  const res = await sql<Record<string, unknown>>`
    WITH bounds AS (
      SELECT
        (date_trunc('day', ${NOW} AT TIME ZONE 'UTC') - (${offset} || ' days')::interval) AT TIME ZONE 'UTC' AS day_start,
        (date_trunc('day', ${NOW} AT TIME ZONE 'UTC') - ((${offset} - 1) || ' days')::interval) AT TIME ZONE 'UTC' AS day_end
    )
    SELECT r.bucket AS hour, r.request_count, r.total_tokens, r.total_cost,
      coalesce(s.new_sessions, 0) AS new_sessions
    FROM (
      SELECT date_trunc('hour', requests.timestamp AT TIME ZONE 'UTC') AS bucket,
        count(*) AS request_count,
        coalesce(sum(requests.input_tokens), 0) + coalesce(sum(requests.output_tokens), 0)
          + coalesce(sum(requests.cache_read_input_tokens), 0) + coalesce(sum(requests.cache_write_tokens), 0) AS total_tokens,
        coalesce(sum(requests.cost_usd), 0) AS total_cost
      FROM requests, bounds
      WHERE requests.timestamp >= bounds.day_start AND requests.timestamp < bounds.day_end
        AND ${requestsVisFilter(vis, 'requests', traceVersion)} AND ${modelFilter(model)}
      GROUP BY date_trunc('hour', requests.timestamp AT TIME ZONE 'UTC')
    ) r
    LEFT JOIN (
      SELECT date_trunc('hour', sessions.started_at AT TIME ZONE 'UTC') AS bucket, count(*) AS new_sessions
      FROM sessions, bounds
      WHERE sessions.started_at >= bounds.day_start AND sessions.started_at < bounds.day_end
        AND ${sessionsVisFilter(vis, traceVersion)}
        AND ${eligible.length === 0 ? sql`FALSE` : sql`sessions.id = ANY(${sql.val(eligible)}::text[])`}
      GROUP BY date_trunc('hour', sessions.started_at AT TIME ZONE 'UTC')
    ) s ON r.bucket = s.bucket
    ORDER BY r.bucket
  `.execute(db);
  return res.rows.map(mapUsageRow);
}

async function dailyUsageCounts(
  db: Kysely<Database>,
  vis: string[] | null,
  model: string | null,
  traceVersion: number | null,
  eligible: string[],
): Promise<DailyBucketRow[]> {
  const res = await sql<Record<string, unknown>>`
    SELECT r.bucket AS day, r.request_count, r.total_tokens, r.total_cost,
      coalesce(s.new_sessions, 0) AS new_sessions
    FROM (
      SELECT date_trunc('day', requests.timestamp AT TIME ZONE 'UTC') AS bucket,
        count(*) AS request_count,
        coalesce(sum(requests.input_tokens), 0) + coalesce(sum(requests.output_tokens), 0)
          + coalesce(sum(requests.cache_read_input_tokens), 0) + coalesce(sum(requests.cache_write_tokens), 0) AS total_tokens,
        coalesce(sum(requests.cost_usd), 0) AS total_cost
      FROM requests
      WHERE requests.timestamp > ${NOW} - interval '14 days'
        AND ${requestsVisFilter(vis, 'requests', traceVersion)} AND ${modelFilter(model)}
      GROUP BY date_trunc('day', requests.timestamp AT TIME ZONE 'UTC')
    ) r
    ${newSessionsJoin(
      vis,
      traceVersion,
      eligible,
      sql`date_trunc('day', sessions.started_at AT TIME ZONE 'UTC')`,
      sql`sessions.started_at > ${NOW} - interval '14 days'`,
    )}
    ORDER BY r.bucket
  `.execute(db);
  return res.rows.map((r) => ({
    day: String(r.day),
    requestCount: Number(r.request_count),
    totalTokens: Number(r.total_tokens),
    totalCost: Number(r.total_cost),
    newSessions: Number(r.new_sessions),
  }));
}

function mapUsageRow(r: Record<string, unknown>): UsageBucketRow {
  return {
    hour: String(r.hour),
    requestCount: Number(r.request_count),
    totalTokens: Number(r.total_tokens),
    totalCost: Number(r.total_cost),
    newSessions: Number(r.new_sessions),
  };
}

async function scalarStats(
  db: Kysely<Database>,
  vis: string[] | null,
  model: string | null,
  traceVersion: number | null,
) {
  const modelCond = modelFilter(model);
  const [sessionRow, gt20Row, windowCostRow, clientRow, gapRow] = await Promise.all([
    sql<Record<string, string>>`
      WITH bounds AS (
        SELECT
          date_trunc('day', ${NOW} AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS today_start,
          (date_trunc('day', ${NOW} AT TIME ZONE 'UTC') - interval '1 day') AT TIME ZONE 'UTC' AS yesterday_start
      )
      SELECT
        (SELECT count(DISTINCT sessions.client_id) FROM sessions WHERE sessions.last_active_at > ${NOW} - interval '24 hours' AND ${sessionsVisFilter(vis, traceVersion)}) AS active_clients_24h,
        (SELECT count(*) FROM sessions WHERE ${sessionsVisFilter(vis, traceVersion)}) AS session_count,
        (SELECT count(*) FROM sessions WHERE sessions.last_active_at > ${NOW} - interval '24 hours' AND ${sessionsVisFilter(vis, traceVersion)}) AS sessions_24h,
        (SELECT count(*) FROM sessions, bounds WHERE sessions.last_active_at >= bounds.today_start AND ${sessionsVisFilter(vis, traceVersion)}) AS sessions_today_utc,
        (SELECT count(*) FROM sessions, bounds WHERE sessions.last_active_at >= bounds.yesterday_start AND sessions.last_active_at < bounds.today_start AND ${sessionsVisFilter(vis, traceVersion)}) AS sessions_yesterday_utc
    `.execute(db),
    sql<Record<string, string>>`
      WITH bounds AS (
        SELECT
          date_trunc('day', ${NOW} AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS today_start,
          (date_trunc('day', ${NOW} AT TIME ZONE 'UTC') - interval '1 day') AT TIME ZONE 'UTC' AS yesterday_start
      )
      SELECT
        (SELECT count(*) FROM (SELECT session_id FROM requests WHERE ${requestsVisFilter(vis, 'requests', traceVersion)} AND ${modelCond} AND timestamp > ${NOW} - interval '24 hours' GROUP BY session_id HAVING count(*) > 20) sub) AS sessions_gt20_24h,
        (SELECT count(*) FROM (SELECT session_id FROM requests, bounds WHERE ${requestsVisFilter(vis, 'requests', traceVersion)} AND ${modelCond} AND requests.timestamp >= bounds.today_start GROUP BY session_id HAVING count(*) > 20) sub) AS sessions_gt20_today_utc,
        (SELECT count(*) FROM (SELECT session_id FROM requests, bounds WHERE ${requestsVisFilter(vis, 'requests', traceVersion)} AND ${modelCond} AND requests.timestamp >= bounds.yesterday_start AND requests.timestamp < bounds.today_start GROUP BY session_id HAVING count(*) > 20) sub) AS sessions_gt20_yesterday_utc
    `.execute(db),
    sql<Record<string, string>>`
      WITH bounds AS (
        SELECT
          date_trunc('day', ${NOW} AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS today_start,
          (date_trunc('day', ${NOW} AT TIME ZONE 'UTC') - interval '1 day') AT TIME ZONE 'UTC' AS yesterday_start
      )
      SELECT
        coalesce(sum(cost_usd) FILTER (WHERE timestamp > ${NOW} - interval '24 hours'), 0) AS cost_24h,
        coalesce(sum(cost_usd) FILTER (WHERE timestamp >= (SELECT today_start FROM bounds)), 0) AS cost_today_utc,
        coalesce(sum(cost_usd) FILTER (WHERE timestamp >= (SELECT yesterday_start FROM bounds) AND timestamp < (SELECT today_start FROM bounds)), 0) AS cost_yesterday_utc
      FROM requests, bounds
      WHERE requests.timestamp >= bounds.yesterday_start
        AND ${requestsVisFilter(vis, 'requests', traceVersion)} AND ${modelCond}
    `.execute(db),
    sql<{ client_count: string }>`SELECT count(*) AS client_count FROM clients`.execute(db),
    sql<Record<string, string>>`
      SELECT
        percentile_cont(0.25) WITHIN GROUP (ORDER BY gap_seconds) AS p25,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_seconds) AS p50,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY gap_seconds) AS p75,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY gap_seconds) AS p90,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY gap_seconds) AS p99
      FROM (
        SELECT extract(epoch FROM requests.timestamp - lag(requests.timestamp) OVER (
          PARTITION BY requests.session_id ORDER BY requests.timestamp
        )) AS gap_seconds
        FROM requests
        WHERE ${requestsVisFilter(vis, 'requests', traceVersion)} AND ${modelCond}
      ) sub
      WHERE gap_seconds IS NOT NULL
    `.execute(db),
  ]);

  return {
    session: sessionRow.rows[0],
    gt20: gt20Row.rows[0],
    windowCost: windowCostRow.rows[0],
    clientCount: Number(clientRow.rows[0].client_count),
    gap: gapRow.rows[0] ?? {},
  };
}

interface LatencyStat {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  avg: number;
  count: number;
}

async function streamingStats(
  db: Kysely<Database>,
  vis: string[] | null,
  model: string | null,
  traceVersion: number | null,
): Promise<{ ttftStats: LatencyStat; tpotStats: LatencyStat; prefillSpeedStats: LatencyStat }> {
  const pf = sql`(COALESCE(requests.cache_read_input_tokens, 0) + COALESCE(requests.cache_write_tokens, 0))::float / (requests.ttft_ms / 1000.0)`;
  const pfFilter = sql`requests.ttft_ms > 0 AND (COALESCE(requests.cache_read_input_tokens, 0) + COALESCE(requests.cache_write_tokens, 0)) > 0`;
  const res = await sql<Record<string, string>>`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY requests.ttft_ms) FILTER (WHERE requests.ttft_ms > 0) AS ttft_p50,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY requests.ttft_ms) FILTER (WHERE requests.ttft_ms > 0) AS ttft_p90,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY requests.ttft_ms) FILTER (WHERE requests.ttft_ms > 0) AS ttft_p95,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY requests.ttft_ms) FILTER (WHERE requests.ttft_ms > 0) AS ttft_p99,
        avg(requests.ttft_ms) FILTER (WHERE requests.ttft_ms > 0) AS ttft_avg,
        count(*) FILTER (WHERE requests.ttft_ms > 0) AS ttft_count,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY requests.tpot_ms) FILTER (WHERE requests.tpot_ms > 0) AS tpot_p50,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY requests.tpot_ms) FILTER (WHERE requests.tpot_ms > 0) AS tpot_p90,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY requests.tpot_ms) FILTER (WHERE requests.tpot_ms > 0) AS tpot_p95,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY requests.tpot_ms) FILTER (WHERE requests.tpot_ms > 0) AS tpot_p99,
        avg(requests.tpot_ms) FILTER (WHERE requests.tpot_ms > 0) AS tpot_avg,
        count(*) FILTER (WHERE requests.tpot_ms > 0) AS tpot_count,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY ${pf}) FILTER (WHERE ${pfFilter}) AS pf_p50,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY ${pf}) FILTER (WHERE ${pfFilter}) AS pf_p90,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY ${pf}) FILTER (WHERE ${pfFilter}) AS pf_p95,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY ${pf}) FILTER (WHERE ${pfFilter}) AS pf_p99,
        avg(${pf}) FILTER (WHERE ${pfFilter}) AS pf_avg,
        count(*) FILTER (WHERE ${pfFilter}) AS pf_count
      FROM requests
      WHERE requests.is_streaming
        AND ${requestsVisFilter(vis, 'requests', traceVersion)}
        AND ${modelFilter(model)}
    `.execute(db);
  const r = res.rows[0];
  const stat = (prefix: string): LatencyStat => ({
    p50: Number(r[`${prefix}_p50`] ?? 0),
    p90: Number(r[`${prefix}_p90`] ?? 0),
    p95: Number(r[`${prefix}_p95`] ?? 0),
    p99: Number(r[`${prefix}_p99`] ?? 0),
    avg: Number(r[`${prefix}_avg`] ?? 0),
    count: Number(r[`${prefix}_count`] ?? 0),
  });
  return { ttftStats: stat('ttft'), tpotStats: stat('tpot'), prefillSpeedStats: stat('pf') };
}

export async function computeOverviewPayload(
  db: Kysely<Database>,
  vis: string[] | null,
  model: string | null,
  traceVersion: number | null,
) {
  await assertRollupReady(db);

  const perSessionNoModel = await sessionRequestCounts(db, vis, null, traceVersion);
  const eligible = perSessionNoModel.ids.filter((_, i) => perSessionNoModel.counts[i] > 20);
  const turnsSource =
    model === null ? perSessionNoModel : await sessionRequestCounts(db, vis, model, traceVersion);
  const turnsPercentiles = percentiles5(turnsSource.counts);
  const sessionsGt20 = turnsSource.counts.filter((c) => c > 20).length;

  const [
    totals,
    scalars,
    tokensByModel,
    streaming,
    usageHistogram,
    usageHistogramTodayUtc,
    usageHistogramYesterdayUtc,
    dailyUsageHistogram,
  ] = await Promise.all([
    overviewTotals(db, vis, model, traceVersion),
    scalarStats(db, vis, model, traceVersion),
    tokensByModelFromRollup(db, vis, model, traceVersion),
    streamingStats(db, vis, model, traceVersion),
    hourlyUsageCounts(db, vis, model, traceVersion, eligible),
    hourlyUsageCountsForUtcDay(db, vis, model, traceVersion, eligible, 0),
    hourlyUsageCountsForUtcDay(db, vis, model, traceVersion, eligible, 1),
    dailyUsageCounts(db, vis, model, traceVersion, eligible),
  ]);
  const { ttftStats, tpotStats, prefillSpeedStats } = streaming;

  const s = scalars.session;
  const g = scalars.gt20;
  const w = scalars.windowCost;
  const gap = scalars.gap;

  const costBreakdown = computeCostBreakdown(tokensByModel);

  return {
    clients: scalars.clientCount,
    activeClients24h: Number(s.active_clients_24h),
    sessions: Number(s.session_count),
    requests: totals.request_count,
    totalInputTokens: totals.input_tokens,
    totalOutputTokens: totals.output_tokens,
    totalCacheWrite: totals.cache_write_tokens,
    totalCacheRead: totals.cache_read_input_tokens,
    totalCost: totals.cost_usd,
    sessions24h: Number(s.sessions_24h ?? 0),
    cost24h: Number(w.cost_24h ?? 0),
    sessionsGt20,
    sessionsGt20_24h: Number(g.sessions_gt20_24h ?? 0),
    sessionsTodayUtc: Number(s.sessions_today_utc ?? 0),
    sessionsYesterdayUtc: Number(s.sessions_yesterday_utc ?? 0),
    costTodayUtc: Number(w.cost_today_utc ?? 0),
    costYesterdayUtc: Number(w.cost_yesterday_utc ?? 0),
    sessionsGt20TodayUtc: Number(g.sessions_gt20_today_utc ?? 0),
    sessionsGt20YesterdayUtc: Number(g.sessions_gt20_yesterday_utc ?? 0),
    turnsPercentiles,
    gapPercentiles: {
      p25: Number(gap.p25 ?? 0),
      p50: Number(gap.p50 ?? 0),
      p75: Number(gap.p75 ?? 0),
      p90: Number(gap.p90 ?? 0),
      p99: Number(gap.p99 ?? 0),
    },
    costBreakdown,
    ttftStats,
    tpotStats,
    prefillSpeedStats,
    usageHistogram,
    usageHistogramTodayUtc,
    usageHistogramYesterdayUtc,
    dailyUsageHistogram,
  };
}

export async function computeModelsPayload(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
) {
  await assertRollupReady(db);
  const [tokensByModel, timeSeries] = await Promise.all([
    tokensByModelFromRollup(db, vis, null, traceVersion),
    modelTimeSeriesFromRollup(db, vis, traceVersion),
  ]);
  return {
    tokensByModel: sanitizeModels(tokensByModel),
    timeSeries: sanitizeModels(timeSeries),
  };
}

export async function computeAndCacheOverview(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
): Promise<Awaited<ReturnType<typeof computeOverviewPayload>>> {
  const payload = await computeOverviewPayload(db, vis, null, traceVersion);
  await writeStatsCache(db, statsCacheKey('overview', vis, traceVersion), payload);
  return payload;
}

export async function computeAndCacheModels(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
): Promise<Awaited<ReturnType<typeof computeModelsPayload>>> {
  const payload = await computeModelsPayload(db, vis, traceVersion);
  await writeStatsCache(db, statsCacheKey('models', vis, traceVersion), payload);
  return payload;
}

export async function computeCachePayload(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
) {
  const [stats, daily, byModel, byClient] = await Promise.all([
    getCacheStats(vis, traceVersion, db),
    getDailyCacheEfficiency(vis, traceVersion, db),
    getCacheByModel(vis, traceVersion, db),
    getCacheByClient(vis, traceVersion, db),
  ]);
  return { stats, daily, byModel: sanitizeModels(byModel), byClient };
}

export async function computeTrafficPayload(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
) {
  const [stats, daily, heatmap, streamingBreakdown] = await Promise.all([
    getTrafficStats(vis, traceVersion, db),
    getDailyTraffic(vis, traceVersion, db),
    getHourlyHeatmap(vis, traceVersion, db),
    getStreamingBreakdown(vis, traceVersion, db),
  ]);
  return { stats, daily, heatmap, streamingBreakdown };
}

export async function computeErrorsPayload(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
) {
  const [data, errorReach] = await Promise.all([
    getErrorStats(vis, traceVersion, db),
    getErrorReach(vis, traceVersion, db),
  ]);
  return {
    ...data,
    byModel: sanitizeModels(data.byModel),
    recentErrors: sanitizeModels(data.recentErrors),
    errorReach,
  };
}

export async function computeWebSearchPayload(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
) {
  const data = await getWebSearchStats(vis, traceVersion, db);
  return { ...data, byModel: sanitizeModels(data.byModel) };
}

export async function computePlatformPayload(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
) {
  const [stats, timeSeries] = await Promise.all([
    getPlatformStats(vis, traceVersion, db),
    getPlatformTimeSeries(vis, traceVersion, db),
  ]);
  return { stats, timeSeries };
}

export async function computeCostsPayload(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
) {
  const [summary, daily, byModel, byClient, tokensByModel, pricingCoverage] = await Promise.all([
    getCostSummary(vis, traceVersion, db),
    getDailyCosts(vis, traceVersion, db),
    getCostByModel(vis, traceVersion, db),
    getCostByClient(vis, traceVersion, db),
    getTokensByModel(vis, null, traceVersion, db),
    getPricingCoverage(vis, traceVersion, db),
  ]);
  const costBreakdown = computeCostBreakdown(tokensByModel);
  return {
    summary,
    daily,
    byModel: sanitizeModels(byModel),
    byClient,
    costBreakdown,
    pricingCoverage: {
      ...pricingCoverage,
      by_model: sanitizeModels(pricingCoverage.by_model),
    },
  };
}

interface SessionInsightsBin {
  min: number;
  max: number;
  count: number;
}
interface SessionInsightsPercentiles {
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

export function sessionInsightsPercentiles(sorted: number[]): SessionInsightsPercentiles {
  if (sorted.length === 0) return { p25: 0, p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 };
  const pct = (p: number) =>
    sorted[Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)];
  return { p25: pct(25), p50: pct(50), p75: pct(75), p90: pct(90), p95: pct(95), p99: pct(99) };
}

export function sessionInsightsHistogram(
  values: number[],
  bucketCount: number,
): { bins: SessionInsightsBin[]; percentiles: SessionInsightsPercentiles } {
  if (values.length === 0) {
    return { bins: [], percentiles: { p25: 0, p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 } };
  }
  const sorted = [...values].toSorted((a, b) => a - b);
  const percentiles = sessionInsightsPercentiles(sorted);

  const min = sorted[0];
  if (min === sorted.at(-1)) {
    return { bins: [{ min, max: min + 1, count: values.length }], percentiles };
  }

  const p95Idx = Math.min(Math.floor(0.95 * sorted.length), sorted.length - 1);
  const p95Val = sorted[p95Idx];
  const max = p95Val + (p95Val - min) * 0.1 || sorted.at(-1)!;

  const step = (max - min) / bucketCount;
  const bins: SessionInsightsBin[] = Array.from({ length: bucketCount }, (_, i) => ({
    min: min + i * step,
    max: min + (i + 1) * step,
    count: 0,
  }));
  for (const v of sorted) {
    if (v > max) continue;
    let idx = Math.floor((v - min) / step);
    if (idx >= bucketCount) idx = bucketCount - 1;
    bins[idx].count++;
  }
  return { bins, percentiles };
}

export async function computeSessionInsightsPayload(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
) {
  const data = await getSessionInsights(vis, traceVersion, db);

  const durations = data.sessionAggregates
    .map((s) => s.duration_seconds)
    .filter((v): v is number => v !== null && v > 0);
  const turns = data.sessionAggregates.map((s) => s.turn_count);
  const costs = data.sessionAggregates.map((s) => s.total_cost);

  const duration = sessionInsightsHistogram(durations, 40);
  const turn = sessionInsightsHistogram(turns, 30);
  const cost = sessionInsightsHistogram(costs, 30);

  return {
    stats: data.stats,
    durationBins: duration.bins,
    durationPercentiles: duration.percentiles,
    turnBins: turn.bins,
    turnPercentiles: turn.percentiles,
    costBins: cost.bins,
    costPercentiles: cost.percentiles,
    dailySessions: data.dailySessions,
    hourlyConcurrent: data.hourlyConcurrent,
  };
}

export interface GraphBucket {
  min: number;
  max: number;
  count: number;
}
export interface GraphPercentile {
  label: string;
  value: number;
}
export interface GraphHistogram {
  buckets: GraphBucket[];
  percentiles: GraphPercentile[];
  n: number;
}

interface PerformanceLatencyModeStats {
  p50: number;
  p95: number;
  avg: number;
  count: number;
}

interface PerformanceLatencyStats {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  requestsToday: number;
  streaming: PerformanceLatencyModeStats;
  nonStreaming: PerformanceLatencyModeStats;
}

export interface PerformanceExactStats {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  avg: number;
  count: number;
}

interface PerformanceHourlyLatency {
  hour: string;
  p50: number;
  p95: number;
  avg: number;
  count: number;
}

interface PerformanceModelLatency extends Omit<PerformanceHourlyLatency, 'hour'> {
  model: string;
}

interface PerformanceCacheReadBucket {
  bucket: number;
  count: number;
  p50: number;
  p95: number;
  p90: number;
  avg: number;
}

interface PerformanceHeatmapCell {
  readBucket: number;
  writeBucket: number;
  count: number;
  p90: number;
}

interface PerformanceHeatmapByOutputCell extends PerformanceHeatmapCell {
  outputBucket: number;
}

interface PerformanceInteractivityCell {
  cacheTotalBucket: number;
  outputBucket: number;
  count: number;
  p90Interactivity: number;
}

export interface PerformanceLatencyPayload {
  stats: PerformanceLatencyStats;
  distribution: GraphHistogram;
  hourly: PerformanceHourlyLatency[];
  byModel: PerformanceModelLatency[];
  cacheReadVsLatency: PerformanceCacheReadBucket[];
  cacheHeatmap: PerformanceHeatmapCell[];
  cacheHeatmapByOutput: PerformanceHeatmapByOutputCell[];
  ttftDistribution: GraphHistogram;
  tpotDistribution: GraphHistogram;
  ttftStats: PerformanceExactStats;
  tpotStats: PerformanceExactStats;
  cacheHeatmapTTFT: PerformanceHeatmapCell[];
  cacheHeatmapPrefillSpeed: PerformanceHeatmapCell[];
  prefillSpeedDistribution: GraphHistogram;
  prefillSpeedStats: PerformanceExactStats;
  cacheTotalVsOutputInteractivity: PerformanceInteractivityCell[];
  interactivityDistribution: GraphHistogram;
}

interface PerformanceStreamingStats {
  streamingCount: number;
  nonStreamingCount: number;
  totalCount: number;
  streamingAvgLatency: number;
  nonStreamingAvgLatency: number;
}

interface PerformanceDailyStreamingRatio {
  day: string;
  streaming_count: number;
  total_count: number;
}

interface PerformanceStreamingByModel {
  model: string;
  streaming_count: number;
  non_streaming_count: number;
  streaming_avg_latency: number | null;
  non_streaming_avg_latency: number | null;
}

export interface PerformanceStreamingPayload {
  stats: PerformanceStreamingStats;
  dailyRatio: PerformanceDailyStreamingRatio[];
  byModel: PerformanceStreamingByModel[];
  ttftDistribution: GraphHistogram;
  tpotDistribution: GraphHistogram;
  ttftStats: PerformanceExactStats;
  tpotStats: PerformanceExactStats;
  prefillSpeedDistribution: GraphHistogram;
  prefillSpeedStats: PerformanceExactStats;
  interactivityDistribution: GraphHistogram;
  streamingLatencyDistribution: GraphHistogram;
  nonStreamingLatencyDistribution: GraphHistogram;
  throughputDistribution: GraphHistogram;
}

export interface PerformancePayload {
  latency: PerformanceLatencyPayload;
  streaming: PerformanceStreamingPayload;
}

interface FastModeSummaryRow {
  is_fast_mode: boolean;
  count: number;
  total_cost: number;
  avg_duration_ms: number;
  avg_ttft_ms: number;
  total_output_tokens: number;
}

interface FastModeDailyRow {
  day: string;
  total_count: number;
  fast_count: number;
  total_cost: number;
  fast_cost: number;
}

interface FastModeModelRow {
  model: string;
  is_fast_mode: boolean;
  count: number;
  total_cost: number;
  avg_duration_ms: number;
}

export interface FastModePayload {
  summary: FastModeSummaryRow[];
  daily: FastModeDailyRow[];
  byModel: FastModeModelRow[];
}
export interface GraphPie {
  p50a: number;
  p50b: number;
  n: number;
}
export interface GraphConcurrencyBucket {
  label: string;
  value: number;
}

function graphBuildHistogramFromSorted(sorted: number[], bucketCount: number): GraphBucket[] {
  if (sorted.length === 0) return [];
  if (sorted[0] === sorted.at(-1)) {
    return [{ min: sorted[0], max: sorted[0], count: sorted.length }];
  }
  const min = sorted[0];
  const p95Idx = Math.min(Math.floor(0.95 * sorted.length), sorted.length - 1);
  const p95Val = sorted[p95Idx];
  const max = p95Val + (p95Val - min) * 0.1 || sorted.at(-1)!;
  const step = (max - min) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    min: min + i * step,
    max: min + (i + 1) * step,
    count: 0,
  }));
  for (const value of sorted) {
    if (value > max) continue;
    let index = Math.floor((value - min) / step);
    if (index >= bucketCount) index = bucketCount - 1;
    buckets[index].count++;
  }
  return buckets;
}

export function graphBuildHistogram(values: number[], bucketCount: number): GraphBucket[] {
  return graphBuildHistogramFromSorted(
    values.toSorted((a, b) => a - b),
    bucketCount,
  );
}

function graphPercentilesFromSorted(
  sorted: number[],
  tailDirection: 'high' | 'low',
  transform: (value: number) => number,
): GraphPercentile[] {
  const percentileValue = (percentile: number) =>
    sorted[Math.min(Math.floor((percentile / 100) * sorted.length), sorted.length - 1)];
  const percentiles = tailDirection === 'low' ? [1, 5, 10, 25, 50] : [50, 75, 90, 95, 99];
  return percentiles.map((percentile) => ({
    label: `p${percentile}`,
    value: transform(percentileValue(percentile)),
  }));
}

export function graphPercentiles(
  values: number[],
  tailDirection: 'high' | 'low' = 'high',
  sourceValues?: number[],
  sourceTransform?: (v: number) => number,
): GraphPercentile[] {
  const sorted = (sourceValues ?? values).toSorted((a, b) => a - b);
  return graphPercentilesFromSorted(sorted, tailDirection, sourceTransform ?? ((value) => value));
}

export function graphHistogram(
  values: number[],
  tailDirection: 'high' | 'low' = 'high',
  source?: { sourceValues: number[]; sourceTransform: (v: number) => number },
  bucketCount = 50,
): GraphHistogram {
  if (values.length === 0) return { buckets: [], percentiles: [], n: 0 };
  const sorted = values.toSorted((a, b) => a - b);
  const percentileSource = source ? source.sourceValues.toSorted((a, b) => a - b) : sorted;
  return {
    buckets: graphBuildHistogramFromSorted(sorted, bucketCount),
    percentiles: graphPercentilesFromSorted(
      percentileSource,
      tailDirection,
      source?.sourceTransform ?? ((value) => value),
    ),
    n: values.length,
  };
}

const LATENCY_HISTOGRAM_BUCKETS = 50;
const STREAMING_HISTOGRAM_BUCKETS = 30;

interface PerformanceDistributionAndStats<Row> {
  distribution: Row[];
  stats: PerformanceExactStats;
}

interface PerformanceHistogramSources {
  ttftValues: number[];
  tpotValues: number[];
  prefillSpeedValues: number[];
  interactivityValues: number[];
  interactivitySource: {
    sourceValues: number[];
    sourceTransform: (value: number) => number;
  };
  ttftStats: PerformanceExactStats;
  tpotStats: PerformanceExactStats;
  prefillSpeedStats: PerformanceExactStats;
}

interface PerformanceSharedHistograms {
  ttftDistribution: GraphHistogram;
  tpotDistribution: GraphHistogram;
  ttftStats: PerformanceExactStats;
  tpotStats: PerformanceExactStats;
  prefillSpeedDistribution: GraphHistogram;
  prefillSpeedStats: PerformanceExactStats;
  interactivityDistribution: GraphHistogram;
}

interface PerformanceLatencyOperations {
  stats: PerformanceLatencyStats;
  distribution: { duration_ms: number }[];
  hourly: PerformanceHourlyLatency[];
  byModel: PerformanceModelLatency[];
  cacheReadVsLatency: PerformanceCacheReadBucket[];
  cacheHeatmap: PerformanceHeatmapCell[];
  cacheHeatmapByOutput: PerformanceHeatmapByOutputCell[];
  cacheHeatmapTTFT: PerformanceHeatmapCell[];
  cacheHeatmapPrefillSpeed: PerformanceHeatmapCell[];
  cacheTotalVsOutputInteractivity: PerformanceInteractivityCell[];
}

interface PerformanceThroughputRow {
  is_streaming: boolean;
  duration_ms: number;
  output_tokens: number;
}

interface PerformanceStreamingOperations {
  statsWithRows: PerformanceStreamingStats & { throughputData: PerformanceThroughputRow[] };
  dailyRatio: PerformanceDailyStreamingRatio[];
  byModel: PerformanceStreamingByModel[];
}

function buildPerformanceHistogramSources(
  ttft: PerformanceDistributionAndStats<{ ttft_ms: number }>,
  tpot: PerformanceDistributionAndStats<{ tpot_ms: number }>,
  prefillSpeed: PerformanceDistributionAndStats<{ prefill_speed: number }>,
): PerformanceHistogramSources {
  const tpotValues = tpot.distribution.map((row) => row.tpot_ms);
  const positiveTpotValues: number[] = [];
  const interactivityValues: number[] = [];
  for (const value of tpotValues) {
    if (value <= 0) continue;
    positiveTpotValues.push(value);
    const interactivity = 1000 / value;
    if (interactivity <= 200) interactivityValues.push(interactivity);
  }

  return {
    ttftValues: ttft.distribution.map((row) => row.ttft_ms),
    tpotValues,
    prefillSpeedValues: prefillSpeed.distribution.map((row) => row.prefill_speed),
    interactivityValues,
    interactivitySource: {
      sourceValues: positiveTpotValues,
      sourceTransform: (value: number) => 1000 / value,
    },
    ttftStats: ttft.stats,
    tpotStats: tpot.stats,
    prefillSpeedStats: prefillSpeed.stats,
  };
}

function buildPerformanceSharedHistograms(
  sources: PerformanceHistogramSources,
  bucketCount: number,
  prefillTailDirection: 'high' | 'low',
  interactivityTailDirection: 'high' | 'low',
): PerformanceSharedHistograms {
  return {
    ttftDistribution: graphHistogram(sources.ttftValues, 'high', undefined, bucketCount),
    tpotDistribution: graphHistogram(sources.tpotValues, 'high', undefined, bucketCount),
    ttftStats: sources.ttftStats,
    tpotStats: sources.tpotStats,
    prefillSpeedDistribution: graphHistogram(
      sources.prefillSpeedValues,
      prefillTailDirection,
      undefined,
      bucketCount,
    ),
    prefillSpeedStats: sources.prefillSpeedStats,
    interactivityDistribution: graphHistogram(
      sources.interactivityValues,
      interactivityTailDirection,
      sources.interactivitySource,
      bucketCount,
    ),
  };
}

function assemblePerformanceLatencyPayload(
  operations: PerformanceLatencyOperations,
  sources: PerformanceHistogramSources,
): PerformanceLatencyPayload {
  const shared = buildPerformanceSharedHistograms(sources, LATENCY_HISTOGRAM_BUCKETS, 'low', 'low');
  return {
    stats: operations.stats,
    distribution: graphHistogram(
      operations.distribution.map((row) => row.duration_ms),
      'high',
      undefined,
      LATENCY_HISTOGRAM_BUCKETS,
    ),
    hourly: operations.hourly,
    byModel: sanitizeModels(operations.byModel),
    cacheReadVsLatency: operations.cacheReadVsLatency,
    cacheHeatmap: operations.cacheHeatmap,
    cacheHeatmapByOutput: operations.cacheHeatmapByOutput,
    ttftDistribution: shared.ttftDistribution,
    tpotDistribution: shared.tpotDistribution,
    ttftStats: shared.ttftStats,
    tpotStats: shared.tpotStats,
    cacheHeatmapTTFT: operations.cacheHeatmapTTFT,
    cacheHeatmapPrefillSpeed: operations.cacheHeatmapPrefillSpeed,
    prefillSpeedDistribution: shared.prefillSpeedDistribution,
    prefillSpeedStats: shared.prefillSpeedStats,
    cacheTotalVsOutputInteractivity: operations.cacheTotalVsOutputInteractivity,
    interactivityDistribution: shared.interactivityDistribution,
  };
}

function assemblePerformanceStreamingPayload(
  operations: PerformanceStreamingOperations,
  sources: PerformanceHistogramSources,
): PerformanceStreamingPayload {
  const shared = buildPerformanceSharedHistograms(
    sources,
    STREAMING_HISTOGRAM_BUCKETS,
    'high',
    'high',
  );
  const { throughputData, ...stats } = operations.statsWithRows;
  const streamingLatencyValues: number[] = [];
  const nonStreamingLatencyValues: number[] = [];
  const throughputValues: number[] = [];
  for (const row of throughputData) {
    if (row.duration_ms <= 0 || row.output_tokens <= 0) continue;
    if (row.is_streaming) {
      streamingLatencyValues.push(row.duration_ms);
      throughputValues.push((row.output_tokens / row.duration_ms) * 1000);
    } else {
      nonStreamingLatencyValues.push(row.duration_ms);
    }
  }

  return {
    stats,
    dailyRatio: operations.dailyRatio,
    byModel: sanitizeModels(operations.byModel),
    ttftDistribution: shared.ttftDistribution,
    tpotDistribution: shared.tpotDistribution,
    ttftStats: shared.ttftStats,
    tpotStats: shared.tpotStats,
    prefillSpeedDistribution: shared.prefillSpeedDistribution,
    prefillSpeedStats: shared.prefillSpeedStats,
    interactivityDistribution: shared.interactivityDistribution,
    streamingLatencyDistribution: graphHistogram(
      streamingLatencyValues,
      'high',
      undefined,
      STREAMING_HISTOGRAM_BUCKETS,
    ),
    nonStreamingLatencyDistribution: graphHistogram(
      nonStreamingLatencyValues,
      'high',
      undefined,
      STREAMING_HISTOGRAM_BUCKETS,
    ),
    throughputDistribution: graphHistogram(
      throughputValues,
      'high',
      undefined,
      STREAMING_HISTOGRAM_BUCKETS,
    ),
  };
}

export async function computePerformancePayload(
  db: Kysely<Database>,
  vis: string[] | null,
  model: string | null,
  traceVersion: number | null,
): Promise<PerformancePayload> {
  const [latencyStats, latencyRows, hourly] = await Promise.all([
    getLatencyStats(vis, model, traceVersion, db),
    getLatencyDistribution(vis, model, traceVersion, db),
    getHourlyLatency(vis, model, traceVersion, db),
  ]);
  const [latencyByModel, cacheReadVsLatency, cacheHeatmap, cacheHeatmapByOutput] =
    await Promise.all([
      getLatencyByModel(vis, model, traceVersion, db),
      getCacheReadVsLatency(vis, model, traceVersion, db),
      getCacheHeatmap(vis, model, traceVersion, db),
      getCacheHeatmapByOutput(vis, model, traceVersion, db),
    ]);
  const ttftCombined = await getTTFTDistributionAndStats(vis, model, traceVersion, db);
  const tpotCombined = await getTPOTDistributionAndStats(vis, model, traceVersion, db);
  const [cacheHeatmapTTFT, cacheHeatmapPrefillSpeed, cacheTotalVsOutputInteractivity] =
    await Promise.all([
      getCacheHeatmapTTFT(vis, model, traceVersion, db),
      getCacheHeatmapPrefillSpeed(vis, model, traceVersion, db),
      getCacheTotalVsOutputInteractivity(vis, model, traceVersion, db),
    ]);
  const prefillSpeedCombined = await getPrefillSpeedDistributionAndStats(
    vis,
    model,
    traceVersion,
    db,
  );
  const [streamingStatsWithRows, dailyRatio, streamingByModel] = await Promise.all([
    getStreamingStats(vis, model, traceVersion, db),
    getDailyStreamingRatio(vis, model, traceVersion, db),
    getStreamingByModel(vis, model, traceVersion, db),
  ]);

  const sources = buildPerformanceHistogramSources(
    ttftCombined,
    tpotCombined,
    prefillSpeedCombined,
  );
  return {
    latency: assemblePerformanceLatencyPayload(
      {
        stats: latencyStats,
        distribution: latencyRows,
        hourly,
        byModel: latencyByModel,
        cacheReadVsLatency,
        cacheHeatmap,
        cacheHeatmapByOutput,
        cacheHeatmapTTFT,
        cacheHeatmapPrefillSpeed,
        cacheTotalVsOutputInteractivity,
      },
      sources,
    ),
    streaming: assemblePerformanceStreamingPayload(
      {
        statsWithRows: streamingStatsWithRows,
        dailyRatio,
        byModel: streamingByModel,
      },
      sources,
    ),
  };
}

export async function computePerformanceLatencyPayload(
  db: Kysely<Database>,
  vis: string[] | null,
  model: string | null,
  traceVersion: number | null,
): Promise<PerformanceLatencyPayload> {
  const [stats, distribution, hourly, byModel] = await Promise.all([
    getLatencyStats(vis, model, traceVersion, db),
    getLatencyDistribution(vis, model, traceVersion, db),
    getHourlyLatency(vis, model, traceVersion, db),
    getLatencyByModel(vis, model, traceVersion, db),
  ]);
  const [cacheReadVsLatency, cacheHeatmap, cacheHeatmapByOutput] = await Promise.all([
    getCacheReadVsLatency(vis, model, traceVersion, db),
    getCacheHeatmap(vis, model, traceVersion, db),
    getCacheHeatmapByOutput(vis, model, traceVersion, db),
  ]);
  const ttftCombined = await getTTFTDistributionAndStats(vis, model, traceVersion, db);
  const [tpotCombined, prefillSpeedCombined] = await Promise.all([
    getTPOTDistributionAndStats(vis, model, traceVersion, db),
    getPrefillSpeedDistributionAndStats(vis, model, traceVersion, db),
  ]);
  const [cacheHeatmapTTFT, cacheHeatmapPrefillSpeed, cacheTotalVsOutputInteractivity] =
    await Promise.all([
      getCacheHeatmapTTFT(vis, model, traceVersion, db),
      getCacheHeatmapPrefillSpeed(vis, model, traceVersion, db),
      getCacheTotalVsOutputInteractivity(vis, model, traceVersion, db),
    ]);

  return assemblePerformanceLatencyPayload(
    {
      stats,
      distribution,
      hourly,
      byModel,
      cacheReadVsLatency,
      cacheHeatmap,
      cacheHeatmapByOutput,
      cacheHeatmapTTFT,
      cacheHeatmapPrefillSpeed,
      cacheTotalVsOutputInteractivity,
    },
    buildPerformanceHistogramSources(ttftCombined, tpotCombined, prefillSpeedCombined),
  );
}

export async function computePerformanceStreamingPayload(
  db: Kysely<Database>,
  vis: string[] | null,
  model: string | null,
  traceVersion: number | null,
): Promise<PerformanceStreamingPayload> {
  const [statsWithRows, dailyRatio, byModel] = await Promise.all([
    getStreamingStats(vis, model, traceVersion, db),
    getDailyStreamingRatio(vis, model, traceVersion, db),
    getStreamingByModel(vis, model, traceVersion, db),
  ]);
  const ttftCombined = await getTTFTDistributionAndStats(vis, model, traceVersion, db);
  const [tpotCombined, prefillSpeedCombined] = await Promise.all([
    getTPOTDistributionAndStats(vis, model, traceVersion, db),
    getPrefillSpeedDistributionAndStats(vis, model, traceVersion, db),
  ]);

  return assemblePerformanceStreamingPayload(
    { statsWithRows, dailyRatio, byModel },
    buildPerformanceHistogramSources(ttftCombined, tpotCombined, prefillSpeedCombined),
  );
}

export async function computeFastModePayload(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
): Promise<FastModePayload> {
  const filter = requestsVisFilter(vis, 'requests', traceVersion);
  const [summary, daily, byModel] = await Promise.all([
    sql<FastModeSummaryRow>`
      SELECT
        coalesce(is_fast_mode, false) AS is_fast_mode,
        count(*)::int AS count,
        coalesce(sum(cost_usd), 0) AS total_cost,
        coalesce(avg(duration_ms)::int, 0) AS avg_duration_ms,
        coalesce(avg(ttft_ms)::int, 0) AS avg_ttft_ms,
        coalesce(sum(output_tokens), 0)::bigint AS total_output_tokens
      FROM requests
      WHERE ${filter}
      GROUP BY coalesce(is_fast_mode, false)
      ORDER BY is_fast_mode DESC
    `.execute(db),
    sql<FastModeDailyRow>`
      SELECT
        date_trunc('day', timestamp)::date::text AS day,
        count(*)::int AS total_count,
        count(*) FILTER (WHERE is_fast_mode)::int AS fast_count,
        coalesce(sum(cost_usd), 0) AS total_cost,
        coalesce(sum(cost_usd) FILTER (WHERE is_fast_mode), 0) AS fast_cost
      FROM requests
      WHERE ${filter}
        AND timestamp > ${NOW} - interval '30 days'
      GROUP BY day
      ORDER BY day
    `.execute(db),
    sql<FastModeModelRow>`
      SELECT
        model,
        coalesce(is_fast_mode, false) AS is_fast_mode,
        count(*)::int AS count,
        coalesce(sum(cost_usd), 0) AS total_cost,
        coalesce(avg(duration_ms)::int, 0) AS avg_duration_ms
      FROM requests
      WHERE ${filter}
        AND model IS NOT NULL
      GROUP BY model, coalesce(is_fast_mode, false)
      ORDER BY model, is_fast_mode DESC
    `.execute(db),
  ]);

  return {
    summary: summary.rows,
    daily: daily.rows,
    byModel: sanitizeModels(byModel.rows),
  };
}

function graphP50(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].toSorted((a, b) => a - b);
  return sorted[Math.min(Math.floor(0.5 * sorted.length), sorted.length - 1)];
}

const GRAPH_CONCURRENCY_BUCKETS: { label: string; accepts: (v: number) => boolean }[] = [
  { label: '0', accepts: (v) => v === 0 },
  { label: '1', accepts: (v) => v === 1 },
  { label: '2', accepts: (v) => v === 2 },
  { label: '3', accepts: (v) => v === 3 },
  { label: '4–5', accepts: (v) => v >= 4 && v <= 5 },
  { label: '6–10', accepts: (v) => v >= 6 && v <= 10 },
  { label: '11+', accepts: (v) => v >= 11 },
];

export function graphConcurrencyBuckets(values: number[]): GraphConcurrencyBucket[] {
  const counts = GRAPH_CONCURRENCY_BUCKETS.map(() => 0);
  for (const v of values) {
    for (let i = 0; i < GRAPH_CONCURRENCY_BUCKETS.length; i++) {
      if (GRAPH_CONCURRENCY_BUCKETS[i].accepts(v)) {
        counts[i]++;
        break;
      }
    }
  }
  return GRAPH_CONCURRENCY_BUCKETS.map((def, i) => ({ label: def.label, value: counts[i] }));
}

const GRAPH_OPUS_47_MODEL = 'claude-opus-4-7';
const GRAPH_OPUS_48_MODEL = 'claude-opus-4-8';

const GRAPH_SESSION_MIN_REQS = 20;

export const GRAPH_DATASET_KEYS = [
  'requestStats',
  'sessionAggregates',
  'wallClock',
  'hourlyTokens',
  'ttftValues',
  'tpotValues',
  'prefillSpeedValues',
  'prefillDecodeValues',
  'tokensPerChunkValues',
  'weeklySessionsByHarness',
  'sessionDurationValues',
  'subagentStatsPerSession',
  'cpuGpuOpus47Fast',
  'cpuGpuOpus47NonFast',
  'prefillDecodeOpus47Fast',
  'prefillDecodeOpus47NonFast',
  'cpuGpuOpus48Fast',
  'cpuGpuOpus48NonFast',
  'prefillDecodeOpus48Fast',
  'prefillDecodeOpus48NonFast',
] as const;

export type GraphDatasetKey = (typeof GRAPH_DATASET_KEYS)[number];

function cpuGpuPie(rows: { gapSeconds: number; durationMs: number }[]): GraphPie {
  return {
    p50a: graphP50(rows.map((r) => r.gapSeconds)),
    p50b: graphP50(rows.map((r) => r.durationMs / 1000)),
    n: rows.length,
  };
}

function prefillDecodePie(rows: { ttftMs: number; durationMs: number }[]): GraphPie {
  return {
    p50a: graphP50(rows.map((r) => r.ttftMs / 1000)),
    p50b: graphP50(rows.map((r) => Math.max(0, r.durationMs - r.ttftMs) / 1000)),
    n: rows.length,
  };
}

export async function computeGraphsDataset(
  db: Kysely<Database>,
  key: GraphDatasetKey,
  vis: string[] | null,
  model: string | null,
  traceVersion: number | null,
): Promise<unknown> {
  switch (key) {
    case 'requestStats': {
      const rows = await getGlobalRequestStats(vis, model, traceVersion, db);
      const paired = rows.filter(
        (r) =>
          r.gap_seconds !== null &&
          r.gap_seconds > 0 &&
          r.duration_ms !== null &&
          r.duration_ms > 0,
      );
      return {
        islTotal: graphHistogram(
          rows.map((r) => r.cache_read + r.cache_write + r.input).filter((v) => v > 0),
        ),
        cacheRead: graphHistogram(rows.map((r) => r.cache_read).filter((v) => v > 0)),
        cacheWrite: graphHistogram(rows.map((r) => r.cache_write).filter((v) => v > 0)),
        output: graphHistogram(rows.map((r) => r.output).filter((v) => v > 0)),
        gap: graphHistogram(
          rows.map((r) => r.gap_seconds).filter((v): v is number => v !== null && v > 0),
        ),
        cpuGpuRatio: graphHistogram(
          paired.map((r) => (r.gap_seconds as number) / ((r.duration_ms as number) / 1000)),
        ),
        reqRatio: graphHistogram(
          rows.filter((r) => r.output > 0).map((r) => r.cache_read / r.output),
        ),
        readWriteRatio: graphHistogram(
          rows.filter((r) => r.cache_write > 0).map((r) => r.cache_read / r.cache_write),
        ),
        cpuGpuPie: {
          p50a: graphP50(paired.map((r) => r.gap_seconds as number)),
          p50b: graphP50(paired.map((r) => (r.duration_ms as number) / 1000)),
          n: paired.length,
        } satisfies GraphPie,
      };
    }
    case 'wallClock': {
      const { idle_gaps_ms, walked_away, daily } = await getWallClockBreakdown(
        vis,
        model,
        traceVersion,
        db,
      );
      return {
        userIdle: graphHistogram(idle_gaps_ms.map((ms) => ms / 1000).filter((v) => v > 0)),
        walkedAway: walked_away,
        daily,
      };
    }
    case 'sessionAggregates': {
      const rows = await getGlobalSessionAggregates(vis, model, traceVersion, db);
      return {
        sessRatio: graphHistogram(
          rows.filter((s) => s.output > 0).map((s) => s.cache_read / s.output),
        ),
        turns: graphHistogram(rows.map((s) => s.turn_count)),
      };
    }
    case 'hourlyTokens': {
      return getHourlyTokenCounts(vis, model, traceVersion, db);
    }
    case 'ttftValues': {
      const rows = await getTTFTDistribution(vis, model, traceVersion, db);
      return graphHistogram(rows.map((r) => r.ttft_ms));
    }
    case 'tpotValues': {
      const rows = await getTPOTDistribution(vis, model, traceVersion, db);
      const tpot = rows.map((r) => r.tpot_ms);
      const positiveTpot = tpot.filter((v) => v > 0);
      return {
        tpot: graphHistogram(tpot),
        interactivity: graphHistogram(
          positiveTpot.map((v) => 1000 / v).filter((v) => v <= 200),
          'low',
          { sourceValues: positiveTpot, sourceTransform: (v: number) => 1000 / v },
        ),
      };
    }
    case 'prefillSpeedValues': {
      const rows = await getPrefillSpeedDistribution(vis, model, traceVersion, db);
      return graphHistogram(
        rows.map((r) => r.prefill_speed),
        'low',
      );
    }
    case 'prefillDecodeValues': {
      const rows = await getPrefillDecodePairedDistribution(vis, model, traceVersion, db);
      return {
        prefillShare: graphHistogram(
          rows
            .filter((r) => r.durationMs > 0 && r.ttftMs >= 0 && r.ttftMs <= r.durationMs)
            .map((r) => r.ttftMs / r.durationMs),
        ),
        prefillDecodePie: prefillDecodePie(rows),
      };
    }
    case 'tokensPerChunkValues': {
      const rows = await getTokensPerChunkDistribution(vis, model, traceVersion, db);
      return graphHistogram(rows.map((r) => r.tokens_per_chunk));
    }
    case 'weeklySessionsByHarness': {
      return getWeeklySessionsByHarness(vis, CURRENT_TRACE_VERSION, GRAPH_SESSION_MIN_REQS, db);
    }
    case 'sessionDurationValues': {
      const rows = await getSessionDurationDistribution(
        vis,
        CURRENT_TRACE_VERSION,
        GRAPH_SESSION_MIN_REQS,
        db,
      );
      return graphHistogram(rows.map((r) => r.durationMinutes / 60).filter((v) => v > 0));
    }
    case 'subagentStatsPerSession': {
      const rows = await getSubagentStatsPerSessionDistribution(
        vis,
        CURRENT_TRACE_VERSION,
        GRAPH_SESSION_MIN_REQS,
        db,
      );
      return {
        subagentCount: graphHistogram(rows.map((r) => r.subagentCount)),
        maxConcurrent: graphHistogram(rows.map((r) => r.maxConcurrent)),
        concurrencyPie: graphConcurrencyBuckets(rows.map((r) => r.maxConcurrent)),
      };
    }
    case 'cpuGpuOpus47Fast': {
      return cpuGpuPie(
        await getCpuGpuPairedDistribution(vis, GRAPH_OPUS_47_MODEL, true, traceVersion, db),
      );
    }
    case 'cpuGpuOpus47NonFast': {
      return cpuGpuPie(
        await getCpuGpuPairedDistribution(vis, GRAPH_OPUS_47_MODEL, false, traceVersion, db),
      );
    }
    case 'cpuGpuOpus48Fast': {
      return cpuGpuPie(
        await getCpuGpuPairedDistribution(vis, GRAPH_OPUS_48_MODEL, true, traceVersion, db),
      );
    }
    case 'cpuGpuOpus48NonFast': {
      return cpuGpuPie(
        await getCpuGpuPairedDistribution(vis, GRAPH_OPUS_48_MODEL, false, traceVersion, db),
      );
    }
    case 'prefillDecodeOpus47Fast': {
      return prefillDecodePie(
        await getPrefillDecodePairedByModelFastMode(
          vis,
          GRAPH_OPUS_47_MODEL,
          true,
          traceVersion,
          db,
        ),
      );
    }
    case 'prefillDecodeOpus47NonFast': {
      return prefillDecodePie(
        await getPrefillDecodePairedByModelFastMode(
          vis,
          GRAPH_OPUS_47_MODEL,
          false,
          traceVersion,
          db,
        ),
      );
    }
    case 'prefillDecodeOpus48Fast': {
      return prefillDecodePie(
        await getPrefillDecodePairedByModelFastMode(
          vis,
          GRAPH_OPUS_48_MODEL,
          true,
          traceVersion,
          db,
        ),
      );
    }
    case 'prefillDecodeOpus48NonFast': {
      return prefillDecodePie(
        await getPrefillDecodePairedByModelFastMode(
          vis,
          GRAPH_OPUS_48_MODEL,
          false,
          traceVersion,
          db,
        ),
      );
    }
    default: {
      throw new Error(`unknown graphs dataset key: ${key as string}`);
    }
  }
}

export async function computeGraphsSubset(
  db: Kysely<Database>,
  keys: readonly GraphDatasetKey[],
  vis: string[] | null,
  model: string | null,
  traceVersion: number | null,
): Promise<Record<string, unknown>> {
  const values = await Promise.all(
    keys.map((k) => computeGraphsDataset(db, k, vis, model, traceVersion)),
  );
  const out: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) out[keys[i]] = values[i];
  return out;
}

export function computeGraphsPayload(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
  opts: { skipDatasets?: readonly GraphDatasetKey[] } = {},
): Promise<Record<string, unknown>> {
  const skip = new Set<GraphDatasetKey>(opts.skipDatasets);
  const keys =
    skip.size === 0 ? GRAPH_DATASET_KEYS : GRAPH_DATASET_KEYS.filter((k) => !skip.has(k));
  return computeGraphsSubset(db, keys, vis, null, traceVersion);
}

const WAVE2A_COMPUTERS: Record<
  Exclude<StatsCacheKind, 'overview' | 'models'>,
  (db: Kysely<Database>, vis: string[] | null, tv: number | null) => Promise<unknown>
> = {
  cache: computeCachePayload,
  traffic: computeTrafficPayload,
  errors: computeErrorsPayload,
  'web-search': computeWebSearchPayload,
  platform: computePlatformPayload,
  costs: computeCostsPayload,
  'session-insights': computeSessionInsightsPayload,
  'session-reuse': computeSessionReusePayload,
  performance: (db, vis, traceVersion) => computePerformancePayload(db, vis, null, traceVersion),
  'fast-mode': computeFastModePayload,
  graphs: computeGraphsPayload,
};

export async function computeAndCacheStatsKind(
  db: Kysely<Database>,
  kind: Exclude<StatsCacheKind, 'overview' | 'models'>,
  vis: string[] | null,
  traceVersion: number | null,
): Promise<unknown> {
  const payload = await WAVE2A_COMPUTERS[kind](db, vis, traceVersion);
  await writeStatsCache(db, statsCacheKey(kind, vis, traceVersion), payload);
  return payload;
}

export async function computeAndPatchGraphsRefresh(
  db: Kysely<Database>,
  vis: string[] | null,
  traceVersion: number | null,
): Promise<Record<string, unknown>> {
  const payload = await computeGraphsPayload(db, vis, traceVersion);
  await patchStatsCache(db, statsCacheKey('graphs', vis, traceVersion), payload);
  return payload;
}
