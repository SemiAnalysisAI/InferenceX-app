import { describe, expect, it } from 'vitest';

import { parseScrapeCsv } from './scrape';
import { sglang } from './sglang';
import { scrapeCsv } from './test-helpers';
import type { RolePoolInput } from './types';

const worker = (lines: string[]): RolePoolInput => ({
  workers: [lines],
  scrape: new Map(),
  topology: { tp: 8, dpAttention: false, workers: null },
});

const rank = (dp: number, tokens: number) =>
  `[DP${dp} TP${dp} EP${dp}] max_total_num_tokens=${tokens}, context_len=1048576`;

describe('sglang parser', () => {
  it('counts TP ranks of one DP rank as a single shared pool', () => {
    // Every TP rank reports the same pool; summing them overcounts by TP.
    const lines = [
      '[2026-08-03 23:23:57 TP0] max_total_num_tokens=2693376, chunked_prefill_size=8192',
      '[2026-08-03 23:23:57 TP8] max_total_num_tokens=2693376, chunked_prefill_size=8192',
    ];
    expect(sglang.rolePool(worker(lines))).toBe(2_693_376);
  });

  it('scales a single logged DP rank by dp_size under DP attention', () => {
    const lines = [
      ' dp_size=8',
      '[2026-08-20 DP0 TP0 EP0] max_total_num_tokens=218560, chunked_prefill_size=8192',
    ];
    expect(sglang.rolePool(worker(lines))).toBe(1_748_480);
  });

  it('sums DP ranks when all are logged and rejects a partial set', () => {
    expect(sglang.rolePool(worker([' dp_size=2', rank(0, 100), rank(1, 90)]))).toBe(190);
    expect(sglang.rolePool(worker([' dp_size=4', rank(0, 100), rank(1, 90)]))).toBe(
      '2 of 4 DP ranks logged',
    );
  });

  it('splits device and HiCache host hits by cache source', () => {
    const scrape = parseScrapeCsv(
      scrapeCsv([
        { type: 'counter', metric: 'sglang:prompt_tokens', value: 1000 },
        { type: 'counter', metric: 'sglang:generation_tokens', value: 40 },
        {
          type: 'counter',
          metric: 'sglang:cached_tokens',
          value: 700,
          labels: { cache_source: 'device' },
        },
        {
          type: 'counter',
          metric: 'sglang:cached_tokens',
          value: 100,
          labels: { cache_source: 'host' },
        },
        { type: 'gauge', metric: 'sglang:token_usage', value: 58 },
      ]),
    );
    expect(sglang.scrape(scrape)).toEqual({
      gpuCacheHitRate: 0.7,
      cpuCacheHitRate: 0.1,
      externalCacheHitRate: 0.1,
      gpuKvCacheUsage: 0.58,
      promptTokens: 1000,
      generationTokens: 40,
    });
  });
});
