import { describe, expect, it } from 'vitest';
import type { BenchmarkSibling } from '@/hooks/api/use-benchmark-siblings';
import { memoryComparisonPeers } from './memory-view-utils';

const seed = {
  id: 1,
  conc: 8,
  decode_tp: 4,
  decode_ep: 1,
  disagg: false,
  decode_dcp_size: 1,
  offload_mode: 'off',
} as BenchmarkSibling;
describe('memory concurrency selection', () => {
  it('sorts concurrency and retains repeated measurements without averaging', () => {
    expect(
      memoryComparisonPeers(1, [seed, { ...seed, id: 2, conc: 1 }, { ...seed, id: 3 }]).map(
        (p) => p.id,
      ),
    ).toEqual([2, 1, 3]);
  });
  it('excludes different topology, offload and disaggregated layouts', () => {
    expect(
      memoryComparisonPeers(1, [
        seed,
        { ...seed, id: 2, decode_ep: 4 },
        { ...seed, id: 3, decode_dcp_size: 2 },
        { ...seed, id: 4, offload_mode: 'on' },
        { ...seed, id: 5, disagg: true },
      ]),
    ).toEqual([seed]);
    expect(memoryComparisonPeers(5, [{ ...seed, id: 5, disagg: true }])).toEqual([]);
    expect(memoryComparisonPeers(0, [seed])).toEqual([]);
  });
});
