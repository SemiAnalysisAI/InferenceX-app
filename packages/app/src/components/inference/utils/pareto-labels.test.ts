import { describe, it, expect } from 'vitest';
import type { InferenceData } from '@/components/inference/types';
import {
  getParetoLabel,
  parseLabelComponents,
  labelSimilarity,
  computeParetoPointLabels,
  computeGradientStops,
  PARETO_LABEL_COLORS,
  type ParetoPointLabel,
} from './paretoLabels';

// Helper to create a minimal InferenceData for testing
const makePoint = (overrides: Partial<InferenceData> = {}): InferenceData =>
  ({
    x: 100,
    y: 200,
    tp: 8,
    hwKey: 'h100_sxm_sglang',
    precision: 'fp8',
    ...overrides,
  }) as InferenceData;

describe('getParetoLabel', () => {
  it('prefixes simple numeric tp with "TP"', () => {
    const point = makePoint({ tp: 4 });
    // Without ep/dp_attention, getPointLabel returns String(tp) = "4"
    expect(getParetoLabel(point)).toBe('TP4');
  });

  it('prefixes tp=16 with "TP"', () => {
    const point = makePoint({ tp: 16 });
    expect(getParetoLabel(point)).toBe('TP16');
  });

  it('uses full parallelism label when ep is present', () => {
    const point = makePoint({ tp: 4, ep: 8 });
    const label = getParetoLabel(point);
    // Should contain EP (expert parallelism) rather than just "TP4"
    expect(label).not.toBe('TP4');
    expect(label).toContain('EP');
  });

  it('uses full parallelism label when dp_attention is present', () => {
    const point = makePoint({ tp: 4, ep: 8, dp_attention: true });
    const label = getParetoLabel(point);
    expect(label).not.toBe('TP4');
    expect(label).toContain('DPA');
  });

  it('returns exact "DEP8" when tp === ep and dp_attention is true', () => {
    const point = makePoint({ tp: 8, ep: 8, dp_attention: true });
    expect(getParetoLabel(point)).toBe('DEP8');
  });

  it('returns exact "TEP4" when tp === ep and dp_attention is false', () => {
    const point = makePoint({ tp: 4, ep: 4, dp_attention: false });
    expect(getParetoLabel(point)).toBe('TEP4');
  });

  it('returns "DPAEP16" when ep > 1, ep !== tp, dp_attention is true', () => {
    const point = makePoint({ tp: 4, ep: 16, dp_attention: true });
    expect(getParetoLabel(point)).toBe('DPAEP16');
  });

  it('returns "EP8" when ep > 1, ep !== tp, dp_attention is false', () => {
    const point = makePoint({ tp: 4, ep: 8, dp_attention: false });
    expect(getParetoLabel(point)).toBe('EP8');
  });

  it('returns "TP1" for tp=1 with no ep field', () => {
    const point = makePoint({ tp: 1 });
    expect(getParetoLabel(point)).toBe('TP1');
  });

  it('handles multinode disagg format with "TP" prefix stripped', () => {
    const point = makePoint({
      tp: 8,
      ep: 4,
      is_multinode: true,
      disagg: true,
      prefill_tp: 4,
      prefill_ep: 4,
      prefill_dp_attention: false,
      decode_tp: 8,
      decode_ep: 8,
      decode_dp_attention: true,
      prefill_num_workers: 2,
      decode_num_workers: 1,
    });
    const label = getParetoLabel(point);
    // Should be something like "2xTEP4+1xDEP8"
    expect(label).toContain('2x');
    expect(label).toContain('+');
    expect(label).toContain('1x');
  });
});

describe('parseLabelComponents', () => {
  it('parses simple TP label', () => {
    expect(parseLabelComponents('TP8')).toEqual(['TP8']);
  });

  it('parses TEP label', () => {
    expect(parseLabelComponents('TEP8')).toEqual(['TEP8']);
  });

  it('strips multiplier prefix', () => {
    expect(parseLabelComponents('1xDPAEP4')).toEqual(['DPAEP4']);
    expect(parseLabelComponents('3xTP8')).toEqual(['TP8']);
  });

  it('parses multi-node labels with "+"', () => {
    expect(parseLabelComponents('1xDPAEP4+1xDPAEP32')).toEqual(['DPAEP4', 'DPAEP32']);
  });

  it('parses mixed multi-node labels', () => {
    expect(parseLabelComponents('2xEP4+1xDPAEP32')).toEqual(['EP4', 'DPAEP32']);
  });
});

describe('labelSimilarity', () => {
  it('returns 1 for identical labels', () => {
    expect(labelSimilarity('TP8', 'TP8')).toBe(1);
    expect(labelSimilarity('1xDPAEP4+1xDPAEP32', '1xDPAEP4+1xDPAEP32')).toBe(1);
  });

  it('returns 0 for completely different labels', () => {
    expect(labelSimilarity('TP8', 'TEP4')).toBe(0);
  });

  it('returns fractional value for partial overlap', () => {
    // "1xDPAEP4+1xDPAEP32" → ["DPAEP4", "DPAEP32"]
    // "1xDPAEP4+1xDPAEP16" → ["DPAEP4", "DPAEP16"]
    // Shared: DPAEP4 (1), All unique: DPAEP4, DPAEP32, DPAEP16 (3)
    const sim = labelSimilarity('1xDPAEP4+1xDPAEP32', '1xDPAEP4+1xDPAEP16');
    expect(sim).toBeCloseTo(1 / 3);
  });

  it('returns higher similarity for more shared components', () => {
    const sim1 = labelSimilarity('TP8', 'TEP4'); // 0 shared
    const sim2 = labelSimilarity('1xDPAEP4+1xDPAEP32', '1xDPAEP4+1xDPAEP16'); // 1/3
    expect(sim2).toBeGreaterThan(sim1);
  });
});

describe('computeParetoPointLabels', () => {
  it('maps points to labels with colors from colorMap', () => {
    const colorMap = new Map([
      ['TP4', '#aaa'],
      ['TP8', '#bbb'],
    ]);
    const points = [makePoint({ tp: 4, x: 10 }), makePoint({ tp: 8, x: 20 })];
    const result = computeParetoPointLabels(points, colorMap);

    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('TP4');
    expect(result[0].color).toBe('#aaa');
    expect(result[0].point).toBe(points[0]);
    expect(result[1].label).toBe('TP8');
    expect(result[1].color).toBe('#bbb');
  });

  it('falls back to #888 for unknown labels', () => {
    const colorMap = new Map<string, string>();
    const points = [makePoint({ tp: 99 })];
    const result = computeParetoPointLabels(points, colorMap);
    expect(result[0].color).toBe('#888');
  });
});

describe('computeGradientStops', () => {
  const linearScale = (x: number) => x; // identity scale for simplicity

  const makeParetoLabel = (x: number, label: string, color: string): ParetoPointLabel => ({
    point: makePoint({ x, y: 100 }),
    label,
    color,
  });

  it('returns null for fewer than 2 points', () => {
    const result = computeGradientStops([makeParetoLabel(10, 'TP4', '#aaa')], linearScale);
    expect(result).toBeNull();
  });

  it('returns null when all labels are the same', () => {
    const result = computeGradientStops(
      [makeParetoLabel(10, 'TP4', '#aaa'), makeParetoLabel(20, 'TP4', '#aaa')],
      linearScale,
    );
    expect(result).toBeNull();
  });

  it('returns gradient stops for two distinct labels', () => {
    const stops = computeGradientStops(
      [makeParetoLabel(10, 'TP4', '#aaa'), makeParetoLabel(20, 'TP8', '#bbb')],
      linearScale,
    );
    expect(stops).not.toBeNull();
    expect(stops!.length).toBeGreaterThanOrEqual(3);
    // First stop should be color of first label
    expect(stops![0].color).toBe('#aaa');
    // Last stop should be color of second label
    expect(stops![stops!.length - 1].color).toBe('#bbb');
    // All offsets should be between 0 and 1
    for (const stop of stops!) {
      expect(stop.offset).toBeGreaterThanOrEqual(0);
      expect(stop.offset).toBeLessThanOrEqual(1);
    }
  });

  it('returns null when x range is zero', () => {
    const result = computeGradientStops(
      [makeParetoLabel(10, 'TP4', '#aaa'), makeParetoLabel(10, 'TP8', '#bbb')],
      linearScale,
    );
    expect(result).toBeNull();
  });

  it('handles three points with two distinct labels', () => {
    const stops = computeGradientStops(
      [
        makeParetoLabel(10, 'TP4', '#aaa'),
        makeParetoLabel(20, 'TP4', '#aaa'),
        makeParetoLabel(30, 'TP8', '#bbb'),
      ],
      linearScale,
    );
    expect(stops).not.toBeNull();
    // Should transition from #aaa to #bbb
    expect(stops![0].color).toBe('#aaa');
    expect(stops![stops!.length - 1].color).toBe('#bbb');
  });

  it('produces stops covering the full 0..1 range', () => {
    const stops = computeGradientStops(
      [
        makeParetoLabel(10, 'TP4', '#aaa'),
        makeParetoLabel(20, 'TP8', '#bbb'),
        makeParetoLabel(30, 'TP16', '#ccc'),
      ],
      linearScale,
    );
    expect(stops).not.toBeNull();
    // Starts at 0, ends at 1
    expect(stops![0].offset).toBe(0);
    expect(stops![stops!.length - 1].offset).toBe(1);
    // Contains all three colors
    const colors = new Set(stops!.map((s) => s.color));
    expect(colors.has('#aaa')).toBe(true);
    expect(colors.has('#bbb')).toBe(true);
    expect(colors.has('#ccc')).toBe(true);
  });

  it('returns null for descending-x points (paretoFrontLowerRight order)', () => {
    // paretoFrontLowerRight returns points in descending x order.
    // Without sorting to ascending x first, totalRange becomes negative
    // and computeGradientStops returns null — the bug that broke gradient
    // lines for cost/energy metrics.
    const descendingPoints = [
      makeParetoLabel(30, 'TP16', '#ccc'),
      makeParetoLabel(20, 'TP8', '#bbb'),
      makeParetoLabel(10, 'TP4', '#aaa'),
    ];
    const result = computeGradientStops(descendingPoints, linearScale);
    // Descending x ⇒ totalRange ≤ 0 ⇒ null
    expect(result).toBeNull();
  });

  it('works correctly when descending-x points are sorted to ascending before calling', () => {
    // This mirrors the fix in ScatterGraph.tsx: sort roofline points
    // by ascending x before passing to computeGradientStops.
    const points = [
      makeParetoLabel(30, 'TP16', '#ccc'),
      makeParetoLabel(20, 'TP8', '#bbb'),
      makeParetoLabel(10, 'TP4', '#aaa'),
    ];
    // Sort ascending by x (the fix)
    points.sort((a, b) => a.point.x - b.point.x);

    const stops = computeGradientStops(points, linearScale);
    expect(stops).not.toBeNull();
    expect(stops![0].offset).toBe(0);
    expect(stops![stops!.length - 1].offset).toBe(1);
    // First color should be TP4's color (smallest x)
    expect(stops![0].color).toBe('#aaa');
    // Last color should be TP16's color (largest x)
    expect(stops![stops!.length - 1].color).toBe('#ccc');
  });
});

describe('PARETO_LABEL_COLORS', () => {
  it('has 10 distinct colors', () => {
    expect(PARETO_LABEL_COLORS).toHaveLength(10);
    expect(new Set(PARETO_LABEL_COLORS).size).toBe(10);
  });

  it('all colors are valid hex strings', () => {
    for (const color of PARETO_LABEL_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
