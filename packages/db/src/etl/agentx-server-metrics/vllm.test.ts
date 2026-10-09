import { describe, expect, it } from 'vitest';

import { parseScrapeCsv } from './scrape';
import { scrapeCsv } from './test-helpers';
import type { RolePoolInput } from './types';
import { vllm } from './vllm';

const agg = (workers: string[][]): RolePoolInput => ({
  workers,
  scrape: new Map(),
  topology: { tp: 8, dpAttention: false, workers: null },
});

describe('vllm parser', () => {
  it('sums one pool per DP engine core, merging headless hosts of one worker', () => {
    const host0 = [
      'data_parallel_size=2',
      '(EngineCore_DP0 pid=11) INFO [kv_cache_utils.py:2235] GPU KV cache size: 1,226,636 tokens',
      // A reprint of the same engine core does not add capacity.
      '(EngineCore_DP0 pid=11) INFO [kv_cache_utils.py:2235] GPU KV cache size: 1,226,636 tokens',
    ];
    const host1 = [
      '(EngineCore_DP1 pid=12) INFO [kv_cache_utils.py:2235] GPU KV cache size: 1,224,353 tokens',
    ];
    expect(vllm.rolePool(agg([[...host0, ...host1]]))).toBe(2_450_989);
  });

  it('rejects a worker whose DP engine cores were not all logged', () => {
    expect(
      vllm.rolePool(
        agg([['data_parallel_size=4', '(EngineCore_DP0 pid=1) GPU KV cache size: 100 tokens']]),
      ),
    ).toBe('1 of 4 DP engine cores logged');
  });

  it('requires every worker of a disaggregated role', () => {
    const line = ['(EngineCore pid=1) GPU KV cache size: 100 tokens'];
    const input = { ...agg([line]), topology: { tp: 8, dpAttention: false, workers: 2 } };
    expect(vllm.rolePool(input)).toBe('1 of 2 worker logs');
    expect(vllm.rolePool({ ...input, workers: [line, line] })).toBe(200);
  });

  it('prefers token-source counters over prefix-cache queries', () => {
    const scrape = parseScrapeCsv(
      scrapeCsv([
        { type: 'counter', metric: 'vllm:prompt_tokens', value: 1000 },
        { type: 'counter', metric: 'vllm:generation_tokens', value: 50 },
        { type: 'counter', metric: 'vllm:prefix_cache_hits', value: 10 },
        { type: 'counter', metric: 'vllm:prefix_cache_queries', value: 100 },
        {
          type: 'counter',
          metric: 'vllm:prompt_tokens_by_source',
          value: 600,
          labels: { source: 'local_cache_hit' },
        },
        {
          type: 'counter',
          metric: 'vllm:prompt_tokens_by_source',
          value: 300,
          labels: { source: 'external_kv_transfer' },
        },
        {
          type: 'counter',
          metric: 'vllm:prompt_tokens_by_source',
          value: 100,
          labels: { source: 'local_compute' },
        },
        { type: 'gauge', metric: 'vllm:kv_cache_usage_perc', value: 0.25 },
      ]),
    );
    expect(vllm.scrape(scrape)).toEqual({
      gpuCacheHitRate: 0.6,
      cpuCacheHitRate: 0.3,
      externalCacheHitRate: 0.3,
      gpuKvCacheUsage: 0.25,
      promptTokens: 1000,
      generationTokens: 50,
    });
  });
});
