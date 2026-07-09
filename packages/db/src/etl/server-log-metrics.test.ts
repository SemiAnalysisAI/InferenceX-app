import { describe, expect, it } from 'vitest';

import { kvCachePoolTokensFromServerLog } from './server-log-metrics';

describe('kvCachePoolTokensFromServerLog', () => {
  it('returns null for empty / missing logs', () => {
    expect(kvCachePoolTokensFromServerLog(null)).toBeNull();
    expect(kvCachePoolTokensFromServerLog('')).toBeNull();
    expect(kvCachePoolTokensFromServerLog('no kv cache line here')).toBeNull();
  });

  it('reads a single-engine (ep1) pool size', () => {
    const log = `
(EngineCore pid=1950943) INFO 06-30 18:28:46 [kv_cache_utils.py:1744] GPU KV cache size: 11,294,463 tokens
(EngineCore pid=1950943) INFO 06-30 18:28:46 [kv_cache_utils.py:1745] Maximum concurrency for 1,048,576 tokens per request: 10.77x
`;
    expect(kvCachePoolTokensFromServerLog(log)).toBe(11_294_463);
  });

  it('sums across data-parallel engine cores (ep8)', () => {
    const lines = Array.from(
      { length: 8 },
      (_, i) =>
        `(EngineCore_DP${i} pid=${2337827 + i}) INFO [kv_cache_utils.py:1744] GPU KV cache size: 11,577,333 tokens`,
    ).join('\n');
    expect(kvCachePoolTokensFromServerLog(lines)).toBe(11_577_333 * 8);
  });

  it('dedups reprinted lines for the same engine core', () => {
    const log = `
(EngineCore_DP0 pid=1) GPU KV cache size: 5,000,000 tokens
(EngineCore_DP0 pid=1) GPU KV cache size: 5,000,000 tokens
(EngineCore_DP1 pid=2) GPU KV cache size: 5,000,000 tokens
`;
    // DP0 counted once + DP1 once = 10M, not 15M.
    expect(kvCachePoolTokensFromServerLog(log)).toBe(10_000_000);
  });

  it('falls back to bare lines when no engine-core prefix is present', () => {
    const log = `INFO GPU KV cache size: 1,234,567 tokens`;
    expect(kvCachePoolTokensFromServerLog(log)).toBe(1_234_567);
  });

  it('reads an SGLang single-scheduler pool size', () => {
    const log = `
[2026-07-08 15:44:52] server_args=ServerArgs(tp_size=8, dp_size=1, moe_dp_size=1)
[2026-07-08 15:55:55 DP0 TP0 EP0] max_total_num_tokens=2,301,440, chunked_prefill_size=4096
`;
    expect(kvCachePoolTokensFromServerLog(log)).toBe(2_301_440);
  });

  it('multiplies an SGLang per-scheduler pool by data-parallel size', () => {
    const log = `
[2026-07-08 16:43:35] server_args=ServerArgs(tp_size=4, dp_size=4, moe_dp_size=1)
[2026-07-08 16:49:59 DP0 TP0 EP0] max_total_num_tokens=3219456, chunked_prefill_size=4096
`;
    expect(kvCachePoolTokensFromServerLog(log)).toBe(3_219_456 * 4);
  });

  it('dedups repeated SGLang startup summaries', () => {
    const log = `
[2026-07-08 16:43:35] server_args=ServerArgs(dp_size=8, moe_dp_size=1)
[2026-07-08 16:49:59 DP0 TP0 EP0] max_total_num_tokens=2301440
[2026-07-08 16:49:59 DP0 TP0 EP0] max_total_num_tokens=2301440
`;
    expect(kvCachePoolTokensFromServerLog(log)).toBe(2_301_440 * 8);
  });
});
