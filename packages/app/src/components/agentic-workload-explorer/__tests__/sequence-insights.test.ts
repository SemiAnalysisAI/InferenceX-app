import { describe, it, expect } from 'vitest';
import {
  analyzeToolSequences,
  collapseRuns,
} from '@semianalysisai/inferencex-db/proxytrace/sequence-insights';

describe('collapseRuns', () => {
  it('collapses consecutive repeats into runs', () => {
    expect(collapseRuns(['Bash', 'Bash', 'Bash', 'Read', 'Bash'])).toEqual([
      { tool: 'Bash', run: 3 },
      { tool: 'Read', run: 1 },
      { tool: 'Bash', run: 1 },
    ]);
  });

  it('handles empty input', () => {
    expect(collapseRuns([])).toEqual([]);
  });
});

describe('analyzeToolSequences — summary', () => {
  it('computes repeat share and longest streak', () => {
    const result = analyzeToolSequences([
      ['Bash', 'Bash', 'Bash', 'Bash', 'Read'], // 5 calls → 2 steps
      ['Edit', 'Edit', 'Bash'], // 3 calls → 2 steps
    ]);
    expect(result.totalSessions).toBe(2);
    expect(result.totalCalls).toBe(8);
    expect(result.collapsedSteps).toBe(4);
    expect(result.repeatShare).toBe(0.5);
    expect(result.longestStreak).toEqual({ tool: 'Bash', run: 4 });
  });

  it('returns an empty result for no sessions', () => {
    const result = analyzeToolSequences([]);
    expect(result.totalSessions).toBe(0);
    expect(result.repeatShare).toBe(0);
    expect(result.longestStreak).toBeNull();
    expect(result.motifs).toEqual([]);
    expect(result.streaks).toEqual([]);
    expect(result.loops).toEqual([]);
  });
});

describe('analyzeToolSequences — motifs', () => {
  it('mines contiguous collapsed motifs, not gapped subsequences', () => {
    const sequences = [
      ['Read', 'Edit', 'Bash'],
      ['Grep', 'Read', 'Edit', 'Bash'],
      // Read … Edit … Bash appears here only with gaps — must not count.
      ['Read', 'Grep', 'Edit', 'WebFetch', 'Bash'],
    ];
    const result = analyzeToolSequences(sequences);
    const motif = result.motifs.find((m) => m.pattern.join(',') === 'Read,Edit,Bash');
    expect(motif).toBeDefined();
    expect(motif!.support).toBe(2);
    expect(motif!.supportRatio).toBeCloseTo(2 / 3);
  });

  it('never produces adjacent duplicate steps (Bash spam collapses)', () => {
    const spam = Array.from({ length: 20 }, () => 'Bash');
    const result = analyzeToolSequences([
      [...spam, 'Read', ...spam],
      [...spam, 'Read', ...spam, 'Read', 'Bash'],
    ]);
    for (const motif of result.motifs) {
      for (let i = 1; i < motif.pattern.length; i++) {
        expect(motif.pattern[i]).not.toBe(motif.pattern[i - 1]);
      }
    }
  });

  it('reports average run length per step', () => {
    const result = analyzeToolSequences([
      ['Bash', 'Bash', 'Bash', 'Read', 'Edit'],
      ['Bash', 'Read', 'Edit'],
    ]);
    const motif = result.motifs.find((m) => m.pattern.join(',') === 'Bash,Read,Edit');
    expect(motif).toBeDefined();
    expect(motif!.avgRuns).toEqual([2, 1, 1]);
  });

  it('drops shorter motifs absorbed by a longer motif with the same support', () => {
    const sequences = [
      ['Grep', 'Read', 'Edit', 'Bash'],
      ['Grep', 'Read', 'Edit', 'Bash'],
      ['Grep', 'Read', 'Edit', 'Bash'],
    ];
    const result = analyzeToolSequences(sequences);
    const patterns = result.motifs.map((m) => m.pattern.join(','));
    expect(patterns).toContain('Grep,Read,Edit,Bash');
    expect(patterns).not.toContain('Grep,Read,Edit');
    expect(patterns).not.toContain('Read,Edit,Bash');
  });

  it('excludes motifs below minimum support', () => {
    const result = analyzeToolSequences([
      ['Read', 'Edit', 'Bash'],
      ['Grep', 'WebFetch', 'Write'],
      ['Bash', 'Read', 'Grep'],
    ]);
    // Every 3-step window is unique to one session; minSupport is 2.
    expect(result.motifs).toEqual([]);
  });
});

describe('analyzeToolSequences — streaks', () => {
  it('computes run percentiles and streak sessions per tool', () => {
    const result = analyzeToolSequences([
      ['Bash', 'Bash', 'Bash', 'Bash', 'Read', 'Bash'], // Bash runs: 4, 1
      ['Bash', 'Bash', 'Read', 'Edit'], // Bash runs: 2
      ['Read', 'Edit', 'Bash'], // Bash runs: 1
    ]);
    const bash = result.streaks.find((s) => s.tool === 'Bash');
    expect(bash).toBeDefined();
    expect(bash!.totalCalls).toBe(8);
    expect(bash!.runs).toBe(4); // [4, 1, 2, 1]
    expect(bash!.p50Run).toBe(1);
    expect(bash!.maxRun).toBe(4);
    expect(bash!.streakSessions).toBe(2); // sessions 1 and 2 have a run ≥ 2
  });

  it('ranks streak rows by total calls', () => {
    const result = analyzeToolSequences([
      ['Bash', 'Bash', 'Bash', 'Read', 'Edit'],
      ['Bash', 'Read', 'Read', 'Edit'],
    ]);
    expect(result.streaks[0]?.tool).toBe('Bash');
  });
});

describe('analyzeToolSequences — ping-pong loops', () => {
  it('detects alternating segments of 2+ cycles with a canonical pair order', () => {
    const loopy = ['Edit', 'Bash', 'Edit', 'Bash', 'Edit', 'Bash'];
    const result = analyzeToolSequences([loopy, loopy, ['Read', 'Edit', 'Bash']]);
    expect(result.loops).toHaveLength(1);
    const loop = result.loops[0];
    expect(loop.pair).toEqual(['Bash', 'Edit']);
    expect(loop.sessions).toBe(2);
    expect(loop.loops).toBe(2);
    expect(loop.p50Cycles).toBe(3);
    expect(loop.maxCycles).toBe(3);
  });

  it('ignores single alternations (fewer than 2 cycles)', () => {
    const result = analyzeToolSequences([
      ['Edit', 'Bash', 'Edit', 'Read', 'Write'],
      ['Edit', 'Bash', 'Edit', 'Read', 'Write'],
    ]);
    expect(result.loops).toEqual([]);
  });

  it('splits distinct alternations within one session', () => {
    const seq = ['A', 'B', 'A', 'B', 'C', 'A', 'C', 'A', 'C'];
    const result = analyzeToolSequences([seq, seq]);
    const pairs = result.loops.map((l) => l.pair.join('↔'));
    expect(pairs).toContain('A↔B');
    expect(pairs).toContain('A↔C');
  });
});
