import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import type { ReplayTimeline } from '../buildReplayTimeline';
import {
  FRACTION_COMMIT_QUANTUM,
  buildFrameData,
  dateAtFraction,
  shouldCommitFraction,
  spanMs,
  stepFloatAtFraction,
} from '../replayFrameData';

const baseTemplate = {
  hwKey: 'b200',
  precision: 'fp8',
  tp: 8,
  conc: 64,
} as unknown as InferenceData;

function makeTimeline(): ReplayTimeline {
  return {
    dates: ['2025-09-01', '2025-09-02', '2025-09-03'],
    configs: [
      {
        configId: 'a',
        hwKey: 'b200',
        precision: 'fp8',
        template: baseTemplate,
        stepValues: [
          { visible: true, x: 0, y: 100 },
          { visible: true, x: 10, y: 200 },
          { visible: true, x: 20, y: 300 },
        ],
      },
      {
        configId: 'b',
        hwKey: 'h100',
        precision: 'fp8',
        template: { ...baseTemplate, hwKey: 'h100' } as InferenceData,
        // Stays invisible across the first two steps so a true "omits invisible
        // configs" assertion is meaningful — `interpolateAtStep` pops a config
        // in for the *whole* invisible→visible segment, so we need both
        // bracketing steps invisible for the config to actually be skipped.
        stepValues: [
          { visible: false, x: 0, y: 0 },
          { visible: false, x: 0, y: 0 },
          { visible: true, x: 15, y: 150 },
        ],
      },
    ],
    domain: { x: [0, 20], y: [0, 300] },
  };
}

describe('stepFloatAtFraction', () => {
  it('pins endpoints at fraction 0 and 1', () => {
    expect(stepFloatAtFraction(0, 3)).toBe(0);
    expect(stepFloatAtFraction(1, 3)).toBe(2);
  });

  it('is monotonically non-decreasing', () => {
    let prev = stepFloatAtFraction(0, 5);
    for (let i = 1; i <= 100; i++) {
      const cur = stepFloatAtFraction(i / 100, 5);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });

  it('lands on integer step at segment boundaries', () => {
    // 4 dates → segments at fraction 0, 1/3, 2/3, 1
    expect(stepFloatAtFraction(0, 4)).toBe(0);
    expect(stepFloatAtFraction(1 / 3, 4)).toBeCloseTo(1, 6);
    expect(stepFloatAtFraction(2 / 3, 4)).toBeCloseTo(2, 6);
    expect(stepFloatAtFraction(1, 4)).toBe(3);
  });

  it('returns 0 when there is at most one date', () => {
    expect(stepFloatAtFraction(0.5, 0)).toBe(0);
    expect(stepFloatAtFraction(0.5, 1)).toBe(0);
  });

  it('clamps out-of-range fractions', () => {
    expect(stepFloatAtFraction(-1, 3)).toBe(0);
    expect(stepFloatAtFraction(2, 3)).toBe(2);
  });
});

describe('spanMs', () => {
  it('is at least 1500ms even for tiny timelines', () => {
    expect(spanMs(0)).toBe(1500);
    expect(spanMs(1)).toBe(1500);
  });

  it('scales linearly with date count', () => {
    expect(spanMs(10)).toBe(8000);
    expect(spanMs(20)).toBe(16000);
  });

  it('caps at 30s for very long histories', () => {
    expect(spanMs(95)).toBe(30_000);
    expect(spanMs(1000)).toBe(30_000);
  });

  it('respects a minimum of 4500ms once the floor kicks in', () => {
    expect(spanMs(5)).toBe(4500);
  });
});

describe('dateAtFraction', () => {
  it('returns the first date at fraction 0', () => {
    const t = makeTimeline();
    expect(dateAtFraction(t, 0)).toBe('2025-09-01');
  });

  it('returns the last date at fraction 1', () => {
    const t = makeTimeline();
    expect(dateAtFraction(t, 1)).toBe('2025-09-03');
  });

  it('returns the date the playhead is currently within for intermediate fractions', () => {
    const t = makeTimeline();
    expect(dateAtFraction(t, 0.5)).toBe('2025-09-02');
  });

  it('returns empty string for an empty timeline', () => {
    const empty: ReplayTimeline = { dates: [], configs: [], domain: { x: [0, 1], y: [0, 1] } };
    expect(dateAtFraction(empty, 0.5)).toBe('');
  });
});

describe('shouldCommitFraction', () => {
  const quantumStep = 1 / FRACTION_COMMIT_QUANTUM;

  it('skips when the quantized value is unchanged', () => {
    expect(shouldCommitFraction(0.5, 0.5)).toBe(false);
    expect(shouldCommitFraction(0.5, 0.5 + quantumStep / 10)).toBe(false);
  });

  it('commits when the quantized value changes by one full quantum', () => {
    expect(shouldCommitFraction(0.5, 0.5 + quantumStep)).toBe(true);
    expect(shouldCommitFraction(0.5, 0.5 - quantumStep)).toBe(true);
  });

  it('commits across the rounding boundary', () => {
    // 0.5004 → round*1000 = 500, 0.5006 → round*1000 = 501
    expect(shouldCommitFraction(0.5004, 0.5006)).toBe(true);
  });
});

describe('commitFraction throttle (rAF-loop invariant)', () => {
  // Mirrors ReplayPanel.commitFraction: snapshot fractionRef BEFORE mutating
  // it, then ask the pure predicate whether to call setFraction. The throttle
  // is load-bearing — if the predicate is given the React-committed value
  // instead of the ref's previous value, a backward scrub that crosses a
  // quantum boundary would silently no-op the commit.
  function makeCommitter() {
    const fractionRef = { current: 0 };
    const commits: number[] = [];
    const setFraction = (v: number) => commits.push(v);
    const commit = (next: number, opts?: { force?: boolean }) => {
      const clamped = next < 0 ? 0 : Math.min(1, next);
      const prev = fractionRef.current;
      fractionRef.current = clamped;
      const force = opts?.force ?? false;
      if (force || shouldCommitFraction(prev, clamped)) setFraction(clamped);
    };
    return { fractionRef, commits, commit };
  }

  it('advances fractionRef every tick but commits only when the quantum changes', () => {
    const { fractionRef, commits, commit } = makeCommitter();
    // Sub-quantum increments. 0.0001 * 4 = 0.0004 — all round to 0, no commits.
    const subQuantum = 1 / (FRACTION_COMMIT_QUANTUM * 10);
    for (let i = 1; i <= 4; i++) commit(i * subQuantum);
    expect(fractionRef.current).toBeCloseTo(4 * subQuantum);
    expect(commits).toHaveLength(0);
    // Fifth tick lands on 0.0005 — round(0.5) === 1, crossing the first
    // quantum boundary → one commit.
    commit(5 * subQuantum);
    expect(commits).toHaveLength(1);
    expect(commits[0]).toBeCloseTo(5 * subQuantum);
  });

  it('force=true always commits even when the predicate would skip', () => {
    const { commits, commit } = makeCommitter();
    commit(0.5, { force: true });
    commit(0.5, { force: true });
    expect(commits).toEqual([0.5, 0.5]);
  });

  it('commits a backward scrub that crosses a quantum boundary', () => {
    const { fractionRef, commits, commit } = makeCommitter();
    commit(0.8); // forward, commits
    fractionRef.current = 0.8; // simulate the ref already at the committed value
    commit(0.6); // backward across many quanta — must commit
    expect(commits.at(-1)).toBe(0.6);
  });

  it('clamps to [0, 1]', () => {
    const { fractionRef, commit } = makeCommitter();
    commit(-1);
    expect(fractionRef.current).toBe(0);
    commit(2);
    expect(fractionRef.current).toBe(1);
  });
});

describe('buildFrameData', () => {
  it('emits one InferenceData per visible config at the given fraction', () => {
    const t = makeTimeline();
    const out = buildFrameData(t, 0);
    // At fraction 0 only config "a" is visible (config "b" pops in at step 1).
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ hwKey: 'b200', x: 0, y: 100 });
  });

  it('omits invisible configs', () => {
    const t = makeTimeline();
    const out = buildFrameData(t, 0);
    expect(out.every((d) => d.hwKey !== 'h100')).toBe(true);
  });

  it('lerps positions between step values', () => {
    const t = makeTimeline();
    // fraction 0.25 → idxFloat ≈ 0.0625 after cubic ease, mostly at step 0
    const out = buildFrameData(t, 0.25);
    const a = out.find((d) => d.hwKey === 'b200');
    expect(a).toBeDefined();
    expect(a!.x).toBeGreaterThan(0);
    expect(a!.x).toBeLessThan(10);
  });

  it('preserves template fields (precision, tp, conc, hwKey) on every frame', () => {
    const t = makeTimeline();
    const out = buildFrameData(t, 1);
    for (const d of out) {
      expect(d.precision).toBe('fp8');
      expect(d.tp).toBe(8);
      expect(d.conc).toBe(64);
    }
  });

  it('returns empty when the timeline has zero configs', () => {
    const empty: ReplayTimeline = {
      dates: ['2025-09-01'],
      configs: [],
      domain: { x: [0, 1], y: [0, 1] },
    };
    expect(buildFrameData(empty, 0.5)).toEqual([]);
  });
});
