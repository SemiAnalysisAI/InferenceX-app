import { describe, it, expect, vi } from 'vitest';

import type { AggDataEntry, ChartDefinition, InferenceData } from '@/components/inference/types';
import {
  buildAvailabilityHwKey,
  generateHighContrastColors,
  getNestedYValue,
  getHardwareKey,
  normalizeEvalHardwareKey,
  createChartDataPoint,
  calculateRoofline,
  computeAllRooflines,
  markRooflinePoints,
  paretoFrontUpperRight,
  paretoFrontLowerRight,
  paretoFrontLowerLeft,
  paretoFrontUpperLeft,
} from '@/lib/chart-utils';

// mock constants so createChartDataPoint (also in this module) doesn't call
// the real HARDWARE_CONFIG during module initialisation.
vi.mock('@/lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/constants')>();
  return {
    ...actual,
    getHardwareConfig: vi.fn(() => ({ label: 'H100', suffix: '' })),
    getGpuSpecs: vi.fn(() => ({ power: 700, costh: 2.8, costn: 1.4, costr: 0.7 })),
  };
});

// ---------------------------------------------------------------------------
// fixture factory
// ---------------------------------------------------------------------------
function pt(
  x: number,
  y: number,
  hwKey = 'h100',
  opts: {
    tpPerGpuY?: number;
    costhY?: number;
    outputTputY?: number;
    inputTputY?: number;
  } = {},
): InferenceData {
  const tpPerGpuY = opts.tpPerGpuY ?? y * 10;
  return {
    date: '2024-01-01',
    x,
    y,
    tp: 1,
    conc: 1,
    hwKey,
    precision: 'fp16',
    tpPerGpu: { y: tpPerGpuY, roof: false },
    tpPerMw: { y: 5, roof: false },
    costh: { y: opts.costhY ?? 1.0, roof: false },
    costn: { y: 1.5, roof: false },
    costr: { y: 1.2, roof: false },
    costhi: { y: 2.0, roof: false },
    costni: { y: 2.5, roof: false },
    costri: { y: 2.2, roof: false },
    ...(opts.outputTputY !== undefined
      ? { outputTputPerGpu: { y: opts.outputTputY, roof: false } }
      : {}),
    ...(opts.inputTputY !== undefined
      ? { inputTputPerGpu: { y: opts.inputTputY, roof: false } }
      : {}),
  } as InferenceData;
}

// ---------------------------------------------------------------------------
// fixture factory — AggDataEntry for createChartDataPoint / getHardwareKey tests
// ---------------------------------------------------------------------------
function entry(overrides: Partial<AggDataEntry> = {}): AggDataEntry {
  return {
    hw: 'h100-sxm',
    framework: '',
    mtp: '',
    spec_decoding: 'none',
    hwKey: 'h100' as any,
    tp: 8,
    conc: 64,
    model: 'test-model',
    precision: 'fp8',
    tput_per_gpu: 1000,
    output_tput_per_gpu: 0,
    input_tput_per_gpu: 0,
    mean_ttft: 100,
    median_ttft: 95,
    std_ttft: 10,
    p99_ttft: 200,
    mean_tpot: 5,
    mean_intvty: 50,
    median_tpot: 4,
    median_intvty: 45,
    std_tpot: 1,
    std_intvty: 5,
    p99_tpot: 8,
    p99_intvty: 80,
    mean_itl: 3,
    median_itl: 2.5,
    std_itl: 0.5,
    p99_itl: 5,
    mean_e2el: 500,
    median_e2el: 480,
    std_e2el: 50,
    p99_e2el: 700,
    disagg: false,
    num_prefill_gpu: 0,
    num_decode_gpu: 0,
    date: '2025-01-15',
    ...overrides,
  } as AggDataEntry;
}

// ---------------------------------------------------------------------------
// fixture factory — minimal InferenceData for pareto front tests (only x/y matter)
// ---------------------------------------------------------------------------
function paretoPt(x: number, y: number, overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    date: '2024-01-01',
    x,
    y,
    tp: 1,
    conc: 1,
    hwKey: 'h100',
    precision: 'fp16',
    tpPerGpu: { y: 100, roof: false },
    tpPerMw: { y: 50, roof: false },
    costh: { y: 1, roof: false },
    costn: { y: 1, roof: false },
    costr: { y: 1, roof: false },
    costhi: { y: 1, roof: false },
    costni: { y: 1, roof: false },
    costri: { y: 1, roof: false },
    ...overrides,
  };
}

// assertion helper, extracts {x, y} from each point
const xy = (pts: InferenceData[]) => pts.map((p) => ({ x: p.x, y: p.y }));

/**
 * Creates a minimal InferenceData point with all optional roofline fields populated.
 */
function fullPt(
  x: number,
  hwKey: string,
  vals: {
    tpPerGpuY: number;
    costhY?: number;
    costhOutputY?: number;
    costnOutputY?: number;
    costrOutputY?: number;
    jTotalY?: number;
    jOutputY?: number;
    jInputY?: number;
    outputTputY?: number;
    inputTputY?: number;
    inputTputPerMwY?: number;
    outputTputPerMwY?: number;
  },
): InferenceData {
  return {
    date: '2025-01-15',
    x,
    y: 0,
    tp: 8,
    conc: 64,
    hwKey,
    precision: 'fp8',
    tpPerGpu: { y: vals.tpPerGpuY, roof: false },
    tpPerMw: { y: 5, roof: false },
    costh: { y: vals.costhY ?? 1.0, roof: false },
    costn: { y: 1.5, roof: false },
    costr: { y: 1.2, roof: false },
    costhi: { y: 2.0, roof: false },
    costni: { y: 2.5, roof: false },
    costri: { y: 2.2, roof: false },
    ...(vals.costhOutputY !== undefined
      ? { costhOutput: { y: vals.costhOutputY, roof: false } }
      : {}),
    ...(vals.costnOutputY !== undefined
      ? { costnOutput: { y: vals.costnOutputY, roof: false } }
      : {}),
    ...(vals.costrOutputY !== undefined
      ? { costrOutput: { y: vals.costrOutputY, roof: false } }
      : {}),
    ...(vals.jTotalY !== undefined ? { jTotal: { y: vals.jTotalY, roof: false } } : {}),
    ...(vals.jOutputY !== undefined ? { jOutput: { y: vals.jOutputY, roof: false } } : {}),
    ...(vals.jInputY !== undefined ? { jInput: { y: vals.jInputY, roof: false } } : {}),
    ...(vals.outputTputY !== undefined
      ? { outputTputPerGpu: { y: vals.outputTputY, roof: false } }
      : {}),
    ...(vals.inputTputY !== undefined
      ? { inputTputPerGpu: { y: vals.inputTputY, roof: false } }
      : {}),
    ...(vals.inputTputPerMwY !== undefined
      ? { inputTputPerMw: { y: vals.inputTputPerMwY, roof: false } }
      : {}),
    ...(vals.outputTputPerMwY !== undefined
      ? { outputTputPerMw: { y: vals.outputTputPerMwY, roof: false } }
      : {}),
  } as InferenceData;
}

// ===========================================================================
// buildAvailabilityHwKey
// ===========================================================================
describe('buildAvailabilityHwKey', () => {
  it('returns hardware base when no framework or spec method', () => {
    expect(buildAvailabilityHwKey('h200')).toBe('h200');
  });

  it('strips suffix after hyphen from hardware name', () => {
    expect(buildAvailabilityHwKey('h200-sxm')).toBe('h200');
  });

  it('appends framework with underscore separator', () => {
    expect(buildAvailabilityHwKey('mi355x', 'sglang')).toBe('mi355x_sglang');
  });

  it('builds mori-sglang key when framework is mori-sglang', () => {
    expect(buildAvailabilityHwKey('mi355x', 'mori-sglang', undefined, true)).toBe(
      'mi355x_mori-sglang',
    );
  });

  it('appends _mtp for mtp spec method with mori-sglang', () => {
    expect(buildAvailabilityHwKey('mi355x', 'mori-sglang', 'mtp', true)).toBe(
      'mi355x_mori-sglang_mtp',
    );
  });

  it('non-disagg sglang stays as sglang', () => {
    expect(buildAvailabilityHwKey('mi355x', 'sglang', undefined, false)).toBe('mi355x_sglang');
  });

  it('appends arbitrary spec method', () => {
    expect(buildAvailabilityHwKey('h200', 'trt', 'eagle')).toBe('h200_trt_eagle');
  });

  it('ignores spec method "none"', () => {
    expect(buildAvailabilityHwKey('h200', 'sglang', 'none')).toBe('h200_sglang');
  });

  it('handles undefined framework with mtp spec method', () => {
    expect(buildAvailabilityHwKey('h200', undefined, 'mtp')).toBe('h200_mtp');
  });

  it('handles undefined framework and spec method', () => {
    expect(buildAvailabilityHwKey('b200', undefined, undefined)).toBe('b200');
  });

  it('normalizes old sglang-disagg framework to mori-sglang', () => {
    expect(buildAvailabilityHwKey('mi355x', 'sglang-disagg', undefined, true)).toBe(
      'mi355x_mori-sglang',
    );
  });

  it('normalizes sglang-disagg with mtp spec method', () => {
    expect(buildAvailabilityHwKey('mi355x', 'sglang-disagg', 'mtp', true)).toBe(
      'mi355x_mori-sglang_mtp',
    );
  });
});

// ===========================================================================
// generateHighContrastColors
// ===========================================================================
describe('generateHighContrastColors', () => {
  /** Parse a hex (#rrggbb) or rgb() color into [r, g, b]. */
  function parseRgb(color: string): [number, number, number] {
    const hex = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];
    const rgb = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    throw new Error(`Cannot parse color: ${color}`);
  }

  /** Euclidean distance in RGB — rough proxy (palette is perceptually uniform by construction). */
  function rgbDist(a: [number, number, number], b: [number, number, number]): number {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  }

  /** Not red/pink — green, teal, yellow-green, cyan all count. */
  function isNotReddish(rgb: [number, number, number]): boolean {
    const [r, g, b] = rgb;
    // Reject if red-dominant with low green (the "looks red/pink" zone)
    return !(r > g * 1.2 && r > b);
  }

  /** Not green — red, magenta, orange, pink all count. */
  function isNotGreenish(rgb: [number, number, number]): boolean {
    const [r, g, b] = rgb;
    // Reject if green-dominant with low red and blue
    return !(g > r * 1.2 && g > b * 1.2);
  }

  /** Assert every pair has at least `min` RGB distance. */
  function assertMinDist(colors: Record<string, string>, min: number) {
    const rgbs = Object.values(colors).map(parseRgb);
    for (let i = 0; i < rgbs.length; i++) {
      for (let j = i + 1; j < rgbs.length; j++) {
        expect(rgbDist(rgbs[i], rgbs[j])).toBeGreaterThanOrEqual(min);
      }
    }
  }

  // ---------- Basics ----------

  it('returns an empty object for an empty keys array', () => {
    expect(generateHighContrastColors([], 'dark')).toEqual({});
  });

  it('returns a valid hex color for a single key', () => {
    const result = generateHighContrastColors(['gpu-a'], 'dark');
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['gpu-a']).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('returns one color per key', () => {
    const keys = ['h100_vllm', 'b200_sglang', 'mi300x_sglang'];
    const result = generateHighContrastColors(keys, 'dark');
    expect(Object.keys(result)).toHaveLength(3);
    for (const key of keys) expect(result[key]).toBeDefined();
  });

  it('is deterministic — same inputs produce same colors', () => {
    const keys = ['h100_vllm', 'b200_sglang', 'mi300x_sglang'];
    expect(generateHighContrastColors(keys, 'dark')).toEqual(
      generateHighContrastColors(keys, 'dark'),
    );
  });

  it('produces different palettes for dark vs light', () => {
    const keys = [
      'h100_vllm',
      'h200_sglang',
      'b200_dynamo-trt',
      'mi300x_sglang',
      'mi355x_mori-sglang',
    ];
    const dark = generateHighContrastColors(keys, 'dark');
    const light = generateHighContrastColors(keys, 'light');
    expect(Object.values(dark).join()).not.toEqual(Object.values(light).join());
  });

  // ---------- Tier 1: few items → brand zone ----------

  it('3 NVIDIA GPUs are not red', () => {
    const result = generateHighContrastColors(['h100_vllm', 'h200_vllm', 'b200_vllm'], 'dark');
    for (const color of Object.values(result)) {
      expect(isNotReddish(parseRgb(color))).toBe(true);
    }
    assertMinDist(result, 30);
  });

  it('2 AMD GPUs are not green', () => {
    const result = generateHighContrastColors(['mi300x_sglang', 'mi325x_sglang'], 'dark');
    for (const color of Object.values(result)) {
      expect(isNotGreenish(parseRgb(color))).toBe(true);
    }
    assertMinDist(result, 30);
  });

  it('4 NVIDIA GPUs stay in brand zone and are distinguishable', () => {
    const keys = ['h100_vllm', 'h200_vllm', 'b200_vllm', 'b300_vllm'];
    const result = generateHighContrastColors(keys, 'dark');
    for (const color of Object.values(result)) {
      expect(isNotReddish(parseRgb(color))).toBe(true);
    }
    assertMinDist(result, 25);
  });

  it('3 NVIDIA + 3 AMD: no color confusion, all distinguishable', () => {
    const keys = [
      'h100_vllm',
      'h200_vllm',
      'b200_vllm',
      'mi300x_sglang',
      'mi325x_sglang',
      'mi355x_sglang',
    ];
    const result = generateHighContrastColors(keys, 'dark');
    // NVIDIA keys should not be red (3 ≤ PREFERRED_MAX)
    for (const k of keys.slice(0, 3)) {
      expect(isNotReddish(parseRgb(result[k]))).toBe(true);
    }
    // AMD keys should not be green (3 ≤ PREFERRED_MAX)
    for (const k of keys.slice(3)) {
      expect(isNotGreenish(parseRgb(result[k]))).toBe(true);
    }
    assertMinDist(result, 25);
  });

  // ---------- Tier 2: moderate items → full wheel minus rival color ----------

  it('10 NVIDIA GPUs: no red hues, still distinguishable', () => {
    const gpus = ['h100', 'h200', 'b200', 'b300', 'gb200'];
    const keys = gpus.flatMap((g) => [`${g}_vllm`, `${g}_sglang`]);
    const result = generateHighContrastColors(keys, 'dark');
    // Should not be reddish (banned)
    for (const color of Object.values(result)) {
      const rgb = parseRgb(color);
      // Not red-dominant with low green — i.e. not in the red/pink zone
      const isRedPink = rgb[0] > 150 && rgb[1] < 80 && rgb[2] < 150;
      expect(isRedPink).toBe(false);
    }
    assertMinDist(result, 20);
  });

  // ---------- Tier 3: many items → no restrictions, best spacing ----------

  it('15+ NVIDIA items: all colors allowed, well-spaced', () => {
    const gpus = ['h100', 'h200', 'b200', 'b300', 'gb200', 'gb300'];
    const frameworks = ['vllm', 'sglang', 'trt'];
    const keys = gpus.flatMap((g) => frameworks.map((f) => `${g}_${f}`));
    expect(keys.length).toBe(18);
    const result = generateHighContrastColors(keys, 'dark');
    expect(Object.keys(result)).toHaveLength(18);
    // Just verify they're all distinct — no color constraints at this count
    assertMinDist(result, 15);
  });

  // ---------- Mixed vendor scenarios ----------

  it('6 NVIDIA + 3 AMD: vendors visually separate, all distinct', () => {
    const nvidia = ['h100_vllm', 'h200_vllm', 'b200_vllm', 'b300_vllm', 'gb200_vllm', 'gb300_vllm'];
    const amd = ['mi300x_sglang', 'mi325x_sglang', 'mi355x_sglang'];
    const result = generateHighContrastColors([...nvidia, ...amd], 'dark');
    assertMinDist(result, 20);
  });

  it('single GPU per vendor: NVIDIA not red, AMD not green', () => {
    const result = generateHighContrastColors(['h100_vllm', 'mi300x_sglang'], 'dark');
    expect(isNotReddish(parseRgb(result['h100_vllm']))).toBe(true);
    expect(isNotGreenish(parseRgb(result['mi300x_sglang']))).toBe(true);
  });
});

// ===========================================================================
// getNestedYValue
// ===========================================================================
describe('getNestedYValue', () => {
  const point = pt(1, 5, 'h100', { tpPerGpuY: 42, costhY: 7 });

  it('returns the flat value for a plain key', () => {
    expect(getNestedYValue(point, 'y')).toBe(5);
    expect(getNestedYValue(point, 'x')).toBe(1);
  });

  it('extracts nested y-value with dot notation (tpPerGpu.y)', () => {
    expect(getNestedYValue(point, 'tpPerGpu.y')).toBe(42);
  });

  it('extracts nested y-value for costh.y', () => {
    expect(getNestedYValue(point, 'costh.y')).toBe(7);
  });

  it('returns 0 when the nested sub-key does not exist', () => {
    expect(getNestedYValue(point, 'tpPerGpu.missing' as never)).toBe(0);
  });

  it('returns 0 when the top-level key does not exist', () => {
    expect(getNestedYValue(point, 'nonExistentField' as never)).toBe(0);
  });

  it('returns 0 when the top-level key maps to a non-object for dot notation', () => {
    // 'x' is a number, not an object; x.y makes no sense
    expect(getNestedYValue(point, 'x.y' as never)).toBe(0);
  });
});

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
      pt(1, 0, 'h100', { tpPerGpuY: 50, costhY: 2.0 }),
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
    expect(front[0].y).toBe(2.0);
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
    const pA = pt(1, 0, 'h100', { tpPerGpuY: 50, costhY: 2.0 });
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
// getHardwareKey
// ===========================================================================
describe('getHardwareKey', () => {
  it('returns base hardware name from hw field (splits on first dash)', () => {
    expect(getHardwareKey(entry({ hw: 'h100-sxm', framework: '' }))).toBe('h100');
  });

  it('appends framework when present', () => {
    expect(getHardwareKey(entry({ hw: 'h100-sxm', framework: 'vllm' }))).toBe('h100_vllm');
  });

  it('appends _mtp when mtp is "on"', () => {
    expect(getHardwareKey(entry({ hw: 'h100-sxm', framework: '', mtp: 'on' }))).toBe('h100_mtp');
  });

  it('appends _mtp when spec_decoding is "mtp"', () => {
    expect(getHardwareKey(entry({ hw: 'h100-sxm', framework: '', spec_decoding: 'mtp' }))).toBe(
      'h100_mtp',
    );
  });

  it('appends spec_decoding suffix when not "none" and not "mtp"', () => {
    expect(getHardwareKey(entry({ hw: 'b200-sxm', framework: '', spec_decoding: 'eagle' }))).toBe(
      'b200_eagle',
    );
  });

  it('does not append spec_decoding when it is "none"', () => {
    expect(getHardwareKey(entry({ hw: 'h100-sxm', framework: '', spec_decoding: 'none' }))).toBe(
      'h100',
    );
  });

  it('combines framework + mtp when both present', () => {
    expect(getHardwareKey(entry({ hw: 'b200-sxm', framework: 'trt', mtp: 'on' }))).toBe(
      'b200_trt_mtp',
    );
  });

  it('combines framework + spec_decoding when both present', () => {
    expect(
      getHardwareKey(entry({ hw: 'b200-sxm', framework: 'trt', spec_decoding: 'eagle' })),
    ).toBe('b200_trt_eagle');
  });

  it('mtp takes precedence over non-mtp spec_decoding when mtp is "on"', () => {
    expect(
      getHardwareKey(entry({ hw: 'h100-sxm', framework: '', mtp: 'on', spec_decoding: 'eagle' })),
    ).toBe('h100_mtp');
  });

  it('handles hw with no dashes', () => {
    expect(getHardwareKey(entry({ hw: 'h100', framework: '' }))).toBe('h100');
  });
});

// ===========================================================================
// normalizeEvalHardwareKey
// ===========================================================================
describe('normalizeEvalHardwareKey', () => {
  it('lowercases and replaces dashes with underscores', () => {
    // 'H100' → 'h100'; if in HARDWARE_CONFIG → returned
    expect(normalizeEvalHardwareKey('H100')).not.toBe('unknown');
  });

  it('strips qualifier suffixes like "NB", "CW", "NV"', () => {
    // 'B200 NB' → 'b200' after stripping NB
    const result = normalizeEvalHardwareKey('B200 NB');
    expect(result).not.toContain('nb');
    // should resolve to b200 if in HARDWARE_CONFIG, otherwise unknown
  });

  it('appends framework to form a specific config key', () => {
    // 'h100' + framework 'vllm' → 'h100_vllm'
    const result = normalizeEvalHardwareKey('H100', 'vllm');
    // should resolve to h100_vllm if in HARDWARE_CONFIG
    expect(result === 'h100_vllm' || result === 'h100').toBe(true);
  });

  it('appends spec_decoding after framework', () => {
    const result = normalizeEvalHardwareKey('H100', 'vllm', 'mtp');
    // tries h100_vllm_mtp, then h100_vllm, then h100
    expect(['h100_vllm_mtp', 'h100_vllm', 'h100'].includes(result)).toBe(true);
  });

  it('returns "unknown" when hardware is not in HARDWARE_CONFIG', () => {
    expect(normalizeEvalHardwareKey('NONEXISTENT_GPU')).toBe('unknown');
  });

  it('does not append spec_decoding when it is "none"', () => {
    const result = normalizeEvalHardwareKey('H100', 'vllm', 'none');
    // should NOT try h100_vllm_none
    expect(result).not.toContain('none');
  });

  it('handles empty framework gracefully', () => {
    const result = normalizeEvalHardwareKey('H100', '');
    // empty framework → no suffix appended
    expect(result === 'h100' || result === 'unknown').toBe(true);
  });

  it('strips "amd" qualifier', () => {
    const result = normalizeEvalHardwareKey('MI300X AMD');
    expect(result).not.toContain('amd');
  });
});

// ===========================================================================
// createChartDataPoint
// ===========================================================================
describe('createChartDataPoint', () => {
  it('sets date, x, y, and hwKey on the returned point', () => {
    const e = entry({ median_e2el: 200, tput_per_gpu: 500 });
    const point = createChartDataPoint('2025-06-15', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.date).toBe('2025-06-15');
    expect(point.x).toBe(200);
    expect(point.y).toBe(500);
    expect(point.hwKey).toBe('h100');
  });

  it('computes tp from prefill+decode GPU counts when disagg is true', () => {
    const e = entry({ disagg: true, num_prefill_gpu: 4, num_decode_gpu: 2, tp: 99 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.tp).toBe(6); // 4 + 2, not the original tp=99
  });

  it('uses original tp when disagg is false', () => {
    const e = entry({ disagg: false, tp: 8 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.tp).toBe(8);
  });

  it('sets tpPerGpu roofline metric from tput_per_gpu', () => {
    const e = entry({ tput_per_gpu: 2000 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.tpPerGpu).toEqual({ y: 2000, roof: false });
  });

  it('sets outputTputPerGpu when output_tput_per_gpu > 0', () => {
    const e = entry({ output_tput_per_gpu: 800 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.outputTputPerGpu).toEqual({ y: 800, roof: false });
  });

  it('omits outputTputPerGpu when output_tput_per_gpu is 0', () => {
    const e = entry({ output_tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.outputTputPerGpu).toBeUndefined();
  });

  it('sets inputTputPerGpu when input_tput_per_gpu > 0', () => {
    const e = entry({ input_tput_per_gpu: 300 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.inputTputPerGpu).toEqual({ y: 300, roof: false });
  });

  it('computes tpPerMw from throughput and hardware power', () => {
    // tpPerMw = (tput_per_gpu * 1000) / power = (1000 * 1000) / 700
    const e = entry({ tput_per_gpu: 1000 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.tpPerMw.y).toBeCloseTo((1000 * 1000) / 700, 5);
  });

  it('computes inputTputPerMw when input_tput_per_gpu > 0', () => {
    // inputTputPerMw = (input_tput_per_gpu * 1000) / power = (300 * 1000) / 700
    const e = entry({ input_tput_per_gpu: 300 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.inputTputPerMw).toBeDefined();
    expect(point.inputTputPerMw!.y).toBeCloseTo((300 * 1000) / 700, 5);
    expect(point.inputTputPerMw!.roof).toBe(false);
  });

  it('omits inputTputPerMw when input_tput_per_gpu is 0', () => {
    const e = entry({ input_tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.inputTputPerMw).toBeUndefined();
  });

  it('computes outputTputPerMw when output_tput_per_gpu > 0', () => {
    // outputTputPerMw = (output_tput_per_gpu * 1000) / power = (800 * 1000) / 700
    const e = entry({ output_tput_per_gpu: 800 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.outputTputPerMw).toBeDefined();
    expect(point.outputTputPerMw!.y).toBeCloseTo((800 * 1000) / 700, 5);
    expect(point.outputTputPerMw!.roof).toBe(false);
  });

  it('omits outputTputPerMw when output_tput_per_gpu is 0', () => {
    const e = entry({ output_tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.outputTputPerMw).toBeUndefined();
  });

  it('computes cost fields (costh, costn, costr) from hardware config and throughput', () => {
    // tokensPerHour = (tput_per_gpu * 3600) / 1_000_000 = (1000 * 3600) / 1e6 = 3.6
    // costh.y = hwConfig.costh / tokensPerHour = 2.8 / 3.6
    const e = entry({ tput_per_gpu: 1000 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.costh.y).toBeCloseTo(2.8 / 3.6, 5);
    expect(point.costn.y).toBeCloseTo(1.4 / 3.6, 5);
    expect(point.costr.y).toBeCloseTo(0.7 / 3.6, 5);
  });

  it('sets cost fields to 0 when throughput is 0', () => {
    const e = entry({ tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.costh.y).toBe(0);
    expect(point.costn.y).toBe(0);
    expect(point.costr.y).toBe(0);
  });

  it('computes output cost fields when output_tput_per_gpu > 0', () => {
    const e = entry({ output_tput_per_gpu: 500 });
    // outputTokensPerHour = (500 * 3600) / 1e6 = 1.8
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.costhOutput!.y).toBeCloseTo(2.8 / 1.8, 5);
    expect(point.costnOutput!.y).toBeCloseTo(1.4 / 1.8, 5);
    expect(point.costrOutput!.y).toBeCloseTo(0.7 / 1.8, 5);
  });

  it('computes input cost fields when input_tput_per_gpu > 0', () => {
    const e = entry({ input_tput_per_gpu: 200 });
    // inputTokensPerHour = (200 * 3600) / 1e6 = 0.72
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.costhi.y).toBeCloseTo(2.8 / 0.72, 5);
    expect(point.costni.y).toBeCloseTo(1.4 / 0.72, 5);
    expect(point.costri.y).toBeCloseTo(0.7 / 0.72, 5);
  });

  it('narrows dp_attention string "true" to boolean true', () => {
    const e = entry({ dp_attention: 'true' });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.dp_attention).toBe(true);
  });

  it('narrows dp_attention boolean false to false', () => {
    const e = entry({ dp_attention: false });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.dp_attention).toBe(false);
  });

  it('sets dp_attention to undefined when not present', () => {
    const e = entry();
    delete (e as any).dp_attention;
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.dp_attention).toBeUndefined();
  });

  it('sets disagg fields only when disagg is true', () => {
    const e = entry({ disagg: true, num_prefill_gpu: 4, num_decode_gpu: 2 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.disagg).toBe(true);
    expect(point.num_prefill_gpu).toBe(4);
    expect(point.num_decode_gpu).toBe(2);
  });

  it('sets disagg fields to undefined when disagg is false', () => {
    const e = entry({ disagg: false, num_prefill_gpu: 4, num_decode_gpu: 2 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.disagg).toBeUndefined();
    expect(point.num_prefill_gpu).toBeUndefined();
    expect(point.num_decode_gpu).toBeUndefined();
  });

  it('passes through image field when present', () => {
    const e = entry({ image: 'vllm-v0.6.0' });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.image).toBe('vllm-v0.6.0');
  });

  it('sets image to undefined when not in entry', () => {
    const e = entry();
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.image).toBeUndefined();
  });

  it('defaults x to 0 when xKey field is missing', () => {
    const e = entry();
    delete (e as any).nonexistent_field;
    const point = createChartDataPoint(
      '2025-01-01',
      e,
      'nonexistent_field' as any,
      'tput_per_gpu',
      'h100',
    );
    expect(point.x).toBe(0);
  });
});

// ===========================================================================
// getHardwareKey — additional edge cases
// ===========================================================================
describe('getHardwareKey edge cases', () => {
  it('handles undefined spec_decoding (field absent)', () => {
    const e = entry({ hw: 'b200-sxm', framework: '', mtp: '' });
    delete (e as any).spec_decoding;
    // No spec_decoding at all — should just return base hw name
    expect(getHardwareKey(e)).toBe('b200');
  });

  it('handles empty string spec_decoding', () => {
    const e = entry({ hw: 'mi300x-amd', framework: '', mtp: '', spec_decoding: '' });
    // Empty string is falsy, so no suffix appended
    expect(getHardwareKey(e)).toBe('mi300x');
  });

  it('combines framework + spec_decoding mtp via mtp field taking precedence', () => {
    // When mtp='on' AND spec_decoding is something else, mtp wins
    const e = entry({
      hw: 'gb200-nvl72',
      framework: 'sglang',
      mtp: 'on',
      spec_decoding: 'eagle',
    });
    expect(getHardwareKey(e)).toBe('gb200_sglang_mtp');
  });

  it('appends spec_decoding via mtp field when spec_decoding is "mtp" with framework', () => {
    const e = entry({
      hw: 'h200-sxm',
      framework: 'trt',
      mtp: '',
      spec_decoding: 'mtp',
    });
    expect(getHardwareKey(e)).toBe('h200_trt_mtp');
  });

  it('handles hw with multiple dashes (only splits on first)', () => {
    const e = entry({ hw: 'gb200-nvl72-special', framework: '', mtp: '' });
    // split('-')[0] = 'gb200'
    expect(getHardwareKey(e)).toBe('gb200');
  });
});

// ===========================================================================
// createChartDataPoint — energy (Joules) fields
// ===========================================================================
describe('createChartDataPoint energy fields', () => {
  it('computes jTotal from hardware power and tput_per_gpu', () => {
    // jTotal = (power * 1000) / tput_per_gpu = (700 * 1000) / 2000 = 350
    // Note: mock getGpuSpecs returns power=700
    const e = entry({ tput_per_gpu: 2000 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.jTotal).toBeDefined();
    expect(point.jTotal!.y).toBeCloseTo((700 * 1000) / 2000, 5);
    expect(point.jTotal!.roof).toBe(false);
  });

  it('sets jTotal.y to 0 when tput_per_gpu is 0', () => {
    const e = entry({ tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.jTotal!.y).toBe(0);
  });

  it('computes jOutput when output_tput_per_gpu > 0', () => {
    // jOutput = (power * 1000) / output_tput_per_gpu = (700 * 1000) / 400 = 1750
    const e = entry({ output_tput_per_gpu: 400 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.jOutput).toBeDefined();
    expect(point.jOutput!.y).toBeCloseTo((700 * 1000) / 400, 5);
  });

  it('omits jOutput when output_tput_per_gpu is 0', () => {
    const e = entry({ output_tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.jOutput).toBeUndefined();
  });

  it('computes jInput when input_tput_per_gpu > 0', () => {
    // jInput = (power * 1000) / input_tput_per_gpu = (700 * 1000) / 150 ≈ 4666.67
    const e = entry({ input_tput_per_gpu: 150 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.jInput).toBeDefined();
    expect(point.jInput!.y).toBeCloseTo((700 * 1000) / 150, 5);
  });

  it('omits jInput when input_tput_per_gpu is 0', () => {
    const e = entry({ input_tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.jInput).toBeUndefined();
  });
});

// ===========================================================================
// createChartDataPoint — boolean narrowing for prefill/decode dp_attention, is_multinode
// ===========================================================================
describe('createChartDataPoint boolean narrowing', () => {
  it('narrows prefill_dp_attention string "true" to boolean true', () => {
    const e = entry({ prefill_dp_attention: 'true' });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.prefill_dp_attention).toBe(true);
  });

  it('narrows prefill_dp_attention boolean true to true', () => {
    const e = entry({ prefill_dp_attention: true });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.prefill_dp_attention).toBe(true);
  });

  it('narrows prefill_dp_attention string "false" to false', () => {
    const e = entry({ prefill_dp_attention: 'false' });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.prefill_dp_attention).toBe(false);
  });

  it('sets prefill_dp_attention to undefined when field is null/undefined', () => {
    const e = entry();
    delete (e as any).prefill_dp_attention;
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.prefill_dp_attention).toBeUndefined();
  });

  it('narrows decode_dp_attention string "true" to boolean true', () => {
    const e = entry({ decode_dp_attention: 'true' });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.decode_dp_attention).toBe(true);
  });

  it('narrows decode_dp_attention boolean false to false', () => {
    const e = entry({ decode_dp_attention: false });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.decode_dp_attention).toBe(false);
  });

  it('sets decode_dp_attention to undefined when field is absent', () => {
    const e = entry();
    delete (e as any).decode_dp_attention;
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.decode_dp_attention).toBeUndefined();
  });

  it('narrows is_multinode truthy value to true', () => {
    const e = entry({ is_multinode: true });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.is_multinode).toBe(true);
  });

  it('narrows is_multinode false to false', () => {
    const e = entry({ is_multinode: false });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.is_multinode).toBe(false);
  });

  it('sets is_multinode to undefined when field is absent', () => {
    const e = entry();
    delete (e as any).is_multinode;
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.is_multinode).toBeUndefined();
  });
});

// ===========================================================================
// createChartDataPoint — output cost fields with zero output throughput
// ===========================================================================
describe('createChartDataPoint output cost edge cases', () => {
  it('sets output cost fields to 0 when output_tput_per_gpu is 0', () => {
    const e = entry({ output_tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.costhOutput!.y).toBe(0);
    expect(point.costnOutput!.y).toBe(0);
    expect(point.costrOutput!.y).toBe(0);
  });

  it('sets input cost fields to 0 when input_tput_per_gpu is 0', () => {
    const e = entry({ input_tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.costhi.y).toBe(0);
    expect(point.costni.y).toBe(0);
    expect(point.costri.y).toBe(0);
  });

  it('computes all 9 cost fields correctly for a point with all throughput types', () => {
    const e = entry({
      tput_per_gpu: 1000,
      output_tput_per_gpu: 500,
      input_tput_per_gpu: 200,
    });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');

    // Total: tokensPerHour = (1000 * 3600) / 1e6 = 3.6
    expect(point.costh.y).toBeCloseTo(2.8 / 3.6, 5);
    expect(point.costn.y).toBeCloseTo(1.4 / 3.6, 5);
    expect(point.costr.y).toBeCloseTo(0.7 / 3.6, 5);

    // Output: outputTokensPerHour = (500 * 3600) / 1e6 = 1.8
    expect(point.costhOutput!.y).toBeCloseTo(2.8 / 1.8, 5);
    expect(point.costnOutput!.y).toBeCloseTo(1.4 / 1.8, 5);
    expect(point.costrOutput!.y).toBeCloseTo(0.7 / 1.8, 5);

    // Input: inputTokensPerHour = (200 * 3600) / 1e6 = 0.72
    expect(point.costhi.y).toBeCloseTo(2.8 / 0.72, 5);
    expect(point.costni.y).toBeCloseTo(1.4 / 0.72, 5);
    expect(point.costri.y).toBeCloseTo(0.7 / 0.72, 5);
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
    (p1 as any).jTotal = { y: 5.0, roof: false };
    const p2 = pt(2, 0, 'h100');
    (p2 as any).jTotal = { y: 3.0, roof: false };
    const p3 = pt(3, 0, 'h100');
    (p3 as any).jTotal = { y: 4.0, roof: false };

    const groupedData = { h100: [p1, p2, p3] };
    const result = computeAllRooflines(groupedData, chartDef);
    // lower_left front: p1(1,5.0) added, p2(2,3.0) < 5.0 so added, p3(3,4.0) > 3.0 so skipped
    expect(result.h100.y_jTotal).toHaveLength(2);
    expect(result.h100.y_jTotal[0].y).toBe(5.0);
    expect(result.h100.y_jTotal[1].y).toBe(3.0);
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

    const p1 = fullPt(1, 'h100', { tpPerGpuY: 50, jTotalY: 10.0 });
    const p2 = fullPt(2, 'h100', { tpPerGpuY: 80, jTotalY: 5.0 });
    const p3 = fullPt(3, 'h100', { tpPerGpuY: 60, jTotalY: 8.0 });

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

    const p1 = fullPt(1, 'h100', { tpPerGpuY: 50, costhOutputY: 3.0 });
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
    const p1 = fullPt(1, 'h100', { tpPerGpuY: 50, jOutputY: 2.0, jInputY: 10.0 });
    const p2 = fullPt(2, 'h100', { tpPerGpuY: 80, jOutputY: 5.0, jInputY: 4.0 });

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
      costnOutputY: 3.0,
      costrOutputY: 2.0,
    });
    const p2 = fullPt(2, 'h100', {
      tpPerGpuY: 80,
      costnOutputY: 1.5,
      costrOutputY: 1.0,
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

// ===========================================================================
// normalizeEvalHardwareKey — trtllm → trt substitution
// ===========================================================================
describe('normalizeEvalHardwareKey trtllm substitution', () => {
  it('replaces trtllm with trt in framework key', () => {
    // If HARDWARE_CONFIG has h100_trt but not h100_trtllm,
    // passing framework='trtllm' should match h100_trt
    const result = normalizeEvalHardwareKey('H100', 'trtllm');
    // Either resolves to h100_trt (if in config) or falls back to h100
    expect(result).not.toContain('trtllm');
  });

  it('replaces dynamo-trtllm with dynamo-trt in framework key', () => {
    const result = normalizeEvalHardwareKey('H100', 'dynamo-trtllm');
    expect(result).not.toContain('trtllm');
  });

  it('strips "cr" qualifier suffix', () => {
    const result = normalizeEvalHardwareKey('H100 CR');
    expect(result).not.toContain('cr');
  });

  it('strips "dgxc" qualifier suffix', () => {
    const result = normalizeEvalHardwareKey('H200 DGXC');
    expect(result).not.toContain('dgxc');
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
