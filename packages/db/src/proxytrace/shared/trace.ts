export type PrivacyMode = 'anon' | 'full';

export interface ReasoningTelemetry {
  schemaVersion: 1;
  requestedEffort: string | null;
  responseEffort: string | null;
  thinkingMode: 'enabled' | 'adaptive' | 'disabled' | null;
  budgetTokens: number | null;
  reportedReasoningTokens: number | null;
  visibleThinkingTokensEstimate: number | null;
  visibleThinkingTokenizer: string | null;
  visibleThinkingEstimateStatus: 'measured' | 'unavailable' | 'work_limit' | 'tokenizer_error';
  thinkingBlockCount: number | null;
  redactedThinkingBlockCount: number | null;
}

export const CURRENT_TRACE_VERSION = 7;

export interface AltHash {
  tokenizer: string;
  hashIds: string[];
  hashTokenCount: number;
}

export interface TracePayload {
  client: {
    apiKeyHash: string;
  };
  session: {
    id: string;
    metadata: Record<string, unknown>;
  };
  request: {
    traceId?: string;
    timestamp: string;
    method: string;
    endpoint: string;
    model: string | null;
    requestHeaders: Record<string, string>;
    requestBody: unknown;
    responseStatusCode: number | null;
    responseHeaders: Record<string, string[]> | null;
    responseBody: unknown;
    inputTokens: number | null;
    outputTokens: number | null;
    cacheWriteTokens: number | null;
    cacheReadInputTokens: number | null;
    durationMs: number | null;
    ttftMs: number | null;
    tpotMs: number | null;
    sseChunkCount: number | null;
    isStreaming: boolean;
    isFastMode: boolean;
    privacyMode: PrivacyMode;
    traceVersion: number;
    hashIds: string[] | null;
    hashTokenCount: number | null;
    altHashes?: AltHash[] | null;
    costUsd: number | null;
    webSearchCount: number;
    subagentLabel: string | null;
    error: string | null;
    metadata: Record<string, unknown> | null;
  };
}
