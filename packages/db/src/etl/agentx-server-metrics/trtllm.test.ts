import { describe, expect, it } from 'vitest';

import { parseScrapeCsv } from './scrape';
import { scrapeCsv } from './test-helpers';
import { trtllm } from './trtllm';

const pool = (endpoints: [string, number][], dpAttention = false, workers: number | null = null) =>
  trtllm.rolePool({
    workers: [],
    scrape: parseScrapeCsv(
      scrapeCsv(
        endpoints.flatMap(([endpoint, blocks]) => [
          { type: 'gauge' as const, metric: 'trtllm_kv_cache_max_blocks', value: blocks, endpoint },
          {
            type: 'gauge' as const,
            metric: 'trtllm_kv_cache_tokens_per_block',
            value: 128,
            endpoint,
          },
        ]),
      ),
    ),
    topology: { tp: 4, dpAttention, workers },
  });

describe('trtllm parser', () => {
  it('sums each worker endpoint pool from exported blocks', () => {
    expect(
      pool(
        [
          ['10.0.0.1:7500', 62762],
          ['10.0.0.2:7501', 62830],
        ],
        false,
        2,
      ),
    ).toBe(16_075_776);
  });

  it('refuses attention-DP workers, whose exporter reports rank 0 only', () => {
    expect(pool([['10.0.0.1:7500', 97089]], true)).toBe(
      'attention-DP exports rank 0 capacity only',
    );
  });

  it('requires one scraped endpoint per expected worker', () => {
    expect(pool([['10.0.0.1:7500', 1000]], false, 3)).toBe('1 of 3 worker endpoints scraped');
  });

  it('falls back from the exported hit-rate gauge to cached prompt tokens', () => {
    const scrape = parseScrapeCsv(
      scrapeCsv([
        { type: 'counter', metric: 'trtllm_prompt_tokens_total', value: 1800 },
        { type: 'counter', metric: 'trtllm_prompt_cached_tokens_total', value: 450 },
        { type: 'counter', metric: 'trtllm_generation_tokens_total', value: 30 },
        { type: 'gauge', metric: 'trtllm_kv_cache_utilization', value: 0.5 },
      ]),
    );
    expect(trtllm.scrape(scrape)).toEqual({
      gpuCacheHitRate: 0.25,
      cpuCacheHitRate: null,
      externalCacheHitRate: null,
      gpuKvCacheUsage: 0.5,
      promptTokens: 1800,
      generationTokens: 30,
    });
    const gauge = parseScrapeCsv(
      scrapeCsv([{ type: 'gauge', metric: 'trtllm_kv_cache_hit_rate', value: 97 }]),
    );
    expect(trtllm.scrape(gauge).gpuCacheHitRate).toBe(0.97);
  });
});
