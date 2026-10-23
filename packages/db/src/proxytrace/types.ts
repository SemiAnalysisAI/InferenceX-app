import type { Generated } from 'kysely';
import type { AltHash, PrivacyMode } from './shared/trace';

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
  privacy_mode: PrivacyMode;
}

export interface SessionMetadata {
  userAgent?: string;
  cliVersion?: string;
  os?: string;
  arch?: string;
  nodeVersion?: string;
  client?: string;
}

export interface RequestsTable {
  id: Generated<string>;
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
  trace_version: Generated<number>;
  hash_ids: string[] | null;
  hash_token_count: number | null;
  alt_hashes: AltHash[] | null;
  cost_usd: number | null;
  web_search_count: Generated<number>;
  subagent_label: string | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
}

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

export interface ToolAnalyticsCacheTable {
  key: string;
  data: unknown;
  cached_at: Generated<Date>;
}

export interface StatsCacheTable {
  key: string;
  data: unknown;
  cached_at: Generated<Date>;
}

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
