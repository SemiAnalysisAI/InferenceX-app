import { Model } from '@/lib/catalog/data-mappings';

import type { OverviewScenario } from './overview-data';

/**
 * First-party API list prices for the Overview "Official API" reference column.
 *
 * Every price comes from the model developer's own pricing page (never a
 * reseller), in USD per million tokens, and is converted to the same unit and
 * workload as the hardware cells: dollars per million TOTAL tokens for the
 * row's scenario. The conversion applies the scenario's token mix:
 *
 *   price = cached × P_cache_hit + uncached × P_input + output × P_output
 *
 * where cached / uncached / output are each scenario's share of total tokens.
 * Rule for picking a tier when the developer publishes several: the lowest
 * real-time list price under standard commercial terms — no batch, no
 * priority tier, no data-for-training discount.
 */

export interface OverviewTokenMix {
  /** Cache-hit input tokens. */
  cachedTokens: number;
  /** Input tokens that miss the prefix cache. */
  uncachedInputTokens: number;
  outputTokens: number;
}

/** Corpus each scenario row replays. AgentX models with a 256K context cap run
 *  the 256K-filtered corpus (InferenceX `infx/bench/agentic/traces.py`); the
 *  totals are the published dataset summaries. */
export type OverviewTokenMixKey = 'agentx_full' | 'agentx_256k' | 'single_turn_8k1k';

export const OVERVIEW_TOKEN_MIXES: Record<OverviewTokenMixKey, OverviewTokenMix> = {
  // semianalysisai/cc-traces-weka-062126: 21,635,381,376 input tokens of which
  // 21,206,048,768 are prefix-cache hits, plus 106,474,498 output tokens.
  agentx_full: {
    cachedTokens: 21_206_048_768,
    uncachedInputTokens: 21_635_381_376 - 21_206_048_768,
    outputTokens: 106_474_498,
  },
  // semianalysisai/cc-traces-weka-062126-256k: 6,891,228,864 input tokens of
  // which 6,567,678,592 are prefix-cache hits, plus 58,728,807 output tokens.
  agentx_256k: {
    cachedTokens: 6_567_678_592,
    uncachedInputTokens: 6_891_228_864 - 6_567_678_592,
    outputTokens: 58_728_807,
  },
  // Fixed 8,192 input / 1,024 output tokens per request, random prompts.
  single_turn_8k1k: { cachedTokens: 0, uncachedInputTokens: 8192, outputTokens: 1024 },
};

/** One flat price band, USD per million tokens. */
export interface OverviewApiPriceBand {
  /** Cache-hit input price; null when the API does not cache, so every input
   *  token bills at `input`. */
  cacheHit: number | null;
  input: number;
  output: number;
}

/** A per-request input-length tier: requests whose input is at most
 *  `maxInputTokens` bill at `band`. */
export interface OverviewApiPriceTier {
  maxInputTokens: number;
  band: OverviewApiPriceBand;
}

/** Token mix split by request-input tier, measured by replaying the corpus. */
export interface OverviewTieredTokenMix {
  maxInputTokens: number;
  mix: OverviewTokenMix;
}

export interface OverviewApiPricing {
  /** Developer name as shown on its pricing page. */
  provider: string;
  /** Compact provider name for the cell's caption, when `provider` is long. */
  providerShort?: string;
  /** Exact API model id the price is quoted for. */
  apiModelId: string;
  sourceUrl: string;
  /** Date the price was read off the source page (YYYY-MM-DD). */
  asOf: string;
  /** Flat price, or input-length tiers in ascending order. */
  pricing: OverviewApiPriceBand | readonly OverviewApiPriceTier[];
  /** Short qualifier on which list price was used and why, per locale. */
  note: { en: string; zh: string };
}

export const OVERVIEW_API_PRICES_AS_OF = '2026-11-13';

const OVERVIEW_API_PRICING: Partial<Record<Model, OverviewApiPricing>> = {
  [Model.Muse_Spark_Open]: {
    provider: 'Meta',
    apiModelId: 'muse-spark-1.3',
    sourceUrl: 'https://dev.meta.ai/docs/pricing-rate-limits',
    asOf: OVERVIEW_API_PRICES_AS_OF,
    pricing: { cacheHit: 0.15, input: 1.25, output: 4.25 },
    note: {
      en: 'Standard mode. Contributor mode is cheaper but trains on your data. Muse Spark Open has no API of its own; it shares Muse Spark 1.3’s base model.',
      zh: '标准模式。贡献者模式更便宜，但会用你的数据训练。Muse Spark Open 没有独立 API，它与 Muse Spark 1.3 共用基础模型。',
    },
  },
  [Model.DeepSeek_V4_1_Flash]: {
    provider: 'DeepSeek',
    apiModelId: 'deepseek-flash',
    sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing/',
    asOf: OVERVIEW_API_PRICES_AS_OF,
    pricing: { cacheHit: 0.003, input: 0.15, output: 0.6 },
    note: {
      en: 'Off-peak price. Peak hours (weekdays 01:00–04:00 and 06:00–10:00 UTC) cost 2×.',
      zh: '非高峰价。高峰时段（工作日 UTC 01:00–04:00 与 06:00–10:00）价格为 2 倍。',
    },
  },
  [Model.Kimi_K3_1_Pro]: {
    provider: 'Moonshot AI',
    apiModelId: 'kimi-k3.1-pro',
    sourceUrl: 'https://platform.kimi.ai/docs/pricing/chat',
    asOf: OVERVIEW_API_PRICES_AS_OF,
    pricing: { cacheHit: 0.2, input: 2, output: 10 },
    note: {
      en: 'Automatic 5-minute cache; a cache write bills at the input price.',
      zh: '自动 5 分钟缓存；缓存写入按输入价计费。',
    },
  },
  [Model.MiniMax_M3_1_Flash]: {
    provider: 'MiniMax',
    apiModelId: 'MiniMax-M3.1-Flash',
    sourceUrl: 'https://platform.minimax.io/docs/pricing/overview',
    asOf: OVERVIEW_API_PRICES_AS_OF,
    pricing: { cacheHit: 0.015, input: 0.15, output: 0.6 },
    note: {
      en: 'Standard tier. The Priority tier costs 1.5×.',
      zh: '标准档。Priority 档价格为 1.5 倍。',
    },
  },
  [Model.GLM_5_2]: {
    provider: 'Z.ai',
    apiModelId: 'glm-5.3',
    sourceUrl: 'https://docs.z.ai/guides/overview/pricing',
    asOf: OVERVIEW_API_PRICES_AS_OF,
    pricing: { cacheHit: 0.26, input: 1.4, output: 4.4 },
    note: {
      en: 'GLM-5.2 and GLM-5.3 list the same price. Cache storage is free for a limited time.',
      zh: 'GLM-5.2 与 GLM-5.3 标价相同。缓存存储限时免费。',
    },
  },
  [Model.GLM_5_3_Flash]: {
    provider: 'Z.ai',
    apiModelId: 'glm-5.3-flash',
    sourceUrl: 'https://docs.z.ai/guides/overview/pricing',
    asOf: OVERVIEW_API_PRICES_AS_OF,
    pricing: { cacheHit: 0.03, input: 0.15, output: 0.5 },
    note: {
      en: 'Cache storage is free for a limited time.',
      zh: '缓存存储限时免费。',
    },
  },
  [Model.Qwen3_5]: {
    provider: 'Alibaba Cloud Model Studio',
    providerShort: 'Alibaba Cloud',
    apiModelId: 'qwen3.5-397b-a17b',
    sourceUrl:
      'https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen3-5-397b-a17b',
    asOf: OVERVIEW_API_PRICES_AS_OF,
    // Model Studio's "128K" uses binary K, as its "256K" context = 262,144.
    pricing: [
      { maxInputTokens: 131_072, band: { cacheHit: null, input: 0.172, output: 1.032 } },
      { maxInputTokens: 262_144, band: { cacheHit: null, input: 0.43, output: 2.58 } },
    ],
    note: {
      en: 'Global scope (US Virginia), priced per request by input length. Context caching is not supported, so every input token bills at the input price. The International scope lists a flat $0.60 / $3.60.',
      zh: 'Global 部署范围（美国弗吉尼亚），按单次请求输入长度计费。不支持上下文缓存，所有输入 token 均按输入价计费。International 范围为固定 $0.60 / $3.60。',
    },
  },
  [Model.Qwen3_8_Flash_Next]: {
    provider: 'Alibaba Cloud Model Studio',
    providerShort: 'Alibaba Cloud',
    apiModelId: 'qwen3.8-flash',
    sourceUrl: 'https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen3-8-flash',
    asOf: OVERVIEW_API_PRICES_AS_OF,
    pricing: { cacheHit: 0.014, input: 0.113, output: 0.382 },
    note: {
      en: 'Global scope, implicit cache; the International and US scopes list $0.15 / $0.47. Priced as qwen3.8-flash, the hosted Qwen3.8 Flash; Model Studio does not list the Flash Next open checkpoint by name.',
      zh: 'Global 部署范围，隐式缓存；International 与 US 范围为 $0.15 / $0.47。按 qwen3.8-flash（托管版 Qwen3.8 Flash）计价；百炼未以名称列出 Flash Next 开源权重。',
    },
  },
};

/**
 * Per-tier token mixes for tiered APIs, measured by replaying every request of
 * the 256K corpus (68,266 requests) and bucketing it by its own input length.
 * Tier buckets sum to `OVERVIEW_TOKEN_MIXES.agentx_256k` totals. The corpus
 * caches, but the only tiered API here (Qwen3.5) does not, so cached and
 * uncached input are kept together as uncached input.
 */
const OVERVIEW_TIERED_MIXES: Partial<
  Record<OverviewTokenMixKey, readonly OverviewTieredTokenMix[]>
> = {
  agentx_256k: [
    {
      maxInputTokens: 131_072,
      mix: { cachedTokens: 0, uncachedInputTokens: 2_879_088_448, outputTokens: 33_042_035 },
    },
    {
      maxInputTokens: 262_144,
      mix: { cachedTokens: 0, uncachedInputTokens: 4_012_140_416, outputTokens: 25_686_772 },
    },
  ],
};

/** Measured per-tier split of a corpus, or null when none is recorded. */
export function overviewTieredTokenMix(
  mixKey: OverviewTokenMixKey,
): readonly OverviewTieredTokenMix[] | null {
  return OVERVIEW_TIERED_MIXES[mixKey] ?? null;
}

/** Models with a 256K context cap that replay the filtered AgentX corpus. */
const OVERVIEW_256K_AGENTX_MODELS: ReadonlySet<Model> = new Set([
  Model.DeepSeek_R1,
  Model.Qwen3_5,
  Model.Qwen3_8_Flash_Next,
]);

export function overviewTokenMixKey(model: Model, scenario: OverviewScenario): OverviewTokenMixKey {
  if (scenario === 'single_turn_8k1k') return 'single_turn_8k1k';
  return OVERVIEW_256K_AGENTX_MODELS.has(model) ? 'agentx_256k' : 'agentx_full';
}

export function totalTokens(mix: OverviewTokenMix): number {
  return mix.cachedTokens + mix.uncachedInputTokens + mix.outputTokens;
}

/** Each part's share of total tokens, in [0, 1]. */
export function tokenMixShares(mix: OverviewTokenMix): OverviewTokenMix {
  const total = totalTokens(mix);
  return {
    cachedTokens: mix.cachedTokens / total,
    uncachedInputTokens: mix.uncachedInputTokens / total,
    outputTokens: mix.outputTokens / total,
  };
}

/** Dollars billed for `mix` at a flat band (tokens, not millions). */
function bandDollars(band: OverviewApiPriceBand, mix: OverviewTokenMix): number {
  const cachedRate = band.cacheHit ?? band.input;
  return (
    (mix.cachedTokens * cachedRate +
      mix.uncachedInputTokens * band.input +
      mix.outputTokens * band.output) /
    1_000_000
  );
}

/** Splits a mix across input-length tiers. Fixed-length scenarios fall wholly
 *  in the first tier that fits; replayed corpora use measured buckets. */
function mixByTier(
  mixKey: OverviewTokenMixKey,
  tiers: readonly OverviewApiPriceTier[],
): { band: OverviewApiPriceBand; mix: OverviewTokenMix }[] | null {
  if (mixKey === 'single_turn_8k1k') {
    const tier = tiers.find((t) => t.maxInputTokens >= 8192);
    return tier ? [{ band: tier.band, mix: OVERVIEW_TOKEN_MIXES.single_turn_8k1k }] : null;
  }
  const measured = OVERVIEW_TIERED_MIXES[mixKey];
  if (!measured || measured.length !== tiers.length) return null;
  const pairs = tiers.map((tier, i) =>
    measured[i]?.maxInputTokens === tier.maxInputTokens
      ? { band: tier.band, mix: measured[i].mix }
      : null,
  );
  return pairs.every((pair) => pair !== null) ? pairs : null;
}

export interface OverviewApiPriceRead {
  status: 'priced';
  pricing: OverviewApiPricing;
  mixKey: OverviewTokenMixKey;
  /** USD per million total tokens for the row's workload. */
  costPerMtok: number;
}

export interface OverviewApiPriceUnavailable {
  status: 'unavailable';
  reason: 'no_official_api' | 'tier_mix_unknown';
}

/** The row's official API price, or the reason none is shown. Never estimates:
 *  a model without a recorded first-party price stays unavailable. */
export function overviewApiPrice(
  model: Model,
  scenario: OverviewScenario,
): OverviewApiPriceRead | OverviewApiPriceUnavailable {
  const pricing = OVERVIEW_API_PRICING[model];
  if (!pricing) return { status: 'unavailable', reason: 'no_official_api' };
  const mixKey = overviewTokenMixKey(model, scenario);
  const mix = OVERVIEW_TOKEN_MIXES[mixKey];
  let dollars: number;
  if ('input' in pricing.pricing) {
    dollars = bandDollars(pricing.pricing, mix);
  } else {
    const parts = mixByTier(mixKey, pricing.pricing);
    if (!parts) return { status: 'unavailable', reason: 'tier_mix_unknown' };
    dollars = parts.reduce((sum, part) => sum + bandDollars(part.band, part.mix), 0);
  }
  return {
    status: 'priced',
    pricing,
    mixKey,
    costPerMtok: (dollars / totalTokens(mix)) * 1_000_000,
  };
}

/** How many times cheaper self-hosting is than the API (API ÷ hardware).
 *  Null when either side is missing or non-positive. */
export function overviewApiRatio(
  hardwareCostPerMtok: number | null,
  apiCostPerMtok: number | null,
): number | null {
  if (hardwareCostPerMtok === null || apiCostPerMtok === null) return null;
  if (hardwareCostPerMtok <= 0 || apiCostPerMtok <= 0) return null;
  return apiCostPerMtok / hardwareCostPerMtok;
}
