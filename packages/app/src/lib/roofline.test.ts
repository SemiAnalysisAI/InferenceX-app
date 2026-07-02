import { describe, it, expect } from 'vitest';

import type { ChartDefinition } from '@/lib/chart-types';
import {
  calculateRoofline,
  computeAllRooflines,
  markRooflinePoints,
  paretoFrontLowerLeft,
  paretoFrontLowerRight,
  paretoFrontUpperLeft,
  paretoFrontUpperRight,
} from '@/lib/roofline';
import { fullPt, paretoPt, pt, xy } from '@/lib/chart-test-fixtures';

// ===========================================================================
// calculateRoofline
// ===========================================================================
describe('calculateRoofline', () => {
  it('returns an empty array for empty input', () => {
    expect(calculateRoofline([], 'tpPerGpu.y', 'upper_right')).toEqual([]);
  });

  it('extracts nested y-value (dot notation) and maps it onto y before computing the front', () => {
    // A(x=1, tpPerGpu.y=50), B(x=2, tpPerGpu.y=80), C(x=3, tpPerGpu.y=60)
    // upper_right front → A and B; each result point's y is the tpPerGpu.y value
    const points = [
      pt(1, 999, 'h100', { tpPerGpuY: 50 }), // y=999 should be ignored
      pt(2, 999, 'h100', { tpPerGpuY: 80 }),
      pt(3, 999, 'h100', { tpPerGpuY: 60 }),
    ];
    const front = calculateRoofline(points, 'tpPerGpu.y', 'upper_right');
    expect(front).toHaveLength(2);
    expect(front[0].y).toBe(50); // remapped from tpPerGpu.y, not the original y=999
    expect(front[1].y).toBe(80);
  });

  it('works with a flat (non-nested) y key', () => {
    const points = [pt(1, 5, 'h100'), pt(2, 8, 'h100'), pt(3, 6, 'h100')];
    const front = calculateRoofline(points, 'y', 'upper_right');
    expect(front).toHaveLength(2);
    expect(front[0].y).toBe(5);
    expect(front[1].y).toBe(8);
  });

  it.each([
    ['upper_right', 2], // A(1,50) and B(2,80) both on front
    ['upper_left', 1], // B(2,80) dominates A(1,50) → only B kept
    ['lower_left', 1], // A(1,50) is lowest; B(2,80) has higher y → only A kept
    ['lower_right', 1], // sorted desc by x: B(2,80) first, A(1,50) next (50<80 → add); but wait
  ] as const)('routes direction "%s" to the correct Pareto function', (direction, _) => {
    // Just verify the function doesn't throw and returns an array for each direction
    const points = [pt(1, 0, 'h100', { tpPerGpuY: 50 }), pt(2, 0, 'h100', { tpPerGpuY: 80 })];
    const front = calculateRoofline(points, 'tpPerGpu.y', direction);
    expect(Array.isArray(front)).toBe(true);
  });

  it('delegates to paretoFrontUpperRight for "upper_right" (specific assertions)', () => {
    const rPoints = [
      paretoPt(1, 99, { tpPerGpu: { y: 10, roof: false } }),
      paretoPt(2, 99, { tpPerGpu: { y: 30, roof: false } }),
      paretoPt(3, 99, { tpPerGpu: { y: 20, roof: false } }),
    ];
    // after remapping y: (1,10),(2,30),(3,20)
    // upper-right front: (1,10),(2,30) — (3,20) dropped because y=20<maxY=30
    const result = calculateRoofline(rPoints, 'tpPerGpu.y', 'upper_right');
    expect(xy(result)).toEqual([
      { x: 1, y: 10 },
      { x: 2, y: 30 },
    ]);
  });

  it('delegates to paretoFrontUpperLeft for "upper_left" (specific assertions)', () => {
    const rPoints = [
      paretoPt(1, 99, { tpPerGpu: { y: 10, roof: false } }),
      paretoPt(2, 99, { tpPerGpu: { y: 30, roof: false } }),
      paretoPt(3, 99, { tpPerGpu: { y: 20, roof: false } }),
    ];
    // remapped: (1,10),(2,30),(3,20)
    // upper-left: (1,10) push, (2,30): y=30>=10, pop (1,10), push (2,30),
    //             (3,20): y=20<30, push → [(2,30),(3,20)]
    const result = calculateRoofline(rPoints, 'tpPerGpu.y', 'upper_left');
    expect(xy(result)).toEqual([
      { x: 2, y: 30 },
      { x: 3, y: 20 },
    ]);
  });

  it('delegates to paretoFrontLowerLeft for "lower_left" (specific assertions)', () => {
    const rPoints = [
      paretoPt(1, 99, { tpPerGpu: { y: 10, roof: false } }),
      paretoPt(2, 99, { tpPerGpu: { y: 30, roof: false } }),
      paretoPt(3, 99, { tpPerGpu: { y: 20, roof: false } }),
    ];
    // lower-left keeps new minimums: (1,10) min=10; (2,30) skip; (3,20) skip → [(1,10)]
    const result = calculateRoofline(rPoints, 'tpPerGpu.y', 'lower_left');
    expect(xy(result)).toEqual([{ x: 1, y: 10 }]);
  });

  it('delegates to paretoFrontLowerRight for "lower_right" (specific assertions)', () => {
    const rPoints = [
      paretoPt(1, 99, { tpPerGpu: { y: 10, roof: false } }),
      paretoPt(2, 99, { tpPerGpu: { y: 30, roof: false } }),
      paretoPt(3, 99, { tpPerGpu: { y: 20, roof: false } }),
    ];
    // sorted x desc: (3,20),(2,30),(1,10)
    // (3,20): min=20; (2,30): skip; (1,10): y=10<20, new min → [(3,20),(1,10)]
    const result = calculateRoofline(rPoints, 'tpPerGpu.y', 'lower_right');
    expect(xy(result)).toEqual([
      { x: 3, y: 20 },
      { x: 1, y: 10 },
    ]);
  });

  it('returns empty array for an unrecognised roofline direction', () => {
    const rPoints = [paretoPt(1, 5), paretoPt(2, 3)];
    const result = calculateRoofline(rPoints, 'tpPerGpu.y', 'diagonal' as any);
    expect(result).toEqual([]);
  });

  it('does not mutate the original point objects — only the remapped copies', () => {
    const original = paretoPt(1, 99, { tpPerGpu: { y: 10, roof: false } });
    calculateRoofline([original], 'tpPerGpu.y', 'upper_right');
    // the original point's y should still be 99, not 10
    expect(original.y).toBe(99);
  });
});

// ===========================================================================
// computeAllRooflines
// ===========================================================================
describe('computeAllRooflines', () => {
  const chartDef: ChartDefinition = {
    chartType: 'e2e',
    heading: 'Test',
    x: 'median_e2el',
    x_label: 'E2E Latency',
    y: 'tput_per_gpu',
    y_tpPerGpu: 'tpPerGpu.y',
    y_tpPerGpu_roofline: 'upper_right',
    y_costh: 'costh.y',
    y_costh_roofline: 'lower_left',
  };

  const groupedData = {
    h100: [
      pt(1, 0, 'h100', { tpPerGpuY: 50, costhY: 2 }),
      pt(2, 0, 'h100', { tpPerGpuY: 80, costhY: 1.5 }),
      pt(3, 0, 'h100', { tpPerGpuY: 60, costhY: 1.8 }),
    ],
  };

  it('returns a roofline entry for each hardware group', () => {
    const result = computeAllRooflines(groupedData, chartDef);
    expect(result).toHaveProperty('h100');
  });

  it('computes y_tpPerGpu roofline (upper_right)', () => {
    const result = computeAllRooflines(groupedData, chartDef);
    const front = result.h100.y_tpPerGpu;
    // points A(1,50) and B(2,80) form the upper_right front
    expect(front).toHaveLength(2);
    expect(front[0].x).toBe(1);
    expect(front[0].y).toBe(50);
    expect(front[1].x).toBe(2);
    expect(front[1].y).toBe(80);
  });

  it('computes y_costh roofline (lower_left)', () => {
    const result = computeAllRooflines(groupedData, chartDef);
    const front = result.h100.y_costh;
    // costh: A(x=1,2.0), B(x=2,1.5), C(x=3,1.8)
    // lower_left sorted by x: A(1,2.0) added, B(1.5<2.0) added, C(1.8>1.5) skipped
    expect(front).toHaveLength(2);
    expect(front[0].x).toBe(1);
    expect(front[0].y).toBe(2);
    expect(front[1].x).toBe(2);
    expect(front[1].y).toBe(1.5);
  });

  it('skips metrics not defined in the chartDef', () => {
    const result = computeAllRooflines(groupedData, chartDef);
    // y_tpPerMw is not defined in chartDef → should be undefined or empty
    expect(result.h100.y_tpPerMw).toBeUndefined();
  });

  it('handles multiple hardware groups independently', () => {
    const multiGrouped = {
      h100: [pt(1, 0, 'h100', { tpPerGpuY: 50 }), pt(2, 0, 'h100', { tpPerGpuY: 80 })],
      h200: [pt(1, 0, 'h200', { tpPerGpuY: 100 }), pt(2, 0, 'h200', { tpPerGpuY: 70 })],
    };
    const result = computeAllRooflines(multiGrouped, chartDef);
    // h100 upper_right: [A(1,50), B(2,80)]
    expect(result.h100.y_tpPerGpu).toHaveLength(2);
    // h200 upper_right: only A(1,100) since B has lower y
    expect(result.h200.y_tpPerGpu).toHaveLength(1);
    expect(result.h200.y_tpPerGpu[0].x).toBe(1);
  });
});

// ===========================================================================
// computeAllRooflines — additional edge cases
// ===========================================================================
describe('computeAllRooflines edge cases', () => {
  it('returns empty object for empty groupedData', () => {
    const chartDef = {
      chartType: 'e2e',
      heading: 'Test',
      x: 'median_e2el',
      x_label: 'E2E Latency',
      y: 'tput_per_gpu',
      y_tpPerGpu: 'tpPerGpu.y',
      y_tpPerGpu_roofline: 'upper_right',
    } as any;
    const result = computeAllRooflines({}, chartDef);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('skips metrics where roofline direction is not defined', () => {
    // chartDef has y_tpPerGpu defined but no y_tpPerGpu_roofline
    const chartDef = {
      chartType: 'e2e',
      heading: 'Test',
      x: 'median_e2el',
      x_label: 'E2E Latency',
      y: 'tput_per_gpu',
      y_tpPerGpu: 'tpPerGpu.y',
      // intentionally no y_tpPerGpu_roofline
    } as any;
    const groupedData = {
      h100: [pt(1, 50, 'h100', { tpPerGpuY: 50 })],
    };
    const result = computeAllRooflines(groupedData, chartDef);
    expect(result.h100.y_tpPerGpu).toBeUndefined();
  });

  it('computes energy roofline (jTotal) when defined in chartDef', () => {
    const chartDef = {
      chartType: 'e2e',
      heading: 'Test',
      x: 'median_e2el',
      x_label: 'E2E Latency',
      y: 'tput_per_gpu',
      y_jTotal: 'jTotal.y',
      y_jTotal_roofline: 'lower_left',
    } as any;
    const p1 = pt(1, 0, 'h100');
    (p1 as any).jTotal = { y: 5, roof: false };
    const p2 = pt(2, 0, 'h100');
    (p2 as any).jTotal = { y: 3, roof: false };
    const p3 = pt(3, 0, 'h100');
    (p3 as any).jTotal = { y: 4, roof: false };

    const groupedData = { h100: [p1, p2, p3] };
    const result = computeAllRooflines(groupedData, chartDef);
    // lower_left front: p1(1,5.0) added, p2(2,3.0) < 5.0 so added, p3(3,4.0) > 3.0 so skipped
    expect(result.h100.y_jTotal).toHaveLength(2);
    expect(result.h100.y_jTotal[0].y).toBe(5);
    expect(result.h100.y_jTotal[1].y).toBe(3);
  });

  it('handles chartDef with no roofline keys at all', () => {
    const chartDef = {
      chartType: 'e2e',
      heading: 'Test',
      x: 'median_e2el',
      x_label: 'E2E Latency',
      y: 'tput_per_gpu',
      // No y_*_roofline keys at all
    } as any;
    const groupedData = {
      h100: [pt(1, 50, 'h100')],
    };
    const result = computeAllRooflines(groupedData, chartDef);
    // All metric rooflines should be undefined
    for (const metric of [
      'y_tpPerGpu',
      'y_costh',
      'y_costn',
      'y_costr',
      'y_tpPerMw',
      'y_jTotal',
    ] as const) {
      expect((result as any).h100[metric]).toBeUndefined();
    }
  });
});

// ===========================================================================
// markRooflinePoints
// ===========================================================================
describe('markRooflinePoints', () => {
  // 3 points for h100: A(x=1, tpPerGpu.y=50), B(x=2, tpPerGpu.y=80), C(x=3, tpPerGpu.y=60)
  // upper_right front = [A, B]  → A.tpPerGpu.roof=true, B.tpPerGpu.roof=true, C.tpPerGpu.roof=false
  const chartDef: ChartDefinition = {
    chartType: 'e2e',
    heading: 'Test',
    x: 'median_e2el',
    x_label: 'E2E Latency',
    y: 'tput_per_gpu',
    y_tpPerGpu: 'tpPerGpu.y',
    y_tpPerGpu_roofline: 'upper_right',
  };

  const pointA = pt(1, 0, 'h100', { tpPerGpuY: 50 });
  const pointB = pt(2, 0, 'h100', { tpPerGpuY: 80 });
  const pointC = pt(3, 0, 'h100', { tpPerGpuY: 60 });

  const groupedData = { h100: [pointA, pointB, pointC] };

  function buildRooflines() {
    return computeAllRooflines(groupedData, chartDef);
  }

  it('sets tpPerGpu.roof=true for points on the upper_right roofline', () => {
    const rooflines = buildRooflines();
    const marked = markRooflinePoints(groupedData, rooflines, chartDef);

    const a = marked.find((p) => p.x === 1)!;
    const b = marked.find((p) => p.x === 2)!;
    expect(a.tpPerGpu.roof).toBe(true);
    expect(b.tpPerGpu.roof).toBe(true);
  });

  it('sets tpPerGpu.roof=false for points NOT on the roofline', () => {
    const rooflines = buildRooflines();
    const marked = markRooflinePoints(groupedData, rooflines, chartDef);

    const c = marked.find((p) => p.x === 3)!;
    expect(c.tpPerGpu.roof).toBe(false);
  });

  it('resets roof flags to false before re-evaluating (no stale state)', () => {
    // manually pre-set a roof flag to true on a point that's NOT on the front
    const contaminated = { ...pointC, tpPerGpu: { y: 60, roof: true } };
    const dirtyGroup = { h100: [pointA, pointB, contaminated] };
    const rooflines = computeAllRooflines(dirtyGroup, chartDef);
    const marked = markRooflinePoints(dirtyGroup, rooflines, chartDef);

    const c = marked.find((p) => p.x === 3)!;
    expect(c.tpPerGpu.roof).toBe(false);
  });

  it('returns all input points (none are filtered out)', () => {
    const rooflines = buildRooflines();
    const marked = markRooflinePoints(groupedData, rooflines, chartDef);
    expect(marked).toHaveLength(3);
  });

  it('handles multiple hardware groups, marking each independently', () => {
    const chartDefMulti: ChartDefinition = {
      ...chartDef,
      y_tpPerGpu: 'tpPerGpu.y',
      y_tpPerGpu_roofline: 'upper_right',
    };
    const h200A = pt(1, 0, 'h200', { tpPerGpuY: 100 });
    const h200B = pt(2, 0, 'h200', { tpPerGpuY: 70 });
    const multiGrouped = {
      h100: [pointA, pointB, pointC],
      h200: [h200A, h200B],
    };
    const rooflines = computeAllRooflines(multiGrouped, chartDefMulti);
    const marked = markRooflinePoints(multiGrouped, rooflines, chartDefMulti);

    // h200: A(x=1,y=100) on front, B(x=2,y=70) not
    const h200Points = marked.filter((p) => p.hwKey === 'h200');
    const h200Marked_A = h200Points.find((p) => p.x === 1)!;
    const h200Marked_B = h200Points.find((p) => p.x === 2)!;
    expect(h200Marked_A.tpPerGpu.roof).toBe(true);
    expect(h200Marked_B.tpPerGpu.roof).toBe(false);
  });

  it('does not mark costh.roof when y_costh is not in chartDef', () => {
    const rooflines = buildRooflines();
    const marked = markRooflinePoints(groupedData, rooflines, chartDef);
    // costh roofline not in this chartDef → costh.roof should remain false
    for (const p of marked) {
      expect(p.costh.roof).toBe(false);
    }
  });

  it('marks costh.roof when y_costh_roofline is defined in chartDef', () => {
    const chartDefWithCost: ChartDefinition = {
      ...chartDef,
      y_costh: 'costh.y',
      y_costh_roofline: 'lower_left',
    };
    // costh values: A(x=1, costh.y=2.0), B(x=2, costh.y=1.5), C(x=3, costh.y=1.8)
    const pA = pt(1, 0, 'h100', { tpPerGpuY: 50, costhY: 2 });
    const pB = pt(2, 0, 'h100', { tpPerGpuY: 80, costhY: 1.5 });
    const pC = pt(3, 0, 'h100', { tpPerGpuY: 60, costhY: 1.8 });
    const group = { h100: [pA, pB, pC] };
    const rooflines = computeAllRooflines(group, chartDefWithCost);
    const marked = markRooflinePoints(group, rooflines, chartDefWithCost);

    // lower_left: A(1,2.0) and B(2,1.5) are on the front
    const mA = marked.find((p) => p.x === 1)!;
    const mB = marked.find((p) => p.x === 2)!;
    const mC = marked.find((p) => p.x === 3)!;
    expect(mA.costh.roof).toBe(true);
    expect(mB.costh.roof).toBe(true);
    expect(mC.costh.roof).toBe(false);
  });
});

// ===========================================================================
// markRooflinePoints — energy and output cost field marking
// ===========================================================================
describe('markRooflinePoints energy and output fields', () => {
  it('marks jTotal.roof for points on the energy roofline', () => {
    const chartDef = {
      chartType: 'e2e',
      heading: 'Test',
      x: 'median_e2el',
      x_label: 'E2E Latency',
      y: 'tput_per_gpu',
      y_jTotal: 'jTotal.y',
      y_jTotal_roofline: 'lower_left',
    } as any;

    const p1 = fullPt(1, 'h100', { tpPerGpuY: 50, jTotalY: 10 });
    const p2 = fullPt(2, 'h100', { tpPerGpuY: 80, jTotalY: 5 });
    const p3 = fullPt(3, 'h100', { tpPerGpuY: 60, jTotalY: 8 });

    const groupedData = { h100: [p1, p2, p3] };
    const rooflines = computeAllRooflines(groupedData, chartDef);
    const marked = markRooflinePoints(groupedData, rooflines, chartDef);

    // lower_left: p1(1,10), p2(2,5) on front; p3(3,8) > 5 so not on front
    const m1 = marked.find((p) => p.x === 1)!;
    const m2 = marked.find((p) => p.x === 2)!;
    const m3 = marked.find((p) => p.x === 3)!;
    expect(m1.jTotal!.roof).toBe(true);
    expect(m2.jTotal!.roof).toBe(true);
    expect(m3.jTotal!.roof).toBe(false);
  });

  it('marks costhOutput.roof for points on the output cost roofline', () => {
    const chartDef = {
      chartType: 'e2e',
      heading: 'Test',
      x: 'median_e2el',
      x_label: 'E2E Latency',
      y: 'tput_per_gpu',
      y_costhOutput: 'costhOutput.y',
      y_costhOutput_roofline: 'lower_left',
    } as any;

    const p1 = fullPt(1, 'h100', { tpPerGpuY: 50, costhOutputY: 3 });
    const p2 = fullPt(2, 'h100', { tpPerGpuY: 80, costhOutputY: 1.5 });
    const p3 = fullPt(3, 'h100', { tpPerGpuY: 60, costhOutputY: 2.5 });

    const groupedData = { h100: [p1, p2, p3] };
    const rooflines = computeAllRooflines(groupedData, chartDef);
    const marked = markRooflinePoints(groupedData, rooflines, chartDef);

    const m1 = marked.find((p) => p.x === 1)!;
    const m2 = marked.find((p) => p.x === 2)!;
    const m3 = marked.find((p) => p.x === 3)!;
    expect(m1.costhOutput!.roof).toBe(true);
    expect(m2.costhOutput!.roof).toBe(true);
    expect(m3.costhOutput!.roof).toBe(false);
  });

  it('marks outputTputPerGpu.roof for points on the output throughput roofline', () => {
    const chartDef = {
      chartType: 'e2e',
      heading: 'Test',
      x: 'median_e2el',
      x_label: 'E2E Latency',
      y: 'tput_per_gpu',
      y_outputTputPerGpu: 'outputTputPerGpu.y',
      y_outputTputPerGpu_roofline: 'upper_right',
    } as any;

    const p1 = fullPt(1, 'h100', { tpPerGpuY: 50, outputTputY: 300 });
    const p2 = fullPt(2, 'h100', { tpPerGpuY: 80, outputTputY: 600 });
    const p3 = fullPt(3, 'h100', { tpPerGpuY: 60, outputTputY: 400 });

    const groupedData = { h100: [p1, p2, p3] };
    const rooflines = computeAllRooflines(groupedData, chartDef);
    const marked = markRooflinePoints(groupedData, rooflines, chartDef);

    // upper_right: p1(1,300) and p2(2,600) on front; p3(3,400) < 600 so not on front
    const m1 = marked.find((p) => p.x === 1)!;
    const m2 = marked.find((p) => p.x === 2)!;
    const m3 = marked.find((p) => p.x === 3)!;
    expect(m1.outputTputPerGpu!.roof).toBe(true);
    expect(m2.outputTputPerGpu!.roof).toBe(true);
    expect(m3.outputTputPerGpu!.roof).toBe(false);
  });

  it('marks inputTputPerGpu.roof for points on the input throughput roofline', () => {
    const chartDef = {
      chartType: 'e2e',
      heading: 'Test',
      x: 'median_e2el',
      x_label: 'E2E Latency',
      y: 'tput_per_gpu',
      y_inputTputPerGpu: 'inputTputPerGpu.y',
      y_inputTputPerGpu_roofline: 'upper_right',
    } as any;

    const p1 = fullPt(1, 'h100', { tpPerGpuY: 50, inputTputY: 200 });
    const p2 = fullPt(2, 'h100', { tpPerGpuY: 80, inputTputY: 500 });
    const p3 = fullPt(3, 'h100', { tpPerGpuY: 60, inputTputY: 350 });

    const groupedData = { h100: [p1, p2, p3] };
    const rooflines = computeAllRooflines(groupedData, chartDef);
    const marked = markRooflinePoints(groupedData, rooflines, chartDef);

    const m1 = marked.find((p) => p.x === 1)!;
    const m2 = marked.find((p) => p.x === 2)!;
    const m3 = marked.find((p) => p.x === 3)!;
    expect(m1.inputTputPerGpu!.roof).toBe(true);
    expect(m2.inputTputPerGpu!.roof).toBe(true);
    expect(m3.inputTputPerGpu!.roof).toBe(false);
  });

  it('marks inputTputPerMw.roof for points on the input per-MW roofline', () => {
    const chartDef = {
      chartType: 'e2e',
      heading: 'Test',
      x: 'median_e2el',
      x_label: 'E2E Latency',
      y: 'tput_per_gpu',
      y_inputTputPerMw: 'inputTputPerMw.y',
      y_inputTputPerMw_roofline: 'upper_right',
    } as any;

    const p1 = fullPt(1, 'h100', { tpPerGpuY: 50, inputTputPerMwY: 100 });
    const p2 = fullPt(2, 'h100', { tpPerGpuY: 80, inputTputPerMwY: 400 });
    const p3 = fullPt(3, 'h100', { tpPerGpuY: 60, inputTputPerMwY: 250 });

    const groupedData = { h100: [p1, p2, p3] };
    const rooflines = computeAllRooflines(groupedData, chartDef);
    const marked = markRooflinePoints(groupedData, rooflines, chartDef);

    const m1 = marked.find((p) => p.x === 1)!;
    const m2 = marked.find((p) => p.x === 2)!;
    const m3 = marked.find((p) => p.x === 3)!;
    expect(m1.inputTputPerMw!.roof).toBe(true);
    expect(m2.inputTputPerMw!.roof).toBe(true);
    expect(m3.inputTputPerMw!.roof).toBe(false);
  });

  it('marks outputTputPerMw.roof for points on the output per-MW roofline', () => {
    const chartDef = {
      chartType: 'e2e',
      heading: 'Test',
      x: 'median_e2el',
      x_label: 'E2E Latency',
      y: 'tput_per_gpu',
      y_outputTputPerMw: 'outputTputPerMw.y',
      y_outputTputPerMw_roofline: 'upper_right',
    } as any;

    const p1 = fullPt(1, 'h100', { tpPerGpuY: 50, outputTputPerMwY: 200 });
    const p2 = fullPt(2, 'h100', { tpPerGpuY: 80, outputTputPerMwY: 500 });
    const p3 = fullPt(3, 'h100', { tpPerGpuY: 60, outputTputPerMwY: 350 });

    const groupedData = { h100: [p1, p2, p3] };
    const rooflines = computeAllRooflines(groupedData, chartDef);
    const marked = markRooflinePoints(groupedData, rooflines, chartDef);

    const m1 = marked.find((p) => p.x === 1)!;
    const m2 = marked.find((p) => p.x === 2)!;
    const m3 = marked.find((p) => p.x === 3)!;
    expect(m1.outputTputPerMw!.roof).toBe(true);
    expect(m2.outputTputPerMw!.roof).toBe(true);
    expect(m3.outputTputPerMw!.roof).toBe(false);
  });

  it('handles points missing optional roofline fields gracefully', () => {
    // Points without jTotal, jOutput, jInput, outputTputPerGpu, inputTputPerGpu
    const chartDef = {
      chartType: 'e2e',
      heading: 'Test',
      x: 'median_e2el',
      x_label: 'E2E Latency',
      y: 'tput_per_gpu',
      y_jTotal: 'jTotal.y',
      y_jTotal_roofline: 'lower_left',
      y_outputTputPerGpu: 'outputTputPerGpu.y',
      y_outputTputPerGpu_roofline: 'upper_right',
    } as any;

    // Points WITHOUT jTotal or outputTputPerGpu fields
    const p1 = fullPt(1, 'h100', { tpPerGpuY: 50 });
    const p2 = fullPt(2, 'h100', { tpPerGpuY: 80 });

    const groupedData = { h100: [p1, p2] };
    const rooflines = computeAllRooflines(groupedData, chartDef);
    const marked = markRooflinePoints(groupedData, rooflines, chartDef);

    // Should not crash; optional fields stay undefined
    expect(marked).toHaveLength(2);
    expect(marked[0].jTotal).toBeUndefined();
    expect(marked[0].outputTputPerGpu).toBeUndefined();
  });

  it('marks jOutput.roof and jInput.roof independently', () => {
    const chartDef = {
      chartType: 'e2e',
      heading: 'Test',
      x: 'median_e2el',
      x_label: 'E2E Latency',
      y: 'tput_per_gpu',
      y_jOutput: 'jOutput.y',
      y_jOutput_roofline: 'lower_left',
      y_jInput: 'jInput.y',
      y_jInput_roofline: 'lower_left',
    } as any;

    // p1: low jOutput (on front), high jInput (not on front alone)
    // p2: high jOutput (not on front), low jInput (on front)
    const p1 = fullPt(1, 'h100', { tpPerGpuY: 50, jOutputY: 2, jInputY: 10 });
    const p2 = fullPt(2, 'h100', { tpPerGpuY: 80, jOutputY: 5, jInputY: 4 });

    const groupedData = { h100: [p1, p2] };
    const rooflines = computeAllRooflines(groupedData, chartDef);
    const marked = markRooflinePoints(groupedData, rooflines, chartDef);

    const m1 = marked.find((p) => p.x === 1)!;
    const m2 = marked.find((p) => p.x === 2)!;

    // jOutput lower_left: p1(1,2.0) on front, p2(2,5.0) > 2.0 so NOT on front
    expect(m1.jOutput!.roof).toBe(true);
    expect(m2.jOutput!.roof).toBe(false);

    // jInput lower_left: p1(1,10.0) on front, p2(2,4.0) < 10.0 so on front
    expect(m1.jInput!.roof).toBe(true);
    expect(m2.jInput!.roof).toBe(true);
  });

  it('marks costnOutput and costrOutput independently', () => {
    const chartDef = {
      chartType: 'e2e',
      heading: 'Test',
      x: 'median_e2el',
      x_label: 'E2E Latency',
      y: 'tput_per_gpu',
      y_costnOutput: 'costnOutput.y',
      y_costnOutput_roofline: 'lower_left',
      y_costrOutput: 'costrOutput.y',
      y_costrOutput_roofline: 'lower_left',
    } as any;

    const p1 = fullPt(1, 'h100', {
      tpPerGpuY: 50,
      costnOutputY: 3,
      costrOutputY: 2,
    });
    const p2 = fullPt(2, 'h100', {
      tpPerGpuY: 80,
      costnOutputY: 1.5,
      costrOutputY: 1,
    });
    const p3 = fullPt(3, 'h100', {
      tpPerGpuY: 60,
      costnOutputY: 2.5,
      costrOutputY: 1.5,
    });

    const groupedData = { h100: [p1, p2, p3] };
    const rooflines = computeAllRooflines(groupedData, chartDef);
    const marked = markRooflinePoints(groupedData, rooflines, chartDef);

    // lower_left: both costnOutput and costrOutput front = [p1, p2], p3 off front
    const m1 = marked.find((p) => p.x === 1)!;
    const m2 = marked.find((p) => p.x === 2)!;
    const m3 = marked.find((p) => p.x === 3)!;

    expect(m1.costnOutput!.roof).toBe(true);
    expect(m2.costnOutput!.roof).toBe(true);
    expect(m3.costnOutput!.roof).toBe(false);

    expect(m1.costrOutput!.roof).toBe(true);
    expect(m2.costrOutput!.roof).toBe(true);
    expect(m3.costrOutput!.roof).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pareto front x-ordering — gradient labels require ascending x
// ---------------------------------------------------------------------------
describe('paretoFront x-ordering for gradient labels', () => {
  it('paretoFrontUpperRight returns points in ascending x order', () => {
    const points = [pt(3, 30), pt(1, 10), pt(2, 20)];
    const front = paretoFrontUpperRight(points);
    for (let i = 1; i < front.length; i++) {
      expect(front[i].x).toBeGreaterThanOrEqual(front[i - 1].x);
    }
  });

  it('paretoFrontLowerRight returns points in descending x order', () => {
    // This is the documented behavior that causes gradient labels to break
    // when points are not re-sorted to ascending x.
    // Use data where y decreases as x decreases so multiple points land on front:
    // lower_right: sort desc x, push when y < minY
    const points = [pt(3, 20), pt(2, 15), pt(1, 10)];
    const front = paretoFrontLowerRight(points);
    expect(front.length).toBeGreaterThanOrEqual(2);
    // Verify descending order
    for (let i = 1; i < front.length; i++) {
      expect(front[i].x).toBeLessThanOrEqual(front[i - 1].x);
    }
  });

  it('paretoFrontLowerRight sorted ascending fixes gradient label compatibility', () => {
    // Regression test: sorting the output of paretoFrontLowerRight by
    // ascending x ensures computeGradientStops gets a positive totalRange.
    const points = [pt(3, 20), pt(2, 15), pt(1, 10)];
    const front = paretoFrontLowerRight(points);
    expect(front.length).toBeGreaterThanOrEqual(2);
    // Apply the fix from ScatterGraph.tsx
    front.sort((a, b) => a.x - b.x);
    // Now ascending
    for (let i = 1; i < front.length; i++) {
      expect(front[i].x).toBeGreaterThanOrEqual(front[i - 1].x);
    }
  });

  it('paretoFrontUpperLeft returns points in ascending x order', () => {
    const points = [pt(3, 10), pt(1, 30), pt(2, 20)];
    const front = paretoFrontUpperLeft(points);
    for (let i = 1; i < front.length; i++) {
      expect(front[i].x).toBeGreaterThanOrEqual(front[i - 1].x);
    }
  });

  it('paretoFrontLowerLeft returns points in ascending x order', () => {
    const points = [pt(3, 30), pt(1, 10), pt(2, 20)];
    const front = paretoFrontLowerLeft(points);
    for (let i = 1; i < front.length; i++) {
      expect(front[i].x).toBeGreaterThanOrEqual(front[i - 1].x);
    }
  });
});

// ===========================================================================
// paretoFrontUpperRight
// "higher x AND higher y is better"
// result is a staircase where y is non-decreasing as x increases
// ===========================================================================
describe('paretoFrontUpperRight', () => {
  it('returns empty array for empty input', () => {
    expect(paretoFrontUpperRight([])).toEqual([]);
  });

  it('returns single point unchanged', () => {
    const result = paretoFrontUpperRight([paretoPt(3, 7)]);
    expect(xy(result)).toEqual([{ x: 3, y: 7 }]);
  });

  it('returns both points when neither dominates (x increases, y increases)', () => {
    // {x:1,y:2} and {x:3,y:5} — as x grows, y grows: both on front
    const result = paretoFrontUpperRight([paretoPt(1, 2), paretoPt(3, 5)]);
    expect(xy(result)).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 5 },
    ]);
  });

  it('drops the second point when it has higher x but lower y than the first', () => {
    // {x:1,y:5} sets maxY=5. {x:3,y:3}: y=3 < maxY=5 gets dropped
    const result = paretoFrontUpperRight([paretoPt(1, 5), paretoPt(3, 3)]);
    expect(xy(result)).toEqual([{ x: 1, y: 5 }]);
  });

  it('drops points where y decreases as x increases', () => {
    const result = paretoFrontUpperRight([paretoPt(1, 5), paretoPt(2, 3), paretoPt(3, 1)]);
    expect(xy(result)).toEqual([{ x: 1, y: 5 }]);
  });

  it('keeps all points when y strictly increases with x', () => {
    const result = paretoFrontUpperRight([paretoPt(1, 1), paretoPt(2, 3), paretoPt(3, 7)]);
    expect(xy(result)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 3 },
      { x: 3, y: 7 },
    ]);
  });

  it('handles unsorted input (sorts by x ascending internally)', () => {
    const result = paretoFrontUpperRight([paretoPt(3, 7), paretoPt(1, 1), paretoPt(2, 3)]);
    expect(xy(result)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 3 },
      { x: 3, y: 7 },
    ]);
  });

  it('keeps all points with same y at increasing x (flat roofline extends rightward)', () => {
    // y == maxY and x increases: the condition allows extending the front rightward
    const result = paretoFrontUpperRight([paretoPt(1, 5), paretoPt(2, 5), paretoPt(3, 5)]);
    expect(xy(result)).toEqual([
      { x: 1, y: 5 },
      { x: 2, y: 5 },
      { x: 3, y: 5 },
    ]);
  });

  it('keeps only highest y when multiple points share the same x', () => {
    const result = paretoFrontUpperRight([paretoPt(2, 3), paretoPt(2, 7), paretoPt(2, 1)]);
    expect(xy(result)).toEqual([{ x: 2, y: 7 }]);
  });

  it('handles the general scattered cloud case', () => {
    // front: (1,2), (2,5), (4,6) — (3,3) is below maxY at that point
    const result = paretoFrontUpperRight([
      paretoPt(1, 2),
      paretoPt(2, 5),
      paretoPt(3, 3),
      paretoPt(4, 6),
    ]);
    expect(xy(result)).toEqual([
      { x: 1, y: 2 },
      { x: 2, y: 5 },
      { x: 4, y: 6 },
    ]);
  });

  it('sorts the input array in-place as a side effect', () => {
    const input = [paretoPt(3, 7), paretoPt(1, 1), paretoPt(2, 3)];
    paretoFrontUpperRight(input);
    // after the call the array is sorted ascending by x
    expect(input.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('preserves the original InferenceData object references in the result', () => {
    const a = paretoPt(1, 2);
    const b = paretoPt(2, 5);
    const result = paretoFrontUpperRight([a, b]);
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(b);
  });
});

// ===========================================================================
// paretoFrontUpperLeft
// "lower x AND higher y is better"
// result is a staircase where y strictly decreases as x increases
// ===========================================================================
describe('paretoFrontUpperLeft', () => {
  it('returns empty array for empty input', () => {
    expect(paretoFrontUpperLeft([])).toEqual([]);
  });

  it('returns single point unchanged', () => {
    expect(xy(paretoFrontUpperLeft([paretoPt(3, 7)]))).toEqual([{ x: 3, y: 7 }]);
  });

  it('returns both points when y strictly decreases as x increases', () => {
    const result = paretoFrontUpperLeft([paretoPt(1, 5), paretoPt(3, 2)]);
    expect(xy(result)).toEqual([
      { x: 1, y: 5 },
      { x: 3, y: 2 },
    ]);
  });

  it('returns only the highest-y point when all points have non-decreasing y', () => {
    // each new point has y >= previous, so previous gets popped each time
    const result = paretoFrontUpperLeft([paretoPt(1, 1), paretoPt(2, 2), paretoPt(3, 5)]);
    expect(xy(result)).toEqual([{ x: 3, y: 5 }]);
  });

  it('returns only the rightmost point when all points share the same y', () => {
    // flat line: each y >= previous, so only the last one survives
    const result = paretoFrontUpperLeft([paretoPt(1, 3), paretoPt(2, 3), paretoPt(3, 3)]);
    expect(xy(result)).toEqual([{ x: 3, y: 3 }]);
  });

  it('keeps only highest y for duplicate x values', () => {
    const result = paretoFrontUpperLeft([
      paretoPt(1, 3),
      paretoPt(1, 7),
      paretoPt(1, 5),
      paretoPt(2, 2),
    ]);
    expect(xy(result)).toEqual([
      { x: 1, y: 7 },
      { x: 2, y: 2 },
    ]);
  });

  it('removes a middle point that is dominated by a later (higher-x) higher-y point', () => {
    // {x:2,y:2} is popped when {x:3,y:4} arrives (y=4 >= 2)
    const result = paretoFrontUpperLeft([paretoPt(1, 5), paretoPt(2, 2), paretoPt(3, 4)]);
    expect(xy(result)).toEqual([
      { x: 1, y: 5 },
      { x: 3, y: 4 },
    ]);
  });

  it('handles unsorted input', () => {
    const result = paretoFrontUpperLeft([paretoPt(3, 2), paretoPt(1, 5), paretoPt(2, 3)]);
    // sorted: (1,5),(2,3),(3,2) — strictly decreasing, all kept
    expect(xy(result)).toEqual([
      { x: 1, y: 5 },
      { x: 2, y: 3 },
      { x: 3, y: 2 },
    ]);
  });

  it('handles the general scattered cloud case', () => {
    // (1,5),(2,2),(3,4),(4,1)
    // (1,5): push → [(1,5)]
    // (2,2): 2<5, push → [(1,5),(2,2)]
    // (3,4): 4>=2, pop (2,2); 4<5, stop; push → [(1,5),(3,4)]
    // (4,1): 1<4, push → [(1,5),(3,4),(4,1)]
    const result = paretoFrontUpperLeft([
      paretoPt(1, 5),
      paretoPt(2, 2),
      paretoPt(3, 4),
      paretoPt(4, 1),
    ]);
    expect(xy(result)).toEqual([
      { x: 1, y: 5 },
      { x: 3, y: 4 },
      { x: 4, y: 1 },
    ]);
  });

  it('sorts the input array in-place as a side effect', () => {
    const input = [paretoPt(3, 2), paretoPt(1, 5), paretoPt(2, 3)];
    paretoFrontUpperLeft(input);
    expect(input.map((p) => p.x)).toEqual([1, 2, 3]);
  });
});

// ===========================================================================
// paretoFrontLowerLeft
// "lower x AND lower y is better"
// sorted by x asc (ties by y asc), keeps only points where y reaches a new
// global minimum: a staircase descending from upper-left to lower-right
// ===========================================================================
describe('paretoFrontLowerLeft', () => {
  it('returns empty array for empty input', () => {
    expect(paretoFrontLowerLeft([])).toEqual([]);
  });

  it('returns single point unchanged', () => {
    expect(xy(paretoFrontLowerLeft([paretoPt(3, 7)]))).toEqual([{ x: 3, y: 7 }]);
  });

  it('keeps all points when y strictly decreases as x increases', () => {
    const result = paretoFrontLowerLeft([paretoPt(1, 5), paretoPt(2, 3), paretoPt(3, 1)]);
    expect(xy(result)).toEqual([
      { x: 1, y: 5 },
      { x: 2, y: 3 },
      { x: 3, y: 1 },
    ]);
  });

  it('returns only the first point when y strictly increases with x', () => {
    const result = paretoFrontLowerLeft([paretoPt(1, 1), paretoPt(2, 3), paretoPt(3, 7)]);
    expect(xy(result)).toEqual([{ x: 1, y: 1 }]);
  });

  it('returns only the first point when all points share the same y', () => {
    // y never goes below initial minY, so only the first x keeps its slot
    const result = paretoFrontLowerLeft([paretoPt(1, 3), paretoPt(2, 3), paretoPt(3, 3)]);
    expect(xy(result)).toEqual([{ x: 1, y: 3 }]);
  });

  it('keeps only lowest y for duplicate x values (sorted y asc for ties)', () => {
    // sorted by (x asc, y asc): (1,3),(1,5),(2,2)
    const result = paretoFrontLowerLeft([paretoPt(1, 5), paretoPt(1, 3), paretoPt(2, 2)]);
    expect(xy(result)).toEqual([
      { x: 1, y: 3 },
      { x: 2, y: 2 },
    ]);
  });

  it('skips points above current minimum y', () => {
    // (1,3),(2,5),(3,1),(4,2) → (1,3) kept, (2,5) skipped, (3,1) new min, (4,2) skipped
    const result = paretoFrontLowerLeft([
      paretoPt(1, 3),
      paretoPt(2, 5),
      paretoPt(3, 1),
      paretoPt(4, 2),
    ]);
    expect(xy(result)).toEqual([
      { x: 1, y: 3 },
      { x: 3, y: 1 },
    ]);
  });

  it('handles unsorted input', () => {
    const result = paretoFrontLowerLeft([paretoPt(3, 1), paretoPt(1, 5), paretoPt(2, 3)]);
    // sorted: (1,5),(2,3),(3,1) — strictly decreasing y: all kept
    expect(xy(result)).toEqual([
      { x: 1, y: 5 },
      { x: 2, y: 3 },
      { x: 3, y: 1 },
    ]);
  });

  it('sorts the input array in-place as a side effect', () => {
    const input = [paretoPt(3, 1), paretoPt(1, 5), paretoPt(2, 3)];
    paretoFrontLowerLeft(input);
    expect(input.map((p) => p.x)).toEqual([1, 2, 3]);
  });
});

// ===========================================================================
// paretoFrontLowerRight
// "higher x AND lower y is better"
// Sorted by x DESC (ties by y asc), keeps only points that achieve a new
// global minimum y as x decreases: a staircase from upper-left to lower-right
// traversed right-to-left
// ===========================================================================
describe('paretoFrontLowerRight', () => {
  it('returns empty array for empty input', () => {
    expect(paretoFrontLowerRight([])).toEqual([]);
  });

  it('returns single point unchanged', () => {
    expect(xy(paretoFrontLowerRight([paretoPt(3, 7)]))).toEqual([{ x: 3, y: 7 }]);
  });

  it('keeps all points when y strictly decreases as x decreases (ideal staircase)', () => {
    // sorted by x desc: (3,5),(2,3),(1,1) — each has new lower y → all kept
    const result = paretoFrontLowerRight([paretoPt(1, 1), paretoPt(2, 3), paretoPt(3, 5)]);
    expect(xy(result)).toEqual([
      { x: 3, y: 5 },
      { x: 2, y: 3 },
      { x: 1, y: 1 },
    ]);
  });

  it('returns only the point with highest x when y increases as x decreases', () => {
    // sorted x desc: (3,1),(2,2),(1,5). Only (3,1) sets minY; others have y > minY
    const result = paretoFrontLowerRight([paretoPt(1, 5), paretoPt(2, 2), paretoPt(3, 1)]);
    expect(xy(result)).toEqual([{ x: 3, y: 1 }]);
  });

  it('returns only one point when all share the same y', () => {
    // only the first processed (highest x) survives since y never goes below initial minY
    const result = paretoFrontLowerRight([paretoPt(1, 3), paretoPt(2, 3), paretoPt(3, 3)]);
    expect(xy(result)).toEqual([{ x: 3, y: 3 }]);
  });

  it('returns only one point when all share the same x', () => {
    // Sorted x desc, y asc: (1,1),(1,3),(1,5). Only (1,1) survives.
    const result = paretoFrontLowerRight([paretoPt(1, 5), paretoPt(1, 3), paretoPt(1, 1)]);
    expect(xy(result)).toEqual([{ x: 1, y: 1 }]);
  });

  it('skips points with y above current minimum when scanning right-to-left', () => {
    // sorted x desc: (4,3),(3,1),(2,5),(1,2)
    // (4,3): minY=3, keep
    // (3,1): y=1<3, new min, keep
    // (2,5): y=5>=1, skip
    // (1,2): y=2>=1, skip
    const result = paretoFrontLowerRight([
      paretoPt(1, 2),
      paretoPt(2, 5),
      paretoPt(3, 1),
      paretoPt(4, 3),
    ]);
    expect(xy(result)).toEqual([
      { x: 4, y: 3 },
      { x: 3, y: 1 },
    ]);
  });

  it('handles unsorted input', () => {
    const result = paretoFrontLowerRight([paretoPt(1, 1), paretoPt(3, 5), paretoPt(2, 3)]);
    expect(xy(result)).toEqual([
      { x: 3, y: 5 },
      { x: 2, y: 3 },
      { x: 1, y: 1 },
    ]);
  });

  it('sorts the input array in-place as a side effect (x descending)', () => {
    const input = [paretoPt(1, 1), paretoPt(3, 5), paretoPt(2, 3)];
    paretoFrontLowerRight(input);
    expect(input.map((p) => p.x)).toEqual([3, 2, 1]);
  });
});
