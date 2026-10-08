import { type Kysely, type QueryResult, type RawBuilder, sql } from 'kysely';
import type { Harness } from './shared/harness';
import { PLATFORM_OS_ALIASES } from './shared/platform';
import type { PrivacyMode } from './shared/trace';
import { SUBAGENT_STATS_WINDOW_DAYS } from './shared/subagent';
import { isPlausibleCommandBinaryName } from './shared/tool-classifiers';
import { IDLE_GAP_CUTOFF_MS, WALL_CLOCK_DAILY_DAYS } from './shared/wall-clock';
import { LONG_CONTEXT_PRICING_MODELS, LONG_CONTEXT_TOKEN_THRESHOLD } from './shared/pricing';
import { getDb } from './connection';
import type { Database } from './types';
import type { ToolOutcomeAnalytics } from './tool-analysis';
import { analyzeToolSequences } from './sequence-insights';
import { NOW, TODAY_UTC_START } from './as-of';
const LONG_CONTEXT_MODEL_NAMES = Object.keys(LONG_CONTEXT_PRICING_MODELS);

// ── Visibility filter helpers ──

/**
 * SQL condition for requests table. Admin sees every privacy mode; non-admins
 * only see anonymized rows. Optionally pins to a single `trace_version` for
 * the dashboard's global version selector (`null` ⇒ all versions).
 */
export function requestsVisFilter(
  v: string[] | null,
  alias = 'requests',
  traceVersion: number | null = null,
) {
  const vis = v === null ? sql`TRUE` : sql`${sql.raw(alias)}.privacy_mode = 'anon'`;
  if (traceVersion === null) return vis;
  return sql`${vis} AND ${sql.raw(alias)}.trace_version = ${traceVersion}`;
}

/**
 * SQL condition for sessions table. A non-admin may see a session only if it
 * has at least one anonymized request. When `traceVersion` is set, also
 * requires at least one request at that pipeline version — so the sessions
 * list and any sessions-only aggregate naturally narrows with the global
 * version selector.
 */
export function sessionsVisFilter(v: string[] | null, traceVersion: number | null = null) {
  if (v === null && traceVersion === null) return sql`TRUE`;
  const vis = v === null ? sql`TRUE` : sql`r_vis.privacy_mode = 'anon'`;
  const ver = traceVersion === null ? sql`TRUE` : sql`r_vis.trace_version = ${traceVersion}`;
  return sql`EXISTS (
    SELECT 1 FROM requests r_vis
    WHERE r_vis.session_id = sessions.id
      AND ${vis}
      AND ${ver}
  )`;
}

/**
 * SQL condition to filter requests by model name.
 * @param model - null = no filter (all models), string = specific model
 */
export function modelFilter(model: string | null) {
  if (!model) return sql`TRUE`;
  return sql`requests.model = ${model}`;
}

/**
 * SQL condition to filter requests by stamped trace_version. Used by the
 * dashboard's global version selector so analytics only mix rows from a
 * single pipeline generation. `null` ⇒ no filter (return every version).
 *
 * @param traceVersion - null = all versions, number = exact match
 * @param alias - table alias for the requests row (defaults to `requests`)
 */
export function traceVersionFilter(traceVersion: number | null, alias = 'requests') {
  if (traceVersion === null) return sql`TRUE`;
  return sql`${sql.raw(alias)}.trace_version = ${traceVersion}`;
}

/** Restricts a scan to the given sessions; `null` leaves it unrestricted. */
function sessionIdFilter(sessionIds: readonly string[] | null, column: string) {
  return sessionIds === null ? sql`TRUE` : sql`${sql.ref(column)} = ANY(${sessionIds}::text[])`;
}

/**
 * Joins `request_stats` as `rs`. For a session sample the planner overestimates
 * the matching requests and seq-scans all of request_stats; the OFFSET 0
 * lateral keeps it to one index lookup per request.
 */
function requestStatsJoin(requestId: string, sessionIds: readonly string[] | null) {
  return sessionIds === null
    ? sql`JOIN request_stats rs ON rs.request_id = ${sql.ref(requestId)}`
    : sql`CROSS JOIN LATERAL (
        SELECT * FROM request_stats WHERE request_id = ${sql.ref(requestId)} OFFSET 0
      ) rs`;
}

export async function getDistinctModels(visibleClientIds: string[] | null = null) {
  const db = getDb();
  const result = await sql<{ model: string }>`
    SELECT DISTINCT model
    FROM requests
    WHERE model IS NOT NULL
      AND ${requestsVisFilter(visibleClientIds)}
    ORDER BY model
  `.execute(db);
  return result.rows.map((r) => String(r.model));
}

/** SQL mirror of `harnessFromUserAgent` in `./shared/harness`. */
export const SESSION_HARNESS_SQL = sql<Harness>`CASE
  WHEN sessions.metadata ->> 'userAgent' LIKE 'claude-cli/%' THEN 'claude-code'
  WHEN sessions.metadata ->> 'userAgent' ~* '^codex' THEN 'codex'
  WHEN sessions.metadata ->> 'userAgent' LIKE 'pi (%' THEN 'pi'
  WHEN sessions.metadata ->> 'userAgent' ~ '^(omp|pi)/' THEN 'omp'
  ELSE 'other'
END`;

/**
 * SQL conditions that mirror the chip filters on /sessions. Shared by
 * `getRecentSessions` and `getSessionStats` so the stat cards always agree
 * with the visible list.
 */
function sessionFilterConditions(
  traceVersion: number | null,
  privacyMode: PrivacyMode | null,
  harnessFilter: Harness | null,
) {
  // ALL-rows semantics: a session matches the version filter iff every one of
  // its visible requests is at the chosen trace_version (and it has at least
  // one — guaranteed by the session_summary join).
  let versionCondition = sql`TRUE`;
  if (traceVersion !== null) {
    versionCondition = sql`ss.min_trace_version = ${traceVersion} AND ss.max_trace_version = ${traceVersion}`;
  }

  // Privacy mode filter: when specified, filter sessions by their privacy_mode.
  // Only admins can filter by privacy_mode (enforced at API level).
  let privacyCondition = sql`TRUE`;
  if (privacyMode !== null) {
    privacyCondition = sql`sessions.privacy_mode = ${privacyMode}`;
  }

  const harnessCondition =
    harnessFilter === null ? sql`TRUE` : sql`${SESSION_HARNESS_SQL} = ${harnessFilter}`;

  return { versionCondition, privacyCondition, harnessCondition };
}

/**
 * Session list for the read-only deployment. Per-session request totals come
 * from the `session_summary` materialized view (anonymized requests only,
 * grouped by session; see README) instead of aggregating `requests` per call.
 * The data is a static snapshot and every viewer is non-admin, so
 * `_visibleClientIds` is always the anon marker; a session is visible iff it
 * has a session_summary row.
 */
export const SESSION_SORT_KEYS = [
  'active',
  'started',
  'requests',
  'cost',
  'session',
  'user',
  'version',
] as const;
export type SessionSortKey = (typeof SESSION_SORT_KEYS)[number];
export interface SessionSort {
  key: SessionSortKey;
  dir: 'asc' | 'desc';
}

// Mirrors parseUserAgent's CLI_VERSION_RE (Postgres uses \m for a word start).
const UA_VERSION_RE = String.raw`\m(?:claude-cli|codex[\w-]*|Codex Desktop|omp|pi)/(\S+)`;

/**
 * ORDER BY for the sessions list, applied over every matching session so the
 * first page of a sort is the true first page. Versions order like
 * compareVersions: numeric dot parts, then a release after its prerelease,
 * with versionless sessions last in both directions.
 */
function sessionOrderBy(sort: SessionSort | null) {
  const d = sort?.dir === 'asc' ? sql`ASC` : sql`DESC`;
  switch (sort?.key) {
    case 'started': {
      return sql`sessions.started_at ${d}`;
    }
    case 'requests': {
      return sql`ss.request_count ${d}`;
    }
    case 'cost': {
      return sql`ss.total_cost ${d}`;
    }
    case 'session': {
      return sql`sessions.id ${d}`;
    }
    case 'user': {
      return sql`clients.api_key_hash ${d}`;
    }
    case 'version': {
      return sql`(ver.v IS NULL),
        string_to_array(coalesce(nullif(ver.core, ''), '0'), '.')::numeric[] ${d},
        (substr(ver.v, length(ver.core) + 1) = '') ${d},
        substr(ver.v, length(ver.core) + 1) ${d}`;
    }
    default: {
      return sql`sessions.last_active_at ${d}`;
    }
  }
}

export async function getRecentSessions(
  limit = 50,
  offset = 0,
  _visibleClientIds: string[] | null = null,
  search: string | null = null,
  traceVersion: number | null = null,
  privacyMode: PrivacyMode | null = null,
  harnessFilter: Harness | null = null,
  minReqs = 0,
  sort: SessionSort | null = null,
) {
  const db = getDb();

  let searchCondition = sql`TRUE`;
  if (search) {
    const pattern = `%${search}%`;
    searchCondition = sql`(sessions.id ILIKE ${pattern} OR clients.api_key_hash ILIKE ${pattern})`;
  }

  const { versionCondition, privacyCondition, harnessCondition } = sessionFilterConditions(
    traceVersion,
    privacyMode,
    harnessFilter,
  );

  // `> minReqs` (strict) mirrors the chip labels (> 20 Reqs, > 100 Reqs).
  // minReqs=0 disables the threshold.
  const minReqsFilter = minReqs > 0 ? sql`ss.request_count > ${minReqs}` : sql`TRUE`;

  const result = await sql<{
    id: string;
    clientId: string;
    startedAt: Date;
    lastActiveAt: Date;
    metadata: Record<string, unknown> | null;
    clientApiKeyHash: string | null;
    requestCount: number;
    totalInput: number;
    totalCacheRead: number;
    totalCacheWrite: number;
    totalOutput: number;
    totalCost: number;
    privacyMode: 'anon' | 'full';
  }>`
    SELECT
      sessions.id,
      sessions.client_id AS "clientId",
      sessions.started_at AS "startedAt",
      sessions.last_active_at AS "lastActiveAt",
      sessions.metadata,
      sessions.privacy_mode AS "privacyMode",
      clients.api_key_hash AS "clientApiKeyHash",
      ss.request_count AS "requestCount",
      ss.total_input AS "totalInput",
      ss.total_cache_read AS "totalCacheRead",
      ss.total_cache_write AS "totalCacheWrite",
      ss.total_output AS "totalOutput",
      ss.total_cost AS "totalCost"
    FROM sessions
    JOIN session_summary ss ON ss.session_id = sessions.id
    LEFT JOIN clients ON sessions.client_id = clients.id
    CROSS JOIN LATERAL (
      SELECT v, coalesce(substring(v FROM '^\\d+(?:\\.\\d+)*'), '') AS core
      FROM (
        SELECT coalesce(
          sessions.metadata->>'cliVersion',
          substring(sessions.metadata->>'userAgent' FROM ${UA_VERSION_RE})
        ) AS v
      ) raw
    ) ver
    WHERE ${searchCondition}
      AND ${versionCondition}
      AND ${privacyCondition}
      AND ${harnessCondition}
      AND ${minReqsFilter}
    ORDER BY ${sessionOrderBy(sort)}, sessions.last_active_at DESC, sessions.id
    LIMIT ${limit}
    OFFSET ${offset}
  `.execute(db);
  return result.rows;
}

export async function getSessionById(sessionId: string, visibleClientIds: string[] | null = null) {
  const db = getDb();

  const [sessionResult, usageResult] = await Promise.all([
    sql<{
      id: string;
      clientId: string;
      startedAt: Date;
      lastActiveAt: Date;
      metadata: Record<string, unknown> | null;
      clientApiKeyHash: string | null;
      privacyMode: 'anon' | 'full';
    }>`
      SELECT
        sessions.id,
        sessions.client_id AS "clientId",
        sessions.started_at AS "startedAt",
        sessions.last_active_at AS "lastActiveAt",
        sessions.metadata,
        sessions.privacy_mode AS "privacyMode",
        clients.api_key_hash AS "clientApiKeyHash"
      FROM sessions
      LEFT JOIN clients ON sessions.client_id = clients.id
      WHERE sessions.id = ${sessionId}
        AND ${sessionsVisFilter(visibleClientIds)}
      LIMIT 1
    `.execute(db),
    sql<{
      requestCount: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCacheCreation: number;
      totalCacheRead: number;
      totalCost: number;
      minTraceVersion: number | null;
      maxTraceVersion: number | null;
    }>`
      SELECT
        count(*)::int AS "requestCount",
        coalesce(sum(input_tokens), 0)::bigint AS "totalInputTokens",
        coalesce(sum(output_tokens), 0)::bigint AS "totalOutputTokens",
        coalesce(sum(cache_write_tokens), 0)::bigint AS "totalCacheCreation",
        coalesce(sum(cache_read_input_tokens), 0)::bigint AS "totalCacheRead",
        coalesce(sum(cost_usd), 0) AS "totalCost",
        min(trace_version)::int AS "minTraceVersion",
        max(trace_version)::int AS "maxTraceVersion"
      FROM requests
      WHERE session_id = ${sessionId}
        AND ${requestsVisFilter(visibleClientIds)}
    `.execute(db),
  ]);

  if (!sessionResult.rows[0]) return null;
  const { minTraceVersion, maxTraceVersion, ...usage } = usageResult.rows[0];
  return { ...sessionResult.rows[0], usage, minTraceVersion, maxTraceVersion };
}

// Every requests column except hash_ids, plus its block count. hash_ids is
// ~90% of a request's payload (about 95 KB each) and most session views only
// show the count; the full list is fetched per request via getRequestHashIds.
const REQUEST_COLUMNS_WITHOUT_HASH_IDS = sql.raw(
  `${[
    'id',
    'session_id',
    'client_id',
    'timestamp',
    'method',
    'endpoint',
    'model',
    'request_headers',
    'request_body',
    'response_status_code',
    'response_headers',
    'response_body',
    'input_tokens',
    'output_tokens',
    'cache_write_tokens',
    'cache_read_input_tokens',
    'duration_ms',
    'is_streaming',
    'error',
    'is_fast_mode',
    'cost_usd',
    'hash_token_count',
    'ttft_ms',
    'tpot_ms',
    'web_search_count',
    'subagent_label',
    'metadata',
    'privacy_mode',
    'trace_version',
    'sse_chunk_count',
    'trace_id',
    'alt_hashes',
  ]
    .map((c) => `"${c}"`)
    .join(
      ', ',
    )}, NULL::jsonb AS "hash_ids", coalesce(jsonb_array_length("hash_ids"), 0) AS "hash_count"`,
);

export async function getRequestsBySession(
  sessionId: string,
  limit = 20,
  offset = 0,
  sort: 'asc' | 'desc' = 'asc',
  visibleClientIds: string[] | null = null,
  includeHashIds = true,
) {
  const db = getDb();

  const orderDir = sort === 'desc' ? sql`DESC` : sql`ASC`;
  const columns = includeHashIds ? sql`*` : REQUEST_COLUMNS_WITHOUT_HASH_IDS;

  // The total comes from the session_summary view (visible = anonymized
  // requests; see getRecentSessions) instead of counting requests per call.
  const [totalResult, rowsResult] = await Promise.all([
    sql<{ count: number }>`
      SELECT coalesce((
        SELECT request_count FROM session_summary WHERE session_id = ${sessionId}
      ), 0)::int AS count
    `.execute(db),
    sql<Record<string, unknown>>`
      SELECT ${columns}
      FROM requests
      WHERE session_id = ${sessionId}
        AND ${requestsVisFilter(visibleClientIds)}
      ORDER BY timestamp ${orderDir}
      LIMIT ${limit}
      OFFSET ${offset}
    `.execute(db),
  ]);

  return { requests: rowsResult.rows, total: totalResult.rows[0].count };
}

export interface SessionHashBlockMetadata {
  hashCount: number;
  hashTokenCount: number;
}

export interface SessionHashChainRow {
  id: string;
  hashIds: string[] | null;
  hashTokenCount: number | null;
}

interface SessionHashChainCursor {
  timestamp: string;
  id: string;
}

interface SessionHashChainPageRow extends SessionHashChainRow {
  timestampCursor: string;
}

/** Read only scalar metadata so block-size inference never transfers a hash array. */
/** One request's hash_ids, for views that load them on demand. */
export async function getRequestHashIds(
  requestId: string,
  visibleClientIds: string[] | null = null,
): Promise<string[] | null | undefined> {
  const db = getDb();
  const result = await sql<{ hash_ids: string[] | null }>`
    SELECT hash_ids FROM requests
    WHERE id = ${requestId} AND ${requestsVisFilter(visibleClientIds)}
  `.execute(db);
  // undefined: no such (visible) request; null: request without hashes.
  return result.rows.length === 0 ? undefined : result.rows[0].hash_ids;
}

/**
 * Precomputed hash-prefix cache totals for one session, from the
 * `session_hash_stats` table (built once from the static snapshot; see README).
 * Returns null when the session (or the table) is missing, so callers can compute it live.
 */
export async function getPrecomputedSessionHashStats(
  sessionId: string,
): Promise<{ hashCached: number; hashTotal: number } | null> {
  const db = getDb();
  let rows: { hash_cached: string; hash_total: string }[];
  try {
    const result = await sql<{ hash_cached: string; hash_total: string }>`
      SELECT hash_cached, hash_total FROM session_hash_stats WHERE session_id = ${sessionId}
    `.execute(db);
    rows = result.rows;
  } catch (error) {
    // Table not created yet: fall back to live computation.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01') {
      return null;
    }
    throw error;
  }
  const row = rows[0];
  if (!row) return null;
  return { hashCached: Number(row.hash_cached), hashTotal: Number(row.hash_total) };
}

export async function getSessionHashBlockMetadata(
  sessionId: string,
  visibleClientIds: string[] | null = null,
): Promise<SessionHashBlockMetadata | null> {
  const db = getDb();
  const result = await sql<{ hashCount: number; hashTokenCount: number }>`
    SELECT
      jsonb_array_length(hash_ids)::int AS "hashCount",
      hash_token_count AS "hashTokenCount"
    FROM requests
    WHERE session_id = ${sessionId}
      AND ${requestsVisFilter(visibleClientIds)}
      AND hash_ids IS NOT NULL
      AND jsonb_array_length(hash_ids) > 0
      AND hash_token_count > 0
      AND jsonb_array_length(hash_ids) IN (
        ceil(hash_token_count / 64.0)::int,
        ceil(hash_token_count / 128.0)::int,
        ceil(hash_token_count / 256.0)::int,
        ceil(hash_token_count / 512.0)::int,
        ceil(hash_token_count / 1024.0)::int
      )
    ORDER BY timestamp ASC, id ASC
    LIMIT 1
  `.execute(db);
  const row = result.rows[0];
  if (!row) return null;
  return {
    hashCount: Number(row.hashCount),
    hashTokenCount: Number(row.hashTokenCount),
  };
}

/**
 * Iterate one session's hash chains in stable chronological pages. Keeping
 * each Neon response bounded avoids its 64 MiB HTTP response ceiling while
 * preserving the exact all-request trie calculation.
 */
export async function* iterateSessionHashChainPages(
  sessionId: string,
  visibleClientIds: string[] | null = null,
): AsyncGenerator<SessionHashChainRow[]> {
  const db = getDb();
  const candidatePageSize = 1_000;
  const hashPageSize = 1_000_000;
  let cursor: SessionHashChainCursor | null = null;

  while (true) {
    const cursorFilter: RawBuilder<unknown> = cursor
      ? sql`AND (r.timestamp, r.id) > (${cursor.timestamp}::timestamptz, ${cursor.id})`
      : sql``;
    const result: QueryResult<SessionHashChainPageRow> = await sql<SessionHashChainPageRow>`
      WITH candidates AS MATERIALIZED (
        SELECT
          r.id,
          r.timestamp,
          jsonb_array_length(r.hash_ids)::int AS hash_count
        FROM requests r
        WHERE r.session_id = ${sessionId}
          AND ${requestsVisFilter(visibleClientIds, 'r')}
          AND r.hash_ids IS NOT NULL
          ${cursorFilter}
        ORDER BY r.timestamp ASC, r.id ASC
        LIMIT ${candidatePageSize}
      ), budgeted AS (
        SELECT
          id,
          timestamp,
          sum(hash_count) OVER (ORDER BY timestamp ASC, id ASC) AS cumulative_hashes,
          row_number() OVER (ORDER BY timestamp ASC, id ASC) AS row_number
        FROM candidates
      ), page_ids AS (
        SELECT id, timestamp
        FROM budgeted
        WHERE cumulative_hashes <= ${hashPageSize}
           OR row_number = 1
      )
      SELECT
        r.id,
        page_ids.timestamp::text AS "timestampCursor",
        r.hash_ids AS "hashIds",
        r.hash_token_count AS "hashTokenCount"
      FROM page_ids
      JOIN requests r ON r.id = page_ids.id
      ORDER BY page_ids.timestamp ASC, r.id ASC
    `.execute(db);

    if (result.rows.length === 0) return;

    yield result.rows.map((row) => ({
      id: row.id,
      hashIds: row.hashIds,
      hashTokenCount: row.hashTokenCount === null ? null : Number(row.hashTokenCount),
    }));

    const last: SessionHashChainPageRow = result.rows.at(-1)!;
    cursor = { timestamp: last.timestampCursor, id: last.id };
  }
}

export async function getSessionTokenStats(
  sessionId: string,
  visibleClientIds: string[] | null = null,
) {
  const db = getDb();
  const result = await sql<{
    id: string;
    cacheReadInputTokens: number | null;
    cacheWriteTokens: number | null;
    outputTokens: number | null;
  }>`
    SELECT
      id,
      cache_read_input_tokens AS "cacheReadInputTokens",
      cache_write_tokens AS "cacheWriteTokens",
      output_tokens AS "outputTokens"
    FROM requests
    WHERE session_id = ${sessionId}
      AND ${requestsVisFilter(visibleClientIds)}
    ORDER BY timestamp
  `.execute(db);
  return result.rows;
}

export async function getAllClients(limit = 50, offset = 0) {
  const db = getDb();
  const result = await sql<{
    id: string;
    apiKeyHash: string;
    firstSeen: Date;
    lastSeen: Date;
    sessionCount: number;
  }>`
    SELECT
      clients.id,
      clients.api_key_hash AS "apiKeyHash",
      clients.first_seen AS "firstSeen",
      clients.last_seen AS "lastSeen",
      count(sessions.id)::int AS "sessionCount"
    FROM clients
    LEFT JOIN sessions ON clients.id = sessions.client_id
    GROUP BY clients.id
    ORDER BY clients.last_seen DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `.execute(db);
  return result.rows;
}

export async function getClientStats() {
  const db = getDb();
  const result = await sql<{
    total: number;
    last_48h: number;
    sessions_7d: number;
  }>`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE clients.last_seen > ${NOW} - interval '48 hours')::int AS last_48h,
      (SELECT count(*)::int FROM sessions WHERE sessions.last_active_at > ${NOW} - interval '7 days') AS sessions_7d
    FROM clients
  `.execute(db);
  const row = result.rows[0];
  return {
    total: Number(row.total),
    last48h: Number(row.last_48h),
    sessions7d: Number(row.sessions_7d),
  };
}

/** Header counters for the session list; same filters and source as getRecentSessions. */
export async function getSessionStats(
  _visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  privacyMode: PrivacyMode | null = null,
  harnessFilter: Harness | null = null,
  minReqs = 0,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const { versionCondition, privacyCondition, harnessCondition } = sessionFilterConditions(
    traceVersion,
    privacyMode,
    harnessFilter,
  );
  const minReqsFilter = minReqs > 0 ? sql`ss.request_count > ${minReqs}` : sql`TRUE`;

  const result = await sql<{
    total: number;
    last_48h: number;
    last_7d: number;
  }>`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE sessions.last_active_at > ${NOW} - interval '48 hours')::int AS last_48h,
      count(*) FILTER (WHERE sessions.last_active_at > ${NOW} - interval '7 days')::int AS last_7d
    FROM sessions
    JOIN session_summary ss ON ss.session_id = sessions.id
    WHERE ${versionCondition}
      AND ${privacyCondition}
      AND ${harnessCondition}
      AND ${minReqsFilter}
  `.execute(db);
  const row = result.rows[0];
  return {
    total: Number(row.total),
    last48h: Number(row.last_48h),
    last7d: Number(row.last_7d),
  };
}

export async function getOverviewStats(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
) {
  const db = getDb();

  // Parallel: combined stats + median turns + median gap
  const [statsResult, medianResult, medianGapResult] = await Promise.all([
    sql<{
      client_count: number;
      active_clients_24h: number;
      session_count: number;
      request_count: number;
      total_input_tokens: number;
      total_output_tokens: number;
      total_cache_write: number;
      total_cache_read: number;
      total_cost: number;
      sessions_24h: number;
      cost_24h: number;
      sessions_gt20: number;
      sessions_gt20_24h: number;
      sessions_today_utc: number;
      sessions_yesterday_utc: number;
      cost_today_utc: number;
      cost_yesterday_utc: number;
      sessions_gt20_today_utc: number;
      sessions_gt20_yesterday_utc: number;
    }>`
      WITH bounds AS (
        SELECT
          date_trunc('day', ${NOW} AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS today_start,
          (date_trunc('day', ${NOW} AT TIME ZONE 'UTC') - interval '1 day') AT TIME ZONE 'UTC' AS yesterday_start
      )
      SELECT
        (SELECT count(*) FROM clients) AS client_count,
        (SELECT count(DISTINCT sessions.client_id) FROM sessions WHERE sessions.last_active_at > ${NOW} - interval '24 hours' AND ${sessionsVisFilter(visibleClientIds, traceVersion)}) AS active_clients_24h,
        (SELECT count(*) FROM sessions WHERE ${sessionsVisFilter(visibleClientIds, traceVersion)}) AS session_count,
        r.request_count,
        r.total_input_tokens,
        r.total_output_tokens,
        r.total_cache_write,
        r.total_cache_read,
        r.total_cost,
        (SELECT count(*) FROM sessions WHERE sessions.last_active_at > ${NOW} - interval '24 hours' AND ${sessionsVisFilter(visibleClientIds, traceVersion)}) AS sessions_24h,
        r.cost_24h,
        (SELECT count(*) FROM (SELECT session_id FROM requests WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)} AND ${modelFilter(model)} GROUP BY session_id HAVING count(*) > 20) sub) AS sessions_gt20,
        (SELECT count(*) FROM (SELECT session_id FROM requests WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)} AND ${modelFilter(model)} AND timestamp > ${NOW} - interval '24 hours' GROUP BY session_id HAVING count(*) > 20) sub) AS sessions_gt20_24h,
        (SELECT count(*) FROM sessions, bounds WHERE sessions.last_active_at >= bounds.today_start AND ${sessionsVisFilter(visibleClientIds, traceVersion)}) AS sessions_today_utc,
        (SELECT count(*) FROM sessions, bounds WHERE sessions.last_active_at >= bounds.yesterday_start AND sessions.last_active_at < bounds.today_start AND ${sessionsVisFilter(visibleClientIds, traceVersion)}) AS sessions_yesterday_utc,
        r.cost_today_utc,
        r.cost_yesterday_utc,
        (SELECT count(*) FROM (SELECT session_id FROM requests, bounds WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)} AND ${modelFilter(model)} AND requests.timestamp >= bounds.today_start GROUP BY session_id HAVING count(*) > 20) sub) AS sessions_gt20_today_utc,
        (SELECT count(*) FROM (SELECT session_id FROM requests, bounds WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)} AND ${modelFilter(model)} AND requests.timestamp >= bounds.yesterday_start AND requests.timestamp < bounds.today_start GROUP BY session_id HAVING count(*) > 20) sub) AS sessions_gt20_yesterday_utc
      FROM (
        SELECT
          count(*)::int AS request_count,
          coalesce(sum(input_tokens), 0) AS total_input_tokens,
          coalesce(sum(output_tokens), 0) AS total_output_tokens,
          coalesce(sum(cache_write_tokens), 0) AS total_cache_write,
          coalesce(sum(cache_read_input_tokens), 0) AS total_cache_read,
          coalesce(sum(cost_usd), 0) AS total_cost,
          coalesce(sum(cost_usd) FILTER (WHERE timestamp > ${NOW} - interval '24 hours'), 0) AS cost_24h,
          coalesce(sum(cost_usd) FILTER (WHERE timestamp >= (SELECT today_start FROM bounds)), 0) AS cost_today_utc,
          coalesce(sum(cost_usd) FILTER (WHERE timestamp >= (SELECT yesterday_start FROM bounds) AND timestamp < (SELECT today_start FROM bounds)), 0) AS cost_yesterday_utc
        FROM requests
        WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)} AND ${modelFilter(model)}
      ) r
    `.execute(db),
    sql<{
      p25: number;
      p50: number;
      p75: number;
      p90: number;
      p99: number;
    }>`
      SELECT
        percentile_cont(0.25) WITHIN GROUP (ORDER BY cnt) AS p25,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY cnt) AS p50,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY cnt) AS p75,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY cnt) AS p90,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY cnt) AS p99
      FROM (SELECT count(*) AS cnt FROM requests WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)} AND ${modelFilter(model)} GROUP BY session_id) sub
    `.execute(db),
    sql<{
      p25: number;
      p50: number;
      p75: number;
      p90: number;
      p99: number;
    }>`
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
        WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)} AND ${modelFilter(model)}
      ) sub
      WHERE gap_seconds IS NOT NULL
    `.execute(db),
  ]);

  const stats = statsResult.rows[0];
  const turnsRow = medianResult.rows[0] ?? {};
  const gapRow = medianGapResult.rows[0] ?? {};

  return {
    clients: Number(stats.client_count),
    activeClients24h: Number(stats.active_clients_24h),
    sessions: Number(stats.session_count),
    requests: Number(stats.request_count),
    totalInputTokens: Number(stats.total_input_tokens),
    totalOutputTokens: Number(stats.total_output_tokens),
    totalCacheWrite: Number(stats.total_cache_write),
    totalCacheRead: Number(stats.total_cache_read),
    totalCost: Number(stats.total_cost),
    sessions24h: Number(stats.sessions_24h ?? 0),
    cost24h: Number(stats.cost_24h ?? 0),
    sessionsGt20: Number(stats.sessions_gt20 ?? 0),
    sessionsGt20_24h: Number(stats.sessions_gt20_24h ?? 0),
    sessionsTodayUtc: Number(stats.sessions_today_utc ?? 0),
    sessionsYesterdayUtc: Number(stats.sessions_yesterday_utc ?? 0),
    costTodayUtc: Number(stats.cost_today_utc ?? 0),
    costYesterdayUtc: Number(stats.cost_yesterday_utc ?? 0),
    sessionsGt20TodayUtc: Number(stats.sessions_gt20_today_utc ?? 0),
    sessionsGt20YesterdayUtc: Number(stats.sessions_gt20_yesterday_utc ?? 0),
    turnsPercentiles: {
      p25: Number(turnsRow.p25 ?? 0),
      p50: Number(turnsRow.p50 ?? 0),
      p75: Number(turnsRow.p75 ?? 0),
      p90: Number(turnsRow.p90 ?? 0),
      p99: Number(turnsRow.p99 ?? 0),
    },
    gapPercentiles: {
      p25: Number(gapRow.p25 ?? 0),
      p50: Number(gapRow.p50 ?? 0),
      p75: Number(gapRow.p75 ?? 0),
      p90: Number(gapRow.p90 ?? 0),
      p99: Number(gapRow.p99 ?? 0),
    },
  };
}

export async function getTokensByModel(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
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
  }>`
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
    WHERE requests.model IS NOT NULL
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      AND ${modelFilter(model)}
    GROUP BY requests.model
  `.execute(db);
  return result.rows.map((r) => ({
    model: String(r.model),
    input_tokens: Number(r.input_tokens),
    output_tokens: Number(r.output_tokens),
    cache_read_input_tokens: Number(r.cache_read_input_tokens),
    cache_write_tokens: Number(r.cache_write_tokens),
    fast_mode_count: Number(r.fast_mode_count),
    fast_input_tokens: Number(r.fast_input_tokens),
    fast_output_tokens: Number(r.fast_output_tokens),
    fast_cache_read_input_tokens: Number(r.fast_cache_read_input_tokens),
    fast_cache_write_tokens: Number(r.fast_cache_write_tokens),
    long_input_tokens: Number(r.long_input_tokens),
    long_output_tokens: Number(r.long_output_tokens),
    long_cache_read_input_tokens: Number(r.long_cache_read_input_tokens),
    long_cache_write_tokens: Number(r.long_cache_write_tokens),
  }));
}

/**
 * Just the paired CPU (gap between turns) and GPU (e2e duration) signal,
 * restricted to a specific `(model, fastMode)`. Used by the /graphs pie
 * cards that compare fast-mode vs regular Opus inference. The `LAG`
 * partition runs AFTER the model+fastMode filter, so "gap" is the time
 * between two consecutive matching requests in the session — any
 * interleaved haiku / subagent traffic counts toward CPU.
 *
 * Filters out the first request per session (no prior timestamp → NULL gap)
 * and any rows with non-positive duration / gap, so the result is always
 * paired and usable directly by the pie.
 */
export async function getCpuGpuPairedDistribution(
  visibleClientIds: string[] | null,
  model: string,
  fastMode: boolean,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{ gap_seconds: number; duration_ms: number }>`
    SELECT gap_seconds, duration_ms FROM (
      SELECT
        extract(epoch FROM requests.timestamp - lag(requests.timestamp) OVER (
          PARTITION BY requests.session_id ORDER BY requests.timestamp
        )) AS gap_seconds,
        requests.duration_ms
      FROM requests
      WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND requests.model = ${model}
        AND requests.is_fast_mode = ${fastMode}
    ) sub
    WHERE gap_seconds IS NOT NULL
      AND gap_seconds > 0
      AND duration_ms IS NOT NULL
      AND duration_ms > 0
  `.execute(db);
  return result.rows.map((r) => ({
    gapSeconds: Number(r.gap_seconds),
    durationMs: Number(r.duration_ms),
  }));
}

export async function getGlobalRequestStats(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    input: number;
    cache_read: number;
    cache_write: number;
    output: number;
    gap_seconds: number | null;
    duration_ms: number | null;
  }>`
    SELECT
      coalesce(requests.input_tokens, 0) AS input,
      coalesce(requests.cache_read_input_tokens, 0) AS cache_read,
      coalesce(requests.cache_write_tokens, 0) AS cache_write,
      coalesce(requests.output_tokens, 0) AS output,
      extract(epoch FROM requests.timestamp - lag(requests.timestamp) OVER (
        PARTITION BY requests.session_id ORDER BY requests.timestamp
      )) AS gap_seconds,
      requests.duration_ms AS duration_ms
    FROM requests
    WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    AND ${modelFilter(model)}
    ORDER BY requests.session_id, requests.timestamp
  `.execute(db);
  return result.rows.map((r) => ({
    input: Number(r.input),
    cache_read: Number(r.cache_read),
    cache_write: Number(r.cache_write),
    output: Number(r.output),
    gap_seconds: r.gap_seconds === null ? null : Number(r.gap_seconds),
    duration_ms: r.duration_ms === null ? null : Number(r.duration_ms),
  }));
}

export async function getHourlyTokenCounts(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    hour: string;
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
    request_count: number;
    cost: number;
  }>`
    SELECT
      date_trunc('hour', requests.timestamp) AS hour,
      coalesce(sum(requests.input_tokens), 0) AS input,
      coalesce(sum(requests.output_tokens), 0) AS output,
      coalesce(sum(requests.cache_read_input_tokens), 0) AS cache_read,
      coalesce(sum(requests.cache_write_tokens), 0) AS cache_write,
      count(*) AS request_count,
      coalesce(sum(requests.cost_usd), 0) AS cost
    FROM requests
    WHERE requests.timestamp > ${NOW} - interval '48 hours'
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      AND ${modelFilter(model)}
    GROUP BY date_trunc('hour', requests.timestamp)
    ORDER BY hour
  `.execute(db);
  return result.rows.map((r) => ({
    hour: String(r.hour),
    input: Number(r.input),
    output: Number(r.output),
    cache_read: Number(r.cache_read),
    cache_write: Number(r.cache_write),
    request_count: Number(r.request_count),
    cost: Number(r.cost),
  }));
}

export async function getHourlyUsageCounts(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
) {
  const db = getDb();
  const result = await sql<{
    hour: string;
    request_count: number;
    total_tokens: number;
    total_cost: number;
    new_sessions: number;
  }>`
    SELECT
      r.hour,
      r.request_count,
      r.total_tokens,
      r.total_cost,
      coalesce(s.new_sessions, 0) AS new_sessions
    FROM (
      SELECT
        date_trunc('hour', requests.timestamp) AS hour,
        count(*) AS request_count,
        coalesce(sum(requests.input_tokens), 0) +
          coalesce(sum(requests.output_tokens), 0) +
          coalesce(sum(requests.cache_read_input_tokens), 0) +
          coalesce(sum(requests.cache_write_tokens), 0) AS total_tokens,
        coalesce(sum(requests.cost_usd), 0) AS total_cost
      FROM requests
      WHERE requests.timestamp > ${NOW} - interval '24 hours'
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
      GROUP BY date_trunc('hour', requests.timestamp)
    ) r
    LEFT JOIN (
      SELECT
        date_trunc('hour', sessions.started_at) AS hour,
        count(*) AS new_sessions
      FROM sessions
      WHERE sessions.started_at > ${NOW} - interval '24 hours'
        AND ${sessionsVisFilter(visibleClientIds, traceVersion)}
        AND (
          SELECT count(*)
          FROM requests
          WHERE requests.session_id = sessions.id
            AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        ) > 20
      GROUP BY date_trunc('hour', sessions.started_at)
    ) s ON r.hour = s.hour
    ORDER BY r.hour
  `.execute(db);
  return result.rows.map((r) => ({
    hour: String(r.hour),
    requestCount: Number(r.request_count),
    totalTokens: Number(r.total_tokens),
    totalCost: Number(r.total_cost),
    newSessions: Number(r.new_sessions),
  }));
}

export async function getHourlyUsageCountsForUtcDay(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dayOffset = 0,
) {
  const db = getDb();
  const offset = Math.max(0, Math.floor(dayOffset));
  const result = await sql<{
    hour: string;
    request_count: number;
    total_tokens: number;
    total_cost: number;
    new_sessions: number;
  }>`
    WITH bounds AS (
      SELECT
        (date_trunc('day', ${NOW} AT TIME ZONE 'UTC') - (${offset} || ' days')::interval) AT TIME ZONE 'UTC' AS day_start,
        (date_trunc('day', ${NOW} AT TIME ZONE 'UTC') - ((${offset} - 1) || ' days')::interval) AT TIME ZONE 'UTC' AS day_end
    )
    SELECT
      r.hour,
      r.request_count,
      r.total_tokens,
      r.total_cost,
      coalesce(s.new_sessions, 0) AS new_sessions
    FROM (
      SELECT
        date_trunc('hour', requests.timestamp AT TIME ZONE 'UTC') AS hour,
        count(*) AS request_count,
        coalesce(sum(requests.input_tokens), 0) +
          coalesce(sum(requests.output_tokens), 0) +
          coalesce(sum(requests.cache_read_input_tokens), 0) +
          coalesce(sum(requests.cache_write_tokens), 0) AS total_tokens,
        coalesce(sum(requests.cost_usd), 0) AS total_cost
      FROM requests, bounds
      WHERE requests.timestamp >= bounds.day_start
        AND requests.timestamp < bounds.day_end
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
      GROUP BY date_trunc('hour', requests.timestamp AT TIME ZONE 'UTC')
    ) r
    LEFT JOIN (
      SELECT
        date_trunc('hour', sessions.started_at AT TIME ZONE 'UTC') AS hour,
        count(*) AS new_sessions
      FROM sessions, bounds
      WHERE sessions.started_at >= bounds.day_start
        AND sessions.started_at < bounds.day_end
        AND ${sessionsVisFilter(visibleClientIds, traceVersion)}
        AND (
          SELECT count(*)
          FROM requests
          WHERE requests.session_id = sessions.id
            AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        ) > 20
      GROUP BY date_trunc('hour', sessions.started_at AT TIME ZONE 'UTC')
    ) s ON r.hour = s.hour
    ORDER BY r.hour
  `.execute(db);
  return result.rows.map((r) => ({
    hour: String(r.hour),
    requestCount: Number(r.request_count),
    totalTokens: Number(r.total_tokens),
    totalCost: Number(r.total_cost),
    newSessions: Number(r.new_sessions),
  }));
}

export async function getDailyUsageCounts(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
) {
  const db = getDb();
  const result = await sql<{
    day: string;
    request_count: number;
    total_tokens: number;
    total_cost: number;
    new_sessions: number;
  }>`
    SELECT
      r.day,
      r.request_count,
      r.total_tokens,
      r.total_cost,
      coalesce(s.new_sessions, 0) AS new_sessions
    FROM (
      SELECT
        date_trunc('day', requests.timestamp AT TIME ZONE 'UTC') AS day,
        count(*) AS request_count,
        coalesce(sum(requests.input_tokens), 0) +
          coalesce(sum(requests.output_tokens), 0) +
          coalesce(sum(requests.cache_read_input_tokens), 0) +
          coalesce(sum(requests.cache_write_tokens), 0) AS total_tokens,
        coalesce(sum(requests.cost_usd), 0) AS total_cost
      FROM requests
      WHERE requests.timestamp > ${NOW} - interval '14 days'
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
      GROUP BY date_trunc('day', requests.timestamp AT TIME ZONE 'UTC')
    ) r
    LEFT JOIN (
      SELECT
        date_trunc('day', sessions.started_at AT TIME ZONE 'UTC') AS day,
        count(*) AS new_sessions
      FROM sessions
      WHERE sessions.started_at > ${NOW} - interval '14 days'
        AND ${sessionsVisFilter(visibleClientIds, traceVersion)}
        AND (
          SELECT count(*)
          FROM requests
          WHERE requests.session_id = sessions.id
            AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        ) > 20
      GROUP BY date_trunc('day', sessions.started_at AT TIME ZONE 'UTC')
    ) s ON r.day = s.day
    ORDER BY r.day
  `.execute(db);
  return result.rows.map((r) => ({
    day: String(r.day),
    requestCount: Number(r.request_count),
    totalTokens: Number(r.total_tokens),
    totalCost: Number(r.total_cost),
    newSessions: Number(r.new_sessions),
  }));
}

/**
 * Weekly count of sessions broken down by harness, restricted to sessions with
 * more than `minReqs` requests, all at `traceVersion` (the /sessions list's
 * ALL-rows version semantics). Used by the /graphs stacked bar chart. Buckets
 * by ISO week of `sessions.started_at` (Postgres `date_trunc('week', ...)`
 * starts weeks on Monday). Like `getRecentSessions`, reads the anon-only
 * `session_summary` rather than grouping `requests`: the frozen graphs cache
 * predates this dataset, so it is computed on every request.
 */
export async function getWeeklySessionsByHarness(
  _visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  minReqs = 20,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const { versionCondition } = sessionFilterConditions(traceVersion, null, null);
  const result = await sql<{
    week: string;
    harness: Harness;
    session_count: number;
  }>`
    SELECT
      -- to_char(...) so the wire format is an unambiguous YYYY-MM-DD string.
      -- Casting to ::date instead leaves serialization to the driver: pg
      -- returns a JS Date, then String(Date) → a verbose locale string the
      -- client can't reparse as a date.
      to_char(date_trunc('week', sessions.started_at), 'YYYY-MM-DD') AS week,
      ${SESSION_HARNESS_SQL} AS harness,
      count(*)::int AS session_count
    FROM sessions
    JOIN session_summary ss ON ss.session_id = sessions.id
    WHERE ${versionCondition}
      AND ss.request_count > ${minReqs}
    GROUP BY week, harness
    ORDER BY week
  `.execute(db);
  return result.rows.map((r) => ({
    week: String(r.week),
    harness: r.harness,
    sessionCount: Number(r.session_count),
  }));
}

export async function getGlobalSessionAggregates(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    cache_read: number;
    cache_write: number;
    output: number;
    turn_count: number;
  }>`
    SELECT
      coalesce(sum(requests.cache_read_input_tokens), 0) AS cache_read,
      coalesce(sum(requests.cache_write_tokens), 0) AS cache_write,
      coalesce(sum(requests.output_tokens), 0) AS output,
      count(*) AS turn_count
    FROM requests
    WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    AND ${modelFilter(model)}
    GROUP BY requests.session_id
  `.execute(db);
  return result.rows.map((r) => ({
    cache_read: Number(r.cache_read),
    cache_write: Number(r.cache_write),
    output: Number(r.output),
    turn_count: Number(r.turn_count),
  }));
}

// ── Cost analytics ──

export async function getCostSummary(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const [reqStats, sessionAvg] = await Promise.all([
    sql<{
      total_cost: number;
      cost_today: number;
      cost_week: number;
      cost_month: number;
      fast_mode_cost: number;
      regular_cost: number;
      avg_cost_per_request: number;
    }>`
      SELECT
        coalesce(sum(requests.cost_usd), 0) AS total_cost,
        coalesce(sum(requests.cost_usd) FILTER (WHERE requests.timestamp >= ${TODAY_UTC_START}), 0) AS cost_today,
        coalesce(sum(requests.cost_usd) FILTER (WHERE requests.timestamp >= ${NOW} - interval '7 days'), 0) AS cost_week,
        coalesce(sum(requests.cost_usd) FILTER (WHERE requests.timestamp >= ${NOW} - interval '30 days'), 0) AS cost_month,
        coalesce(sum(requests.cost_usd) FILTER (WHERE requests.is_fast_mode), 0) AS fast_mode_cost,
        coalesce(sum(requests.cost_usd) FILTER (WHERE NOT requests.is_fast_mode), 0) AS regular_cost,
        coalesce(avg(requests.cost_usd), 0) AS avg_cost_per_request
      FROM requests
      WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    `.execute(db),
    sql<{ avg_cost_per_session: number }>`
      SELECT coalesce(avg(sc), 0) AS avg_cost_per_session
      FROM (SELECT sum(requests.cost_usd) AS sc FROM requests WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)} GROUP BY requests.session_id) sub
    `.execute(db),
  ]);
  const r = reqStats.rows[0];
  const s = sessionAvg.rows[0];
  return {
    totalCost: Number(r.total_cost),
    costToday: Number(r.cost_today),
    costWeek: Number(r.cost_week),
    costMonth: Number(r.cost_month),
    fastModeCost: Number(r.fast_mode_cost),
    regularCost: Number(r.regular_cost),
    avgCostPerRequest: Number(r.avg_cost_per_request),
    avgCostPerSession: Number(s.avg_cost_per_session),
  };
}

export async function getDailyCosts(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    day: string;
    cost: number;
    request_count: number;
    session_count: number;
  }>`
    SELECT
      date_trunc('day', requests.timestamp) AS day,
      coalesce(sum(requests.cost_usd), 0) AS cost,
      count(*) AS request_count,
      count(DISTINCT requests.session_id) AS session_count
    FROM requests
    WHERE requests.timestamp >= ${NOW} - interval '30 days'
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    GROUP BY date_trunc('day', requests.timestamp)
    ORDER BY day
  `.execute(db);
  return result.rows.map((r) => ({
    day: String(r.day),
    cost: Number(r.cost),
    request_count: Number(r.request_count),
    session_count: Number(r.session_count),
  }));
}

export async function getCostByModel(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    model: string;
    total_cost: number;
    request_count: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_write_tokens: number;
    fast_mode_cost: number;
    fast_mode_count: number;
  }>`
    SELECT
      requests.model AS model,
      coalesce(sum(requests.cost_usd), 0) AS total_cost,
      count(*) AS request_count,
      coalesce(sum(requests.input_tokens), 0) AS input_tokens,
      coalesce(sum(requests.output_tokens), 0) AS output_tokens,
      coalesce(sum(requests.cache_read_input_tokens), 0) AS cache_read_input_tokens,
      coalesce(sum(requests.cache_write_tokens), 0) AS cache_write_tokens,
      coalesce(sum(requests.cost_usd) FILTER (WHERE requests.is_fast_mode), 0) AS fast_mode_cost,
      count(*) FILTER (WHERE requests.is_fast_mode) AS fast_mode_count
    FROM requests
    WHERE requests.model IS NOT NULL
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    GROUP BY requests.model
    ORDER BY total_cost DESC
  `.execute(db);
  return result.rows.map((r) => ({
    model: String(r.model),
    total_cost: Number(r.total_cost),
    request_count: Number(r.request_count),
    input_tokens: Number(r.input_tokens),
    output_tokens: Number(r.output_tokens),
    cache_read_input_tokens: Number(r.cache_read_input_tokens),
    cache_write_tokens: Number(r.cache_write_tokens),
    fast_mode_cost: Number(r.fast_mode_cost),
    fast_mode_count: Number(r.fast_mode_count),
  }));
}

export const PRICING_COVERAGE_WINDOW_DAYS = 7;

export interface PricingCoverageModel {
  model: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_write_tokens: number;
}

export interface PricingCoverage {
  window_days: number;
  usage_request_count: number;
  priced_request_count: number;
  unpriced_request_count: number;
  request_coverage: number | null;
  input_side_tokens: number;
  priced_input_side_tokens: number;
  input_side_token_coverage: number | null;
  output_tokens: number;
  priced_output_tokens: number;
  output_token_coverage: number | null;
  by_model: PricingCoverageModel[];
}

/**
 * Pricing completeness over a bounded recent window. Requests without any
 * token usage are excluded: a failed/no-usage response with no cost is not
 * evidence that its model lacks pricing. This runs only in the cached Costs
 * refresh path and returns one compact row per observed model.
 */
export async function getPricingCoverage(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
): Promise<PricingCoverage> {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    model: string;
    usage_request_count: number;
    unpriced_request_count: number;
    input_tokens: number;
    unpriced_input_tokens: number;
    output_tokens: number;
    unpriced_output_tokens: number;
    cache_read_input_tokens: number;
    unpriced_cache_read_input_tokens: number;
    cache_write_tokens: number;
    unpriced_cache_write_tokens: number;
  }>`
    WITH scoped AS MATERIALIZED (
      SELECT
        coalesce(requests.model, '(unknown)') AS model,
        requests.cost_usd IS NOT NULL AS is_priced,
        coalesce(requests.input_tokens, 0)::bigint AS input_tokens,
        coalesce(requests.output_tokens, 0)::bigint AS output_tokens,
        coalesce(requests.cache_read_input_tokens, 0)::bigint AS cache_read_input_tokens,
        coalesce(requests.cache_write_tokens, 0)::bigint AS cache_write_tokens
      FROM requests
      WHERE requests.timestamp >= ${NOW} - make_interval(days => ${PRICING_COVERAGE_WINDOW_DAYS})
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    )
    SELECT
      model,
      count(*) FILTER (
        WHERE input_tokens + output_tokens + cache_read_input_tokens + cache_write_tokens > 0
      )::int AS usage_request_count,
      count(*) FILTER (
        WHERE NOT is_priced
          AND input_tokens + output_tokens + cache_read_input_tokens + cache_write_tokens > 0
      )::int AS unpriced_request_count,
      coalesce(sum(input_tokens), 0)::bigint AS input_tokens,
      coalesce(sum(input_tokens) FILTER (WHERE NOT is_priced), 0)::bigint
        AS unpriced_input_tokens,
      coalesce(sum(output_tokens), 0)::bigint AS output_tokens,
      coalesce(sum(output_tokens) FILTER (WHERE NOT is_priced), 0)::bigint
        AS unpriced_output_tokens,
      coalesce(sum(cache_read_input_tokens), 0)::bigint AS cache_read_input_tokens,
      coalesce(sum(cache_read_input_tokens) FILTER (WHERE NOT is_priced), 0)::bigint
        AS unpriced_cache_read_input_tokens,
      coalesce(sum(cache_write_tokens), 0)::bigint AS cache_write_tokens,
      coalesce(sum(cache_write_tokens) FILTER (WHERE NOT is_priced), 0)::bigint
        AS unpriced_cache_write_tokens
    FROM scoped
    GROUP BY model
  `.execute(db);

  const totals = result.rows.reduce(
    (acc, row) => {
      acc.usageRequests += Number(row.usage_request_count);
      acc.unpricedRequests += Number(row.unpriced_request_count);
      acc.inputTokens += Number(row.input_tokens);
      acc.unpricedInputTokens += Number(row.unpriced_input_tokens);
      acc.outputTokens += Number(row.output_tokens);
      acc.unpricedOutputTokens += Number(row.unpriced_output_tokens);
      acc.cacheReadTokens += Number(row.cache_read_input_tokens);
      acc.unpricedCacheReadTokens += Number(row.unpriced_cache_read_input_tokens);
      acc.cacheWriteTokens += Number(row.cache_write_tokens);
      acc.unpricedCacheWriteTokens += Number(row.unpriced_cache_write_tokens);
      return acc;
    },
    {
      usageRequests: 0,
      unpricedRequests: 0,
      inputTokens: 0,
      unpricedInputTokens: 0,
      outputTokens: 0,
      unpricedOutputTokens: 0,
      cacheReadTokens: 0,
      unpricedCacheReadTokens: 0,
      cacheWriteTokens: 0,
      unpricedCacheWriteTokens: 0,
    },
  );
  const inputSideTokens = totals.inputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
  const unpricedInputSideTokens =
    totals.unpricedInputTokens + totals.unpricedCacheReadTokens + totals.unpricedCacheWriteTokens;
  const pricedRequests = totals.usageRequests - totals.unpricedRequests;

  return {
    window_days: PRICING_COVERAGE_WINDOW_DAYS,
    usage_request_count: totals.usageRequests,
    priced_request_count: pricedRequests,
    unpriced_request_count: totals.unpricedRequests,
    request_coverage: totals.usageRequests > 0 ? pricedRequests / totals.usageRequests : null,
    input_side_tokens: inputSideTokens,
    priced_input_side_tokens: inputSideTokens - unpricedInputSideTokens,
    input_side_token_coverage:
      inputSideTokens > 0 ? (inputSideTokens - unpricedInputSideTokens) / inputSideTokens : null,
    output_tokens: totals.outputTokens,
    priced_output_tokens: totals.outputTokens - totals.unpricedOutputTokens,
    output_token_coverage:
      totals.outputTokens > 0
        ? (totals.outputTokens - totals.unpricedOutputTokens) / totals.outputTokens
        : null,
    by_model: result.rows
      .filter((row) => Number(row.unpriced_request_count) > 0)
      .map((row) => ({
        model: String(row.model),
        request_count: Number(row.unpriced_request_count),
        input_tokens: Number(row.unpriced_input_tokens),
        output_tokens: Number(row.unpriced_output_tokens),
        cache_read_input_tokens: Number(row.unpriced_cache_read_input_tokens),
        cache_write_tokens: Number(row.unpriced_cache_write_tokens),
      }))
      .toSorted(
        (left, right) =>
          right.input_tokens +
          right.output_tokens +
          right.cache_read_input_tokens +
          right.cache_write_tokens -
          (left.input_tokens +
            left.output_tokens +
            left.cache_read_input_tokens +
            left.cache_write_tokens),
      ),
  };
}

export async function getCostByClient(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    client_id: string;
    api_key_hash: string;
    total_cost: number;
    request_count: number;
    session_count: number;
    last_active: string;
  }>`
    SELECT
      requests.client_id AS client_id,
      clients.api_key_hash AS api_key_hash,
      coalesce(sum(requests.cost_usd), 0) AS total_cost,
      count(*) AS request_count,
      count(DISTINCT requests.session_id) AS session_count,
      max(requests.timestamp) AS last_active
    FROM requests
    INNER JOIN clients ON clients.id = requests.client_id
    WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    GROUP BY requests.client_id, clients.api_key_hash
    ORDER BY total_cost DESC
    LIMIT 50
  `.execute(db);
  return result.rows.map((r) => ({
    client_id: String(r.client_id),
    api_key_hash: String(r.api_key_hash),
    total_cost: Number(r.total_cost),
    request_count: Number(r.request_count),
    session_count: Number(r.session_count),
    last_active: String(r.last_active),
  }));
}

// ── Model analytics ──

export async function getModelTimeSeries(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
) {
  const db = getDb();
  const result = await sql<{
    day: string;
    model: string;
    request_count: number;
    input_tokens: number;
    output_tokens: number;
  }>`
    SELECT
      date_trunc('day', requests.timestamp) AS day,
      requests.model AS model,
      count(*) AS request_count,
      coalesce(sum(requests.input_tokens), 0) AS input_tokens,
      coalesce(sum(requests.output_tokens), 0) AS output_tokens
    FROM requests
    WHERE requests.timestamp >= ${NOW} - interval '30 days'
      AND requests.model IS NOT NULL
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    GROUP BY day, requests.model
    ORDER BY day, requests.model
  `.execute(db);
  return result.rows.map((r) => ({
    day: String(r.day),
    model: String(r.model),
    request_count: Number(r.request_count),
    input_tokens: Number(r.input_tokens),
    output_tokens: Number(r.output_tokens),
  }));
}

// ── Error analytics ──

export const ERROR_REACH_WINDOW_DAYS = 30;

export interface ErrorReachCohort {
  client: string;
  request_count: number;
  error_count: number;
  request_error_rate: number | null;
  session_count: number;
  affected_session_count: number;
  affected_session_rate: number | null;
  repeat_error_session_count: number;
  repeat_error_count: number;
  repeat_error_share: number | null;
  avg_errors_per_affected_session: number | null;
  p50_errors_per_affected_session: number | null;
  p90_errors_per_affected_session: number | null;
  max_errors_in_session: number;
  top_session_error_share: number | null;
  top_ten_error_share: number | null;
}

export interface ErrorReach {
  window_days: number;
  overall: ErrorReachCohort | null;
  by_client: ErrorReachCohort[];
}

/**
 * Distinguish broad error reach from concentrated retry storms. One bounded
 * row per recent session is reduced to overall/client aggregates; request
 * rows never cross the cache boundary. A repeat-error session has 2+ failed
 * requests in the window.
 */
export async function getErrorReach(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
): Promise<ErrorReach> {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    client: string;
    request_count: number;
    error_count: number;
    session_count: number;
    affected_session_count: number;
    repeat_error_session_count: number;
    repeat_error_count: number;
    avg_errors_per_affected_session: number | null;
    p50_errors_per_affected_session: number | null;
    p90_errors_per_affected_session: number | null;
    max_errors_in_session: number;
    top_session_error_count: number;
    top_ten_error_count: number;
  }>`
    WITH recent_requests AS MATERIALIZED (
      SELECT
        requests.session_id,
        requests.response_status_code >= 400 OR requests.error IS NOT NULL AS is_error
      FROM requests
      WHERE requests.timestamp >= ${NOW} - make_interval(days => ${ERROR_REACH_WINDOW_DAYS})
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    ),
    per_session AS MATERIALIZED (
      SELECT
        coalesce(nullif(lower(sessions.metadata ->> 'client'), ''), 'anthropic') AS client,
        recent_requests.session_id,
        count(*)::int AS request_count,
        count(*) FILTER (WHERE recent_requests.is_error)::int AS error_count
      FROM recent_requests
      JOIN sessions ON sessions.id = recent_requests.session_id
      GROUP BY
        coalesce(nullif(lower(sessions.metadata ->> 'client'), ''), 'anthropic'),
        recent_requests.session_id
    ),
    scoped_sessions AS MATERIALIZED (
      SELECT client, session_id, request_count, error_count
      FROM per_session
      UNION ALL
      SELECT '(all)' AS client, session_id, request_count, error_count
      FROM per_session
    ),
    ranked_sessions AS MATERIALIZED (
      SELECT
        scoped_sessions.*,
        row_number() OVER (
          PARTITION BY client
          ORDER BY error_count DESC, session_id
        ) AS error_rank
      FROM scoped_sessions
    )
    SELECT
      client,
      coalesce(sum(request_count), 0)::bigint AS request_count,
      coalesce(sum(error_count), 0)::bigint AS error_count,
      count(*)::int AS session_count,
      count(*) FILTER (WHERE error_count > 0)::int AS affected_session_count,
      count(*) FILTER (WHERE error_count >= 2)::int AS repeat_error_session_count,
      coalesce(sum(error_count) FILTER (WHERE error_count >= 2), 0)::bigint
        AS repeat_error_count,
      avg(error_count::float8) FILTER (WHERE error_count > 0)::float8
        AS avg_errors_per_affected_session,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY error_count)
        FILTER (WHERE error_count > 0)::float8 AS p50_errors_per_affected_session,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY error_count)
        FILTER (WHERE error_count > 0)::float8 AS p90_errors_per_affected_session,
      coalesce(max(error_count), 0)::int AS max_errors_in_session,
      coalesce(sum(error_count) FILTER (WHERE error_rank = 1), 0)::bigint
        AS top_session_error_count,
      coalesce(sum(error_count) FILTER (WHERE error_rank <= 10), 0)::bigint
        AS top_ten_error_count
    FROM ranked_sessions
    GROUP BY client
    ORDER BY CASE WHEN client = '(all)' THEN 0 ELSE 1 END, error_count DESC, client
  `.execute(db);

  const cohorts = result.rows.map((row): ErrorReachCohort => {
    const requests = Number(row.request_count);
    const errors = Number(row.error_count);
    const sessions = Number(row.session_count);
    const affectedSessions = Number(row.affected_session_count);
    const repeatErrors = Number(row.repeat_error_count);
    return {
      client: String(row.client),
      request_count: requests,
      error_count: errors,
      request_error_rate: requests > 0 ? errors / requests : null,
      session_count: sessions,
      affected_session_count: affectedSessions,
      affected_session_rate: sessions > 0 ? affectedSessions / sessions : null,
      repeat_error_session_count: Number(row.repeat_error_session_count),
      repeat_error_count: repeatErrors,
      repeat_error_share: errors > 0 ? repeatErrors / errors : null,
      avg_errors_per_affected_session:
        row.avg_errors_per_affected_session === null
          ? null
          : Number(row.avg_errors_per_affected_session),
      p50_errors_per_affected_session:
        row.p50_errors_per_affected_session === null
          ? null
          : Number(row.p50_errors_per_affected_session),
      p90_errors_per_affected_session:
        row.p90_errors_per_affected_session === null
          ? null
          : Number(row.p90_errors_per_affected_session),
      max_errors_in_session: Number(row.max_errors_in_session),
      top_session_error_share: errors > 0 ? Number(row.top_session_error_count) / errors : null,
      top_ten_error_share: errors > 0 ? Number(row.top_ten_error_count) / errors : null,
    };
  });

  return {
    window_days: ERROR_REACH_WINDOW_DAYS,
    overall: cohorts.find((cohort) => cohort.client === '(all)') ?? null,
    by_client: cohorts.filter((cohort) => cohort.client !== '(all)'),
  };
}

export async function getErrorStats(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const [summaryResult, timelineResult, statusCodesResult, byModelResult, recentResult] =
    await Promise.all([
      sql<{
        total_errors: number;
        total_requests: number;
        errors_today: number;
      }>`
      SELECT
        count(*) FILTER (WHERE requests.response_status_code >= 400 OR requests.error IS NOT NULL) AS total_errors,
        count(*) AS total_requests,
        count(*) FILTER (WHERE (requests.response_status_code >= 400 OR requests.error IS NOT NULL) AND requests.timestamp >= ${TODAY_UTC_START}) AS errors_today
      FROM requests
      WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    `.execute(db),
      sql<{
        hour: string;
        error_count: number;
        total_count: number;
      }>`
      SELECT
        date_trunc('hour', requests.timestamp) AS hour,
        count(*) FILTER (WHERE requests.response_status_code >= 400 OR requests.error IS NOT NULL) AS error_count,
        count(*) AS total_count
      FROM requests
      WHERE requests.timestamp > ${NOW} - interval '48 hours'
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      GROUP BY date_trunc('hour', requests.timestamp)
      ORDER BY hour
    `.execute(db),
      sql<{
        status_code: number;
        count: number;
      }>`
      SELECT
        requests.response_status_code AS status_code,
        count(*) AS count
      FROM requests
      WHERE requests.response_status_code >= 400
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      GROUP BY requests.response_status_code
      ORDER BY count DESC
    `.execute(db),
      sql<{
        model: string;
        error_count: number;
        total_count: number;
      }>`
      SELECT
        requests.model AS model,
        count(*) FILTER (WHERE requests.response_status_code >= 400 OR requests.error IS NOT NULL) AS error_count,
        count(*) AS total_count
      FROM requests
      WHERE requests.model IS NOT NULL
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      GROUP BY requests.model
      ORDER BY error_count DESC
    `.execute(db),
      sql<{
        id: string;
        model: string;
        status_code: number | null;
        error: string | null;
        timestamp: string;
        session_id: string;
        duration_ms: number | null;
      }>`
      SELECT
        requests.id,
        requests.model,
        requests.response_status_code AS status_code,
        requests.error,
        requests.timestamp,
        requests.session_id AS session_id,
        requests.duration_ms AS duration_ms
      FROM requests
      WHERE (requests.response_status_code >= 400 OR requests.error IS NOT NULL)
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      ORDER BY requests.timestamp DESC
      LIMIT 50
    `.execute(db),
    ]);

  const s = summaryResult.rows[0];
  const totalErrors = Number(s.total_errors);
  const totalRequests = Number(s.total_requests);

  return {
    summary: {
      totalErrors,
      totalRequests,
      errorsToday: Number(s.errors_today),
      errorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
    },
    timeline: timelineResult.rows.map((r) => ({
      hour: String(r.hour),
      error_count: Number(r.error_count),
      total_count: Number(r.total_count),
    })),
    statusCodes: statusCodesResult.rows.map((r) => ({
      status_code: Number(r.status_code),
      count: Number(r.count),
    })),
    byModel: byModelResult.rows.map((r) => ({
      model: String(r.model),
      error_count: Number(r.error_count),
      total_count: Number(r.total_count),
    })),
    recentErrors: recentResult.rows.map((r) => ({
      id: String(r.id),
      model: String(r.model),
      status_code: r.status_code === null ? null : Number(r.status_code),
      error: r.error === null ? null : String(r.error),
      timestamp: String(r.timestamp),
      session_id: String(r.session_id),
      duration_ms: r.duration_ms === null ? null : Number(r.duration_ms),
    })),
  };
}

// ── Latency analytics ──

export async function getLatencyStats(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    requests_today: number;
    streaming_p50: number;
    streaming_p95: number;
    streaming_avg: number;
    streaming_count: number;
    non_streaming_p50: number;
    non_streaming_p95: number;
    non_streaming_avg: number;
    non_streaming_count: number;
  }>`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY requests.duration_ms) AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY requests.duration_ms) AS p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY requests.duration_ms) AS p99,
      avg(requests.duration_ms) AS avg,
      count(*) FILTER (WHERE requests.timestamp >= ${TODAY_UTC_START}) AS requests_today,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY requests.duration_ms) FILTER (WHERE requests.is_streaming) AS streaming_p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY requests.duration_ms) FILTER (WHERE requests.is_streaming) AS streaming_p95,
      avg(requests.duration_ms) FILTER (WHERE requests.is_streaming) AS streaming_avg,
      count(*) FILTER (WHERE requests.is_streaming) AS streaming_count,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY requests.duration_ms) FILTER (WHERE NOT requests.is_streaming) AS non_streaming_p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY requests.duration_ms) FILTER (WHERE NOT requests.is_streaming) AS non_streaming_p95,
      avg(requests.duration_ms) FILTER (WHERE NOT requests.is_streaming) AS non_streaming_avg,
      count(*) FILTER (WHERE NOT requests.is_streaming) AS non_streaming_count
    FROM requests
    WHERE requests.duration_ms IS NOT NULL
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      AND ${modelFilter(model)}
  `.execute(db);
  const r = result.rows[0];
  return {
    p50: Number(r.p50 ?? 0),
    p95: Number(r.p95 ?? 0),
    p99: Number(r.p99 ?? 0),
    avg: Number(r.avg ?? 0),
    requestsToday: Number(r.requests_today),
    streaming: {
      p50: Number(r.streaming_p50 ?? 0),
      p95: Number(r.streaming_p95 ?? 0),
      avg: Number(r.streaming_avg ?? 0),
      count: Number(r.streaming_count),
    },
    nonStreaming: {
      p50: Number(r.non_streaming_p50 ?? 0),
      p95: Number(r.non_streaming_p95 ?? 0),
      avg: Number(r.non_streaming_avg ?? 0),
      count: Number(r.non_streaming_count),
    },
  };
}

export async function getLatencyDistribution(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{ duration_ms: number }>`
    SELECT requests.duration_ms AS duration_ms
    FROM requests
    WHERE requests.duration_ms IS NOT NULL AND requests.duration_ms > 0
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      AND ${modelFilter(model)}
  `.execute(db);
  return result.rows.map((r) => ({
    duration_ms: Number(r.duration_ms),
  }));
}

/**
 * Per-session subagent stats: number of distinct runs and the peak
 * number active concurrently over the trailing `SUBAGENT_STATS_WINDOW_DAYS`.
 * The same eligible-session threshold (> `minReqs` visible requests inside
 * the window at `traceVersion`) gates both the count and run interval population.
 *
 * A subagent run = one `(session, x-claude-code-agent-id)` group, with the
 * less reliable `subagent_label` as a fallback for sessions that predate
 * Claude Code 2.1.139's stable agent-id header. A run's interval is
 * `[min(timestamp), max(timestamp + duration_ms)]`; concurrency is the max
 * of a sweep-line over those intervals per session. Sessions with zero
 * subagents are included (count=0, max=0) so the histogram reflects the
 * rolling population shape without an unbounded request_headers scan.
 */
export async function getSubagentStatsPerSessionDistribution(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  minReqs = 20,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    subagent_count: number;
    max_concurrent: number;
  }>`
    WITH eligible_sessions AS (
      SELECT requests.session_id
      FROM requests
      WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND requests.timestamp >= ${NOW} - (${SUBAGENT_STATS_WINDOW_DAYS} || ' days')::interval
      GROUP BY requests.session_id
      HAVING count(*) > ${minReqs}
    ),
    agent_runs AS (
      SELECT
        requests.session_id,
        coalesce(
          requests.request_headers->>'x-claude-code-agent-id',
          requests.subagent_label
        ) AS agent_key,
        min(requests.timestamp) AS started,
        max(requests.timestamp + make_interval(secs => coalesce(requests.duration_ms, 0) / 1000.0))
          AS ended
      FROM requests
      JOIN eligible_sessions ON eligible_sessions.session_id = requests.session_id
      WHERE requests.subagent_label IS NOT NULL
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND requests.timestamp >= ${NOW} - (${SUBAGENT_STATS_WINDOW_DAYS} || ' days')::interval
      GROUP BY requests.session_id, agent_key
    ),
    counts AS (
      SELECT session_id, count(*)::int AS subagent_count
      FROM agent_runs
      GROUP BY session_id
    ),
    events AS (
      SELECT session_id, started AS t, 1 AS delta FROM agent_runs
      UNION ALL
      SELECT session_id, ended AS t, -1 AS delta FROM agent_runs
    ),
    running AS (
      SELECT
        session_id,
        sum(delta) OVER (
          PARTITION BY session_id
          ORDER BY t, delta DESC
          ROWS UNBOUNDED PRECEDING
        ) AS active
      FROM events
    ),
    concurrency AS (
      SELECT session_id, max(active)::int AS max_concurrent
      FROM running
      GROUP BY session_id
    )
    SELECT
      coalesce(counts.subagent_count, 0) AS subagent_count,
      coalesce(concurrency.max_concurrent, 0) AS max_concurrent
    FROM eligible_sessions es
    LEFT JOIN counts ON counts.session_id = es.session_id
    LEFT JOIN concurrency ON concurrency.session_id = es.session_id
  `.execute(db);
  return result.rows.map((r) => ({
    subagentCount: Number(r.subagent_count),
    maxConcurrent: Number(r.max_concurrent),
  }));
}

/**
 * Per-session wall-clock duration in minutes (last_active_at − started_at),
 * restricted to sessions with more than `minReqs` visible requests at the
 * given `traceVersion`. Skips sessions where last_active_at == started_at
 * (single-tick / aborted) so the zero-bucket doesn't dominate the histogram.
 * Same eligibility as `getWeeklySessionsByHarness` (which reads it from
 * `session_summary`) so the two /graphs charts agree on what "a real session"
 * means.
 */
export async function getSessionDurationDistribution(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  minReqs = 20,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{ duration_minutes: number }>`
    WITH eligible_sessions AS (
      SELECT requests.session_id
      FROM requests
      WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      GROUP BY requests.session_id
      HAVING count(*) > ${minReqs}
    )
    SELECT
      EXTRACT(EPOCH FROM (sessions.last_active_at - sessions.started_at)) / 60.0
        AS duration_minutes
    FROM sessions
    JOIN eligible_sessions ON eligible_sessions.session_id = sessions.id
    WHERE ${sessionsVisFilter(visibleClientIds)}
      AND sessions.last_active_at > sessions.started_at
  `.execute(db);
  return result.rows.map((r) => ({ durationMinutes: Number(r.duration_minutes) }));
}

export async function getTTFTDistribution(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{ ttft_ms: number }>`
    SELECT requests.ttft_ms AS ttft_ms
    FROM requests
    WHERE requests.ttft_ms IS NOT NULL AND requests.ttft_ms > 0
      AND requests.is_streaming
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      AND ${modelFilter(model)}
  `.execute(db);
  return result.rows.map((r) => ({ ttft_ms: Number(r.ttft_ms) }));
}

export async function getTPOTDistribution(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{ tpot_ms: number }>`
    SELECT requests.tpot_ms AS tpot_ms
    FROM requests
    WHERE requests.tpot_ms IS NOT NULL AND requests.tpot_ms > 0
      AND requests.is_streaming
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      AND ${modelFilter(model)}
  `.execute(db);
  return result.rows.map((r) => ({ tpot_ms: Number(r.tpot_ms) }));
}

export async function getTTFTStats(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    avg: number;
    count: number;
  }>`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY requests.ttft_ms) AS p50,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY requests.ttft_ms) AS p90,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY requests.ttft_ms) AS p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY requests.ttft_ms) AS p99,
      avg(requests.ttft_ms) AS avg,
      count(*) AS count
    FROM requests
    WHERE requests.ttft_ms IS NOT NULL AND requests.ttft_ms > 0
      AND requests.is_streaming
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      AND ${modelFilter(model)}
  `.execute(db);
  const r = result.rows[0];
  return {
    p50: Number(r.p50 ?? 0),
    p90: Number(r.p90 ?? 0),
    p95: Number(r.p95 ?? 0),
    p99: Number(r.p99 ?? 0),
    avg: Number(r.avg ?? 0),
    count: Number(r.count ?? 0),
  };
}

export async function getTokensPerChunkDistribution(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{ tokens_per_chunk: number }>`
    SELECT requests.output_tokens::float / requests.sse_chunk_count AS tokens_per_chunk
    FROM requests
    WHERE requests.sse_chunk_count IS NOT NULL AND requests.sse_chunk_count > 0
      AND requests.output_tokens IS NOT NULL AND requests.output_tokens > 0
      AND requests.is_streaming
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      AND ${modelFilter(model)}
  `.execute(db);
  return result.rows.map((r) => ({ tokens_per_chunk: Number(r.tokens_per_chunk) }));
}

export async function getPrefillSpeedDistribution(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{ prefill_speed: number }>`
    SELECT (COALESCE(requests.cache_read_input_tokens, 0) + COALESCE(requests.cache_write_tokens, 0))::float / (requests.ttft_ms / 1000.0) AS prefill_speed
    FROM requests
    WHERE requests.ttft_ms IS NOT NULL AND requests.ttft_ms > 0
      AND (COALESCE(requests.cache_read_input_tokens, 0) + COALESCE(requests.cache_write_tokens, 0)) > 0
      AND requests.is_streaming
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      AND ${modelFilter(model)}
  `.execute(db);
  return result.rows.map((r) => ({ prefill_speed: Number(r.prefill_speed) }));
}

export async function getPrefillDecodePairedDistribution(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{ ttft_ms: number; duration_ms: number }>`
    SELECT requests.ttft_ms AS ttft_ms, requests.duration_ms AS duration_ms
    FROM requests
    WHERE requests.ttft_ms IS NOT NULL AND requests.ttft_ms > 0
      AND requests.duration_ms IS NOT NULL AND requests.duration_ms >= requests.ttft_ms
      AND requests.is_streaming
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      AND ${modelFilter(model)}
  `.execute(db);
  return result.rows.map((r) => ({
    ttftMs: Number(r.ttft_ms),
    durationMs: Number(r.duration_ms),
  }));
}

export async function getPrefillDecodePairedByModelFastMode(
  visibleClientIds: string[] | null,
  model: string,
  fastMode: boolean,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{ ttft_ms: number; duration_ms: number }>`
    SELECT requests.ttft_ms AS ttft_ms, requests.duration_ms AS duration_ms
    FROM requests
    WHERE requests.ttft_ms IS NOT NULL AND requests.ttft_ms > 0
      AND requests.duration_ms IS NOT NULL AND requests.duration_ms >= requests.ttft_ms
      AND requests.is_streaming
      AND requests.model = ${model}
      AND requests.is_fast_mode = ${fastMode}
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
  `.execute(db);
  return result.rows.map((r) => ({
    ttftMs: Number(r.ttft_ms),
    durationMs: Number(r.duration_ms),
  }));
}

export async function getPrefillSpeedStats(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    avg: number;
    count: number;
  }>`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY (COALESCE(requests.cache_read_input_tokens, 0) + COALESCE(requests.cache_write_tokens, 0))::float / (requests.ttft_ms / 1000.0)) AS p50,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY (COALESCE(requests.cache_read_input_tokens, 0) + COALESCE(requests.cache_write_tokens, 0))::float / (requests.ttft_ms / 1000.0)) AS p90,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY (COALESCE(requests.cache_read_input_tokens, 0) + COALESCE(requests.cache_write_tokens, 0))::float / (requests.ttft_ms / 1000.0)) AS p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY (COALESCE(requests.cache_read_input_tokens, 0) + COALESCE(requests.cache_write_tokens, 0))::float / (requests.ttft_ms / 1000.0)) AS p99,
      avg((COALESCE(requests.cache_read_input_tokens, 0) + COALESCE(requests.cache_write_tokens, 0))::float / (requests.ttft_ms / 1000.0)) AS avg,
      count(*) AS count
    FROM requests
    WHERE requests.ttft_ms IS NOT NULL AND requests.ttft_ms > 0
      AND (COALESCE(requests.cache_read_input_tokens, 0) + COALESCE(requests.cache_write_tokens, 0)) > 0
      AND requests.is_streaming
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      AND ${modelFilter(model)}
  `.execute(db);
  const r = result.rows[0];
  return {
    p50: Number(r.p50 ?? 0),
    p90: Number(r.p90 ?? 0),
    p95: Number(r.p95 ?? 0),
    p99: Number(r.p99 ?? 0),
    avg: Number(r.avg ?? 0),
    count: Number(r.count ?? 0),
  };
}

export async function getTPOTStats(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    avg: number;
    count: number;
  }>`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY requests.tpot_ms) AS p50,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY requests.tpot_ms) AS p90,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY requests.tpot_ms) AS p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY requests.tpot_ms) AS p99,
      avg(requests.tpot_ms) AS avg,
      count(*) AS count
    FROM requests
    WHERE requests.tpot_ms IS NOT NULL AND requests.tpot_ms > 0
      AND requests.is_streaming
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      AND ${modelFilter(model)}
  `.execute(db);
  const r = result.rows[0];
  return {
    p50: Number(r.p50 ?? 0),
    p90: Number(r.p90 ?? 0),
    p95: Number(r.p95 ?? 0),
    p99: Number(r.p99 ?? 0),
    avg: Number(r.avg ?? 0),
    count: Number(r.count ?? 0),
  };
}

// ── Combined distribution + stats (single scan) ──
// Used by /api/latency to avoid scanning the same rows twice.

export async function getTTFTDistributionAndStats(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  // CTE scans once; stats query and distribution query both read from it
  const [distResult, statsResult] = await Promise.all([
    sql<{ ttft_ms: number }>`
      SELECT ttft_ms FROM requests
      WHERE ttft_ms IS NOT NULL AND ttft_ms > 0
        AND is_streaming
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
    `.execute(db),
    sql<{ p50: number; p90: number; p95: number; p99: number; avg: number; count: number }>`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY ttft_ms) AS p50,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY ttft_ms) AS p90,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY ttft_ms) AS p95,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY ttft_ms) AS p99,
        avg(ttft_ms) AS avg, count(*) AS count
      FROM requests
      WHERE ttft_ms IS NOT NULL AND ttft_ms > 0
        AND is_streaming
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
    `.execute(db),
  ]);
  const s = statsResult.rows[0];
  return {
    distribution: distResult.rows.map((r) => ({ ttft_ms: Number(r.ttft_ms) })),
    stats: s
      ? {
          p50: Number(s.p50 ?? 0),
          p90: Number(s.p90 ?? 0),
          p95: Number(s.p95 ?? 0),
          p99: Number(s.p99 ?? 0),
          avg: Number(s.avg ?? 0),
          count: Number(s.count ?? 0),
        }
      : { p50: 0, p90: 0, p95: 0, p99: 0, avg: 0, count: 0 },
  };
}

export async function getTPOTDistributionAndStats(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const [distResult, statsResult] = await Promise.all([
    sql<{ tpot_ms: number }>`
      SELECT tpot_ms FROM requests
      WHERE tpot_ms IS NOT NULL AND tpot_ms > 0
        AND is_streaming
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
    `.execute(db),
    sql<{ p50: number; p90: number; p95: number; p99: number; avg: number; count: number }>`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY tpot_ms) AS p50,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY tpot_ms) AS p90,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY tpot_ms) AS p95,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY tpot_ms) AS p99,
        avg(tpot_ms) AS avg, count(*) AS count
      FROM requests
      WHERE tpot_ms IS NOT NULL AND tpot_ms > 0
        AND is_streaming
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
    `.execute(db),
  ]);
  const s = statsResult.rows[0];
  return {
    distribution: distResult.rows.map((r) => ({ tpot_ms: Number(r.tpot_ms) })),
    stats: s
      ? {
          p50: Number(s.p50 ?? 0),
          p90: Number(s.p90 ?? 0),
          p95: Number(s.p95 ?? 0),
          p99: Number(s.p99 ?? 0),
          avg: Number(s.avg ?? 0),
          count: Number(s.count ?? 0),
        }
      : { p50: 0, p90: 0, p95: 0, p99: 0, avg: 0, count: 0 },
  };
}

export async function getPrefillSpeedDistributionAndStats(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const [distResult, statsResult] = await Promise.all([
    sql<{ prefill_speed: number }>`
      SELECT (COALESCE(cache_read_input_tokens, 0) + COALESCE(cache_write_tokens, 0))::float / (ttft_ms / 1000.0) AS prefill_speed
      FROM requests
      WHERE ttft_ms IS NOT NULL AND ttft_ms > 0
        AND (COALESCE(cache_read_input_tokens, 0) + COALESCE(cache_write_tokens, 0)) > 0
        AND is_streaming
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
    `.execute(db),
    sql<{ p50: number; p90: number; p95: number; p99: number; avg: number; count: number }>`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY (COALESCE(cache_read_input_tokens, 0) + COALESCE(cache_write_tokens, 0))::float / (ttft_ms / 1000.0)) AS p50,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY (COALESCE(cache_read_input_tokens, 0) + COALESCE(cache_write_tokens, 0))::float / (ttft_ms / 1000.0)) AS p90,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY (COALESCE(cache_read_input_tokens, 0) + COALESCE(cache_write_tokens, 0))::float / (ttft_ms / 1000.0)) AS p95,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY (COALESCE(cache_read_input_tokens, 0) + COALESCE(cache_write_tokens, 0))::float / (ttft_ms / 1000.0)) AS p99,
        avg((COALESCE(cache_read_input_tokens, 0) + COALESCE(cache_write_tokens, 0))::float / (ttft_ms / 1000.0)) AS avg,
        count(*) AS count
      FROM requests
      WHERE ttft_ms IS NOT NULL AND ttft_ms > 0
        AND (COALESCE(cache_read_input_tokens, 0) + COALESCE(cache_write_tokens, 0)) > 0
        AND is_streaming
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
    `.execute(db),
  ]);
  const s = statsResult.rows[0];
  return {
    distribution: distResult.rows.map((r) => ({ prefill_speed: Number(r.prefill_speed) })),
    stats: s
      ? {
          p50: Number(s.p50 ?? 0),
          p90: Number(s.p90 ?? 0),
          p95: Number(s.p95 ?? 0),
          p99: Number(s.p99 ?? 0),
          avg: Number(s.avg ?? 0),
          count: Number(s.count ?? 0),
        }
      : { p50: 0, p90: 0, p95: 0, p99: 0, avg: 0, count: 0 },
  };
}

export async function getHourlyLatency(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    hour: string;
    p50: number;
    p95: number;
    avg: number;
    count: number;
  }>`
    SELECT
      date_trunc('hour', requests.timestamp) AS hour,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY requests.duration_ms) AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY requests.duration_ms) AS p95,
      avg(requests.duration_ms) AS avg,
      count(*) AS count
    FROM requests
    WHERE requests.timestamp > ${NOW} - interval '48 hours'
      AND requests.duration_ms IS NOT NULL
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      AND ${modelFilter(model)}
    GROUP BY date_trunc('hour', requests.timestamp)
    ORDER BY hour
  `.execute(db);
  return result.rows.map((r) => ({
    hour: String(r.hour),
    p50: Number(r.p50),
    p95: Number(r.p95),
    avg: Number(r.avg),
    count: Number(r.count),
  }));
}

export async function getLatencyByModel(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    model: string;
    p50: number;
    p95: number;
    avg: number;
    count: number;
  }>`
    SELECT
      requests.model AS model,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY requests.duration_ms) AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY requests.duration_ms) AS p95,
      avg(requests.duration_ms) AS avg,
      count(*) AS count
    FROM requests
    WHERE requests.model IS NOT NULL AND requests.duration_ms IS NOT NULL
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      AND ${modelFilter(model)}
    GROUP BY requests.model
    ORDER BY p50 DESC
  `.execute(db);
  return result.rows.map((r) => ({
    model: String(r.model),
    p50: Number(r.p50),
    p95: Number(r.p95),
    avg: Number(r.avg),
    count: Number(r.count),
  }));
}

export async function getCacheReadVsLatency(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    bucket: number;
    count: number;
    p50: number;
    p95: number;
    p90: number;
    avg: number;
  }>`
    WITH bucketed AS (
      SELECT
        CASE
          WHEN requests.cache_read_input_tokens < 10000 THEN 0
          WHEN requests.cache_read_input_tokens < 50000 THEN 10000
          WHEN requests.cache_read_input_tokens < 100000 THEN 50000
          WHEN requests.cache_read_input_tokens < 200000 THEN 100000
          WHEN requests.cache_read_input_tokens < 500000 THEN 200000
          WHEN requests.cache_read_input_tokens < 1000000 THEN 500000
          ELSE 1000000
        END AS bucket,
        requests.duration_ms AS duration_ms
      FROM requests
      WHERE requests.duration_ms IS NOT NULL
        AND requests.cache_read_input_tokens IS NOT NULL
        AND coalesce(requests.cache_write_tokens, 0) < 4000
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
    )
    SELECT
      bucket,
      count(*)::int AS count,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_ms) AS p90,
      avg(duration_ms) AS avg
    FROM bucketed
    GROUP BY bucket
    ORDER BY bucket
  `.execute(db);
  return result.rows.map((r) => ({
    bucket: Number(r.bucket),
    count: Number(r.count),
    p50: Number(r.p50),
    p95: Number(r.p95),
    p90: Number(r.p90),
    avg: Number(r.avg),
  }));
}

export async function getCacheHeatmap(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    read_bucket: number;
    write_bucket: number;
    count: number;
    p90: number;
  }>`
    WITH bucketed AS (
      SELECT
        CASE
          WHEN coalesce(requests.cache_read_input_tokens, 0) < 10000 THEN 0
          WHEN requests.cache_read_input_tokens < 25000 THEN 10000
          WHEN requests.cache_read_input_tokens < 50000 THEN 25000
          WHEN requests.cache_read_input_tokens < 75000 THEN 50000
          WHEN requests.cache_read_input_tokens < 100000 THEN 75000
          WHEN requests.cache_read_input_tokens < 150000 THEN 100000
          WHEN requests.cache_read_input_tokens < 200000 THEN 150000
          WHEN requests.cache_read_input_tokens < 300000 THEN 200000
          WHEN requests.cache_read_input_tokens < 500000 THEN 300000
          ELSE 500000
        END AS read_bucket,
        CASE
          WHEN coalesce(requests.cache_write_tokens, 0) < 1000 THEN 0
          WHEN requests.cache_write_tokens < 5000 THEN 1000
          WHEN requests.cache_write_tokens < 10000 THEN 5000
          WHEN requests.cache_write_tokens < 25000 THEN 10000
          WHEN requests.cache_write_tokens < 50000 THEN 25000
          WHEN requests.cache_write_tokens < 75000 THEN 50000
          WHEN requests.cache_write_tokens < 100000 THEN 75000
          ELSE 100000
        END AS write_bucket,
        requests.duration_ms AS duration_ms
      FROM requests
      WHERE requests.duration_ms IS NOT NULL
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
    )
    SELECT
      read_bucket,
      write_bucket,
      count(*)::int AS count,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_ms) AS p90
    FROM bucketed
    GROUP BY read_bucket, write_bucket
    ORDER BY read_bucket, write_bucket
  `.execute(db);
  return result.rows.map((r) => ({
    readBucket: Number(r.read_bucket),
    writeBucket: Number(r.write_bucket),
    count: Number(r.count),
    p90: Number(r.p90),
  }));
}

export async function getCacheHeatmapTTFT(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    read_bucket: number;
    write_bucket: number;
    count: number;
    p90: number;
  }>`
    WITH bucketed AS (
      SELECT
        CASE
          WHEN coalesce(requests.cache_read_input_tokens, 0) < 10000 THEN 0
          WHEN requests.cache_read_input_tokens < 25000 THEN 10000
          WHEN requests.cache_read_input_tokens < 50000 THEN 25000
          WHEN requests.cache_read_input_tokens < 75000 THEN 50000
          WHEN requests.cache_read_input_tokens < 100000 THEN 75000
          WHEN requests.cache_read_input_tokens < 150000 THEN 100000
          WHEN requests.cache_read_input_tokens < 200000 THEN 150000
          WHEN requests.cache_read_input_tokens < 300000 THEN 200000
          WHEN requests.cache_read_input_tokens < 500000 THEN 300000
          ELSE 500000
        END AS read_bucket,
        CASE
          WHEN coalesce(requests.cache_write_tokens, 0) < 1000 THEN 0
          WHEN requests.cache_write_tokens < 5000 THEN 1000
          WHEN requests.cache_write_tokens < 10000 THEN 5000
          WHEN requests.cache_write_tokens < 25000 THEN 10000
          WHEN requests.cache_write_tokens < 50000 THEN 25000
          WHEN requests.cache_write_tokens < 75000 THEN 50000
          WHEN requests.cache_write_tokens < 100000 THEN 75000
          ELSE 100000
        END AS write_bucket,
        requests.ttft_ms AS ttft_ms
      FROM requests
      WHERE requests.ttft_ms IS NOT NULL AND requests.ttft_ms > 0
        AND requests.is_streaming
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
    )
    SELECT
      read_bucket,
      write_bucket,
      count(*)::int AS count,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY ttft_ms) AS p90
    FROM bucketed
    GROUP BY read_bucket, write_bucket
    ORDER BY read_bucket, write_bucket
  `.execute(db);
  return result.rows.map((r) => ({
    readBucket: Number(r.read_bucket),
    writeBucket: Number(r.write_bucket),
    count: Number(r.count),
    p90: Number(r.p90),
  }));
}

export async function getCacheHeatmapPrefillSpeed(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    read_bucket: number;
    write_bucket: number;
    count: number;
    p90: number;
  }>`
    WITH bucketed AS (
      SELECT
        CASE
          WHEN coalesce(requests.cache_read_input_tokens, 0) < 10000 THEN 0
          WHEN requests.cache_read_input_tokens < 25000 THEN 10000
          WHEN requests.cache_read_input_tokens < 50000 THEN 25000
          WHEN requests.cache_read_input_tokens < 75000 THEN 50000
          WHEN requests.cache_read_input_tokens < 100000 THEN 75000
          WHEN requests.cache_read_input_tokens < 150000 THEN 100000
          WHEN requests.cache_read_input_tokens < 200000 THEN 150000
          WHEN requests.cache_read_input_tokens < 300000 THEN 200000
          WHEN requests.cache_read_input_tokens < 500000 THEN 300000
          ELSE 500000
        END AS read_bucket,
        CASE
          WHEN coalesce(requests.cache_write_tokens, 0) < 1000 THEN 0
          WHEN requests.cache_write_tokens < 5000 THEN 1000
          WHEN requests.cache_write_tokens < 10000 THEN 5000
          WHEN requests.cache_write_tokens < 25000 THEN 10000
          WHEN requests.cache_write_tokens < 50000 THEN 25000
          WHEN requests.cache_write_tokens < 75000 THEN 50000
          WHEN requests.cache_write_tokens < 100000 THEN 75000
          ELSE 100000
        END AS write_bucket,
        (COALESCE(requests.cache_read_input_tokens, 0) + COALESCE(requests.cache_write_tokens, 0))::float / (requests.ttft_ms / 1000.0) AS prefill_speed
      FROM requests
      WHERE requests.ttft_ms IS NOT NULL AND requests.ttft_ms > 0
        AND (COALESCE(requests.cache_read_input_tokens, 0) + COALESCE(requests.cache_write_tokens, 0)) > 0
        AND requests.is_streaming
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
    )
    SELECT
      read_bucket,
      write_bucket,
      count(*)::int AS count,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY prefill_speed) AS p90
    FROM bucketed
    GROUP BY read_bucket, write_bucket
    ORDER BY read_bucket, write_bucket
  `.execute(db);
  return result.rows.map((r) => ({
    readBucket: Number(r.read_bucket),
    writeBucket: Number(r.write_bucket),
    count: Number(r.count),
    p90: Number(r.p90),
  }));
}

export async function getCacheTotalVsOutputInteractivity(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    cache_total_bucket: number;
    output_bucket: number;
    count: number;
    p90_tpot: number;
  }>`
    WITH bucketed AS (
      SELECT
        CASE
          WHEN coalesce(requests.cache_read_input_tokens, 0) + coalesce(requests.cache_write_tokens, 0) < 10000 THEN 0
          WHEN coalesce(requests.cache_read_input_tokens, 0) + coalesce(requests.cache_write_tokens, 0) < 25000 THEN 10000
          WHEN coalesce(requests.cache_read_input_tokens, 0) + coalesce(requests.cache_write_tokens, 0) < 50000 THEN 25000
          WHEN coalesce(requests.cache_read_input_tokens, 0) + coalesce(requests.cache_write_tokens, 0) < 100000 THEN 50000
          WHEN coalesce(requests.cache_read_input_tokens, 0) + coalesce(requests.cache_write_tokens, 0) < 200000 THEN 100000
          WHEN coalesce(requests.cache_read_input_tokens, 0) + coalesce(requests.cache_write_tokens, 0) < 500000 THEN 200000
          ELSE 500000
        END AS cache_total_bucket,
        CASE
          WHEN coalesce(requests.output_tokens, 0) < 500 THEN 0
          WHEN requests.output_tokens < 1000 THEN 500
          WHEN requests.output_tokens < 2000 THEN 1000
          WHEN requests.output_tokens < 5000 THEN 2000
          WHEN requests.output_tokens < 10000 THEN 5000
          WHEN requests.output_tokens < 20000 THEN 10000
          ELSE 20000
        END AS output_bucket,
        requests.tpot_ms AS tpot_ms
      FROM requests
      WHERE requests.tpot_ms IS NOT NULL AND requests.tpot_ms > 0
        AND requests.is_streaming
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
    )
    SELECT
      cache_total_bucket,
      output_bucket,
      count(*)::int AS count,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY tpot_ms) AS p90_tpot
    FROM bucketed
    GROUP BY cache_total_bucket, output_bucket
    ORDER BY cache_total_bucket, output_bucket
  `.execute(db);
  return result.rows.map((r) => ({
    cacheTotalBucket: Number(r.cache_total_bucket),
    outputBucket: Number(r.output_bucket),
    count: Number(r.count),
    p90Interactivity: Number(r.p90_tpot) > 0 ? 1000 / Number(r.p90_tpot) : 0,
  }));
}

export async function getCacheHeatmapByOutput(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    read_bucket: number;
    write_bucket: number;
    output_bucket: number;
    count: number;
    p90: number;
  }>`
    WITH bucketed AS (
      SELECT
        CASE
          WHEN coalesce(requests.cache_read_input_tokens, 0) < 10000 THEN 0
          WHEN requests.cache_read_input_tokens < 25000 THEN 10000
          WHEN requests.cache_read_input_tokens < 50000 THEN 25000
          WHEN requests.cache_read_input_tokens < 75000 THEN 50000
          WHEN requests.cache_read_input_tokens < 100000 THEN 75000
          WHEN requests.cache_read_input_tokens < 150000 THEN 100000
          WHEN requests.cache_read_input_tokens < 200000 THEN 150000
          WHEN requests.cache_read_input_tokens < 300000 THEN 200000
          WHEN requests.cache_read_input_tokens < 500000 THEN 300000
          ELSE 500000
        END AS read_bucket,
        CASE
          WHEN coalesce(requests.cache_write_tokens, 0) < 1000 THEN 0
          WHEN requests.cache_write_tokens < 5000 THEN 1000
          WHEN requests.cache_write_tokens < 10000 THEN 5000
          WHEN requests.cache_write_tokens < 25000 THEN 10000
          WHEN requests.cache_write_tokens < 50000 THEN 25000
          WHEN requests.cache_write_tokens < 75000 THEN 50000
          WHEN requests.cache_write_tokens < 100000 THEN 75000
          ELSE 100000
        END AS write_bucket,
        CASE
          WHEN coalesce(requests.output_tokens, 0) < 1000 THEN 0
          WHEN requests.output_tokens < 5000 THEN 1000
          WHEN requests.output_tokens < 20000 THEN 5000
          ELSE 20000
        END AS output_bucket,
        requests.duration_ms AS duration_ms
      FROM requests
      WHERE requests.duration_ms IS NOT NULL
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
    )
    SELECT
      read_bucket,
      write_bucket,
      output_bucket,
      count(*)::int AS count,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_ms) AS p90
    FROM bucketed
    GROUP BY read_bucket, write_bucket, output_bucket
    ORDER BY output_bucket, read_bucket, write_bucket
  `.execute(db);
  return result.rows.map((r) => ({
    readBucket: Number(r.read_bucket),
    writeBucket: Number(r.write_bucket),
    outputBucket: Number(r.output_bucket),
    count: Number(r.count),
    p90: Number(r.p90),
  }));
}

// ── Cache analytics ──

export async function getCacheStats(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    total_cache_read: number;
    total_cache_write: number;
    total_input: number;
    total_requests: number;
    cache_hit_requests: number;
  }>`
    SELECT
      coalesce(sum(requests.cache_read_input_tokens), 0) AS total_cache_read,
      coalesce(sum(requests.cache_write_tokens), 0) AS total_cache_write,
      coalesce(sum(requests.input_tokens), 0) AS total_input,
      count(*) AS total_requests,
      count(*) FILTER (WHERE requests.cache_read_input_tokens > 0) AS cache_hit_requests
    FROM requests
    WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
  `.execute(db);
  const r = result.rows[0];
  const cacheRead = Number(r.total_cache_read);
  const input = Number(r.total_input);
  return {
    totalCacheRead: cacheRead,
    totalCacheWrite: Number(r.total_cache_write),
    totalInput: input,
    hitRate: cacheRead + input > 0 ? (cacheRead / (cacheRead + input)) * 100 : 0,
    cacheHitRequests: Number(r.cache_hit_requests),
    totalRequests: Number(r.total_requests),
  };
}

export async function getDailyCacheEfficiency(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    day: string;
    cache_read: number;
    cache_write: number;
    input_tokens: number;
  }>`
    SELECT
      date_trunc('day', requests.timestamp) AS day,
      coalesce(sum(requests.cache_read_input_tokens), 0) AS cache_read,
      coalesce(sum(requests.cache_write_tokens), 0) AS cache_write,
      coalesce(sum(requests.input_tokens), 0) AS input_tokens
    FROM requests
    WHERE requests.timestamp >= ${NOW} - interval '30 days'
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    GROUP BY date_trunc('day', requests.timestamp)
    ORDER BY day
  `.execute(db);
  return result.rows.map((r) => ({
    day: String(r.day),
    cache_read: Number(r.cache_read),
    cache_write: Number(r.cache_write),
    input_tokens: Number(r.input_tokens),
  }));
}

export async function getCacheByModel(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    model: string;
    cache_read: number;
    cache_write: number;
    input_tokens: number;
    request_count: number;
  }>`
    SELECT
      requests.model AS model,
      coalesce(sum(requests.cache_read_input_tokens), 0) AS cache_read,
      coalesce(sum(requests.cache_write_tokens), 0) AS cache_write,
      coalesce(sum(requests.input_tokens), 0) AS input_tokens,
      count(*) AS request_count
    FROM requests
    WHERE requests.model IS NOT NULL
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    GROUP BY requests.model
    ORDER BY cache_read DESC
  `.execute(db);
  return result.rows.map((r) => ({
    model: String(r.model),
    cache_read: Number(r.cache_read),
    cache_write: Number(r.cache_write),
    input_tokens: Number(r.input_tokens),
    request_count: Number(r.request_count),
  }));
}

export async function getCacheByClient(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    client_id: string;
    api_key_hash: string;
    cache_read: number;
    cache_write: number;
    input_tokens: number;
    request_count: number;
  }>`
    SELECT
      requests.client_id AS client_id,
      clients.api_key_hash AS api_key_hash,
      coalesce(sum(requests.cache_read_input_tokens), 0) AS cache_read,
      coalesce(sum(requests.cache_write_tokens), 0) AS cache_write,
      coalesce(sum(requests.input_tokens), 0) AS input_tokens,
      count(*) AS request_count
    FROM requests
    INNER JOIN clients ON clients.id = requests.client_id
    WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    GROUP BY requests.client_id, clients.api_key_hash
    ORDER BY cache_read DESC
    LIMIT 50
  `.execute(db);
  return result.rows.map((r) => ({
    client_id: String(r.client_id),
    api_key_hash: String(r.api_key_hash),
    cache_read: Number(r.cache_read),
    cache_write: Number(r.cache_write),
    input_tokens: Number(r.input_tokens),
    request_count: Number(r.request_count),
  }));
}

/**
 * Per-client daily cache-read vs input tokens for the cache heatmap. Reads the
 * `daily_client_usage` materialized view (requests pre-summed per client, UTC
 * day, privacy mode and trace version; see README) instead of summing
 * requests. The window starts at the first full UTC day `days` ago.
 */
export async function getDailyCacheEfficiencyByClient(
  visibleClientIds: string[] | null = null,
  days = 90,
  traceVersion: number | null = null,
) {
  const db = getDb();
  const result = await sql<{
    client_id: string;
    api_key_hash: string;
    day: string;
    cache_read: number;
    input_tokens: number;
  }>`
    SELECT
      u.client_id AS client_id,
      clients.api_key_hash AS api_key_hash,
      u.day::text AS day,
      sum(u.cache_read) AS cache_read,
      sum(u.input_tokens) AS input_tokens
    FROM daily_client_usage u
    INNER JOIN clients ON clients.id = u.client_id
    WHERE u.day >= (${NOW} - make_interval(days => ${days}))::date
      AND ${requestsVisFilter(visibleClientIds, 'u', traceVersion)}
    GROUP BY u.client_id, clients.api_key_hash, u.day
    ORDER BY u.client_id, u.day
  `.execute(db);
  return result.rows.map((r) => ({
    clientId: String(r.client_id),
    apiKeyHash: String(r.api_key_hash),
    day: r.day,
    cacheRead: Number(r.cache_read),
    inputTokens: Number(r.input_tokens),
  }));
}

// ── Traffic analytics ──

export async function getTrafficStats(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const [totals, peakResult, avgResult] = await Promise.all([
    sql<{
      total_requests: number;
      requests_today: number;
    }>`
      SELECT
        count(*) AS total_requests,
        count(*) FILTER (WHERE requests.timestamp >= ${TODAY_UTC_START}) AS requests_today
      FROM requests
      WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    `.execute(db),
    sql<{ peak_hour: string }>`
      SELECT date_trunc('hour', requests.timestamp) AS peak_hour
      FROM requests
      WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      GROUP BY date_trunc('hour', requests.timestamp)
      ORDER BY count(*) DESC
      LIMIT 1
    `.execute(db),
    sql<{ avg_per_day: number }>`
      SELECT count(*)::float / GREATEST(1, EXTRACT(EPOCH FROM (max(requests.timestamp) - min(requests.timestamp))) / 86400) AS avg_per_day
      FROM requests
      WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    `.execute(db),
  ]);
  return {
    totalRequests: Number(totals.rows[0].total_requests),
    requestsToday: Number(totals.rows[0].requests_today),
    peakHour: (peakResult.rows[0]?.peak_hour as string) ?? null,
    avgPerDay: Number(avgResult.rows[0]?.avg_per_day ?? 0),
  };
}

export async function getDailyTraffic(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    day: string;
    request_count: number;
  }>`
    SELECT
      date_trunc('day', requests.timestamp) AS day,
      count(*) AS request_count
    FROM requests
    WHERE requests.timestamp >= ${NOW} - interval '30 days'
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    GROUP BY date_trunc('day', requests.timestamp)
    ORDER BY day
  `.execute(db);
  return result.rows.map((r) => ({
    day: String(r.day),
    request_count: Number(r.request_count),
  }));
}

export async function getHourlyHeatmap(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    day_of_week: number;
    hour_of_day: number;
    request_count: number;
  }>`
    SELECT
      extract(dow FROM requests.timestamp)::int AS day_of_week,
      extract(hour FROM requests.timestamp)::int AS hour_of_day,
      count(*)::int AS request_count
    FROM requests
    WHERE requests.timestamp >= ${NOW} - interval '4 weeks'
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    GROUP BY
      extract(dow FROM requests.timestamp),
      extract(hour FROM requests.timestamp)
    ORDER BY day_of_week, hour_of_day
  `.execute(db);
  return result.rows.map((r) => ({
    day_of_week: Number(r.day_of_week),
    hour_of_day: Number(r.hour_of_day),
    request_count: Number(r.request_count),
  }));
}

/**
 * Bucketed request counts over a recent window for the RPS timeseries chart.
 * Returns one row per bucket whether or not it had any requests (gaps are
 * filled with zeros). `bucketMinutes` and `rangeHours` are inlined as raw
 * SQL — callers must pass validated server-side constants, not user input.
 */
export async function getRpsTimeseries(
  rangeHours: number,
  bucketMinutes: number,
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
) {
  const db = getDb();
  const bucketInterval = sql.raw(`interval '${bucketMinutes} minutes'`);
  const rangeInterval = sql.raw(`interval '${rangeHours} hours'`);
  const result = await sql<{
    bucket: string;
    request_count: number;
  }>`
    WITH bounds AS (
      SELECT
        date_bin(${bucketInterval}, ${NOW}, to_timestamp(0)) AS bucket_end,
        date_bin(${bucketInterval}, ${NOW} - ${rangeInterval}, to_timestamp(0)) AS bucket_start
    ),
    series AS (
      SELECT generate_series(
        (SELECT bucket_start FROM bounds),
        (SELECT bucket_end FROM bounds),
        ${bucketInterval}
      ) AS bucket
    ),
    counts AS (
      SELECT
        date_bin(${bucketInterval}, requests.timestamp, to_timestamp(0)) AS bucket,
        count(*)::int AS request_count
      FROM requests, bounds
      WHERE requests.timestamp >= bounds.bucket_start
        AND requests.timestamp < bounds.bucket_end + ${bucketInterval}
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
      GROUP BY date_bin(${bucketInterval}, requests.timestamp, to_timestamp(0))
    )
    SELECT series.bucket, coalesce(counts.request_count, 0) AS request_count
    FROM series
    LEFT JOIN counts ON counts.bucket = series.bucket
    ORDER BY series.bucket
  `.execute(db);
  return result.rows.map((r) => ({
    bucket: String(r.bucket),
    requestCount: Number(r.request_count),
  }));
}

export async function getStreamingBreakdown(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    day: string;
    streaming_count: number;
    non_streaming_count: number;
  }>`
    SELECT
      date_trunc('day', requests.timestamp) AS day,
      count(*) FILTER (WHERE requests.is_streaming) AS streaming_count,
      count(*) FILTER (WHERE NOT requests.is_streaming) AS non_streaming_count
    FROM requests
    WHERE requests.timestamp >= ${NOW} - interval '30 days'
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    GROUP BY date_trunc('day', requests.timestamp)
    ORDER BY day
  `.execute(db);
  return result.rows.map((r) => ({
    day: String(r.day),
    streaming_count: Number(r.streaming_count),
    non_streaming_count: Number(r.non_streaming_count),
  }));
}

// ── Session insights ──

export async function getSessionInsights(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const vis = sessionsVisFilter(visibleClientIds, traceVersion);
  const rVis = requestsVisFilter(visibleClientIds, 'requests', traceVersion);
  const [statsResult, aggregatesResult, dailyResult, concurrentResult] = await Promise.all([
    sql<{
      avg_duration: number;
      avg_turns: number;
      avg_cost: number;
      active_24h: number;
    }>`
      SELECT
        avg(extract(epoch FROM (sessions.last_active_at - sessions.started_at))) AS avg_duration,
        (SELECT avg(cnt) FROM (SELECT count(*) AS cnt FROM requests WHERE ${rVis} GROUP BY requests.session_id) sub) AS avg_turns,
        (SELECT avg(sc) FROM (SELECT sum(requests.cost_usd) AS sc FROM requests WHERE ${rVis} GROUP BY requests.session_id) sub) AS avg_cost,
        (SELECT count(DISTINCT sessions.id) FROM sessions WHERE sessions.last_active_at > ${NOW} - interval '24 hours' AND ${vis}) AS active_24h
      FROM sessions
      WHERE ${vis}
    `.execute(db),
    sql<{
      duration_seconds: number | null;
      turn_count: number;
      total_cost: number;
    }>`
      SELECT
        extract(epoch FROM (sessions.last_active_at - sessions.started_at)) AS duration_seconds,
        count(requests.id)::int AS turn_count,
        coalesce(sum(requests.cost_usd), 0) AS total_cost
      FROM sessions
      LEFT JOIN requests ON requests.session_id = sessions.id
        AND ${rVis}
      WHERE ${vis}
      GROUP BY sessions.id, sessions.started_at, sessions.last_active_at
    `.execute(db),
    sql<{
      day: string;
      session_count: number;
    }>`
      SELECT
        date_trunc('day', sessions.started_at) AS day,
        count(*)::int AS session_count
      FROM sessions
      WHERE sessions.started_at >= ${NOW} - interval '30 days' AND ${vis}
      GROUP BY date_trunc('day', sessions.started_at)
      ORDER BY day
    `.execute(db),
    sql<{
      hour: string;
      active_sessions: number;
    }>`
      SELECT
        date_trunc('hour', sessions.last_active_at) AS hour,
        count(DISTINCT sessions.id)::int AS active_sessions
      FROM sessions
      WHERE sessions.last_active_at >= ${NOW} - interval '7 days' AND ${vis}
      GROUP BY date_trunc('hour', sessions.last_active_at)
      ORDER BY hour
    `.execute(db),
  ]);
  const s = statsResult.rows[0];
  return {
    stats: {
      avgDuration: Number(s.avg_duration ?? 0),
      avgTurns: Number(s.avg_turns ?? 0),
      avgCost: Number(s.avg_cost ?? 0),
      active24h: Number(s.active_24h),
    },
    sessionAggregates: aggregatesResult.rows.map((r) => ({
      duration_seconds: r.duration_seconds === null ? null : Number(r.duration_seconds),
      turn_count: Number(r.turn_count),
      total_cost: Number(r.total_cost),
    })),
    dailySessions: dailyResult.rows.map((r) => ({
      day: String(r.day),
      session_count: Number(r.session_count),
    })),
    hourlyConcurrent: concurrentResult.rows.map((r) => ({
      hour: String(r.hour),
      active_sessions: Number(r.active_sessions),
    })),
  };
}

// ── Streaming analytics ──

export async function getStreamingStats(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const [countsResult, throughputResult] = await Promise.all([
    sql<{
      streaming_count: number;
      non_streaming_count: number;
      total_count: number;
      streaming_avg_latency: number;
      non_streaming_avg_latency: number;
    }>`
      SELECT
        count(*) FILTER (WHERE requests.is_streaming) AS streaming_count,
        count(*) FILTER (WHERE NOT requests.is_streaming) AS non_streaming_count,
        count(*) AS total_count,
        avg(requests.duration_ms) FILTER (WHERE requests.is_streaming) AS streaming_avg_latency,
        avg(requests.duration_ms) FILTER (WHERE NOT requests.is_streaming) AS non_streaming_avg_latency
      FROM requests
      WHERE requests.duration_ms IS NOT NULL
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
    `.execute(db),
    sql<{
      is_streaming: boolean;
      duration_ms: number;
      output_tokens: number;
    }>`
      SELECT
        requests.is_streaming AS is_streaming,
        requests.duration_ms AS duration_ms,
        requests.output_tokens AS output_tokens
      FROM requests
      WHERE requests.duration_ms IS NOT NULL
        AND requests.duration_ms > 0
        AND requests.output_tokens IS NOT NULL
        AND requests.output_tokens > 0
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${modelFilter(model)}
    `.execute(db),
  ]);
  const c = countsResult.rows[0];
  return {
    streamingCount: Number(c.streaming_count),
    nonStreamingCount: Number(c.non_streaming_count),
    totalCount: Number(c.total_count),
    streamingAvgLatency: Number(c.streaming_avg_latency ?? 0),
    nonStreamingAvgLatency: Number(c.non_streaming_avg_latency ?? 0),
    throughputData: throughputResult.rows.map((r) => ({
      is_streaming: Boolean(r.is_streaming),
      duration_ms: Number(r.duration_ms),
      output_tokens: Number(r.output_tokens),
    })),
  };
}

export async function getDailyStreamingRatio(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    day: string;
    streaming_count: number;
    total_count: number;
  }>`
    SELECT
      to_char(date_trunc('day', requests.timestamp), 'YYYY-MM-DD') AS day,
      count(*) FILTER (WHERE requests.is_streaming) AS streaming_count,
      count(*) AS total_count
    FROM requests
    WHERE requests.timestamp >= ${NOW} - interval '30 days'
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      AND ${modelFilter(model)}
    GROUP BY date_trunc('day', requests.timestamp)
    ORDER BY day
  `.execute(db);
  return result.rows.map((r) => ({
    day: String(r.day),
    streaming_count: Number(r.streaming_count),
    total_count: Number(r.total_count),
  }));
}

export async function getStreamingByModel(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    model: string;
    streaming_count: number;
    non_streaming_count: number;
    streaming_avg_latency: number | null;
    non_streaming_avg_latency: number | null;
  }>`
    SELECT
      requests.model AS model,
      count(*) FILTER (WHERE requests.is_streaming) AS streaming_count,
      count(*) FILTER (WHERE NOT requests.is_streaming) AS non_streaming_count,
      avg(requests.duration_ms) FILTER (WHERE requests.is_streaming) AS streaming_avg_latency,
      avg(requests.duration_ms) FILTER (WHERE NOT requests.is_streaming) AS non_streaming_avg_latency
    FROM requests
    WHERE requests.model IS NOT NULL
      AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      AND ${modelFilter(model)}
    GROUP BY requests.model
    ORDER BY streaming_count DESC
  `.execute(db);
  return result.rows.map((r) => ({
    model: String(r.model),
    streaming_count: Number(r.streaming_count),
    non_streaming_count: Number(r.non_streaming_count),
    streaming_avg_latency:
      r.streaming_avg_latency === null ? null : Number(r.streaming_avg_latency),
    non_streaming_avg_latency:
      r.non_streaming_avg_latency === null ? null : Number(r.non_streaming_avg_latency),
  }));
}

// ── Platform analytics ──

export async function getPlatformStats(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    os: string | null;
    cli_version: string | null;
    node_version: string | null;
    arch: string | null;
    session_count: number;
  }>`
    SELECT
      sessions.metadata ->> 'os' AS os,
      sessions.metadata ->> 'cliVersion' AS cli_version,
      sessions.metadata ->> 'nodeVersion' AS node_version,
      sessions.metadata ->> 'arch' AS arch,
      count(*)::int AS session_count
    FROM sessions
    WHERE sessions.metadata IS NOT NULL
      AND ${sessionsVisFilter(visibleClientIds, traceVersion)}
    GROUP BY
      sessions.metadata ->> 'os',
      sessions.metadata ->> 'cliVersion',
      sessions.metadata ->> 'nodeVersion',
      sessions.metadata ->> 'arch'
  `.execute(db);
  return result.rows.map((r) => ({
    os: r.os === null ? null : String(r.os),
    cli_version: r.cli_version === null ? null : String(r.cli_version),
    node_version: r.node_version === null ? null : String(r.node_version),
    arch: r.arch === null ? null : String(r.arch),
    session_count: Number(r.session_count),
  }));
}

export async function getPlatformTimeSeries(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    day: string;
    os: string | null;
    session_count: number;
  }>`
    SELECT
      date_trunc('day', sessions.started_at) AS day,
      sessions.metadata ->> 'os' AS os,
      count(*)::int AS session_count
    FROM sessions
    WHERE sessions.started_at >= ${NOW} - interval '30 days'
      AND sessions.metadata IS NOT NULL
      AND ${sessionsVisFilter(visibleClientIds, traceVersion)}
    GROUP BY date_trunc('day', sessions.started_at), sessions.metadata ->> 'os'
    ORDER BY day
  `.execute(db);
  return result.rows.map((r) => ({
    day: String(r.day),
    os: r.os === null ? null : String(r.os),
    session_count: Number(r.session_count),
  }));
}

// ── Web search analytics ──

export async function getWebSearchStats(
  visibleClientIds: string[] | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
) {
  const db = dbOverride ?? getDb();
  const [summaryResult, dailyResult, byModelResult, topSessionsResult] = await Promise.all([
    sql<{
      total_searches: number;
      searches_today: number;
      requests_with_search: number;
      total_requests: number;
    }>`
      SELECT
        coalesce(sum(coalesce(requests.web_search_count, 0)), 0) AS total_searches,
        coalesce(sum(coalesce(requests.web_search_count, 0)) FILTER (WHERE requests.timestamp >= ${TODAY_UTC_START}), 0) AS searches_today,
        count(*) FILTER (WHERE coalesce(requests.web_search_count, 0) > 0) AS requests_with_search,
        count(*) AS total_requests
      FROM requests
      WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    `.execute(db),
    sql<{
      day: string;
      search_count: number;
      requests_with_search: number;
    }>`
      SELECT
        date_trunc('day', requests.timestamp) AS day,
        coalesce(sum(coalesce(requests.web_search_count, 0)), 0) AS search_count,
        count(*) FILTER (WHERE coalesce(requests.web_search_count, 0) > 0) AS requests_with_search
      FROM requests
      WHERE requests.timestamp >= ${NOW} - interval '30 days'
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      GROUP BY date_trunc('day', requests.timestamp)
      ORDER BY day
    `.execute(db),
    sql<{
      model: string;
      search_count: number;
      requests_with_search: number;
      total_requests: number;
    }>`
      SELECT
        requests.model AS model,
        coalesce(sum(coalesce(requests.web_search_count, 0)), 0) AS search_count,
        count(*) FILTER (WHERE coalesce(requests.web_search_count, 0) > 0) AS requests_with_search,
        count(*) AS total_requests
      FROM requests
      WHERE requests.model IS NOT NULL
        AND ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      GROUP BY requests.model
      ORDER BY search_count DESC
    `.execute(db),
    sql<{
      session_id: string;
      search_count: number;
      request_count: number;
    }>`
      SELECT
        requests.session_id AS session_id,
        coalesce(sum(coalesce(requests.web_search_count, 0)), 0) AS search_count,
        count(*)::int AS request_count
      FROM requests
      WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
      GROUP BY requests.session_id
      HAVING coalesce(sum(coalesce(requests.web_search_count, 0)), 0) > 0
      ORDER BY search_count DESC
      LIMIT 20
    `.execute(db),
  ]);
  const s = summaryResult.rows[0];
  const totalRequests = Number(s.total_requests);
  const requestsWithSearch = Number(s.requests_with_search);
  return {
    stats: {
      totalSearches: Number(s.total_searches),
      searchesToday: Number(s.searches_today),
      requestsWithSearch,
      totalRequests,
      searchPct: totalRequests > 0 ? (requestsWithSearch / totalRequests) * 100 : 0,
    },
    daily: dailyResult.rows.map((r) => ({
      day: String(r.day),
      search_count: Number(r.search_count),
      requests_with_search: Number(r.requests_with_search),
    })),
    byModel: byModelResult.rows.map((r) => ({
      model: String(r.model),
      search_count: Number(r.search_count),
      requests_with_search: Number(r.requests_with_search),
      total_requests: Number(r.total_requests),
    })),
    topSessions: topSessionsResult.rows.map((r) => ({
      session_id: String(r.session_id),
      search_count: Number(r.search_count),
      request_count: Number(r.request_count),
    })),
  };
}

interface ToolAnalyticsSqlRow {
  tool_counts: { tool_name: string; count: number }[];
  transitions: { from_tool: string; to_tool: string; count: number }[];
  session_tool_stats: { total_tools: number; unique_tools: number }[];
  tool_error_rates: ToolOutcomeAnalytics['toolErrorRates'];
  tool_error_rates_by_os: ToolErrorRateByOs[];
  verification_summary: ToolOutcomeAnalytics['verificationSummary'];
  verification_by_kind: ToolOutcomeAnalytics['verificationByKind'];
  session_outcome_counts: ToolOutcomeAnalytics['sessionOutcomeCounts'];
}

export interface ToolErrorRateByOs {
  os: string;
  all_calls: number;
  all_matched_results: number;
  comparable_calls: number;
  matched_results: number;
  successes: number;
  errors: number;
  unknown: number;
  error_rate: number | null;
  providers: ToolErrorRateProviderBreakdown[];
}

export interface ToolErrorRateProviderBreakdown {
  client: string;
  total_calls: number;
  matched_results: number;
  supports_explicit_errors: boolean;
}

// First "(<os>; <arch>)" group of a Codex-style user-agent, e.g.
// "Codex Desktop/0.130.0 (Ubuntu 24.4.0; x86_64) unknown (…)". Passed to
// regexp_match() as a bind parameter. Shared by tool outcomes and timings so
// both views attribute historical sessions to the same OS.
const UA_PLATFORM_PATTERN = String.raw`\(([^;()]+); *([^)]+)\)`;

function sqlOsAliasMatch(
  value: RawBuilder<string | null>,
  aliases: readonly string[],
): RawBuilder<unknown> {
  return sql.join(
    aliases.map((alias) => sql`(${value} = ${alias} OR ${value} LIKE ${`${alias} %`})`),
    sql` OR `,
  );
}

/**
 * Keep database-side aggregation aligned with normalizePlatformOs(). The SQL
 * operates on millions of rows, so importing the canonical alias lists is the
 * practical shared boundary; unrecognized platforms deliberately remain null.
 */
function normalizedSessionOsSql(): RawBuilder<string | null> {
  const explicitValue = sql<string | null>`lower(nullif(trim(s.metadata ->> 'os'), ''))`;
  const explicit = sql<string | null>`
    CASE
      WHEN (${sqlOsAliasMatch(explicitValue, PLATFORM_OS_ALIASES.MacOS)}) THEN 'MacOS'
      WHEN (${sqlOsAliasMatch(explicitValue, PLATFORM_OS_ALIASES.Windows)}) THEN 'Windows'
      WHEN (${sqlOsAliasMatch(explicitValue, PLATFORM_OS_ALIASES.Linux)}) THEN 'Linux'
    END
  `;
  const userAgentValue = sql<string | null>`lower(trim(ua.m[1]))`;
  const userAgent = sql<string | null>`
    CASE
      WHEN (${sqlOsAliasMatch(userAgentValue, PLATFORM_OS_ALIASES.MacOS)}) THEN 'MacOS'
      WHEN (${sqlOsAliasMatch(userAgentValue, PLATFORM_OS_ALIASES.Windows)}) THEN 'Windows'
      WHEN (${sqlOsAliasMatch(userAgentValue, PLATFORM_OS_ALIASES.Linux)}) THEN 'Linux'
    END
  `;
  // A present explicit label is authoritative even when it is unrecognized.
  // Only missing/blank metadata may be backfilled from the user agent.
  return sql<string | null>`
    CASE
      WHEN ${explicitValue} IS NOT NULL THEN ${explicit}
      ELSE ${userAgent}
    END
  `;
}

/**
 * Compute tool analytics entirely inside Postgres. The previous implementation
 * returned every tool_use and every (often repeated) tool_result to Node, then
 * cloned and sorted those arrays several times. At production scale that could
 * exhaust the Vercel function's heap before the cache write ran.
 *
 * The MATERIALIZED CTEs keep the event-sized work in Postgres, where it can
 * spill to disk, and return only aggregates plus one compact metric row per
 * tool-using session.
 */
async function getToolAnalyticsFromDb(
  visibleClientIds: string[] | null,
  db: Kysely<Database>,
  traceVersion: number | null,
  sessionIds: readonly string[] | null,
): Promise<
  {
    toolCounts: ToolAnalyticsSqlRow['tool_counts'];
    transitions: ToolAnalyticsSqlRow['transitions'];
    sessionToolStats: ToolAnalyticsSqlRow['session_tool_stats'];
    toolErrorRatesByOs: ToolAnalyticsSqlRow['tool_error_rates_by_os'];
  } & ToolOutcomeAnalytics
> {
  const result = await sql<ToolAnalyticsSqlRow>`
    WITH
    visible_requests AS MATERIALIZED (
      SELECT
        r.id AS request_id,
        r.session_id,
        r.timestamp
      FROM requests r
      WHERE ${requestsVisFilter(visibleClientIds, 'r', traceVersion)}
        AND ${sessionIdFilter(sessionIds, 'r.session_id')}
    ),
    session_universe AS MATERIALIZED (
      SELECT sessions.id AS session_id
      FROM sessions
      WHERE ${sessionsVisFilter(visibleClientIds, traceVersion)}
        AND ${sessionIdFilter(sessionIds, 'sessions.id')}
    ),
    tool_uses AS MATERIALIZED (
      SELECT
        vr.session_id,
        vr.request_id,
        vr.timestamp,
        coalesce((elem ->> 'ordinality')::int, array_ordinality::int) AS ordinality,
        elem ->> 'id' AS tool_use_id,
        coalesce(elem ->> 'name', 'unknown') AS tool_name,
        elem ->> 'verification_kind' AS verification_kind
      FROM visible_requests vr
      ${requestStatsJoin('vr.request_id', sessionIds)}
      CROSS JOIN LATERAL jsonb_array_elements(rs.tool_uses)
        WITH ORDINALITY AS item(elem, array_ordinality)
      WHERE rs.tool_uses <> '[]'::jsonb
    ),
    first_results AS MATERIALIZED (
      SELECT DISTINCT ON (elem ->> 'tool_use_id')
        elem ->> 'tool_use_id' AS tool_use_id,
        coalesce((elem ->> 'is_error')::boolean, false) AS is_error,
        coalesce(elem ->> 'status', 'unknown') AS status
      FROM visible_requests vr
      ${requestStatsJoin('vr.request_id', sessionIds)}
      CROSS JOIN LATERAL jsonb_array_elements(rs.tool_results)
        WITH ORDINALITY AS result_item(elem, array_ordinality)
      WHERE rs.tool_results <> '[]'::jsonb
        AND elem ->> 'tool_use_id' IS NOT NULL
      ORDER BY
        elem ->> 'tool_use_id',
        vr.timestamp,
        vr.request_id,
        coalesce((elem ->> 'content_ordinality')::int, array_ordinality::int)
    ),
    matched_events AS MATERIALIZED (
      SELECT
        u.*,
        fr.tool_use_id IS NOT NULL AS has_result,
        coalesce(fr.is_error, false) AS is_error,
        coalesce(fr.status, 'unknown') AS result_status
      FROM tool_uses u
      LEFT JOIN first_results fr ON fr.tool_use_id = u.tool_use_id
    ),
    -- Platform is the request sender, not necessarily the host that executes a
    -- tool. Explicit SDK metadata wins; Codex-style user-agent data is only a
    -- fallback. Unknown platform strings stay unknown rather than being
    -- guessed as Linux. A missing client label denotes historical Anthropic
    -- traffic; only that client family carries an explicit is_error signal.
    session_dimensions AS MATERIALIZED (
      SELECT
        s.id AS session_id,
        ${normalizedSessionOsSql()} AS os,
        coalesce(nullif(lower(s.metadata ->> 'client'), ''), 'anthropic') AS client
      FROM sessions s
      JOIN (
        SELECT DISTINCT session_id
        FROM matched_events
      ) tool_sessions ON tool_sessions.session_id = s.id
      LEFT JOIN LATERAL (
        SELECT regexp_match(s.metadata ->> 'userAgent', ${UA_PLATFORM_PATTERN}) AS m
      ) ua ON true
    ),
    tool_counts AS (
      SELECT tool_name, count(*)::int AS count
      FROM tool_uses
      GROUP BY tool_name
    ),
    sequenced_tool_uses AS MATERIALIZED (
      SELECT
        tool_name AS from_tool,
        lead(tool_name) OVER (
          PARTITION BY session_id
          ORDER BY timestamp, request_id, ordinality
        ) AS to_tool
      FROM tool_uses
    ),
    transition_counts AS (
      SELECT from_tool, to_tool, count(*)::int AS count
      FROM sequenced_tool_uses
      WHERE to_tool IS NOT NULL
      GROUP BY from_tool, to_tool
    ),
    session_tool_stats AS (
      SELECT
        count(*)::int AS total_tools,
        count(DISTINCT tool_name)::int AS unique_tools
      FROM tool_uses
      GROUP BY session_id
    ),
    tool_error_rates AS (
      SELECT
        me.tool_name,
        count(*)::int AS total_calls,
        count(*) FILTER (WHERE me.has_result)::int AS matched_results,
        count(*) FILTER (WHERE me.has_result AND NOT me.is_error)::int AS successes,
        count(*) FILTER (WHERE me.has_result AND me.is_error)::int AS errors,
        count(*) FILTER (WHERE NOT me.has_result)::int AS unknown,
        CASE
          WHEN count(*) FILTER (WHERE me.has_result) > 0
            THEN (
              count(*) FILTER (WHERE me.has_result AND me.is_error)
            )::float8 / count(*) FILTER (WHERE me.has_result)
          ELSE NULL
        END AS error_rate
      FROM matched_events me
      JOIN session_dimensions sd ON sd.session_id = me.session_id
      WHERE sd.client = 'anthropic'
      GROUP BY me.tool_name
    ),
    tool_error_rates_by_os AS (
      SELECT
        coalesce(sd.os, 'Unknown') AS os,
        count(*)::int AS all_calls,
        count(*) FILTER (WHERE me.has_result)::int AS all_matched_results,
        count(*) FILTER (WHERE sd.client = 'anthropic')::int AS comparable_calls,
        count(*) FILTER (WHERE sd.client = 'anthropic' AND me.has_result)::int
          AS matched_results,
        count(*) FILTER (
          WHERE sd.client = 'anthropic' AND me.has_result AND NOT me.is_error
        )::int AS successes,
        count(*) FILTER (
          WHERE sd.client = 'anthropic' AND me.has_result AND me.is_error
        )::int AS errors,
        count(*) FILTER (
          WHERE sd.client = 'anthropic' AND NOT me.has_result
        )::int AS unknown,
        CASE
          WHEN count(*) FILTER (WHERE sd.client = 'anthropic' AND me.has_result) > 0
            THEN count(*) FILTER (
              WHERE sd.client = 'anthropic' AND me.has_result AND me.is_error
            )::float8 / count(*) FILTER (
              WHERE sd.client = 'anthropic' AND me.has_result
            )
          ELSE NULL
        END AS error_rate
      FROM matched_events me
      JOIN session_dimensions sd ON sd.session_id = me.session_id
      GROUP BY coalesce(sd.os, 'Unknown')
    ),
    os_provider_counts AS (
      SELECT
        coalesce(sd.os, 'Unknown') AS os,
        sd.client,
        count(*)::int AS total_calls,
        count(*) FILTER (WHERE me.has_result)::int AS matched_results
      FROM matched_events me
      JOIN session_dimensions sd ON sd.session_id = me.session_id
      GROUP BY coalesce(sd.os, 'Unknown'), sd.client
    ),
    session_edits AS MATERIALIZED (
      SELECT
        su.session_id,
        min(me.timestamp) FILTER (
          WHERE me.tool_name IN ('Edit', 'MultiEdit', 'Write', 'NotebookEdit')
        ) AS first_edit_at
      FROM session_universe su
      LEFT JOIN matched_events me ON me.session_id = su.session_id
      GROUP BY su.session_id
    ),
    verification_events AS MATERIALIZED (
      SELECT
        me.session_id,
        me.request_id,
        me.timestamp,
        me.ordinality,
        me.verification_kind,
        me.result_status
      FROM matched_events me
      WHERE me.verification_kind IN ('test', 'typecheck', 'lint', 'build')
    ),
    post_edit_verifications AS MATERIALIZED (
      SELECT ve.*
      FROM verification_events ve
      JOIN session_edits se ON se.session_id = ve.session_id
      WHERE se.first_edit_at IS NOT NULL
        AND ve.timestamp >= se.first_edit_at
    ),
    session_verification_rollup AS (
      SELECT
        se.session_id,
        se.first_edit_at,
        count(pev.session_id)::int AS post_edit_attempts,
        count(pev.session_id) FILTER (
          WHERE pev.result_status IN ('pass', 'fail')
        )::int AS known_attempts,
        (
          array_agg(
            pev.result_status
            ORDER BY pev.timestamp DESC, pev.request_id DESC, pev.ordinality DESC
          ) FILTER (WHERE pev.result_status IN ('pass', 'fail'))
        )[1] AS final_known_status,
        coalesce(
          bool_or(pev.result_status = 'fail') FILTER (
            WHERE pev.result_status IN ('pass', 'fail')
          ),
          false
        ) AS had_failure
      FROM session_edits se
      LEFT JOIN post_edit_verifications pev ON pev.session_id = se.session_id
      GROUP BY se.session_id, se.first_edit_at
    ),
    session_outcomes AS MATERIALIZED (
      SELECT
        session_id,
        CASE
          WHEN first_edit_at IS NULL THEN 'no_edit'
          WHEN post_edit_attempts = 0 THEN 'edited_unverified'
          WHEN known_attempts = 0 THEN 'ambiguous'
          WHEN final_known_status = 'fail' THEN 'fail_unrecovered'
          WHEN had_failure THEN 'fail_recovered'
          ELSE 'verified_pass'
        END AS outcome
      FROM session_verification_rollup
    ),
    verification_by_kind AS (
      SELECT
        ve.verification_kind AS kind,
        count(*)::int AS attempts,
        count(*) FILTER (
          WHERE se.first_edit_at IS NOT NULL AND ve.timestamp >= se.first_edit_at
        )::int AS after_edit_attempts,
        count(*) FILTER (WHERE ve.result_status = 'pass')::int AS passes,
        count(*) FILTER (WHERE ve.result_status = 'fail')::int AS failures,
        count(*) FILTER (
          WHERE ve.result_status NOT IN ('pass', 'fail')
        )::int AS unknown,
        CASE
          WHEN count(*) FILTER (WHERE ve.result_status IN ('pass', 'fail')) > 0
            THEN count(*) FILTER (WHERE ve.result_status = 'pass')::float8
              / count(*) FILTER (WHERE ve.result_status IN ('pass', 'fail'))
          ELSE NULL
        END AS pass_rate,
        CASE
          WHEN count(*) FILTER (WHERE ve.result_status IN ('pass', 'fail')) > 0
            THEN count(*) FILTER (WHERE ve.result_status = 'fail')::float8
              / count(*) FILTER (WHERE ve.result_status IN ('pass', 'fail'))
          ELSE NULL
        END AS failure_rate
      FROM verification_events ve
      JOIN session_edits se ON se.session_id = ve.session_id
      GROUP BY ve.verification_kind
    ),
    verification_summary AS (
      SELECT
        count(*)::int AS sessions_analyzed,
        count(*) FILTER (WHERE outcome <> 'no_edit')::int AS edited_sessions,
        count(*) FILTER (WHERE outcome = 'no_edit')::int AS no_edit_sessions,
        count(*) FILTER (
          WHERE outcome IN ('verified_pass', 'fail_recovered', 'fail_unrecovered', 'ambiguous')
        )::int AS verified_edited_sessions,
        count(*) FILTER (WHERE outcome = 'edited_unverified')::int AS unverified_edited_sessions,
        count(*) FILTER (WHERE outcome = 'verified_pass')::int AS verified_pass_sessions,
        count(*) FILTER (WHERE outcome = 'fail_recovered')::int AS fail_recovered_sessions,
        count(*) FILTER (WHERE outcome = 'fail_unrecovered')::int AS fail_unrecovered_sessions,
        count(*) FILTER (WHERE outcome = 'ambiguous')::int AS ambiguous_sessions,
        (SELECT count(*)::int FROM verification_events) AS verification_attempts,
        (SELECT count(*)::int FROM post_edit_verifications) AS verification_attempts_after_edit,
        (
          SELECT count(*) FILTER (WHERE result_status = 'pass')::int
          FROM verification_events
        ) AS verification_passes,
        (
          SELECT count(*) FILTER (WHERE result_status = 'fail')::int
          FROM verification_events
        ) AS verification_failures,
        (
          SELECT count(*) FILTER (WHERE result_status NOT IN ('pass', 'fail'))::int
          FROM verification_events
        ) AS verification_unknown
      FROM session_outcomes
    ),
    outcome_order(outcome, sort_order) AS (
      VALUES
        ('verified_pass', 1),
        ('fail_recovered', 2),
        ('fail_unrecovered', 3),
        ('edited_unverified', 4),
        ('ambiguous', 5),
        ('no_edit', 6)
    ),
    outcome_counts AS (
      SELECT outcome, count(*)::int AS count
      FROM session_outcomes
      GROUP BY outcome
    )
    SELECT
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('tool_name', tc.tool_name, 'count', tc.count)
          ORDER BY tc.count DESC
        )
        FROM tool_counts tc
      ), '[]'::jsonb) AS tool_counts,
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'from_tool', tc.from_tool,
            'to_tool', tc.to_tool,
            'count', tc.count
          )
          ORDER BY tc.count DESC
        )
        FROM transition_counts tc
      ), '[]'::jsonb) AS transitions,
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'total_tools', sts.total_tools,
            'unique_tools', sts.unique_tools
          )
        )
        FROM session_tool_stats sts
      ), '[]'::jsonb) AS session_tool_stats,
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'tool_name', ter.tool_name,
            'total_calls', ter.total_calls,
            'matched_results', ter.matched_results,
            'successes', ter.successes,
            'errors', ter.errors,
            'unknown', ter.unknown,
            'error_rate', ter.error_rate
          )
          ORDER BY
            ter.errors DESC,
            ter.error_rate DESC NULLS LAST,
            ter.total_calls DESC,
            ter.tool_name
        )
        FROM tool_error_rates ter
      ), '[]'::jsonb) AS tool_error_rates,
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'os', oer.os,
            'all_calls', oer.all_calls,
            'all_matched_results', oer.all_matched_results,
            'comparable_calls', oer.comparable_calls,
            'matched_results', oer.matched_results,
            'successes', oer.successes,
            'errors', oer.errors,
            'unknown', oer.unknown,
            'error_rate', oer.error_rate,
            'providers', coalesce((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'client', opc.client,
                  'total_calls', opc.total_calls,
                  'matched_results', opc.matched_results,
                  'supports_explicit_errors', opc.client = 'anthropic'
                )
                ORDER BY opc.total_calls DESC, opc.client
              )
              FROM os_provider_counts opc
              WHERE opc.os = oer.os
            ), '[]'::jsonb)
          )
          ORDER BY oer.os
        )
        FROM tool_error_rates_by_os oer
      ), '[]'::jsonb) AS tool_error_rates_by_os,
      (SELECT to_jsonb(vs) FROM verification_summary vs) AS verification_summary,
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'kind', vbk.kind,
            'attempts', vbk.attempts,
            'after_edit_attempts', vbk.after_edit_attempts,
            'passes', vbk.passes,
            'failures', vbk.failures,
            'unknown', vbk.unknown,
            'pass_rate', vbk.pass_rate,
            'failure_rate', vbk.failure_rate
          )
          ORDER BY array_position(
            ARRAY['test', 'typecheck', 'lint', 'build'],
            vbk.kind
          )
        )
        FROM verification_by_kind vbk
      ), '[]'::jsonb) AS verification_by_kind,
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'outcome', oo.outcome,
            'count', coalesce(oc.count, 0)
          )
          ORDER BY oo.sort_order
        )
        FROM outcome_order oo
        LEFT JOIN outcome_counts oc ON oc.outcome = oo.outcome
      ), '[]'::jsonb) AS session_outcome_counts
  `.execute(db);

  const row = result.rows[0];
  if (!row) throw new Error('tool analytics query returned no row');
  return {
    toolCounts: row.tool_counts,
    transitions: row.transitions,
    sessionToolStats: row.session_tool_stats,
    toolErrorRates: row.tool_error_rates,
    toolErrorRatesByOs: row.tool_error_rates_by_os,
    verificationSummary: row.verification_summary,
    verificationByKind: row.verification_by_kind,
    sessionOutcomeCounts: row.session_outcome_counts,
  };
}

export function getToolAnalytics(
  visibleClientIds: string[] | null = null,
  dbOverride?: Kysely<Database>,
  traceVersion: number | null = null,
  sessionIds: readonly string[] | null = null,
) {
  const db = dbOverride ?? getDb();
  return getToolAnalyticsFromDb(visibleClientIds, db, traceVersion, sessionIds);
}

export async function getToolSequences(
  visibleClientIds: string[] | null = null,
  dbOverride?: Kysely<Database>,
  traceVersion: number | null = null,
  sessionIds: readonly string[] | null = null,
) {
  const db = dbOverride ?? getDb();
  const result = await sql<{
    tool_sequence: string[] | string;
  }>`
    WITH tool_events AS (
      SELECT
        requests.session_id AS session_id,
        requests.id AS request_id,
        requests.timestamp AS ts,
        (elem ->> 'ordinality')::int AS ord,
        (elem ->> 'name') AS tool_name
      FROM requests
        ${requestStatsJoin('requests.id', sessionIds)},
        jsonb_array_elements(rs.tool_uses) AS elem
      WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
        AND ${sessionIdFilter(sessionIds, 'requests.session_id')}
        AND rs.tool_uses <> '[]'::jsonb
    )
    SELECT
      array_agg(tool_name ORDER BY ts, request_id, ord) AS tool_sequence
    FROM tool_events
    GROUP BY session_id
    HAVING count(*) >= 3
  `.execute(db);
  return result.rows.map((r) => {
    const seq = r.tool_sequence;
    // Neon returns Postgres arrays as JS arrays, but handle string fallback
    const toolSequence: string[] = Array.isArray(seq)
      ? seq
      : typeof seq === 'string'
        ? seq.replaceAll(/^\{|\}$/gu, '').split(',')
        : [];
    return { toolSequence };
  });
}

// ── Tool wall-time distributions ──

// Upper edges (ms) of the log-ish histogram bins. width_bucket() maps a gap
// into 0..TIMING_BIN_EDGES_MS.length; the UI labels must stay in sync
// (TIMING_BIN_LABELS on the tool-analytics page).
export const TIMING_BIN_EDGES_MS = [
  500, 1000, 2000, 5000, 10_000, 30_000, 60_000, 120_000, 300_000,
] as const;

// Gaps longer than this are treated as the user walking away (permission
// prompts, abandoned sessions), not tool execution.
const TIMING_IDLE_CUTOFF_MS = 30 * 60 * 1000;

export interface ToolTimingStat {
  tool_name: string;
  samples: number;
  mean_ms: number;
  p25_ms: number;
  p50_ms: number;
  p75_ms: number;
  p90_ms: number;
  p99_ms: number;
}

export interface OsToolTimingStat {
  os: string;
  tool_name: string;
  samples: number;
  sessions: number;
  p50_ms: number;
  p90_ms: number;
}

export interface PlatformToolTimingStat extends OsToolTimingStat {
  arch: string;
}

export interface ToolTimings {
  coverage: {
    tool_turns: number;
    single_tool_turns: number;
    batch_turns: number;
  };
  per_tool: ToolTimingStat[];
  histogram: { tool_name: string; bin: number; count: number }[];
  bash_by_kind: (Omit<ToolTimingStat, 'tool_name'> & { kind: string })[];
  bash_kind_counts: { kind: string; count: number }[];
  bash_by_binary: (Omit<ToolTimingStat, 'tool_name'> & { binary: string })[];
  bash_binary_counts: { binary: string; count: number }[];
  bash_binary_total: number;
  by_os: {
    per_tool: OsToolTimingStat[];
    per_platform: PlatformToolTimingStat[];
    /** Log-spaced bins, 8 per decade: bin b covers gaps around 10^(b/8) ms. */
    fine_histogram: { os: string; arch: string; tool_name: string; bin: number; count: number }[];
  };
}

interface ToolTimingsSqlRow {
  coverage: ToolTimings['coverage'];
  per_tool: ToolTimings['per_tool'];
  histogram: ToolTimings['histogram'];
  bash_by_kind: ToolTimings['bash_by_kind'];
  bash_kind_counts: ToolTimings['bash_kind_counts'];
  bash_by_binary: ToolTimings['bash_by_binary'];
  bash_binary_counts: ToolTimings['bash_binary_counts'];
  bash_binary_total: ToolTimings['bash_binary_total'];
  by_os: ToolTimings['by_os'];
}

/**
 * Wall-time a tool took, derived from the client-side gap between turns: the
 * proxy never sees tool execution, but within one session lane (main loop or
 * a single subagent) the time between a tool_use response ending
 * (timestamp + duration_ms) and the next request arriving is exactly the
 * client-side spend — tool execution plus harness overhead. Turns with one
 * tool_use attribute the gap cleanly to that tool; turns with several are
 * lumped under '(parallel batch)'. The next request must actually carry the
 * matching tool_result so gaps into fresh user prompts don't count.
 */
export async function getToolTimings(
  visibleClientIds: string[] | null = null,
  dbOverride?: Kysely<Database>,
  traceVersion: number | null = null,
  sessionIds: readonly string[] | null = null,
): Promise<ToolTimings> {
  const db = dbOverride ?? getDb();
  const binEdges = sql.raw(`ARRAY[${TIMING_BIN_EDGES_MS.join(', ')}]::float8[]`);
  const percentiles = sql.raw(`ARRAY[0.25, 0.5, 0.75, 0.9, 0.99]::float8[]`);

  // One statement materializes the expensive lane ordering and bounded gap
  // set once. Previously five independent statements rebuilt the same window
  // sort, while two more scans separately expanded Bash tool uses.
  const result = await sql<ToolTimingsSqlRow>`
    WITH
    base_turn AS MATERIALIZED (
      SELECT
        r.id,
        r.session_id,
        coalesce(r.subagent_label, '') AS lane,
        r.timestamp AS ts,
        r.duration_ms,
        rs.tool_uses,
        rs.tool_results,
        jsonb_array_length(rs.tool_uses) AS n_tools,
        rs.tool_uses -> 0 ->> 'id' AS first_tool_use_id,
        coalesce(rs.tool_uses -> 0 ->> 'name', 'unknown') AS first_tool_name,
        coalesce(rs.tool_uses -> 0 ->> 'verification_kind', 'other') AS first_bash_kind,
        coalesce(rs.tool_uses -> 0 ->> 'command_binary', '(unknown)') AS first_bash_binary
      FROM requests r
      ${requestStatsJoin('r.id', sessionIds)}
      WHERE ${requestsVisFilter(visibleClientIds, 'r', traceVersion)}
        AND ${sessionIdFilter(sessionIds, 'r.session_id')}
    ),
    turn AS MATERIALIZED (
      SELECT
        base_turn.*,
        lead(ts) OVER w AS next_ts,
        lead(tool_results) OVER w AS next_tool_results
      FROM base_turn
      WINDOW w AS (
        PARTITION BY session_id, lane
        ORDER BY ts, id
      )
    ),
    gap AS MATERIALIZED (
      SELECT
        session_id,
        CASE WHEN n_tools = 1 THEN first_tool_name ELSE '(parallel batch)' END AS tool_name,
        CASE WHEN n_tools = 1 AND first_tool_name = 'Bash' THEN first_bash_kind END AS bash_kind,
        CASE WHEN n_tools = 1 AND first_tool_name = 'Bash' THEN first_bash_binary END AS bash_binary,
        extract(epoch FROM (next_ts - ts)) * 1000 - duration_ms AS gap_ms
      FROM turn
      WHERE n_tools >= 1
        AND duration_ms IS NOT NULL
        AND first_tool_use_id IS NOT NULL
        AND next_tool_results @> jsonb_build_array(
          jsonb_build_object('tool_use_id', first_tool_use_id)
        )
    ),
    bounded AS MATERIALIZED (
      SELECT *
      FROM gap
      WHERE gap_ms >= 0 AND gap_ms < ${TIMING_IDLE_CUTOFF_MS}
    ),
    -- One row per Bash tool_use (kind counts stay per-invocation); binaries
    -- carries every command-position binary of a compound command, falling
    -- back to the single legacy command_binary when the array is absent.
    bash_events AS MATERIALIZED (
      SELECT
        coalesce(elem ->> 'verification_kind', 'other') AS kind,
        CASE
          WHEN jsonb_typeof(elem -> 'command_binaries') = 'array'
            THEN elem -> 'command_binaries'
          ELSE jsonb_build_array(coalesce(elem ->> 'command_binary', '(unknown)'))
        END || CASE
          WHEN jsonb_typeof(elem -> 'additional_binaries') = 'array'
            THEN elem -> 'additional_binaries'
          ELSE '[]'::jsonb
        END AS binaries
      FROM base_turn
      CROSS JOIN LATERAL jsonb_array_elements(tool_uses) AS elem
      WHERE elem ->> 'name' = 'Bash'
    ),
    per_tool_raw AS (
      SELECT
        tool_name,
        count(*)::int AS samples,
        avg(gap_ms)::float8 AS mean_ms,
        percentile_cont(${percentiles}) WITHIN GROUP (ORDER BY gap_ms) AS pct
      FROM bounded
      GROUP BY tool_name
    ),
    per_tool AS (
      SELECT
        tool_name,
        samples,
        mean_ms,
        pct[1]::float8 AS p25_ms,
        pct[2]::float8 AS p50_ms,
        pct[3]::float8 AS p75_ms,
        pct[4]::float8 AS p90_ms,
        pct[5]::float8 AS p99_ms
      FROM per_tool_raw
    ),
    histogram AS (
      SELECT
        tool_name,
        width_bucket(gap_ms, ${binEdges}) AS bin,
        count(*)::int AS count
      FROM bounded
      GROUP BY tool_name, bin
    ),
    bash_kind_raw AS (
      SELECT
        bash_kind AS kind,
        count(*)::int AS samples,
        avg(gap_ms)::float8 AS mean_ms,
        percentile_cont(${percentiles}) WITHIN GROUP (ORDER BY gap_ms) AS pct
      FROM bounded
      WHERE bash_kind IS NOT NULL
      GROUP BY bash_kind
    ),
    bash_by_kind AS (
      SELECT
        kind,
        samples,
        mean_ms,
        pct[1]::float8 AS p25_ms,
        pct[2]::float8 AS p50_ms,
        pct[3]::float8 AS p75_ms,
        pct[4]::float8 AS p90_ms,
        pct[5]::float8 AS p99_ms
      FROM bash_kind_raw
    ),
    -- One row per binary invocation site (a compound command counts once
    -- per occurrence).
    bash_binary_counts AS MATERIALIZED (
      SELECT b.command_binary, count(*)::int AS count
      FROM bash_events
      CROSS JOIN LATERAL jsonb_array_elements_text(binaries) AS b(command_binary)
      GROUP BY b.command_binary
    ),
    bash_binary_raw AS (
      SELECT
        bounded.bash_binary AS command_binary,
        count(*)::int AS samples,
        avg(gap_ms)::float8 AS mean_ms,
        percentile_cont(${percentiles}) WITHIN GROUP (ORDER BY gap_ms) AS pct
      FROM bounded
      WHERE bounded.bash_binary IS NOT NULL
      GROUP BY bounded.bash_binary
    ),
    bash_by_binary AS (
      SELECT
        command_binary,
        samples,
        mean_ms,
        pct[1]::float8 AS p25_ms,
        pct[2]::float8 AS p50_ms,
        pct[3]::float8 AS p75_ms,
        pct[4]::float8 AS p90_ms,
        pct[5]::float8 AS p99_ms
      FROM bash_binary_raw
    ),
    bash_kind_counts AS (
      SELECT kind, count(*)::int AS count
      FROM bash_events
      GROUP BY kind
    ),
    -- Session OS/arch come from client metadata captured at ingest
    -- (x-stainless-os / x-stainless-arch for Anthropic SDK clients). Codex
    -- clients send no stainless headers but embed platform in their
    -- user-agent — "codex-tui/0.55.0 (Mac OS 26.1.0; arm64) …" — so the
    -- first "(<os>; <arch>)" group backfills them, historical sessions
    -- included. Unrecognized OS values remain unknown and drop out of the
    -- turnaround comparison rather than being guessed as Linux.
    -- Arch spellings are normalized (x86_64/amd64/Bun's other:amd64 → x64,
    -- aarch64 → arm64).
    session_os AS MATERIALIZED (
      SELECT platform.session_id, platform.os, platform.arch
      FROM (
        SELECT
          s.id AS session_id,
          ${normalizedSessionOsSql()} AS os,
          CASE
            WHEN coalesce(s.metadata ->> 'arch', ua.m[2])
              IN ('x64', 'x86_64', 'amd64', 'other:amd64') THEN 'x64'
            WHEN coalesce(s.metadata ->> 'arch', ua.m[2]) IN ('arm64', 'aarch64') THEN 'arm64'
            ELSE coalesce(s.metadata ->> 'arch', ua.m[2], 'unknown')
          END AS arch
        FROM sessions s
        LEFT JOIN LATERAL (
          SELECT regexp_match(s.metadata ->> 'userAgent', ${UA_PLATFORM_PATTERN}) AS m
        ) ua ON true
      ) platform
      WHERE platform.os IS NOT NULL
    ),
    os_bounded AS MATERIALIZED (
      SELECT so.os, so.arch, bounded.tool_name, bounded.session_id, bounded.gap_ms
      FROM bounded
      JOIN session_os so ON so.session_id = bounded.session_id
      WHERE bounded.tool_name <> '(parallel batch)'
    ),
    os_tools AS (
      SELECT tool_name
      FROM os_bounded
      GROUP BY tool_name
      ORDER BY count(*) DESC
      LIMIT 8
    ),
    os_per_tool_raw AS (
      SELECT
        ob.os,
        ob.tool_name,
        count(*)::int AS samples,
        count(DISTINCT ob.session_id)::int AS sessions,
        percentile_cont(ARRAY[0.5, 0.9]::float8[]) WITHIN GROUP (ORDER BY ob.gap_ms) AS pct
      FROM os_bounded ob
      JOIN os_tools ot ON ot.tool_name = ob.tool_name
      GROUP BY ob.os, ob.tool_name
      HAVING count(*) >= 200
    ),
    os_per_tool AS (
      SELECT os, tool_name, samples, sessions, pct[1]::float8 AS p50_ms, pct[2]::float8 AS p90_ms
      FROM os_per_tool_raw
    ),
    -- Same stats one level finer: per (os, arch, tool). Small platforms
    -- (e.g. Linux/arm64 on rare tools) fall under the sample floor and are
    -- simply absent — the UI only renders platform series present here.
    os_arch_per_tool_raw AS (
      SELECT
        ob.os,
        ob.arch,
        ob.tool_name,
        count(*)::int AS samples,
        count(DISTINCT ob.session_id)::int AS sessions,
        percentile_cont(ARRAY[0.5, 0.9]::float8[]) WITHIN GROUP (ORDER BY ob.gap_ms) AS pct
      FROM os_bounded ob
      JOIN os_tools ot ON ot.tool_name = ob.tool_name
      GROUP BY ob.os, ob.arch, ob.tool_name
      HAVING count(*) >= 200
    ),
    os_arch_per_tool AS (
      SELECT
        os, arch, tool_name, samples, sessions,
        pct[1]::float8 AS p50_ms, pct[2]::float8 AS p90_ms
      FROM os_arch_per_tool_raw
    ),
    -- Fine log-spaced bins (8 per decade: ms = 10^(bin/8)) — coarse enough to
    -- cache, fine enough to show distribution shape (the 10-edge histogram
    -- above hides multimodality). Keyed by (os, arch); the OS-level curve is
    -- the exact sum across arch. Keep in sync with FINE_BINS_PER_DECADE on
    -- the tool-analytics page.
    os_fine_histogram AS (
      SELECT
        ob.os,
        ob.arch,
        ob.tool_name,
        floor(log(greatest(ob.gap_ms, 1)) * 8)::int AS bin,
        count(*)::int AS count
      FROM os_bounded ob
      JOIN os_per_tool opt ON opt.os = ob.os AND opt.tool_name = ob.tool_name
      GROUP BY 1, 2, 3, 4
    )
    SELECT
      jsonb_build_object(
        'tool_turns', count(*) FILTER (WHERE n_tools >= 1)::int,
        'single_tool_turns', count(*) FILTER (WHERE n_tools = 1)::int,
        'batch_turns', count(*) FILTER (WHERE n_tools > 1)::int
      ) AS coverage,
      coalesce((
        SELECT jsonb_agg(to_jsonb(pt) ORDER BY pt.samples DESC)
        FROM per_tool pt
      ), '[]'::jsonb) AS per_tool,
      coalesce((
        SELECT jsonb_agg(to_jsonb(h) ORDER BY h.tool_name, h.bin)
        FROM histogram h
      ), '[]'::jsonb) AS histogram,
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'kind', bk.kind,
            'samples', bk.samples,
            'mean_ms', bk.mean_ms,
            'p25_ms', bk.p25_ms,
            'p50_ms', bk.p50_ms,
            'p75_ms', bk.p75_ms,
            'p90_ms', bk.p90_ms,
            'p99_ms', bk.p99_ms
          ) ORDER BY bk.samples DESC
        )
        FROM bash_by_kind bk
      ), '[]'::jsonb) AS bash_by_kind,
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('kind', bkc.kind, 'count', bkc.count)
          ORDER BY bkc.count DESC
        )
        FROM bash_kind_counts bkc
      ), '[]'::jsonb) AS bash_kind_counts,
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'binary', bb.command_binary,
            'samples', bb.samples,
            'mean_ms', bb.mean_ms,
            'p25_ms', bb.p25_ms,
            'p50_ms', bb.p50_ms,
            'p75_ms', bb.p75_ms,
            'p90_ms', bb.p90_ms,
            'p99_ms', bb.p99_ms
          ) ORDER BY bb.samples DESC, bb.command_binary
        )
        FROM bash_by_binary bb
      ), '[]'::jsonb) AS bash_by_binary,
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object('binary', bbc.command_binary, 'count', bbc.count)
          ORDER BY bbc.count DESC, bbc.command_binary
        )
        FROM bash_binary_counts bbc
      ), '[]'::jsonb) AS bash_binary_counts,
      coalesce((
        SELECT sum(bbc.count)::float8
        FROM bash_binary_counts bbc
      ), 0::float8) AS bash_binary_total,
      jsonb_build_object(
        'per_tool', coalesce((
          SELECT jsonb_agg(to_jsonb(o) ORDER BY o.samples DESC)
          FROM os_per_tool o
        ), '[]'::jsonb),
        'per_platform', coalesce((
          SELECT jsonb_agg(to_jsonb(p) ORDER BY p.samples DESC)
          FROM os_arch_per_tool p
        ), '[]'::jsonb),
        'fine_histogram', coalesce((
          SELECT jsonb_agg(to_jsonb(h) ORDER BY h.tool_name, h.os, h.arch, h.bin)
          FROM os_fine_histogram h
        ), '[]'::jsonb)
      ) AS by_os
    FROM turn
  `.execute(db);

  const row = result.rows[0];
  if (!row) throw new Error('tool timings query returned no row');
  // Old anon rows cannot be re-extracted because their raw command was
  // intentionally discarded. Apply the current ingestion precision gate to
  // aggregates as a final defense against legacy parser artifacts.
  row.bash_by_binary = row.bash_by_binary.filter(({ binary }) =>
    isPlausibleCommandBinaryName(binary),
  );
  row.bash_binary_counts = row.bash_binary_counts.filter(({ binary }) =>
    isPlausibleCommandBinaryName(binary),
  );
  row.bash_binary_total = row.bash_binary_counts.reduce((total, { count }) => total + count, 0);
  return row;
}

// ── User idle time + wall-clock composition ──

// A lane's wall clock splits three ways: the model generating (duration_ms),
// the client running tools (the gap the tool-timings query attributes), and
// the human reading/typing (the gap after a turn that ended WITHOUT a
// tool_use — nothing but a person can restart the lane there). This function
// computes all three from one lane sort so the graphs page can chart idle
// distribution and the composition over time.
//
// Blind spot worth labeling in the UI: a user message sent mid-turn arrives
// packaged with the next tool_result, so the assistant turn never ends and
// that wait is counted as tool time. Idle here is a floor, not the total.

export interface WallClockDay {
  day: string;
  agent: 'claude' | 'codex' | 'openai';
  llm_ms: number;
  tool_ms: number;
  idle_ms: number;
  requests: number;
}

export interface WallClockBreakdown {
  /** Bounded user-idle gaps, ms, one per assistant turn that ended. */
  idle_gaps_ms: number[];
  /** Idle gaps at/beyond the cutoff — excluded from `idle_gaps_ms` and sums. */
  walked_away: number;
  daily: WallClockDay[];
}

interface WallClockSqlRow {
  idle_gaps_ms: number[];
  walked_away: number;
  daily: WallClockDay[];
}

/**
 * Wall-clock split per lane: LLM time, tool/CPU time, and user idle time.
 *
 * The model selector is applied when classifying turns, NOT when building the
 * lane, so `lead()` still sees the real next request. Filtering the lane
 * itself would silently stretch gaps across the removed turns — the flaw in
 * the older session-only `gap_seconds` metric.
 */
export async function getWallClockBreakdown(
  visibleClientIds: string[] | null = null,
  model: string | null = null,
  traceVersion: number | null = null,
  dbOverride?: Kysely<Database>,
): Promise<WallClockBreakdown> {
  const db = dbOverride ?? getDb();
  const result = await sql<WallClockSqlRow>`
    WITH
    base AS MATERIALIZED (
      SELECT
        requests.id,
        requests.session_id,
        coalesce(requests.subagent_label, '') AS lane,
        requests.timestamp AS ts,
        requests.duration_ms,
        CASE sessions.metadata ->> 'client'
          WHEN 'codex' THEN 'codex'
          WHEN 'openai' THEN 'openai'
          ELSE 'claude'
        END AS agent,
        (${modelFilter(model)}) AS model_ok,
        -- A request with no stats row still orders the lane, but can never
        -- be read as "the assistant stopped" (see insertRequest: the stats
        -- insert is best-effort).
        rs.request_id IS NOT NULL AS has_stats,
        coalesce(jsonb_array_length(rs.tool_uses), 0) AS n_tools,
        rs.tool_uses -> 0 ->> 'id' AS first_tool_use_id,
        rs.tool_results
      FROM requests
      JOIN sessions ON sessions.id = requests.session_id
      LEFT JOIN request_stats rs ON rs.request_id = requests.id
      WHERE ${requestsVisFilter(visibleClientIds, 'requests', traceVersion)}
    ),
    turn AS MATERIALIZED (
      SELECT
        base.*,
        lead(ts) OVER w AS next_ts,
        lead(tool_results) OVER w AS next_tool_results
      FROM base
      WINDOW w AS (
        PARTITION BY session_id, lane
        ORDER BY ts, id
      )
    ),
    classified AS MATERIALIZED (
      SELECT
        date_trunc('day', ts AT TIME ZONE 'UTC') AS day,
        duration_ms,
        agent,
        extract(epoch FROM (next_ts - ts)) * 1000 - duration_ms AS gap_ms,
        has_stats AND n_tools = 0 AND next_ts IS NOT NULL AS is_idle,
        n_tools >= 1
          AND first_tool_use_id IS NOT NULL
          AND next_tool_results @> jsonb_build_array(
            jsonb_build_object('tool_use_id', first_tool_use_id)
          ) AS is_tool
      FROM turn
      WHERE model_ok AND duration_ms IS NOT NULL
    ),
    idle AS MATERIALIZED (
      SELECT gap_ms FROM classified WHERE is_idle AND gap_ms >= 0
    )
    SELECT
      coalesce((
        SELECT jsonb_agg(round(gap_ms)::int)
        FROM idle WHERE gap_ms < ${IDLE_GAP_CUTOFF_MS}
      ), '[]'::jsonb) AS idle_gaps_ms,
      (SELECT count(*)::int FROM idle WHERE gap_ms >= ${IDLE_GAP_CUTOFF_MS}) AS walked_away,
      coalesce((
        SELECT jsonb_agg(to_jsonb(d) ORDER BY d.day)
        FROM (
          SELECT
            to_char(day, 'YYYY-MM-DD') AS day,
            agent,
            coalesce(sum(duration_ms), 0)::float8 AS llm_ms,
            coalesce(sum(gap_ms) FILTER (
              WHERE is_tool AND gap_ms >= 0 AND gap_ms < ${TIMING_IDLE_CUTOFF_MS}
            ), 0)::float8 AS tool_ms,
            coalesce(sum(gap_ms) FILTER (
              WHERE is_idle AND gap_ms >= 0 AND gap_ms < ${IDLE_GAP_CUTOFF_MS}
            ), 0)::float8 AS idle_ms,
            count(*)::int AS requests
          FROM classified
          WHERE day >= date_trunc('day', ${NOW} AT TIME ZONE 'UTC')
                        - ((${WALL_CLOCK_DAILY_DAYS - 1}) || ' days')::interval
          GROUP BY day, agent
        ) d
      ), '[]'::jsonb) AS daily
    `.execute(db);

  // A single-row aggregate: an empty result means an empty (or unreachable)
  // corpus, which the cards render as "no data" rather than failing the whole
  // graphs payload this dataset shares a response with.
  const row = result.rows[0];
  if (!row) return { idle_gaps_ms: [], walked_away: 0, daily: [] };
  return {
    idle_gaps_ms: (row.idle_gaps_ms ?? []).map(Number),
    walked_away: Number(row.walked_away ?? 0),
    daily: (row.daily ?? []).map((d) => ({
      day: d.day,
      agent: d.agent,
      llm_ms: Number(d.llm_ms),
      tool_ms: Number(d.tool_ms),
      idle_ms: Number(d.idle_ms),
      requests: Number(d.requests),
    })),
  };
}

// ── Per-harness tool-analytics sample ──

/**
 * Request budget for a single-harness view of /tool-analytics. The cache only
 * holds the all-harness payload and the snapshot is read-only, so a harness
 * view runs the same queries live over whole sessions picked in md5(id)
 * order until the budget is reached (the session that crosses it is kept).
 * ~20k requests read in ~4 s cold; a full pass over a large harness takes
 * 30 s or more.
 */
export const HARNESS_TOOL_SAMPLE_REQUESTS = 20_000;

export interface HarnessToolSample {
  sessionIds: string[];
  sessions: number;
  totalSessions: number;
  requests: number;
  totalRequests: number;
}

export async function getHarnessToolSample(
  db: Kysely<Database>,
  harness: Harness,
): Promise<HarnessToolSample> {
  const result = await sql<{
    id: string;
    request_count: number;
    total_sessions: number;
    total_requests: number;
  }>`
    WITH ranked AS (
      SELECT
        sessions.id,
        ss.request_count,
        sum(ss.request_count) OVER (ORDER BY md5(sessions.id), sessions.id) AS cum,
        count(*) OVER () AS total_sessions,
        sum(ss.request_count) OVER () AS total_requests
      FROM sessions
      JOIN session_summary ss ON ss.session_id = sessions.id
      WHERE ${SESSION_HARNESS_SQL} = ${harness}
    )
    SELECT
      id,
      request_count::int AS request_count,
      total_sessions::int AS total_sessions,
      total_requests::float8 AS total_requests
    FROM ranked
    WHERE cum - request_count < ${HARNESS_TOOL_SAMPLE_REQUESTS}
  `.execute(db);
  const first = result.rows[0];
  return {
    sessionIds: result.rows.map((r) => r.id),
    sessions: result.rows.length,
    totalSessions: Number(first?.total_sessions ?? 0),
    requests: result.rows.reduce((n, r) => n + Number(r.request_count), 0),
    totalRequests: Number(first?.total_requests ?? 0),
  };
}

// ── Tool-analytics cache ──

// Bump when the payload shape changes so stale-shape cache rows are never
// served to a newer frontend.
const TOOL_ANALYTICS_CACHE_SCHEMA = 10;

export type ToolAnalyticsCacheKind = 'analytics' | 'sequences';

export function toolAnalyticsCacheKey(
  kind: ToolAnalyticsCacheKind,
  visibleClientIds: string[] | null,
  traceVersion: number | null,
): string {
  const scope = visibleClientIds === null ? 'all' : 'anon';
  return `ta:${TOOL_ANALYTICS_CACHE_SCHEMA}:${kind}:${scope}:${traceVersion ?? 'all'}`;
}

/**
 * `'missing-table'` means migration 028 hasn't been applied to this database
 * yet (e.g. a deployment whose code shipped before the migrate workflow ran).
 * Callers should surface that as a setup problem, not a cache miss — cache
 * writes would fail the same way, so scheduling a warm is pointless.
 */
export async function readToolAnalyticsCache(
  key: string,
  dbOverride?: Kysely<Database>,
): Promise<{ data: unknown; cachedAt: Date } | 'missing-table' | null> {
  const db = dbOverride ?? getDb();
  try {
    const row = await db
      .selectFrom('tool_analytics_cache')
      .select(['data', 'cached_at'])
      .where('key', '=', key)
      .executeTakeFirst();
    if (!row) return null;
    return { data: row.data, cachedAt: new Date(row.cached_at) };
  } catch (error) {
    // 42P01 = undefined_table; both pg and the Neon HTTP driver expose it
    // as `code` on the thrown error.
    if ((error as { code?: string }).code === '42P01') return 'missing-table';
    throw error;
  }
}

export interface ToolAnalyticsCacheEntry {
  key: string;
  data: unknown;
}

/**
 * Upsert cache entries in ONE multi-row statement. `now()` is
 * statement-stable in Postgres, so every row lands with the same
 * `cached_at` — callers that batch all hot combos here get a cache that
 * reads as a single synchronized snapshot regardless of which combo a
 * given user requests.
 */
export async function writeToolAnalyticsCacheEntries(
  _db: Kysely<Database>,
  _entries: ToolAnalyticsCacheEntry[],
): Promise<void> {
  // Read-only deployment: never write the cache. The main ProxyTrace
  // deployment's crons keep tool_analytics_cache fresh.
}

/**
 * Compute one combo's payload without writing it. Callers must pass a
 * pooled-pg `db` (createDirectDb) — the full-history analytics use
 * MATERIALIZED CTEs that may spill to disk and are not suitable for the Neon
 * HTTP driver's request/response model.
 */
export async function computeToolAnalyticsCacheEntry(
  db: Kysely<Database>,
  kind: ToolAnalyticsCacheKind,
  visibleClientIds: string[] | null,
  traceVersion: number | null,
): Promise<ToolAnalyticsCacheEntry> {
  const key = toolAnalyticsCacheKey(kind, visibleClientIds, traceVersion);
  if (kind === 'analytics') {
    // These are both full-history scans. Running them sequentially avoids
    // competing window sorts and keeps peak database/function memory bounded.
    const analytics = await getToolAnalytics(visibleClientIds, db, traceVersion);
    const toolTimings = await getToolTimings(visibleClientIds, db, traceVersion);
    return { key, data: { ...analytics, toolTimings } };
  }
  const sequences = await getToolSequences(visibleClientIds, db, traceVersion);
  const insights = analyzeToolSequences(sequences.map((s) => s.toolSequence));
  return { key, data: insights };
}
