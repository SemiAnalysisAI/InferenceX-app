import { describe, expect, it } from 'vitest';

import { kvCachePoolTokensFromServerLog, llmdEndpointRolesFromLogs } from './server-log-metrics';

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
});

it('reads llm-d discovery roles and rejects conflicting host assignments', () => {
  const prefill =
    '- address: 10.30.1.165\n  labels:\n    llm-d.ai/role: prefill\n  name: prefill-0';
  const decode = '- address: 10.30.1.129\n  labels:\n    llm-d.ai/role: decode\n  name: decode-0';
  expect(llmdEndpointRolesFromLogs([prefill, prefill, decode])).toEqual({
    '10.30.1.165': 'prefill',
    '10.30.1.129': 'decode',
  });
  expect(
    llmdEndpointRolesFromLogs([prefill, prefill.replace('role: prefill', 'role: decode'), decode]),
  ).toEqual({ '10.30.1.129': 'decode' });
  expect(llmdEndpointRolesFromLogs(['engine=0 generation_tokens=100'])).toEqual({});
});
