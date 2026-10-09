import { fraction, gaugeStat, rate, sumStat, type Scrape } from './scrape';
import type { EngineParser, ScrapeScalars } from './types';

function trtllmScrape(scrape: Scrape): ScrapeScalars {
  const prompt = sumStat(scrape, 'trtllm_prompt_tokens_total');
  return {
    gpuCacheHitRate:
      fraction(gaugeStat(scrape, 'trtllm_kv_cache_hit_rate', 'avg')) ??
      rate(sumStat(scrape, 'trtllm_prompt_cached_tokens_total'), prompt),
    cpuCacheHitRate: null,
    externalCacheHitRate: null,
    gpuKvCacheUsage: fraction(gaugeStat(scrape, 'trtllm_kv_cache_utilization')),
    promptTokens: prompt,
    generationTokens: sumStat(scrape, 'trtllm_generation_tokens_total'),
  };
}

/**
 * TensorRT-LLM startup logs do not state the final pool consistently across
 * versions, so capacity comes from each worker endpoint's exported blocks.
 * Under attention DP the exporter reports rank 0's pool only.
 */
export const trtllm: EngineParser = {
  logLines: [],
  logTokens: [],
  scrape: trtllmScrape,
  rolePool({ scrape, topology }) {
    if (topology.dpAttention) return 'attention-DP exports rank 0 capacity only';
    const tokensPerBlock = new Map(
      (scrape.get('trtllm_kv_cache_tokens_per_block') ?? []).map((s) => [s.endpoint, s.stats.max]),
    );
    // One pool per worker endpoint; repeated series (e.g. a restarted pid) are not extra pools.
    const blocks = new Map<string, number>();
    for (const series of scrape.get('trtllm_kv_cache_max_blocks') ?? []) {
      const value = series.stats.max;
      if (value !== undefined)
        blocks.set(series.endpoint, Math.max(blocks.get(series.endpoint) ?? 0, value));
    }
    if (blocks.size === 0) return 'no trtllm_kv_cache_max_blocks series';
    if (topology.workers !== null && blocks.size !== topology.workers) {
      return `${blocks.size} of ${topology.workers} worker endpoints scraped`;
    }
    let total = 0;
    for (const [endpoint, count] of blocks) {
      const perBlock = tokensPerBlock.get(endpoint);
      if (perBlock === undefined) return 'missing tokens per block';
      total += count * perBlock;
    }
    return total;
  },
};
