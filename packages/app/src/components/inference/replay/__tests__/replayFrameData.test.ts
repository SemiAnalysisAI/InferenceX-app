import { describe, expect, it } from 'vitest';

import type { InferenceData, OverlayData } from '@/components/inference/types';

import type { ReplayTimeline } from '../buildReplayTimeline';
import {
  FRACTION_COMMIT_QUANTUM,
  bestPerSkuMorphWindowFraction,
  buildFrameData,
  buildReplayColorKeyMap,
  buildReplayOverlayData,
  computeReplayDomain,
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
  // Deliberately NOT one of the timeline dates: templates carry each config's
  // first-observation date, which buildFrameData must override per frame.
  date: '2025-08-15',
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
        template: { ...baseTemplate, hwKey: 'h100', date: '2025-08-20' } as InferenceData,
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

describe('bestPerSkuMorphWindowFraction', () => {
  it('allocates about 240ms of the MP4 timeline without overlapping adjacent dates', () => {
    expect(bestPerSkuMorphWindowFraction(2)).toBeCloseTo(240 / 4500);
    expect(bestPerSkuMorphWindowFraction(100)).toBeCloseTo(0.45 / 99);
    expect(bestPerSkuMorphWindowFraction(1)).toBe(0);
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

describe('commitFraction throttle (rAF-loop invariant)', () => {
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

  // Regression: ScatterGraph scopes Pareto frontiers and line paths per
  // point.date, so a frame mixing template (first-observation) dates renders
  // one hardware series as several same-colored lines with duplicate labels.
  it('stamps every point with the playhead date, not the template first-observation date', () => {
    const t = makeTimeline();
    const atStart = buildFrameData(t, 0);
    expect(atStart.length).toBeGreaterThan(0);
    for (const d of atStart) expect(d.date).toBe('2025-09-01');

    const atEnd = buildFrameData(t, 1);
    // Both configs are visible at the last step and carry distinct template
    // dates — the frame must still present a single uniform date.
    expect(atEnd).toHaveLength(2);
    for (const d of atEnd) expect(d.date).toBe('2025-09-03');
  });

  it('returns empty when the timeline has zero configs', () => {
    const empty: ReplayTimeline = {
      dates: ['2025-09-01'],
      configs: [],
      domain: { x: [0, 1], y: [0, 1] },
    };
    expect(buildFrameData(empty, 0.5)).toEqual([]);
  });

  it('recomputes Best per SKU for each frame and keeps a winner for every SKU', () => {
    const series = (
      configId: string,
      hw: string,
      hwKey: string,
      x: number,
      startY: number,
      endY: number,
    ) => ({
      configId,
      hwKey,
      precision: 'fp8',
      template: {
        ...baseTemplate,
        hw,
        hwKey,
        x,
        y: startY,
      } as InferenceData,
      stepValues: [
        { visible: true as const, x, y: startY },
        { visible: true as const, x, y: endY },
      ],
    });
    const changing: ReplayTimeline = {
      dates: ['2025-09-01', '2025-09-02'],
      configs: [
        series('b200-a-1', 'B200-8', 'b200_engine_a', 10, 100, 50),
        series('b200-a-2', 'B200-8', 'b200_engine_a', 20, 80, 40),
        series('b200-b-1', 'B200-8', 'b200_engine_b', 10, 90, 110),
        series('b200-b-2', 'B200-8', 'b200_engine_b', 20, 60, 90),
        series('h100-a-1', 'H100-8', 'h100_engine_a', 10, 60, 65),
        series('h100-a-2', 'H100-8', 'h100_engine_a', 20, 50, 55),
      ],
      domain: { x: [10, 20], y: [40, 110] },
    };

    const start = buildFrameData(changing, 0, {
      bestPerSku: true,
      direction: 'upper_left',
    });
    const end = buildFrameData(changing, 1, {
      bestPerSku: true,
      direction: 'upper_left',
    });

    expect(new Set(start.map((point) => point.hwKey))).toEqual(
      new Set(['b200_engine_a', 'h100_engine_a']),
    );
    expect(new Set(end.map((point) => point.hwKey))).toEqual(
      new Set(['b200_engine_b', 'h100_engine_a']),
    );
    expect(computeReplayDomain(changing, { bestPerSku: true, direction: 'upper_left' })).toEqual({
      x: [10, 20],
      y: [50, 110],
    });
    expect(buildReplayColorKeyMap(changing, new Set(['b200_engine_b', 'h100_engine_a']))).toEqual(
      new Map([
        ['b200_engine_a', 'b200_engine_b'],
        ['b200_engine_b', 'b200_engine_b'],
        ['h100_engine_a', 'h100_engine_a'],
      ]),
    );

    // Regression: MP4 export captures deterministic replay fractions and does
    // not wait for wall-clock D3 transitions. A frame shortly after the winner
    // changes must therefore contain intermediate line geometry itself.
    let switchFraction = 0;
    for (let step = 1; step <= 1000; step++) {
      const candidate = step / 1000;
      const keys = new Set(
        buildFrameData(changing, candidate, {
          bestPerSku: true,
          direction: 'upper_left',
        }).map((point) => point.hwKey),
      );
      if (keys.has('b200_engine_b')) {
        switchFraction = candidate;
        break;
      }
    }
    expect(switchFraction).toBeGreaterThan(0);

    const morphFraction = switchFraction + bestPerSkuMorphWindowFraction(2) / 2;
    const snapped = buildFrameData(changing, morphFraction, {
      bestPerSku: true,
      direction: 'upper_left',
    });
    const animated = buildFrameData(changing, morphFraction, {
      bestPerSku: true,
      direction: 'upper_left',
      animateBestPerSku: true,
    });
    const snappedB200 = snapped
      .filter((point) => point.hwKey === 'b200_engine_b')
      .toSorted((a, b) => a.x - b.x);
    const animatedB200 = animated
      .filter((point) => point.hwKey === 'b200_engine_b')
      .toSorted((a, b) => a.x - b.x);
    expect(animatedB200).toHaveLength(snappedB200.length);
    expect(animatedB200[0].y).not.toBeCloseTo(snappedB200[0].y);
    expect(new Set(animated.map((point) => point.hwKey))).toEqual(
      new Set(['b200_engine_b', 'h100_engine_a']),
    );

    const settledFraction = switchFraction + bestPerSkuMorphWindowFraction(2) * 1.1;
    const settled = buildFrameData(changing, settledFraction, {
      bestPerSku: true,
      direction: 'upper_left',
      animateBestPerSku: true,
    });
    expect(settled).toEqual(
      buildFrameData(changing, settledFraction, {
        bestPerSku: true,
        direction: 'upper_left',
      }),
    );
  });
});

describe('buildReplayOverlayData', () => {
  const overlayPoint = (hw: string, hwKey: string, x: number, y: number): InferenceData =>
    ({
      ...baseTemplate,
      hw,
      hwKey,
      x,
      y,
      date: '2025-09-02',
      run_url: 'https://github.com/example/actions/runs/123',
    }) as InferenceData;
  const overlay = {
    label: 'preview',
    hardwareConfig: {},
    data: [
      overlayPoint('B200-8', 'b200_vllm', 10, 80),
      overlayPoint('B200-8', 'b200_vllm', 20, 60),
      overlayPoint('B200-8', 'b200_sglang', 10, 100),
      overlayPoint('B200-8', 'b200_sglang', 20, 90),
      overlayPoint('H100-8', 'h100_vllm', 10, 50),
      overlayPoint('MI355X-8', 'mi355x_hidden', 10, 120),
    ],
  } as OverlayData;

  it('date-gates overlays and preserves the best active series for every visible SKU', () => {
    const beforeRun = buildReplayOverlayData(overlay, {
      currentDate: '2025-09-01',
      selectedPrecisions: ['fp8'],
      activeHwTypes: new Set(['b200_vllm', 'b200_sglang', 'h100_vllm']),
      bestPerSku: true,
      direction: 'upper_left',
    });
    expect(beforeRun.data).toEqual([]);

    const atRun = buildReplayOverlayData(overlay, {
      currentDate: '2025-09-02',
      selectedPrecisions: ['fp8'],
      activeHwTypes: new Set(['b200_vllm', 'b200_sglang', 'h100_vllm']),
      bestPerSku: true,
      direction: 'upper_left',
    });
    expect(new Set(atRun.data.map((point) => point.hwKey))).toEqual(
      new Set(['b200_sglang', 'h100_vllm']),
    );
  });
});
