import { fraction, gaugeStat, rate, sumByLabel, sumStat, type Scrape } from './scrape';
import { sumWorkerPools, type EngineParser, type ScrapeScalars } from './types';

const KV_SIZE = /GPU KV cache size:\s*(?<tokens>[\d,]+)\s*tokens/u;
const ENGINE_TAG = /\((?<tag>EngineCore(?:_DP\d+)?)\s+pid=\d+\)/u;
const DP_SIZE = /\bdata_parallel_size=(?<size>\d+)/u;

function vllmScrape(scrape: Scrape): ScrapeScalars {
  let gpu = rate(
    sumStat(scrape, 'vllm:prefix_cache_hits'),
    sumStat(scrape, 'vllm:prefix_cache_queries'),
  );
  let external = rate(
    sumStat(scrape, 'vllm:external_prefix_cache_hits'),
    sumStat(scrape, 'vllm:external_prefix_cache_queries'),
  );
  // Token-source counters split local hits from external (offload/connector) loads.
  const bySource = sumByLabel(scrape, 'vllm:prompt_tokens_by_source', 'source');
  const sourceTotal = [...bySource.values()].reduce((sum, value) => sum + value, 0);
  if (sourceTotal > 0) {
    const local = bySource.get('local_cache_hit');
    const transfer = bySource.get('external_kv_transfer');
    if (local !== undefined) gpu = local / sourceTotal;
    if (transfer !== undefined) external = transfer / sourceTotal;
  }
  return {
    gpuCacheHitRate: gpu,
    cpuCacheHitRate: external,
    externalCacheHitRate: external,
    gpuKvCacheUsage: fraction(
      gaugeStat(scrape, ['vllm:kv_cache_usage_perc', 'vllm:gpu_cache_usage_perc']),
    ),
    promptTokens: sumStat(scrape, 'vllm:prompt_tokens'),
    generationTokens: sumStat(scrape, 'vllm:generation_tokens'),
  };
}

/**
 * One `GPU KV cache size` line per engine core (DP rank) with TP already
 * folded in. Headless DP ranks on other hosts log their own engine cores.
 */
function workerPool(lines: readonly string[]): number | string {
  const perEngine = new Map<string, number>();
  let dataParallel = 1;
  for (const line of lines) {
    const dp = DP_SIZE.exec(line);
    if (dp) dataParallel = Math.max(dataParallel, Number(dp.groups!.size));
    const size = KV_SIZE.exec(line);
    if (!size) continue;
    const tag = ENGINE_TAG.exec(line)?.groups!.tag ?? 'EngineCore';
    perEngine.set(tag, Number(size.groups!.tokens!.replaceAll(',', '')));
  }
  if (perEngine.size === 0) return 'no GPU KV cache size line';
  if (dataParallel > 1 && perEngine.size !== dataParallel) {
    return `${perEngine.size} of ${dataParallel} DP engine cores logged`;
  }
  return [...perEngine.values()].reduce((sum, value) => sum + value, 0);
}

export const vllm: EngineParser = {
  logLines: ['GPU KV cache size: [0-9,]+ tokens'],
  logTokens: ['data_parallel_size'],
  scrape: vllmScrape,
  rolePool: (input) => sumWorkerPools(input, workerPool),
};
