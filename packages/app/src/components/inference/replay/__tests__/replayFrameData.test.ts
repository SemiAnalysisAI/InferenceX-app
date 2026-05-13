import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import type { ReplayTimeline } from '../buildReplayTimeline';
import { buildFrameData, dateAtFraction, spanMs, stepFloatAtFraction } from '../replayFrameData';

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

  it('returns the nearest observed date for intermediate fractions', () => {
    const t = makeTimeline();
    expect(dateAtFraction(t, 0.5)).toBe('2025-09-02');
  });

  it('returns empty string for an empty timeline', () => {
    const empty: ReplayTimeline = { dates: [], configs: [], domain: { x: [0, 1], y: [0, 1] } };
    expect(dateAtFraction(empty, 0.5)).toBe('');
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
