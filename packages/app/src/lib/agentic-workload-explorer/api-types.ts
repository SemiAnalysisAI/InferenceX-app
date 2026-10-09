/**
 * Shared API response types used by both dashboard pages and API routes.
 * Single source of truth — import from here instead of defining inline.
 */

// ── Raw body search ─────────────────────────────────────────────

export interface RawBodySearchResult {
  id: string;
  sessionId: string;
  model: string | null;
  endpoint: string;
  timestamp: string;
  responseStatusCode: number | null;
  matchedIn: 'request' | 'response';
  snippet: string;
}

// ── Overview ────────────────────────────────────────────────────

export interface UsageBucket {
  hour: string;
  requestCount: number;
  totalTokens: number;
  totalCost: number;
  newSessions: number;
}

export interface DailyUsageBucket {
  day: string;
  requestCount: number;
  totalTokens: number;
  totalCost: number;
  newSessions: number;
}

export interface CostBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface OverviewStats {
  clients: number;
  activeClients24h: number;
  sessions: number;
  requests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheWrite: number;
  totalCacheRead: number;
  totalCost: number;
  sessions24h: number;
  cost24h: number;
  sessionsGt20: number;
  sessionsGt20_24h: number;
  sessionsTodayUtc: number;
  sessionsYesterdayUtc: number;
  costTodayUtc: number;
  costYesterdayUtc: number;
  sessionsGt20TodayUtc: number;
  sessionsGt20YesterdayUtc: number;
  usageHistogramTodayUtc: UsageBucket[];
  usageHistogramYesterdayUtc: UsageBucket[];
  costBreakdown: CostBreakdown;
  turnsPercentiles: { p25: number; p50: number; p75: number; p90: number; p99: number };
  gapPercentiles: { p25: number; p50: number; p75: number; p90: number; p99: number };
  ttftStats: { p50: number; p90: number; p95: number; p99: number; avg: number; count: number };
  tpotStats: { p50: number; p90: number; p95: number; p99: number; avg: number; count: number };
  prefillSpeedStats: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    avg: number;
    count: number;
  };
  usageHistogram: UsageBucket[];
  dailyUsageHistogram: DailyUsageBucket[];
}

// ── Sessions ────────────────────────────────────────────────────

export interface Session {
  id: string;
  clientId: string;
  startedAt: string;
  lastActiveAt: string;
  metadata: {
    userAgent?: string;
    cliVersion?: string;
    os?: string;
    arch?: string;
    /** Proxy route label ('openai' | 'codex'); absent on the Anthropic route. Not the harness. */
    client?: string;
  } | null;
  clientApiKeyHash: string;
  requestCount: number;
  /**
   * Sum of `input_tokens` (i.e. neither cache_read nor cache_write) across
   * the session's requests. Used together with cache totals to derive the
   * session's API cache hit rate without a follow-up query.
   */
  totalInput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalOutput: number;
  /** Sum of `cost_usd` across the session's visible requests, in USD. */
  totalCost: number;
  privacyMode: 'anon' | 'full';
}

/**
 * Payload returned by `/api/v1/agentic-workload-explorer/sessions/[id]/hash-stats` — the lazy-loaded
 * theoretical upper-bound cache hit rate per session row. Computed by walking
 * a chain-hash trie over every request's hash IDs (no eviction, no TTL).
 */
export interface SessionHashStats {
  /** Total hash-block tokens served from prior chains in the session. */
  hashCached: number;
  /** Total hash-block tokens across every chronologically-ordered request. */
  hashTotal: number;
  /** Convenience: hashCached / hashTotal * 100, or 0 when there's no data. */
  hitRate: number;
}

export interface SessionStats {
  total: number;
  last48h: number;
  last7d: number;
}

// ── Session insights ────────────────────────────────────────────

export interface HistogramBin {
  min: number;
  max: number;
  count: number;
}

export interface PercentileStats {
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface SessionInsightsData {
  stats: {
    avgDuration: number;
    avgTurns: number;
    avgCost: number;
    active24h: number;
  };
  durationBins: HistogramBin[];
  durationPercentiles: PercentileStats;
  turnBins: HistogramBin[];
  turnPercentiles: PercentileStats;
  costBins: HistogramBin[];
  costPercentiles: PercentileStats;
  dailySessions: { day: string; sessionCount: number }[];
  hourlyConcurrent: { hour: string; activeSessions: number }[];
}

// ── Costs ───────────────────────────────────────────────────────

export interface CostSummary {
  totalCost: number;
  costToday: number;
  costWeek: number;
  costMonth: number;
  fastModeCost: number;
  regularCost: number;
  avgCostPerRequest: number;
  avgCostPerSession: number;
}

export interface DailyCost {
  day: string;
  cost: number;
  requestCount: number;
  sessionCount: number;
}

export interface ModelCost {
  model: string;
  totalCost: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheWriteTokens: number;
  fastModeCost: number;
  fastModeCount: number;
}

export interface ClientCost {
  clientId: string;
  apiKeyHash: string;
  totalCost: number;
  requestCount: number;
  sessionCount: number;
  lastActive: string;
}

export interface PricingCoverageModel {
  model: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheWriteTokens: number;
}

export interface PricingCoverage {
  windowDays: number;
  usageRequestCount: number;
  pricedRequestCount: number;
  unpricedRequestCount: number;
  requestCoverage: number | null;
  inputSideTokens: number;
  pricedInputSideTokens: number;
  inputSideTokenCoverage: number | null;
  outputTokens: number;
  pricedOutputTokens: number;
  outputTokenCoverage: number | null;
  byModel: PricingCoverageModel[];
}

export interface CostData {
  summary: CostSummary;
  daily: DailyCost[];
  byModel: ModelCost[];
  byClient: ClientCost[];
  costBreakdown: CostBreakdown;
  pricingCoverage: PricingCoverage;
}

// ── Errors ──────────────────────────────────────────────────────

export interface ErrorData {
  summary: {
    totalErrors: number;
    totalRequests: number;
    errorsToday: number;
    errorRate: number;
  };
  timeline: { hour: string; errorCount: number; totalCount: number }[];
  statusCodes: { statusCode: number; count: number }[];
  byModel: { model: string; errorCount: number; totalCount: number }[];
  recentErrors: {
    id: string;
    model: string;
    statusCode: number | null;
    error: string | null;
    timestamp: string;
    sessionId: string;
    durationMs: number | null;
  }[];
  errorReach: ErrorReach;
}

export interface ErrorReachCohort {
  client: string;
  requestCount: number;
  errorCount: number;
  requestErrorRate: number | null;
  sessionCount: number;
  affectedSessionCount: number;
  affectedSessionRate: number | null;
  repeatErrorSessionCount: number;
  repeatErrorCount: number;
  repeatErrorShare: number | null;
  avgErrorsPerAffectedSession: number | null;
  p50ErrorsPerAffectedSession: number | null;
  p90ErrorsPerAffectedSession: number | null;
  maxErrorsInSession: number;
  topSessionErrorShare: number | null;
  topTenErrorShare: number | null;
}

export interface ErrorReach {
  windowDays: number;
  overall: ErrorReachCohort | null;
  byClient: ErrorReachCohort[];
}

// ── Traffic ─────────────────────────────────────────────────────

export interface TrafficStats {
  totalRequests: number;
  requestsToday: number;
  peakHour: string | null;
  avgPerDay: number;
}

export interface DailyCount {
  day: string;
  requestCount: number;
}

export interface TrafficHeatmapCell {
  dayOfWeek: number;
  hourOfDay: number;
  requestCount: number;
}

export interface StreamingDay {
  day: string;
  streamingCount: number;
  nonStreamingCount: number;
}

export interface TrafficData {
  stats: TrafficStats;
  daily: DailyCount[];
  heatmap: TrafficHeatmapCell[];
  streamingBreakdown: StreamingDay[];
}

// ── Cache ───────────────────────────────────────────────────────

export interface CacheStats {
  totalCacheRead: number;
  totalCacheWrite: number;
  totalInput: number;
  hitRate: number;
  cacheHitRequests: number;
  totalRequests: number;
}

export interface DailyCache {
  day: string;
  cacheRead: number;
  cacheWrite: number;
  inputTokens: number;
}

export interface ModelCache {
  model: string;
  cacheRead: number;
  cacheWrite: number;
  inputTokens: number;
  requestCount: number;
}

export interface ClientCache {
  clientId: string;
  apiKeyHash: string;
  cacheRead: number;
  cacheWrite: number;
  inputTokens: number;
  requestCount: number;
}

export interface CacheData {
  stats: CacheStats;
  daily: DailyCache[];
  byModel: ModelCache[];
  byClient: ClientCache[];
}

// ── Models ──────────────────────────────────────────────────────

export interface TokensByModel {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheWriteTokens: number;
  fastModeCount: number;
  fastInputTokens: number;
  fastOutputTokens: number;
  fastCacheReadInputTokens: number;
  fastCacheWriteTokens: number;
}

export interface ModelTimeSeries {
  day: string;
  model: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ModelsData {
  tokensByModel: TokensByModel[];
  timeSeries: ModelTimeSeries[];
}

// ── Streaming ───────────────────────────────────────────────────

export interface PerformancePercentileStats {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  avg: number;
  count: number;
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

export interface DailyRatio {
  day: string;
  streamingCount: number;
  totalCount: number;
}

export interface ModelBreakdown {
  model: string;
  streamingCount: number;
  nonStreamingCount: number;
  streamingAvgLatency: number | null;
  nonStreamingAvgLatency: number | null;
}

export interface StreamingStats {
  streamingCount: number;
  nonStreamingCount: number;
  totalCount: number;
  streamingAvgLatency: number;
  nonStreamingAvgLatency: number;
}

export interface StreamingData {
  stats: StreamingStats;
  dailyRatio: DailyRatio[];
  byModel: ModelBreakdown[];
  ttftDistribution: GraphHistogram;
  tpotDistribution: GraphHistogram;
  ttftStats: PerformancePercentileStats;
  tpotStats: PerformancePercentileStats;
  prefillSpeedDistribution: GraphHistogram;
  prefillSpeedStats: PerformancePercentileStats;
  interactivityDistribution: GraphHistogram;
  streamingLatencyDistribution: GraphHistogram;
  nonStreamingLatencyDistribution: GraphHistogram;
  throughputDistribution: GraphHistogram;
}

// ── Platform ────────────────────────────────────────────────────

export interface PlatformStat {
  os: string | null;
  cliVersion: string | null;
  nodeVersion: string | null;
  arch: string | null;
  sessionCount: number;
}

export interface PlatformTimeSeries {
  day: string;
  os: string | null;
  sessionCount: number;
}

export interface PlatformData {
  stats: PlatformStat[];
  timeSeries: PlatformTimeSeries[];
}

// ── Web search ──────────────────────────────────────────────────

export interface WebSearchStats {
  totalSearches: number;
  searchesToday: number;
  requestsWithSearch: number;
  totalRequests: number;
  searchPct: number;
}

export interface WebSearchDailyEntry {
  day: string;
  searchCount: number;
  requestsWithSearch: number;
}

export interface WebSearchModelEntry {
  model: string;
  searchCount: number;
  requestsWithSearch: number;
  totalRequests: number;
}

export interface WebSearchTopSession {
  sessionId: string;
  searchCount: number;
  requestCount: number;
}

export interface WebSearchData {
  stats: WebSearchStats;
  daily: WebSearchDailyEntry[];
  byModel: WebSearchModelEntry[];
  topSessions: WebSearchTopSession[];
}

// ── Clients ─────────────────────────────────────────────────────

export interface Client {
  id: string;
  apiKeyHash: string;
  firstSeen: string;
  lastSeen: string;
  sessionCount: number;
}

export interface ClientSession {
  id: string;
  startedAt: string;
  lastActiveAt: string;
  metadata: {
    cliVersion?: string;
    os?: string;
  } | null;
  requestCount: number;
}

export interface ClientStats {
  total: number;
  last48h: number;
  sessions7d: number;
}

// ── User ────────────────────────────────────────────────────────

export interface UserActivity {
  stats: {
    sessionCount: number;
    requestCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
  };
  recentSessions: {
    id: string;
    startedAt: string;
    lastActiveAt: string;
    metadata: { cliVersion?: string } | null;
    requestCount: number;
    totalCost: number;
  }[];
  dailyUsage: { date: string; requests: number; cost: number; tokens: number }[];
}
