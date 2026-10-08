export type PrivacyMode = 'anon' | 'full';

/**
 * Additive metadata.reasoning telemetry. Absent on older traces; null means
 * unknown, never zero. Effort is a client setting / response echo, not evidence
 * of a provider's internal compute allocation.
 */
export interface ReasoningTelemetry {
  schemaVersion: 1;
  requestedEffort: string | null;
  responseEffort: string | null;
  thinkingMode: 'enabled' | 'adaptive' | 'disabled' | null;
  budgetTokens: number | null;
  /** Provider usage.output_tokens_details.reasoning_tokens; no text heuristic. */
  reportedReasoningTokens: number | null;
  /** Anthropic visible thinking text only, NOT hidden or billed reasoning. */
  visibleThinkingTokensEstimate: number | null;
  visibleThinkingTokenizer: string | null;
  /** Work-limit/error skips are coverage gaps, never zero or partial counts. */
  visibleThinkingEstimateStatus: 'measured' | 'unavailable' | 'work_limit' | 'tokenizer_error';
  thinkingBlockCount: number | null;
  redactedThinkingBlockCount: number | null;
}

/**
 * Version of the trace-production pipeline (anonymization, BPE hashing, body
 * capture). Bump when a proxy-side change makes rows produced before/after the
 * change incomparable, so analytics can filter on `trace_version >= N`. Old
 * rows keep their stamped version forever; we never back-fill.
 *
 * v4: `subagent_label` for Claude Code ≥ 2.1.139 is now gated on the
 * `x-claude-code-agent-id` header. Utility calls that previously got
 * heuristic labels (Title Generation, Security Monitor, Anthropic.ping, the
 * Web Search Agent helper spawned from a main-session WebSearch, etc.) write
 * NULL instead. v3-and-earlier rows still carry the legacy heuristic labels,
 * so aggregations like "how many Title Generation calls" are incomparable
 * across the boundary — use this version when slicing.
 *
 * v5: hash-token accounting was recalibrated while preserving prefix/KV-reuse
 * semantics. Tokenization is provider-routed (`HASH_TOKENIZER_ANTHROPIC` /
 * `HASH_TOKENIZER_OPENAI`, both defaulting to `o200k_base`) and recorded in
 * `metadata.tokenizer`. Normal Anthropic chains add deterministic interleaved
 * synthetic padding blocks (`HASH_CHAIN_PAD_ANTHROPIC=3:2`) after complete
 * real-block groups, so prefix chains stay aligned while chain length better
 * approximates Anthropic-reported prompt/cache tokens. Forced Anthropic hosted
 * `web_search` server-tool requests instead use an opaque random chain sized
 * from Anthropic's reported prompt tokens, because that hidden server-side
 * context is absent from the client request body and should not be treated as
 * prefix-cache reusable. Rows record details in
 * `metadata.hashChainPadding` / `metadata.hashChainServerToolOpaque`.
 *
 * v6: eliminates two structural sources of phantom prefix
 * rollback that surfaced in v5 cache-reuse analytics.
 *
 * (1) The hash chain now drops any trailing partial real block. v5 emitted a
 * final block of `realTokenCount % blockSize` tokens whose hash included
 * `:len=` in the HMAC, so the next turn's same-position block (now filled to
 * the full block size) always diverged — producing a 1-block rollback when
 * `realBlockCount % 3 != 0` and a 3-block rollback when `% 3 == 0` (the
 * diverged real dragged its two trailing synthetics with it). v6 chains end
 * at the last complete real block; up to `blockSize - 1` tail tokens per
 * request are no longer represented in the chain and are recorded in
 * `metadata.hashChainPadding.droppedTailTokens` instead.
 *
 * (2) Anthropic message content is canonicalized before projection so the
 * two API-accepted shapes for the same logical content
 * (`content: "string"` vs `content: [{type:"text",text:"string"}]`) hash
 * identically. v5 extracted segments recursively, so the literal `"text"`
 * field-value from the array form was included in the projected text while
 * the string form omitted it; whichever shape Claude Code happened to send
 * on a given turn would shift BPE boundaries and invalidate the second-to-
 * last real block (typical observed rollback of 4). The same canonicalization
 * applies to `tool_result.content`.
 *
 * v7 (this version): separates Anthropic baseline padding from historical
 * thinking accounting. Per-model padding is calibrated only on successful
 * non-web-search requests with zero thinking blocks; Opus 4.7/4.8 return to
 * the zero-thinking-calibrated 3:2 baseline. Opaque `thinking.signature` and
 * `redacted_thinking.data` values are replaced in-place with deterministic,
 * HMAC-derived surrogate text sized from model-specific empirical estimates.
 * This preserves prefix identity without storing or tokenizing the ciphertext
 * itself and closes the context-length-dependent hidden-thinking undercount.
 */
export const CURRENT_TRACE_VERSION = 7;

/**
 * One alternate tokenization of a prompt, hashed (irreversible) under a
 * non-primary tokenizer and stored alongside the primary chain. Lets us analyze
 * token counts / prefix-overlap under other frontier models' tokenizers later —
 * the choice can't be revisited after the fact because anon traces destroy the
 * source text. Raw (unpadded) chains; see `hashAltPromptChains`. Additive: rows
 * predating this carry no alt hashes (column null), no trace-version bump.
 */
export interface AltHash {
  /** Tokenizer id, e.g. `deepseek-v4`, `qwen3`, `glm-5.1`. */
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
    /**
     * Idempotency key for this trace, stamped once by the proxy at
     * trace-creation time and reused verbatim across upload retries. The
     * dashboard dedups on it (unique index + ON CONFLICT DO NOTHING) so a
     * retried upload whose first POST already committed can't create a
     * duplicate row. Optional so older/third-party proxies that omit it still
     * ingest — those rows just aren't dedup-protected.
     */
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
    /** Stamped by the proxy from CURRENT_TRACE_VERSION at trace-creation time. */
    traceVersion: number;
    hashIds: string[] | null;
    hashTokenCount: number | null;
    /** Additional tokenizations of the prompt (raw hashed chains). */
    altHashes?: AltHash[] | null;
    costUsd: number | null;
    webSearchCount: number;
    subagentLabel: string | null;
    error: string | null;
    /** Provider/core-pipeline trace properties. Free-form for future provider output. */
    metadata: Record<string, unknown> | null;
  };
}
