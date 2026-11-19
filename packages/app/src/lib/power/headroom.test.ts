import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import { interpolateMetricAtInteractivity } from '@/components/inference/hooks/interpolated-trend-core';

import {
  buildHeadroomRows,
  HEADROOM_INTERACTIVITIES,
  headroomCsvRows,
  headroomExample,
} from './headroom';

const metric = (y: number) => ({ y, roof: false });

function point(
  hwKey: string,
  x: number,
  tput: number,
  avg: number,
  p90: number,
  overrides: Partial<InferenceData> = {},
): InferenceData {
  return {
    hwKey,
    precision: 'fp8',
    model: 'dsr1',
    conc: Math.round(tput / 10),
    x,
    y: avg,
    date: '2026-10-01',
    tpPerGpu: metric(tput),
    measuredAvgPower: metric(avg),
    measuredP90Power: metric(p90),
    ...overrides,
  } as InferenceData;
}

// B200 (TDP 1000 W): power falls with interactivity, four points from 20 to 320 tok/s/user.
const b200 = [
  point('b200_sglang', 20, 4000, 900, 960),
  point('b200_sglang', 60, 2400, 800, 880),
  point('b200_sglang', 150, 1200, 650, 720),
  point('b200_sglang', 320, 500, 500, 560),
];
// H200 (TDP 700 W): only measured between 40 and 120 tok/s/user.
const h200 = [point('h200_trt', 40, 1500, 600, 650), point('h200_trt', 120, 700, 450, 520)];

describe('buildHeadroomRows', () => {
  it('reads avg and P90 W at the four standard interactivities with no extrapolation', () => {
    const rows = buildHeadroomRows([...b200, ...h200]);
    expect(rows.map((row) => row.hwKey)).toEqual(['b200_sglang', 'h200_trt']);
    const [b, h] = rows;
    expect(b.tdpWatts).toBe(1000);
    expect(b.cells.map((cell) => cell !== null)).toEqual([true, true, true, true]);
    // 25 and 300 are outside H200's 40..120 range: blank, never guessed.
    expect(h.cells.map((cell) => cell !== null)).toEqual([false, true, true, false]);
    expect(h.interactivityMin).toBe(40);
    expect(h.interactivityMax).toBe(120);
    for (const [index, cell] of b.cells.entries()) {
      const x = HEADROOM_INTERACTIVITIES[index];
      expect(cell?.interactivity).toBe(x);
      // The same spline the chart's iso-interactivity readings use.
      expect(cell?.avgWatts).toBe(interpolateMetricAtInteractivity(b200, x, 'measuredAvgPower'));
      expect(cell?.p90Watts).toBe(interpolateMetricAtInteractivity(b200, x, 'measuredP90Power'));
      expect(cell?.percentTdpP90).toBeCloseTo((cell!.p90Watts / 1000) * 100, 9);
      expect(cell?.headroomPercent).toBeCloseTo(100 - cell!.percentTdpP90, 9);
    }
    // Monotone: faster serving per user draws less power per chip here.
    const p90s = b.cells.map((cell) => cell!.p90Watts);
    expect(p90s).toEqual([...p90s].toSorted((a, c) => c - a));
    expect(p90s[0]).toBeLessThanOrEqual(960);
    expect(p90s[3]).toBeGreaterThanOrEqual(560);
  });

  it('skips chips without P90, throughput, a registry TDP or two points', () => {
    const noP90 = b200.map(
      (p) => ({ ...p, measuredP90Power: undefined }) as unknown as InferenceData,
    );
    const noTput = b200.map((p) => ({ ...p, tpPerGpu: undefined }) as unknown as InferenceData);
    const unknownHw = b200.map((p) => ({ ...p, hwKey: 'mystery_sglang' }));
    expect(buildHeadroomRows(noP90)).toEqual([]);
    expect(buildHeadroomRows(noTput)).toEqual([]);
    expect(buildHeadroomRows(unknownHw)).toEqual([]);
    expect(buildHeadroomRows([b200[0]])).toEqual([]);
    // Comparison clones and hidden rows are never sources.
    const clones = b200.map((p) => ({
      ...p,
      powerVariant: { kind: 'basis', id: 'utility-modeled' } as const,
    }));
    expect(buildHeadroomRows(clones)).toEqual([]);
  });

  it('builds the 300 → 150 example from the chip with the widest range', () => {
    const example = headroomExample([...b200, ...h200]);
    expect(example?.row.hwKey).toBe('b200_sglang');
    expect(example?.clippedHigh).toBe(false);
    expect(example?.high.interactivity).toBe(300);
    expect(example?.low.interactivity).toBe(150);
    expect(example!.high.percentTdpP90).toBeLessThan(example!.low.percentTdpP90);
    expect(example!.high.headroomPercent).toBeGreaterThan(example!.low.headroomPercent);
    // A chip that stops before 300 uses its fastest point and says so.
    const shorter = [...b200.slice(0, 3), point('b200_sglang', 250, 700, 540, 600)];
    const clipped = headroomExample(shorter);
    expect(clipped?.clippedHigh).toBe(true);
    expect(clipped?.high.interactivity).toBe(250);
    expect(clipped?.low.interactivity).toBe(150);
    // Nothing above 150 tok/s/user: no example.
    expect(headroomExample(b200.slice(0, 3))).toBeNull();
    expect(headroomExample(h200)).toBeNull();
  });

  it('adds one row per unofficial-run overlay line, after the official rows, tagged with the run', () => {
    const runUrl = 'https://github.com/o/r/actions/runs/123';
    const overlay = b200.map((p) => ({
      ...p,
      id: 0,
      run_url: runUrl,
      measuredAvgPower: metric(p.measuredAvgPower!.y * 1.1),
      measuredP90Power: metric(p.measuredP90Power!.y * 1.1),
    }));
    const rows = buildHeadroomRows([...b200, ...h200], {
      points: overlay,
      runIndexByUrl: { [runUrl]: 1 },
      runInfos: [
        { id: 99, branch: 'main' },
        { id: 123, branch: 'feat/powerx-overlay' },
      ],
    });
    expect(rows.map((row) => [row.label, row.runIndex])).toEqual([
      ['B200 (SGLang) FP8', undefined],
      ['H200 (TRTLLM) FP8', undefined],
      ['B200 (SGLang) FP8 · feat/powerx-overlay', 1],
    ]);
    // The overlay row is read from its own points, not merged into the official B200 line.
    expect(rows[2].cells[1]!.p90Watts).toBeCloseTo(rows[0].cells[1]!.p90Watts * 1.1, 6);
    const csv = headroomCsvRows(rows);
    expect(csv.map((row) => row.source)).toEqual([
      ...Array.from({ length: 8 }, () => 'official'),
      ...Array.from({ length: 4 }, () => 'unofficial'),
    ]);
    // An H200 cell outside its measured range (40-120) exports blank, not 0.
    expect(csv[4]).toMatchObject({
      chip: 'H200 (TRTLLM) FP8',
      interactivity_tok_s_user: 25,
      avg_w_per_gpu: '',
      p90_w_per_gpu: '',
      headroom_pct: '',
    });
    // Without overlay input nothing changes.
    expect(buildHeadroomRows([...b200, ...h200])).toHaveLength(2);
  });
});
