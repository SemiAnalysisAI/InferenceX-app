import { describe, it, expect } from 'vitest';
import {
  countSeenPrefixBlocks,
  buildConversationStructure,
  countConversationRequests,
  linearHistogram,
  logHistogram,
  logHistogramWithZero,
  subagentRequestTurns,
  summarizeValues,
  type RawWekaConversation,
  type SubagentNode,
  type TurnNode,
} from './weka-structure';

describe('countSeenPrefixBlocks', () => {
  it('counts only the contiguous leading run already seen', () => {
    const seen = new Set([1, 2, 3, 9]);
    // 1,2,3 seen contiguously; 4 breaks the run even though 9 is seen later.
    expect(countSeenPrefixBlocks([1, 2, 3, 4, 9], seen)).toBe(3);
  });

  it('returns 0 when the first block is unseen', () => {
    expect(countSeenPrefixBlocks([7, 1, 2], new Set([1, 2]))).toBe(0);
  });

  it('returns the full length when every block is seen', () => {
    expect(countSeenPrefixBlocks([1, 2], new Set([1, 2, 3]))).toBe(2);
  });

  it('handles empty hash list', () => {
    expect(countSeenPrefixBlocks([], new Set([1]))).toBe(0);
  });
});

describe('buildConversationStructure', () => {
  it('splits input into cached-prefix vs uncached as the prefix cache warms', () => {
    const conv: RawWekaConversation = {
      id: 'c1',
      block_size: 64,
      requests: [
        // Turn 0: nothing seen yet → all uncached.
        { type: 'n', model: 'm', in: 128, out: 10, hash_ids: [1, 2] },
        // Turn 1: blocks 1,2 already seen, 3 is new → 2 blocks cached.
        { type: 'n', model: 'm', in: 192, out: 20, hash_ids: [1, 2, 3] },
      ],
    };
    const s = buildConversationStructure(conv);
    const t0 = s.nodes[0] as TurnNode;
    const t1 = s.nodes[1] as TurnNode;
    expect(t0).toMatchObject({ kind: 'turn', in: 128, cached: 0, uncached: 128, out: 10 });
    expect(t1.cached).toBe(128); // 2 blocks × 64
    expect(t1.uncached).toBe(64); // 192 - 128
    expect(s.totals).toMatchObject({
      in: 320,
      out: 30,
      cached: 128,
      uncached: 192,
      numTurns: 2,
      numSubagentGroups: 0,
    });
  });

  it('stamps top-level turns with their raw Weka request index', () => {
    const structure = buildConversationStructure({
      id: 'raw-index',
      requests: [
        { type: 'n', in: 1, out: 1 },
        { type: 'subagent', requests: [{ type: 'n', in: 1, out: 1 }] },
        { type: 'n', in: 1, out: 1 },
      ],
    });

    expect((structure.nodes[0] as TurnNode).rawIndex).toBe(0);
    expect((structure.nodes[2] as TurnNode).rawIndex).toBe(2);
  });

  it('clamps cached to the effective input on a partial last block', () => {
    const conv: RawWekaConversation = {
      id: 'c2',
      block_size: 64,
      requests: [
        { type: 'n', in: 100, out: 0, hash_ids: [1, 2] }, // 2 blocks but in=100 (partial)
        { type: 'n', in: 100, out: 0, hash_ids: [1, 2] }, // both seen → cached clamped to 100
      ],
    };
    const s = buildConversationStructure(conv);
    const t1 = s.nodes[1] as TurnNode;
    expect(t1.cached).toBe(100);
    expect(t1.uncached).toBe(0);
  });

  it('treats turns with no hash_ids as fully uncached', () => {
    const conv: RawWekaConversation = {
      id: 'c3',
      requests: [{ type: 'n', in: 50, out: 5 }],
    };
    const t0 = buildConversationStructure(conv).nodes[0] as TurnNode;
    expect(t0).toMatchObject({ cached: 0, uncached: 50 });
  });

  it('nests subagent groups with aggregated children and runs them against a spawn-time snapshot', () => {
    const conv: RawWekaConversation = {
      id: 'c4',
      block_size: 64,
      requests: [
        { type: 'n', model: 'main', t: 0, api_time: 1, in: 64, out: 10, hash_ids: [1] },
        {
          type: 'subagent',
          agent_id: 'a1',
          subagent_type: 'Explore',
          t: 12.5,
          duration_ms: 1234,
          requests: [
            // sees parent block 1 (snapshot at spawn) → 1 block cached
            { type: 'n', model: 'sub', t: 12.5, in: 128, out: 7, hash_ids: [1, 5] },
            // now block 5 is also seen within the subagent → 2 cached
            { type: 'n', model: 'sub', t: 13.1, in: 128, out: 3, hash_ids: [1, 5] },
          ],
        },
        // Parent turn after subagent: block 5 must NOT be cached (subagent
        // context not folded back); only block 1 is in the parent seen set.
        { type: 'n', model: 'main', in: 128, out: 1, hash_ids: [1, 5] },
      ],
    };
    const s = buildConversationStructure(conv);
    expect(s.totals.numTurns).toBe(2); // two top-level normal turns
    expect(s.totals.numSubagentGroups).toBe(1);

    const sub = s.nodes[1] as SubagentNode;
    expect(sub.kind).toBe('subagent');
    expect(sub.label).toBe('Explore');
    expect(sub.agentId).toBe('a1');
    expect(sub.rawIndex).toBe(1);
    expect(sub.durationMs).toBe(1234);
    expect(sub.startS).toBe(12.5);
    expect(sub.endS).toBeCloseTo(13.734, 6);
    expect(sub.children).toHaveLength(2);
    expect(countConversationRequests(s)).toBe(4);
    expect(subagentRequestTurns(s).map((turn) => turn.model)).toEqual(['sub', 'sub']);
    expect(sub.children.map((child) => [child.startS, child.endS])).toEqual([
      [12.5, 12.5],
      [13.1, 13.1],
    ]);
    expect(sub.children.map((child) => [child.rawIndex, child.innerIndex])).toEqual([
      [1, 0],
      [1, 1],
    ]);
    expect(sub.children[0].cached).toBe(64); // block 1 from parent snapshot
    expect(sub.children[1].cached).toBe(128); // blocks 1 & 5 now seen in child
    expect(sub.in).toBe(256);
    expect(sub.out).toBe(10);

    const afterSub = s.nodes[2] as TurnNode;
    expect(afterSub.cached).toBe(64); // only block 1; block 5 not folded back
    expect((s.nodes[0] as TurnNode).endS).toBe(1);
  });

  it('counts top-level and subagent child turns as requests, but not subagent groups', () => {
    const structure = buildConversationStructure({
      id: 'request-count',
      requests: [
        { type: 'n', in: 1, out: 1 },
        {
          type: 'subagent',
          requests: [
            { type: 'n', in: 1, out: 1 },
            { type: 'n', in: 1, out: 1 },
          ],
        },
      ],
    });

    expect(countConversationRequests(structure)).toBe(3);
    expect(subagentRequestTurns(structure)).toHaveLength(2);
  });

  it('falls back to the default block size and a generic subagent label', () => {
    const conv: RawWekaConversation = {
      id: 'c5',
      requests: [{ type: 'subagent', requests: [{ type: 'n', in: 10, out: 1, hash_ids: [1] }] }],
    };
    const s = buildConversationStructure(conv);
    expect(s.blockSize).toBe(64);
    expect((s.nodes[0] as SubagentNode).label).toBe('Subagent');
  });

  it('derives a subagent time range from child timings when group timing is absent', () => {
    const conv: RawWekaConversation = {
      id: 'c6',
      requests: [
        {
          type: 'subagent',
          requests: [
            { type: 'n', t: 5, api_time: 2.5, in: 10, out: 1 },
            { type: 'n', t: 9, api_time: 3, in: 10, out: 1 },
          ],
        },
      ],
    };
    const sub = buildConversationStructure(conv).nodes[0] as SubagentNode;
    expect(sub.startS).toBe(5);
    expect(sub.endS).toBe(12);
  });

  it('normalizes legacy subagent-relative request intervals', () => {
    const structure = buildConversationStructure({
      id: 'legacy-relative',
      requests: [
        {
          type: 'subagent',
          t: 100,
          requests: [{ type: 'n', t: 2, api_time: 3, in: 10, out: 1 }],
        },
      ],
    });
    const child = (structure.nodes[0] as SubagentNode).children[0]!;
    expect(child).toMatchObject({ startS: 102, endS: 105 });
  });
});

describe('histograms', () => {
  it('linearHistogram buckets across [0, max] and totals the count', () => {
    const bins = linearHistogram([0, 1, 2, 3, 4], 4);
    expect(bins).toHaveLength(4);
    expect(bins.reduce((acc, b) => acc + b.count, 0)).toBe(5);
    expect(bins[0].x0).toBe(0);
  });

  it('linearHistogram handles all-zero input', () => {
    expect(linearHistogram([0, 0])).toEqual([{ x0: 0, x1: 1, count: 2 }]);
  });

  it('logHistogram drops non-positive values and preserves the positive total', () => {
    const bins = logHistogram([1, 10, 100, 1000, 0, -5], 3);
    expect(bins.reduce((acc, b) => acc + b.count, 0)).toBe(4);
  });

  it('both return [] for empty input', () => {
    expect(linearHistogram([])).toEqual([]);
    expect(logHistogram([])).toEqual([]);
  });

  it('preserves zero-valued samples in a dedicated log histogram bin', () => {
    const bins = logHistogramWithZero([0, 0, 1, 10, 100], 4);
    expect(bins[0]).toEqual({ x0: 0, x1: 1, count: 2 });
    expect(bins.reduce((total, bin) => total + bin.count, 0)).toBe(5);
  });
});

describe('summarizeValues', () => {
  it('computes the same linearly-interpolated percentile set as request distributions', () => {
    const summary = summarizeValues(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(summary.median).toBeCloseTo(50.5, 6);
    expect(summary.p75).toBeCloseTo(75.25, 6);
    expect(summary.p90).toBeCloseTo(90.1, 6);
    expect(summary.p95).toBeCloseTo(95.05, 6);
  });
});
