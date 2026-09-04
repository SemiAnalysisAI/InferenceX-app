import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  ATOM_KV_BLOCKS_METRIC,
  atomKvCacheBlocksFromMetricPhases,
  atomKvCachePoolTokensFromServerLog,
  updateAtomKvCachePoolTokens,
} from './atom-kv-capacity';
import { computeTraceDerivedPayloads } from './compute-trace-derived';

const metric = (...values: number[]) => ({
  [ATOM_KV_BLOCKS_METRIC]: {
    series: [{ timeslices: values.map((avg) => ({ avg, start_ns: 0, end_ns: 1e9 })) }],
  },
});
const capacity = (blocks: number, blockSize: number, dcp = '') =>
  `[atom 11:27:22] Concurrent capacity vs context length (max_model_len=1048576, block_size=${blockSize}, max_slots=192, pool_blocks=${blocks}${dcp}):`;

describe('ATOM KV capacity', () => {
  it('uses the selected TP pool, not the sum/minimum/first startup estimate (GLM #440062)', () => {
    const log = [capacity(150079, 16), capacity(150190, 16), capacity(150522, 16)].join('\n');
    expect(atomKvCachePoolTokensFromServerLog(log, 150522)).toBe(2_408_352);
  });

  it('uses the already-summed DP count and resolved block size (DeepSeek #440703)', () => {
    const log = [
      "Engine kwargs: {'kv_cache_block_size': 16}",
      capacity(60372, 256),
      capacity(60393, 256),
    ].join('\n');
    expect(atomKvCachePoolTokensFromServerLog(log, 482735)).toBe(123_580_160);
  });

  it('accounts for sharded DCP tokens once (Kimi #440462)', () => {
    const log = [
      capacity(8687, 128, ', dcp=8 (blk/req is per-rank)'),
      capacity(8414, 128, ', dcp=8 (blk/req is per-rank)'),
    ].join('\n');
    expect(atomKvCachePoolTokensFromServerLog(log, 8414)).toBe(8_615_936);
  });

  it('does not cap the pool by context length or max slots', () => {
    expect(atomKvCachePoolTokensFromServerLog(capacity(60372, 256), 60372)).toBe(15_455_232);
  });

  it('does not multiply repeated startup lines, endpoints, or phases', () => {
    const phase = metric(482735, 482735);
    phase[ATOM_KV_BLOCKS_METRIC].series.push(...metric(482735)[ATOM_KV_BLOCKS_METRIC].series);
    const blocks = atomKvCacheBlocksFromMetricPhases(phase, metric(0, 482735));
    expect(blocks).toBe(482735);
    expect(
      atomKvCachePoolTokensFromServerLog(
        [capacity(60372, 256), capacity(60372, 256)].join('\n'),
        blocks!,
      ),
    ).toBe(123_580_160);
  });

  it('rejects missing, fractional, changing or invalid allocated block counts', () => {
    expect(atomKvCacheBlocksFromMetricPhases({}, {})).toBeNull();
    expect(atomKvCacheBlocksFromMetricPhases(metric(0), {})).toBeNull();
    for (const values of [[10, 11], [-1], [0.5], [Infinity], [NaN]]) {
      expect(atomKvCacheBlocksFromMetricPhases(metric(...values), {})).toBeNull();
    }
  });

  it('leaves ambiguous or unsupported startup logs unset', () => {
    for (const log of [
      '',
      'pool_blocks=100',
      capacity(100, 0),
      capacity(100, 16, ', dcp=0'),
      `${capacity(100, 16)}\n${capacity(100, 256)}`,
      `${capacity(100, 16)}\n${capacity(100, 16, ', dcp=8')}`,
    ]) {
      expect(atomKvCachePoolTokensFromServerLog(log, 100)).toBeNull();
    }
    expect(
      atomKvCachePoolTokensFromServerLog(capacity(100, 16), Number.MAX_SAFE_INTEGER),
    ).toBeNull();
    expect(atomKvCachePoolTokensFromServerLog(capacity(100, 16), 0)).toBeNull();
  });

  it('extracts capacity on the shared streaming ingestion path', async () => {
    const blob = gzipSync(
      JSON.stringify({ metrics: metric(482735), warmup_metrics: metric(0, 482735) }),
    );
    const derived = await computeTraceDerivedPayloads(
      null,
      blob,
      { framework: 'atom' },
      { maxInMemoryBytes: 1 },
    );
    expect(derived.atomKvCacheBlocks).toBe(482735);
  });

  it('updates only the capacity key for scoped ATOM rows, preserving benchmark metrics', async () => {
    const calls: { text: string; values: unknown[] }[] = [];
    const execute = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?');
      calls.push({ text, values });
      return Promise.resolve(
        text.includes('select br.id')
          ? [{ id: 440703, capacity_log: capacity(60372, 256) }]
          : Object.assign([], { count: 1 }),
      );
    };
    const sql = Object.assign(execute, {
      array: (values: unknown[]) => values,
    }) as unknown as Parameters<typeof updateAtomKvCachePoolTokens>[0];
    expect(await updateAtomKvCachePoolTokens(sql, [440703], 482735)).toBe(1);
    expect(calls[0].text).toContain("c.framework = 'atom' and not c.disagg");
    expect(calls[0].values).toContainEqual([440703]);
    expect(calls[1].text).toContain("jsonb_set(metrics, '{kv_cache_pool_tokens}'");
    expect(calls[1].text).toContain('is distinct from');
    expect(calls[1].values).toEqual([123580160, 440703, 123580160]);
    expect(await updateAtomKvCachePoolTokens(sql, [440703], null)).toBe(0);
    expect(calls).toHaveLength(2);
  });
});
