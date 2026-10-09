import type { Generated } from 'kysely';
import type { AltHash, PrivacyMode } from './shared/trace';

// ── Core tables ──

export interface ClientsTable {
  id: Generated<string>;
  api_key_hash: string;
  first_seen: Generated<Date>;
  last_seen: Generated<Date>;
  metadata: Record<string, unknown> | null;
}

export interface SessionsTable {
  id: string;
  client_id: string;
  started_at: Generated<Date>;
  last_active_at: Generated<Date>;
  metadata: SessionMetadata | null;
  // Locked at first insert. ON CONFLICT DO UPDATE in upsertSession does not
  // touch this column, so subsequent ingests read back the original mode.
  privacy_mode: PrivacyMode;
}

export interface SessionMetadata {
  userAgent?: string;
  cliVersion?: string;
  os?: string;
  arch?: string;
  nodeVersion?: string;
  /**
   * Client-kind label contributed by the provider (e.g. 'openai').
   * Absent for old Anthropic rows; presence distinguishes non-Anthropic traffic
   * in the UI without parsing user-agent strings.
   */
  client?: string;
}

export interface RequestsTable {
  id: Generated<string>;
  // Proxy-stamped idempotency key, reused across upload retries. Unique index
  // dedups retried uploads at ingest. NULL for legacy/third-party rows.
  trace_id: string | null;
  session_id: string;
  client_id: string;
  timestamp: Generated<Date>;
  method: string;
  endpoint: string;
  model: string | null;
  request_headers: Record<string, string> | null;
  request_body: unknown;
  response_status_code: number | null;
  response_headers: Record<string, string[]> | null;
  response_body: unknown;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_write_tokens: number | null;
  cache_read_input_tokens: number | null;
  duration_ms: number | null;
  ttft_ms: number | null;
  tpot_ms: number | null;
  sse_chunk_count: number | null;
  is_streaming: Generated<boolean | null>;
  is_fast_mode: Generated<boolean | null>;
  privacy_mode: Generated<PrivacyMode>;
  // Version of the trace-production pipeline that wrote this row. Bumped when
  // the proxy's anonymization/hashing/body-capture changes in a way that makes
  // older rows incomparable. See CURRENT_TRACE_VERSION in ./shared/trace.
  trace_version: Generated<number>;
  hash_ids: string[] | null;
  hash_token_count: number | null;
  // Additional tokenizations of the prompt (raw hashed chains under non-primary
  // tokenizers). Null on rows written before this column / by older proxies.
  alt_hashes: AltHash[] | null;
  cost_usd: number | null;
  web_search_count: Generated<number>;
  subagent_label: string | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
}

// ── RBAC tables ──

export type DashboardRole = 'admin' | 'user';
export type DashboardUserStatus = 'pending' | 'approved' | 'rejected' | 'banned';

export interface UsersTable {
  id: Generated<string>;
  clerk_id: string | null;
  email: string;
  name: string | null;
  image: string | null;
  api_key_hash: string | null;
  role: Generated<DashboardRole>;
  status: Generated<DashboardUserStatus>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  last_dashboard_visit: Date | null;
}

export interface UserApiKeysTable {
  id: Generated<string>;
  user_id: string;
  label: string;
  api_key_hash: string;
  created_at: Generated<Date>;
}

export interface AuditLogsTable {
  id: Generated<string>;
  user_id: string;
  email: string;
  page: string;
  action: Generated<string>;
  details: Record<string, unknown> | null;
  timestamp: Generated<Date>;
}

export interface RequestStatsTable {
  request_id: string;
  tool_uses: Generated<unknown>;
  tool_results: Generated<unknown>;
}

// Cron-computed tool-analytics payloads, keyed by
// `ta:<schema-version>:<kind>:<scope>:<trace-version>`. See migration 028.
export interface ToolAnalyticsCacheTable {
  key: string;
  data: unknown;
  cached_at: Generated<Date>;
}

// Cron-computed overview/models payloads, keyed by
// `sc:<schema-version>:<kind>:<scope>:<trace-version>`. Mirrors
// tool_analytics_cache exactly. See migration 029.
export interface StatsCacheTable {
  key: string;
  data: unknown;
  cached_at: Generated<Date>;
}

// Incrementally-maintained daily rollup of `requests`. One row per
// (UTC day, model, privacy_mode, trace_version, is_fast_mode) holding only
// ADDITIVE metrics (sums/counts) — percentiles never live here. Powers the
// lifetime totals + per-model breakdown + daily time-series that /api/overview
// and /api/models used to compute with full-table scans, and future
// "behavior over time" trend views. Refreshed from a watermark minus a 48h
// safety lag (see refreshRollupRequestsDaily). NULL model is stored as the
// empty-string sentinel so it can sit in the primary key (Postgres PKs reject
// NULLs); reads that mirror `getTokensByModel` exclude it via `model <> ''`.
// See migration 029.
export interface RollupRequestsDailyTable {
  day: string;
  model: string;
  privacy_mode: PrivacyMode;
  trace_version: number;
  is_fast_mode: boolean;
  request_count: number;
  error_count: number;
  streaming_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_input_tokens: number;
  long_input_tokens: number;
  long_output_tokens: number;
  long_cache_write_tokens: number;
  long_cache_read_input_tokens: number;
  cost_usd: number;
  web_search_count: number;
  duration_ms_sum: number;
}

// ── Database interface ──

export interface Database {
  clients: ClientsTable;
  sessions: SessionsTable;
  requests: RequestsTable;
  users: UsersTable;
  user_api_keys: UserApiKeysTable;
  audit_logs: AuditLogsTable;
  request_stats: RequestStatsTable;
  tool_analytics_cache: ToolAnalyticsCacheTable;
  stats_cache: StatsCacheTable;
  rollup_requests_daily: RollupRequestsDailyTable;
}
