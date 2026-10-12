// Pricing per million tokens (USD). Standard API rates (not batch).
import { AS_OF_MS } from './as-of';
//
// Sources (re-verify before relying on cost numbers — both vendors rev
// their published rates often):
//   - Anthropic:  https://platform.claude.com/docs/en/about-claude/pricing
//     All Claude rows cross-checked against the official table (Sep 2026).
//   - OpenAI current:  https://developers.openai.com/api/docs/pricing
//     The gpt-5.x rows below are directly from this page. Models with a
//     short/long context split charge the long rate above 272K input tokens; we track
//     only the short-context rate because Usage does not carry a context-length flag.
//   - OpenAI legacy:   prior/aggregator values — earlier-generation model
//     IDs (gpt-5, gpt-4.1, gpt-4o, o1, o3, o4-mini) no longer appear on
//     OpenAI's current public pricing page. The API still accepts those
//     IDs for now; rates below reflect the last-published list price but
//     are the most likely to drift. A missing row returns `null` from
//     estimateCost rather than attributing a bogus number.
//
// Notably NOT included:
//   - `o4-mini-2025-04-16` — it only appears on OpenAI's page under
//     "Finetuning" (inference on fine-tuned variants), not as a standard
//     inference model. We can't distinguish base-model vs fine-tune
//     traffic from trace metadata alone, so omitted to avoid
//     over-charging base-model rows.
//   - Audio / image / video / transcription models — not reachable via
//     /v1/responses so won't show up in OpenAI Responses traces.
//   - Regional/data-residency uplifts — the normalized Usage data does not
//     identify the billing region, so standard global rates are used.
//   - OpenAI Ultrafast processing — the API exposes the service tier but no
//     public token rate is available to encode here.
//
// Known limitation (Anthropic): `cacheCreate` tracks the 5-minute-write
// rate (1.25x input). 1-hour writes (2x input) are undercounted. The
// upstream Usage shape only exposes an aggregate
// `cache_creation_input_tokens` without a TTL — proper fix requires
// threading TTL through the shared Usage interface.
//
// OpenAI reports cache-write tokens for GPT-5.6 and later. Their published
// cache-write rate is 1.25x input; older OpenAI rows retain `cacheCreate = input`
// because their responses normally report no separate cache-write tokens.

interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

// OpenAI announced that the Terra/Luna reductions and Sol Fast mode start on
// July 30, without publishing a time of day. Use the UTC day boundary so
// backfills have one deterministic, documented cutoff.
export const GPT_56_PRICE_CUT_MS = Date.parse('2026-07-30T00:00:00Z');
// Sol's promotional reduction started August 21 and remains published through
// at least November 21. Keep the pre-promotion rate for historical traces; do
// not encode an end date until OpenAI publishes the rate that replaces it.
export const GPT_56_SOL_PROMO_START_MS = Date.parse('2026-08-21T00:00:00Z');

const GPT_56_PRE_CUT_PRICING: Readonly<Partial<Record<string, ModelPricing>>> = {
  'gpt-5.6-terra': { input: 2.5, output: 15, cacheRead: 0.25, cacheCreate: 3.125 },
  'gpt-5.6-luna': { input: 1, output: 6, cacheRead: 0.1, cacheCreate: 1.25 },
};

const GPT_56_SOL_PRE_PROMO_PRICING: ModelPricing = {
  input: 5,
  output: 30,
  cacheRead: 0.5,
  cacheCreate: 6.25,
};

const MODEL_PRICING: Record<string, ModelPricing> = {
  // ── Anthropic ──
  // Opus 5.5 (released 2026-09-22; $4 / $20; 5m-write $5; cache-read 0.05x = $0.20)
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheCreate: 5 },
  // Current Opus tier ($5 / $25; 5m-write $6.25; cache-read $0.50)
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheCreate: 6.25 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheCreate: 6.25 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5, cacheCreate: 6.25 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5, cacheCreate: 6.25 },
  'claude-opus-4-5-20250620': { input: 5, output: 25, cacheRead: 0.5, cacheCreate: 6.25 },
  // Opus legacy tier ($15 / $75; 5m-write $18.75; cache-read $1.50)
  'claude-opus-4-1-20250527': { input: 15, output: 75, cacheRead: 1.5, cacheCreate: 18.75 },
  'claude-opus-4-0-20250514': { input: 15, output: 75, cacheRead: 1.5, cacheCreate: 18.75 },
  // Fable 5.1 retains $10 / $50 and cuts cache reads to $0.25.
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25, cacheCreate: 12.5 },
  // Fable 5 ($10 / $50; 5m-write $12.50; cache-read $1.00).
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1, cacheCreate: 12.5 },
  // Sonnet tier ($3 / $15; 5m-write $3.75; cache-read $0.30)
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheCreate: 3.75 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15, cacheRead: 0.3, cacheCreate: 3.75 },
  'claude-sonnet-4-0-20250514': { input: 3, output: 15, cacheRead: 0.3, cacheCreate: 3.75 },
  // Anthropic made Sonnet 5's launch pricing permanent on Aug 10, 2026.
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheCreate: 2.5 },
  // Haiku 4.5 ($1 / $5; 5m-write $1.25; cache-read $0.10)
  'claude-haiku-4-5-20251001': { input: 1, output: 5, cacheRead: 0.1, cacheCreate: 1.25 },
  // Haiku 3.5 ($0.80 / $4; 5m-write $1.00; cache-read $0.08)
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4, cacheRead: 0.08, cacheCreate: 1 },

  // ── OpenAI-compatible provider ──
  //
  // Current (developers.openai.com, Sep 2026 — short-context rate):
  'gpt-6-astra': { input: 10, output: 50, cacheRead: 1, cacheCreate: 12.5 },
  // GPT-6 Sol / Luna (released 2026-09-23 at these permanent rates).
  'gpt-6-sol': { input: 2, output: 10, cacheRead: 0.2, cacheCreate: 2.5 },
  'gpt-6-luna': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheCreate: 0.125 },
  'gpt-5.5': { input: 5, output: 30, cacheRead: 0.5, cacheCreate: 5 },
  'gpt-5.4': { input: 2.5, output: 15, cacheRead: 0.25, cacheCreate: 2.5 },
  'gpt-5.4-mini': { input: 0.75, output: 4.5, cacheRead: 0.075, cacheCreate: 0.75 },
  'gpt-5.4-nano': { input: 0.2, output: 1.25, cacheRead: 0.02, cacheCreate: 0.2 },
  // Pro tier has no published cached-input rate; `cacheRead` set to `input`
  // so cached traffic is charged full price rather than zero.
  'gpt-5.5-pro': { input: 30, output: 180, cacheRead: 30, cacheCreate: 30 },
  'gpt-5.4-pro': { input: 30, output: 180, cacheRead: 30, cacheCreate: 30 },
  // Specialized:
  'gpt-5.3-chat-latest': { input: 1.75, output: 14, cacheRead: 0.175, cacheCreate: 1.75 },
  'gpt-5.3-codex': { input: 1.75, output: 14, cacheRead: 0.175, cacheCreate: 1.75 },
  // GPT-5.6 cache creation is explicitly priced at 1.25x input.
  'gpt-5.6-sol': { input: 4, output: 20, cacheRead: 0.4, cacheCreate: 5 },
  'gpt-5.6-terra': { input: 2, output: 12, cacheRead: 0.2, cacheCreate: 2.5 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2, cacheRead: 0.02, cacheCreate: 0.25 },

  // Legacy — earlier GPT-5 / GPT-4.x / o-series identifiers. No longer on
  // OpenAI's public pricing page as of Apr 2026; API may still accept them
  // for backward compatibility. Rates below are the last-published list
  // prices and are the likeliest rows to drift out of date — verify if a
  // dashboard shows real spend attributed to any of these.
  'gpt-5': { input: 1.25, output: 10, cacheRead: 0.125, cacheCreate: 1.25 },
  'gpt-5-codex': { input: 1.25, output: 10, cacheRead: 0.125, cacheCreate: 1.25 },
  'gpt-5-mini': { input: 0.25, output: 2, cacheRead: 0.025, cacheCreate: 0.25 },
  'gpt-5-nano': { input: 0.05, output: 0.4, cacheRead: 0.005, cacheCreate: 0.05 },
  'gpt-4.1': { input: 2, output: 8, cacheRead: 0.5, cacheCreate: 2 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6, cacheRead: 0.1, cacheCreate: 0.4 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4, cacheRead: 0.025, cacheCreate: 0.1 },
  'gpt-4o': { input: 2.5, output: 10, cacheRead: 1.25, cacheCreate: 2.5 },
  'gpt-4o-mini': { input: 0.15, output: 0.6, cacheRead: 0.075, cacheCreate: 0.15 },
  o1: { input: 15, output: 60, cacheRead: 7.5, cacheCreate: 15 },
  o3: { input: 2, output: 8, cacheRead: 0.5, cacheCreate: 2 },
  'o3-mini': { input: 1.1, output: 4.4, cacheRead: 0.55, cacheCreate: 1.1 },
  'o4-mini': { input: 1.1, output: 4.4, cacheRead: 0.275, cacheCreate: 1.1 },
};

// Provider aliases and model labels observed in traces. Resolve these before
// pricing while preserving the original known label in dashboard responses.
const MODEL_ALIASES: Record<string, string> = {
  // Codex's Guardian reviewer label (openai/codex#18169). OpenAI publishes no
  // separate price for it (openai/codex#20981), so it's billed like GPT-5.6.
  'codex-auto-review': 'gpt-5.6-sol',
  'Fable 5': 'claude-fable-5',
  'Fable-5': 'claude-fable-5',
  'fable 5': 'claude-fable-5',
  'fable-5': 'claude-fable-5',
  'claude-fabel-5': 'claude-fable-5',
  'claude-fable': 'claude-fable-5',
  'claude-fable-5 1m': 'claude-fable-5',
  'claude-fable-5-0': 'claude-fable-5',
  'claude-fable-5-1m': 'claude-fable-5',
  'claude-fable-5[1m]': 'claude-fable-5',
  'claude-fable5': 'claude-fable-5',
  'claudefable-5': 'claude-fable-5',
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
  'claude-opus-4-0': 'claude-opus-4-0-20250514',
  'claude-opus-4-6[1m]': 'claude-opus-4-6',
  'claude-opus-4-7[1m]': 'claude-opus-4-7',
  'claude-opus-4-8[1m]': 'claude-opus-4-8',
  'claude-opus-4.7': 'claude-opus-4-7',
  'claude-opus-4.8': 'claude-opus-4-8',
  'claude-opus-48': 'claude-opus-4-8',
  'claude-opus-5[1m]': 'claude-opus-5',
  'opus 5': 'claude-opus-5',
  'opus-5': 'claude-opus-5',
  opus5: 'claude-opus-5',
  'opus-4-7': 'claude-opus-4-7',
  'claude-sonnet-4-0': 'claude-sonnet-4-0-20250514',
  'claude-sonnet-4-20250514': 'claude-sonnet-4-0-20250514',
  'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-6[1m]': 'claude-sonnet-4-6',
  'claude-sonnet-5[1m]': 'claude-sonnet-5',
  'sonnet 5': 'claude-sonnet-5',
  'sonnet-5': 'claude-sonnet-5',
  sonnet5: 'claude-sonnet-5',
  'gpt-5.6': 'gpt-5.6-sol',
};

function resolveModel(model: string): string {
  return Object.hasOwn(MODEL_ALIASES, model) ? MODEL_ALIASES[model]! : model;
}

function getModelPricing(model: string, timestampMs?: number): ModelPricing | undefined {
  const resolved = resolveModel(model);
  const at = timestampMs ?? AS_OF_MS;
  const preCut = GPT_56_PRE_CUT_PRICING[resolved];
  if (preCut && at < GPT_56_PRICE_CUT_MS) return preCut;
  if (resolved === 'gpt-5.6-sol' && at < GPT_56_SOL_PROMO_START_MS) {
    return GPT_56_SOL_PRE_PROMO_PRICING;
  }
  return Object.hasOwn(MODEL_PRICING, resolved) ? MODEL_PRICING[resolved] : undefined;
}

interface FastModePricing {
  multiplier: number;
  effectiveAtMs: number;
  endsAtMs?: number;
}

// Anthropic Fast mode and OpenAI/Codex Fast mode use different request
// signals, but pricing converges here after provider-level detection. OpenAI
// renamed Priority processing to Fast mode on July 30; either service_tier
// value selects the same rate. Anthropic's older Opus models retain their
// historical 6x windows so a backfill never applies today's 2x rate to them.
// Date-only vendor announcements use UTC day boundaries for deterministic
// backfills. Models omitted from this table stay standard.
const FAST_MODE_PRICING: Readonly<Record<string, FastModePricing>> = {
  'claude-opus-4-6': {
    multiplier: 6,
    effectiveAtMs: Date.parse('2026-02-07T00:00:00Z'),
    endsAtMs: Date.parse('2026-06-29T00:00:00Z'),
  },
  'claude-opus-4-7': {
    multiplier: 6,
    effectiveAtMs: Date.parse('2026-05-12T00:00:00Z'),
    endsAtMs: Date.parse('2026-07-24T00:00:00Z'),
  },
  'claude-opus-4-8': { multiplier: 2, effectiveAtMs: Date.parse('2026-05-28T00:00:00Z') },
  'claude-opus-5-5': { multiplier: 2, effectiveAtMs: Date.parse('2026-09-22T00:00:00Z') },
  'claude-opus-5': { multiplier: 2, effectiveAtMs: Date.parse('2026-07-24T00:00:00Z') },
  'gpt-6-astra': { multiplier: 2, effectiveAtMs: Date.parse('2026-09-03T00:00:00Z') },
  'gpt-6-sol': { multiplier: 2, effectiveAtMs: Date.parse('2026-09-23T00:00:00Z') },
  'gpt-6-luna': { multiplier: 2, effectiveAtMs: Date.parse('2026-09-23T00:00:00Z') },
  'gpt-5.6-sol': { multiplier: 2, effectiveAtMs: GPT_56_PRICE_CUT_MS },
  'gpt-5.6-terra': { multiplier: 2, effectiveAtMs: GPT_56_PRICE_CUT_MS },
  'gpt-5.6-luna': { multiplier: 2, effectiveAtMs: GPT_56_PRICE_CUT_MS },
  'gpt-5.5': { multiplier: 2.5, effectiveAtMs: GPT_56_PRICE_CUT_MS },
  'gpt-5.4': { multiplier: 2, effectiveAtMs: GPT_56_PRICE_CUT_MS },
  'gpt-5.4-mini': { multiplier: 2, effectiveAtMs: GPT_56_PRICE_CUT_MS },
};

export const LONG_CONTEXT_TOKEN_THRESHOLD = 272_000;
export const LONG_CONTEXT_PRICING_MODELS: Readonly<Record<string, true>> = {
  'gpt-6-astra': true,
  'gpt-6-sol': true,
  'gpt-6-luna': true,
  'gpt-5.4': true,
  'gpt-5.4-pro': true,
  'gpt-5.5': true,
  'gpt-5.5-pro': true,
  'gpt-5.6': true,
  'codex-auto-review': true,
  'gpt-5.6-sol': true,
  'gpt-5.6-terra': true,
  'gpt-5.6-luna': true,
};

export function usesLongContextPricing(
  model: string | null | undefined,
  inputTokens: number,
  cacheReadInputTokens: number,
): boolean {
  if (!model) return false;
  return (
    Object.hasOwn(LONG_CONTEXT_PRICING_MODELS, model) &&
    inputTokens + cacheReadInputTokens > LONG_CONTEXT_TOKEN_THRESHOLD
  );
}

/**
 * Fast-mode price multiplier for a given model. Returns 1 for models that
 * have no fast-mode pricing (i.e. fast-mode requests cost the same as
 * regular). Exported so dashboards can compute the cost premium per model
 * without duplicating the multiplier table.
 */
export function getFastModeMultiplier(
  model: string | null | undefined,
  timestampMs?: number,
): number {
  if (!model) return 1;
  const rule = FAST_MODE_PRICING[resolveModel(model)];
  if (!rule) return 1;
  const at = timestampMs ?? AS_OF_MS;
  if (at < rule.effectiveAtMs || (rule.endsAtMs !== undefined && at >= rule.endsAtMs)) return 1;
  return rule.multiplier;
}

// Server-side tool pricing
const WEB_SEARCH_COST = 0.01; // $10 per 1,000 searches

export function estimateCost(params: {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheWriteTokens: number;
  isFastMode: boolean;
  webSearchRequests?: number;
  timestampMs?: number;
}): number | null {
  if (!params.model) return null;
  const resolvedModel = resolveModel(params.model);
  const pricing = getModelPricing(params.model, params.timestampMs);
  if (!pricing) return null;

  const fastMultiplier = params.isFastMode
    ? getFastModeMultiplier(resolvedModel, params.timestampMs)
    : 1;
  const isLongContext = usesLongContextPricing(
    params.model,
    params.inputTokens,
    params.cacheReadInputTokens,
  );
  const inputMultiplier = fastMultiplier * (isLongContext ? 2 : 1);
  const outputMultiplier = fastMultiplier * (isLongContext ? 1.5 : 1);

  return (
    (params.inputTokens / 1_000_000) * pricing.input * inputMultiplier +
    (params.outputTokens / 1_000_000) * pricing.output * outputMultiplier +
    (params.cacheReadInputTokens / 1_000_000) * pricing.cacheRead * inputMultiplier +
    (params.cacheWriteTokens / 1_000_000) * pricing.cacheCreate * inputMultiplier +
    (params.webSearchRequests || 0) * WEB_SEARCH_COST
  );
}

export interface CostBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export function computeCostBreakdown(
  tokensByModel: {
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_write_tokens: number;
    fast_input_tokens: number;
    fast_output_tokens: number;
    fast_cache_read_input_tokens: number;
    fast_cache_write_tokens: number;
    long_input_tokens?: number;
    long_output_tokens?: number;
    long_cache_read_input_tokens?: number;
    long_cache_write_tokens?: number;
  }[],
): CostBreakdown {
  const breakdown: CostBreakdown = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  for (const row of tokensByModel) {
    const resolvedModel = resolveModel(row.model);
    const pricing = getModelPricing(row.model);
    if (!pricing) continue;

    const longInput = Number(row.long_input_tokens ?? 0);
    const longOutput = Number(row.long_output_tokens ?? 0);
    const longCacheRead = Number(row.long_cache_read_input_tokens ?? 0);
    const longCacheWrite = Number(row.long_cache_write_tokens ?? 0);
    const normalInput = Number(row.input_tokens) - Number(row.fast_input_tokens) - longInput;
    const normalOutput = Number(row.output_tokens) - Number(row.fast_output_tokens) - longOutput;
    const normalCacheRead =
      Number(row.cache_read_input_tokens) -
      Number(row.fast_cache_read_input_tokens) -
      longCacheRead;
    const normalCacheWrite =
      Number(row.cache_write_tokens) - Number(row.fast_cache_write_tokens) - longCacheWrite;
    const fastMult = getFastModeMultiplier(resolvedModel);

    breakdown.input +=
      ((normalInput + longInput * 2) / 1_000_000) * pricing.input +
      (Number(row.fast_input_tokens) / 1_000_000) * pricing.input * fastMult;
    breakdown.output +=
      ((normalOutput + longOutput * 1.5) / 1_000_000) * pricing.output +
      (Number(row.fast_output_tokens) / 1_000_000) * pricing.output * fastMult;
    breakdown.cacheRead +=
      ((normalCacheRead + longCacheRead * 2) / 1_000_000) * pricing.cacheRead +
      (Number(row.fast_cache_read_input_tokens) / 1_000_000) * pricing.cacheRead * fastMult;
    breakdown.cacheWrite +=
      ((normalCacheWrite + longCacheWrite * 2) / 1_000_000) * pricing.cacheCreate +
      (Number(row.fast_cache_write_tokens) / 1_000_000) * pricing.cacheCreate * fastMult;
  }

  return breakdown;
}

export function detectFastMode(headers: Record<string, string> | null): boolean {
  if (!headers) return false;
  const beta = headers['anthropic-beta'] || '';
  return beta.includes('fast-mode');
}

/** OpenAI Responses/Codex Fast mode; `priority` is the backward-compatible name. */
export function detectOpenAIFastMode(
  _headers: Record<string, string> | null,
  requestBody: Record<string, unknown> | null | undefined,
): boolean {
  const tier = requestBody?.service_tier;
  return tier === 'fast' || tier === 'priority';
}

// ── Model name sanitization ──

/** Label for every model the public pricing table does not name. */
export const UNLISTED_MODEL = 'other';

/** True when the public site may show this model name (priced or a known alias). */
export function isPublicModel(model: string): boolean {
  return Object.hasOwn(MODEL_PRICING, model) || Object.hasOwn(MODEL_ALIASES, model);
}

/**
 * Return the model name if the public pricing table names it, otherwise the
 * shared `other` label, so unlisted model IDs are never published or guessable.
 * Null passes through.
 */
export function sanitizeModel(model: string | null): string | null {
  if (model === null) return null;
  return isPublicModel(model) ? model : UNLISTED_MODEL;
}

/** Sanitize the `model` field on each row. Convenience for API route responses. */
export function sanitizeModels<T extends { model: string | null }>(rows: T[]): T[] {
  return rows.map((r) => ({ ...r, model: sanitizeModel(r.model) }));
}
