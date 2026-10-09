import { describe, expect, it } from 'vitest';

import { atom } from './atom';
import { parseScrapeCsv } from './scrape';
import { scrapeCsv } from './test-helpers';

const CAPACITY =
  '[atom 12:33:14] Concurrent capacity vs context length (max_model_len=1048576, block_size=128, max_slots=32, pool_blocks=8687, dcp=8 (blk/req is per-rank)):';

const pool = (lines: string[][], blocks: number[]) =>
  atom.rolePool({
    workers: lines,
    scrape: parseScrapeCsv(
      scrapeCsv(
        blocks.map((value) => ({ type: 'gauge', metric: 'atom:kv_cache_blocks_total', value })),
      ),
    ),
    topology: { tp: 8, dpAttention: false, workers: null },
  });

describe('atom parser', () => {
  it('scales the allocated block gauge by resolved block size and DCP width', () => {
    // The TP ranks' differing startup pool_blocks estimates are not the pool.
    expect(pool([[CAPACITY, CAPACITY.replace('8687', '8702')]], [8414])).toBe(8_615_936);
  });

  it('rejects inconsistent capacity metadata', () => {
    expect(pool([[CAPACITY]], [8414, 8500])).toBe('no constant allocated block count');
    expect(pool([[CAPACITY, CAPACITY.replace('block_size=128', 'block_size=256')]], [8414])).toBe(
      'no consistent block size',
    );
    expect(pool([[CAPACITY], [CAPACITY]], [8414])).toBe('2 worker logs; one is required');
  });

  it('reads admitted prefix-cache and LMCache counters', () => {
    const scrape = parseScrapeCsv(
      scrapeCsv([
        { type: 'counter', metric: 'atom:prompt_tokens_total', value: 1000 },
        { type: 'counter', metric: 'atom_generation_tokens', value: 25 },
        { type: 'counter', metric: 'atom:prefix_cache_full_tokens', value: 800 },
        { type: 'counter', metric: 'atom:prefix_cache_cached_tokens', value: 600 },
        { type: 'counter', metric: 'atom:lmcache_loaded_tokens', value: 200 },
        { type: 'gauge', metric: 'atom:kv_cache_usage_ratio', value: 0.4 },
      ]),
    );
    expect(atom.scrape(scrape)).toEqual({
      gpuCacheHitRate: 0.75,
      cpuCacheHitRate: 0.25,
      externalCacheHitRate: 0.25,
      gpuKvCacheUsage: 0.4,
      promptTokens: 1000,
      generationTokens: 25,
    });
  });
});
