import { fraction, gaugeStat, rate, sumByLabel, sumStat, type Scrape } from './scrape';
import { sumWorkerPools, type EngineParser, type ScrapeScalars } from './types';

const MAX_TOKENS = /\bmax_total_num_tokens=(?<tokens>\d+)/u;
const DP_TAG = /\bDP(?<rank>\d+)\b/u;
const DP_SIZE = /\bdp_size=(?<size>\d+)/u;

function sglangScrape(scrape: Scrape): ScrapeScalars {
  const prompt = sumStat(scrape, 'sglang:prompt_tokens');
  const cached = sumByLabel(scrape, 'sglang:cached_tokens', 'cache_source');
  // HiCache host hits are the CPU tier, outside the GPU radix cache.
  const host = rate(cached.get('host') ?? null, prompt);
  return {
    gpuCacheHitRate: rate(cached.get('device') ?? null, prompt),
    cpuCacheHitRate: host,
    externalCacheHitRate: host,
    gpuKvCacheUsage: fraction(gaugeStat(scrape, 'sglang:token_usage')),
    promptTokens: prompt,
    generationTokens: sumStat(scrape, 'sglang:generation_tokens'),
  };
}

/**
 * `max_total_num_tokens` is one DP rank's pool; TP ranks of that rank share
 * it. SGLang sizes every DP rank alike and often logs only DP0, so a single
 * logged rank stands for all `dp_size` ranks.
 */
function workerPool(lines: readonly string[]): number | string {
  const perRank = new Map<string, number>();
  let dpSize = 1;
  for (const line of lines) {
    const dp = DP_SIZE.exec(line);
    if (dp) dpSize = Math.max(dpSize, Number(dp.groups!.size));
    const tokens = MAX_TOKENS.exec(line);
    if (!tokens) continue;
    const rank = DP_TAG.exec(line.slice(0, tokens.index))?.groups!.rank ?? '0';
    perRank.set(rank, Number(tokens.groups!.tokens));
  }
  if (perRank.size === 0) return 'no max_total_num_tokens line';
  const values = [...perRank.values()];
  if (perRank.size === 1) return values[0]! * dpSize;
  if (perRank.size !== dpSize) return `${perRank.size} of ${dpSize} DP ranks logged`;
  return values.reduce((sum, value) => sum + value, 0);
}

export const sglang: EngineParser = {
  logLines: ['max_total_num_tokens=[0-9]+'],
  logTokens: ['dp_size'],
  scrape: sglangScrape,
  rolePool: (input) => sumWorkerPools(input, workerPool),
};
