import { fraction, gaugeStat, rate, sumStat, type Scrape } from './scrape';
import type { EngineParser, ScrapeScalars } from './types';

/** Direct worker metrics and Atomesh's colon-normalized form, raw and `_total` counters. */
const names = (stem: string): string[] => [
  `atom:${stem}`,
  `atom_${stem}`,
  `atom:${stem}_total`,
  `atom_${stem}_total`,
];
const BLOCKS = 'atom:kv_cache_blocks_total';

function atomScrape(scrape: Scrape): ScrapeScalars {
  const full = sumStat(scrape, names('prefix_cache_full_tokens'));
  // The admitted cache counter can already include a completed LMCache load.
  const external = rate(sumStat(scrape, names('lmcache_loaded_tokens')), full);
  return {
    gpuCacheHitRate: rate(sumStat(scrape, names('prefix_cache_cached_tokens')), full),
    cpuCacheHitRate: external,
    externalCacheHitRate: external,
    gpuKvCacheUsage: fraction(
      gaugeStat(scrape, ['atom:kv_cache_usage_ratio', 'atom_kv_cache_usage_ratio']),
    ),
    promptTokens: sumStat(scrape, names('prompt_tokens')),
    generationTokens: sumStat(scrape, names('generation_tokens')),
  };
}

/** Resolved scheduler block size × DCP width from `Concurrent capacity` startup lines. */
function tokensPerBlock(lines: readonly string[]): number | null {
  let scale: number | null = null;
  for (const line of lines) {
    if (!line.includes('Concurrent capacity vs context length')) continue;
    const blockSize = /\bblock_size=(?<size>\d+)(?=[,)])/u.exec(line);
    const dcp = /\bdcp=(?<width>\d+)(?=[ ,)])/u.exec(line);
    if (!blockSize || (line.includes('dcp=') && !dcp)) return null;
    // DCP stores one shard per rank; TP replicas do not multiply capacity.
    const next = Number(blockSize.groups!.size) * (dcp ? Number(dcp.groups!.width) : 1);
    if (!(next > 0) || (scale !== null && scale !== next)) return null;
    scale = next;
  }
  return scale;
}

/**
 * ATOM's startup `pool_blocks` estimates differ across TP ranks; the exported
 * allocated-block gauge is the selected pool and already sums DP pools. Logs
 * and endpoints cannot be paired per worker, so only one worker is supported.
 */
export const atom: EngineParser = {
  logLines: ['Concurrent capacity vs context length'],
  logTokens: [],
  scrape: atomScrape,
  rolePool({ workers, scrape }) {
    if (workers.length !== 1) return `${workers.length} worker logs; one is required`;
    const blocks = new Set(
      (scrape.get(BLOCKS) ?? []).flatMap((s) => [s.stats.min ?? 0, s.stats.max ?? 0]),
    );
    blocks.delete(0);
    if (blocks.size !== 1) return 'no constant allocated block count';
    const scale = tokensPerBlock(workers[0]!);
    if (scale === null) return 'no consistent block size';
    return [...blocks][0]! * scale;
  },
};
