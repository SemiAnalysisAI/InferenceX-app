import { describe, it, expect, vi } from 'vitest';

import { USD_TO_CNY } from '@semianalysisai/inferencex-constants';
import iwanthue from 'iwanthue';

import type * as ConstantsModule from '@/lib/constants';
import type { AggDataEntry, ChartDefinition, InferenceData } from '@/components/inference/types';
import {
  buildAvailabilityHwKey,
  generateHighContrastColors,
  getNestedYValue,
  getHardwareKey,
  normalizeEvalHardwareKey,
  createChartDataPoint,
  buildDerivedChartFields,
  paretoFrontUpperRight,
  paretoFrontLowerRight,
  paretoFrontLowerLeft,
  paretoFrontUpperLeft,
  metricTitle,
  metricLabel,
  xAxisLabel,
} from '@/lib/chart-utils';

// mock constants so createChartDataPoint (also in this module) doesn't call
// the real HARDWARE_CONFIG during module initialisation.
vi.mock('@/lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof ConstantsModule>();
  return {
    ...actual,
    getHardwareConfig: vi.fn(() => ({ label: 'H100', suffix: '' })),
    getGpuSpecs: vi.fn(() => ({ power: 700, tdp: 700, costh: 2.8, costn: 1.4, costr: 0.7 })),
  };
});

// spy-wrap iwanthue (real implementation) so the palette-cache tests can
// assert how often the expensive clustering actually runs.
vi.mock('iwanthue', { spy: true });

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
    costh: { y: opts.costhY ?? 1, roof: false },
    costn: { y: 1.5, roof: false },
    costr: { y: 1.2, roof: false },
    costhi: { y: 2, roof: false },
    costni: { y: 2.5, roof: false },
    costri: { y: 2.2, roof: false },
    ...(opts.outputTputY === undefined
      ? {}
      : { outputTputPerGpu: { y: opts.outputTputY, roof: false } }),
    ...(opts.inputTputY === undefined
      ? {}
      : { inputTputPerGpu: { y: opts.inputTputY, roof: false } }),
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

  it('omits speculative decoding from agentic availability series keys', () => {
    expect(buildAvailabilityHwKey('h200', 'sglang', 'mtp', false, 'agentic_traces')).toBe(
      'h200_sglang',
    );
    expect(buildAvailabilityHwKey('h200', 'sglang', 'eagle', false, 'agentic_traces')).toBe(
      'h200_sglang',
    );
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

/** Parse a hex (#rrggbb) or rgb() color into [r, g, b]. */
function parseRgb(color: string): [number, number, number] {
  const hex = color.match(/^#(?<r>[0-9a-f]{2})(?<g>[0-9a-f]{2})(?<b>[0-9a-f]{2})$/iu);
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];
  const rgb = color.match(/rgb\((?<r>\d+),\s*(?<g>\d+),\s*(?<b>\d+)\)/u);
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

describe('generateHighContrastColors', () => {
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
    expect(result['gpu-a']).toMatch(/^#[0-9a-f]{6}$/iu);
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
    expect(Object.values(dark).join(',')).not.toEqual(Object.values(light).join(','));
  });

  // ---------- Single vendor: full wheel for maximum contrast ----------
  // Brand-zone / rival-ban only apply when MULTIPLE vendors are present (so the
  // vendors stay visually separable). With a single vendor there's no rival to
  // distinguish from, so HC opens the full hue wheel — brand hue is sacrificed
  // for the contrast HC exists to provide (fixes the all-NVIDIA agentic case
  // where every series otherwise collapsed into the green brand band).

  it('3 NVIDIA GPUs (single vendor) are distinguishable across the full wheel', () => {
    const result = generateHighContrastColors(['h100_vllm', 'h200_vllm', 'b200_vllm'], 'dark');
    expect(Object.keys(result)).toHaveLength(3);
    assertMinDist(result, 30);
  });

  it('2 AMD GPUs (single vendor) are distinguishable across the full wheel', () => {
    const result = generateHighContrastColors(['mi300x_sglang', 'mi325x_sglang'], 'dark');
    expect(Object.keys(result)).toHaveLength(2);
    assertMinDist(result, 30);
  });

  it('4 NVIDIA GPUs (single vendor) use the full wheel and stay well-separated', () => {
    const keys = ['h100_vllm', 'h200_vllm', 'b200_vllm', 'b300_vllm'];
    const result = generateHighContrastColors(keys, 'dark');
    expect(Object.keys(result)).toHaveLength(4);
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

  // ---------- Single vendor, many items → full wheel, best spacing ----------

  it('10 NVIDIA GPUs (single vendor) are well-separated across the full wheel', () => {
    const gpus = ['h100', 'h200', 'b200', 'b300', 'gb200'];
    const keys = gpus.flatMap((g) => [`${g}_vllm`, `${g}_sglang`]);
    const result = generateHighContrastColors(keys, 'dark');
    expect(Object.keys(result)).toHaveLength(10);
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

  // ---------- Palette caching ----------
  // iwanthue's force-vector clustering costs tens of ms per call; results are
  // deterministic per (vendor, theme, count, mode), so repeats must be free.
  // These tests use signatures (5 NVIDIA keys, light theme) no other test in
  // this file requests, since the cache is module-level.

  it('caches palettes — a repeated request does not re-run iwanthue', () => {
    const keys = ['h100_vllm', 'h200_vllm', 'b200_vllm', 'b300_vllm', 'gb200_vllm'];

    const callsBefore = vi.mocked(iwanthue).mock.calls.length;
    const first = generateHighContrastColors(keys, 'light');
    expect(vi.mocked(iwanthue).mock.calls.length).toBe(callsBefore + 1);

    const second = generateHighContrastColors(keys, 'light');
    expect(vi.mocked(iwanthue).mock.calls.length).toBe(callsBefore + 1); // cache hit
    expect(second).toEqual(first);
  });

  it('cache is key-name independent — same vendor/count/theme reuses the palette', () => {
    // Same signature as the test above (NVIDIA × 5 × light), different names:
    // palettes depend on the group shape, not on which GPUs are in it.
    const callsBefore = vi.mocked(iwanthue).mock.calls.length;
    const result = generateHighContrastColors(
      ['h100_sglang', 'h200_sglang', 'b200_sglang', 'b300_sglang', 'gb300_sglang'],
      'light',
    );
    expect(vi.mocked(iwanthue).mock.calls.length).toBe(callsBefore); // cache hit
    expect(Object.keys(result)).toHaveLength(5);
    expect(new Set(Object.values(result)).size).toBe(5); // still distinct colors
  });

  it('a different count is a different cache entry', () => {
    const callsBefore = vi.mocked(iwanthue).mock.calls.length;
    generateHighContrastColors(
      ['h100_trt', 'h200_trt', 'b200_trt', 'b300_trt', 'gb200_trt', 'gb300_trt', 'gb200_vllm'],
      'light',
    );
    expect(vi.mocked(iwanthue).mock.calls.length).toBe(callsBefore + 1);
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

  it('omits speculative decoding from agentic series identity', () => {
    const base = { hw: 'h100-sxm', framework: 'vllm', benchmark_type: 'agentic_traces' };
    expect(getHardwareKey(entry({ ...base, spec_decoding: 'none' }))).toBe('h100_vllm');
    expect(getHardwareKey(entry({ ...base, spec_decoding: 'mtp' }))).toBe('h100_vllm');
    expect(getHardwareKey(entry({ ...base, spec_decoding: 'eagle' }))).toBe('h100_vllm');
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

  it('resolves aliased frameworks to canonical keys (atom-disagg → mooncake-atom)', () => {
    // Must match the canonical key buildAvailabilityHwKey builds for the GPU filter,
    // otherwise disagg Mooncake ATOMesh points are filtered out of the chart.
    expect(getHardwareKey(entry({ hw: 'mi355x', framework: 'atom-disagg', disagg: true }))).toBe(
      'mi355x_mooncake-atom',
    );
  });

  it('keeps the non-aliased atom framework distinct from atom-disagg', () => {
    expect(getHardwareKey(entry({ hw: 'mi355x', framework: 'atom', disagg: true }))).toBe(
      'mi355x_atom',
    );
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

  it('computes token revenue per GPU hour at the normalized $1/M token price', () => {
    const e = entry({ tput_per_gpu: 2000 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    // 2,000 tok/s/GPU × 3,600 s/hr ÷ 1,000,000 tok × $1/M tok = $7.20/GPU/hr.
    expect(point.tokenRevenuePerGpuHour).toEqual({ y: 7.2, roof: false });
  });

  it('computes normalized revenue and profit per all-in utility MW-year', () => {
    const e = entry({ tput_per_gpu: 2000 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    // Mocked specs: 700 kW all-in per GPU, so 1 MW hosts 1000 / 700 GPUs for 8,760 hours.
    const gpuHours = (1000 / 700) * 8_760;
    expect(point.tokenRevenuePerMwYear?.y).toBeCloseTo(7.2 * gpuHours, 6);
    // Mocked TCO tiers: costh 2.8, costn 1.4, costr 0.7 $/GPU/hr.
    expect(point.tokenProfitPerMwYearH?.y).toBeCloseTo((7.2 - 2.8) * gpuHours, 6);
    expect(point.tokenProfitPerMwYearN?.y).toBeCloseTo((7.2 - 1.4) * gpuHours, 6);
    expect(point.tokenProfitPerMwYearR?.y).toBeCloseTo((7.2 - 0.7) * gpuHours, 6);
  });

  it('keeps MW-year profit negative when normalized revenue is below TCO', () => {
    const e = entry({ tput_per_gpu: 100 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    // 100 tok/s/GPU is $0.36/GPU/hr at $1/M, under every mocked TCO tier (2.8, 1.4, 0.7).
    const gpuHours = (1000 / 700) * 8_760;
    expect(point.tokenProfitPerMwYearH?.y).toBeCloseTo((0.36 - 2.8) * gpuHours, 6);
    expect(point.tokenProfitPerMwYearR?.y).toBeCloseTo((0.36 - 0.7) * gpuHours, 6);
    expect(point.tokenProfitPerMwYearH?.y).toBeLessThan(point.tokenProfitPerMwYearN!.y);
    expect(point.tokenProfitPerMwYearN?.y).toBeLessThan(point.tokenProfitPerMwYearR!.y);
    expect(point.tokenProfitPerMwYearR?.y).toBeLessThan(0);
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

  it('keeps cost-per-million fields and adds infrastructure total tokens-per-dollar fields', () => {
    const e = entry({ tput_per_gpu: 1000 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.costh.y).toBeCloseTo(2.8 / 3.6, 5);
    expect(point.costn.y).toBeCloseTo(1.4 / 3.6, 5);
    expect(point.costr.y).toBeCloseTo(0.7 / 3.6, 5);
    expect(point.tokensPerDollarH!.y).toBeCloseTo(3_600_000 / 2.8, 5);
    expect(point.tokensPerDollarN!.y).toBeCloseTo(3_600_000 / 1.4, 5);
    expect(point.tokensPerDollarR!.y).toBeCloseTo(3_600_000 / 0.7, 5);
  });

  it('prices the same tokens in yuan at the pinned FX rate', () => {
    const e = entry({ tput_per_gpu: 1000 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    // ¥ metrics are the $ metrics over USD_TO_CNY — the same tokens, priced in
    // the other currency, so the two must stay in exact proportion.
    expect(point.tokensPerRmbH!.y).toBeCloseTo(3_600_000 / (2.8 * USD_TO_CNY), 5);
    expect(point.tokensPerRmbN!.y).toBeCloseTo(3_600_000 / (1.4 * USD_TO_CNY), 5);
    expect(point.tokensPerRmbR!.y).toBeCloseTo(3_600_000 / (0.7 * USD_TO_CNY), 5);
    expect(point.tokensPerRmbH!.y * USD_TO_CNY).toBeCloseTo(point.tokensPerDollarH!.y, 5);
  });

  it('sets cost fields to 0 when throughput is 0', () => {
    const e = entry({ tput_per_gpu: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.costh.y).toBe(0);
    expect(point.costn.y).toBe(0);
    expect(point.costr.y).toBe(0);
  });

  it('adds output tokens-per-dollar fields without replacing output cost fields', () => {
    const e = entry({ output_tput_per_gpu: 500 });
    // outputTokensPerHour = 500 * 3600 = 1,800,000
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.costhOutput!.y).toBeCloseTo(2.8 / 1.8, 5);
    expect(point.outputTokensPerDollarH!.y).toBeCloseTo(1_800_000 / 2.8, 5);
    expect(point.outputTokensPerDollarN!.y).toBeCloseTo(1_800_000 / 1.4, 5);
    expect(point.outputTokensPerDollarR!.y).toBeCloseTo(1_800_000 / 0.7, 5);
  });

  it('adds input tokens-per-dollar fields without replacing input cost fields', () => {
    const e = entry({ input_tput_per_gpu: 200 });
    // inputTokensPerHour = 200 * 3600 = 720,000
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.costhi.y).toBeCloseTo(2.8 / 0.72, 5);
    expect(point.inputTokensPerDollarH!.y).toBeCloseTo(720_000 / 2.8, 5);
    expect(point.inputTokensPerDollarN!.y).toBeCloseTo(720_000 / 1.4, 5);
    expect(point.inputTokensPerDollarR!.y).toBeCloseTo(720_000 / 0.7, 5);
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

describe('buildDerivedChartFields', () => {
  it('matches full inference formulas while emitting only requested history fields', () => {
    const e = entry({
      tput_per_gpu: 900,
      output_tput_per_gpu: 600,
      input_tput_per_gpu: 300,
    });
    const fullPoint = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    const historicalFields = buildDerivedChartFields(e, 'h100', [
      'outputTputPerGpu',
      'costhOutput',
    ]);

    expect(historicalFields).toEqual({
      outputTputPerGpu: fullPoint.outputTputPerGpu,
      costhOutput: fullPoint.costhOutput,
    });
  });

  it('selectively derives normalized token revenue for historical trends', () => {
    const historicalFields = buildDerivedChartFields(entry({ tput_per_gpu: 1250 }), 'h100', [
      'tokenRevenuePerGpuHour',
    ]);

    expect(historicalFields).toEqual({
      tokenRevenuePerGpuHour: { y: 4.5, roof: false },
    });
  });

  it('selectively derives infrastructure total tokens per dollar', () => {
    const historicalFields = buildDerivedChartFields(entry({ tput_per_gpu: 1250 }), 'h100', [
      'tokensPerDollarN',
    ]);

    expect(historicalFields).toEqual({
      tokensPerDollarN: { y: 4_500_000 / 1.4, roof: false },
    });
  });

  it('preserves missing measured metrics in selective output', () => {
    const historicalFields = buildDerivedChartFields(entry(), 'h100', [
      'tpPerGpu',
      'measuredJPerTotalToken',
    ]);

    expect(historicalFields.tpPerGpu).toEqual({ y: 1000, roof: false });
    expect(historicalFields.measuredJPerTotalToken).toBeUndefined();
    expect(Object.keys(historicalFields)).toEqual(['tpPerGpu']);
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
// createChartDataPoint — measured power / energy fields (from runner telemetry)
// ===========================================================================
describe('createChartDataPoint measured power fields', () => {
  it('emits measuredAvgPower when avg_power_w is present on the entry', () => {
    const e = entry({ avg_power_w: 685.5 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredAvgPower).toBeDefined();
    expect(point.measuredAvgPower!.y).toBe(685.5);
    expect(point.measuredAvgPower!.roof).toBe(false);
  });

  it('emits measuredJPerOutputToken when joules_per_output_token is present', () => {
    const e = entry({ joules_per_output_token: 8.4 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredJPerOutputToken).toBeDefined();
    expect(point.measuredJPerOutputToken!.y).toBe(8.4);
  });

  it('derives J/query, Wh/query, and percent TDP from validated source fields', () => {
    const e = entry({ avg_power_w: 560, joules_per_successful_query: 1800 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');

    expect(point.measuredJPerSuccessfulQuery?.y).toBe(1800);
    expect(point.measuredWhPerSuccessfulQuery?.y).toBe(0.5);
    expect(point.measuredPowerPercentTdp?.y).toBe(80);
  });

  it('omits derived query and TDP axes when their inputs are absent', () => {
    const point = createChartDataPoint(
      '2025-01-01',
      entry(),
      'median_e2el',
      'tput_per_gpu',
      'h100',
    );

    expect(point.measuredJPerSuccessfulQuery).toBeUndefined();
    expect(point.measuredWhPerSuccessfulQuery).toBeUndefined();
    expect(point.measuredPowerPercentTdp).toBeUndefined();
  });

  it('omits both fields when neither is on the entry', () => {
    // Legacy runs predating aggregate_power.py.
    const point = createChartDataPoint(
      '2025-01-01',
      entry(),
      'median_e2el',
      'tput_per_gpu',
      'h100',
    );
    expect(point.measuredAvgPower).toBeUndefined();
    expect(point.measuredJPerOutputToken).toBeUndefined();
  });

  it('emits one and omits the other when only one is present', () => {
    // Defensive: aggregator can patch only avg_power_w if total_output_tokens=0.
    const e = entry({ avg_power_w: 500 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredAvgPower).toBeDefined();
    expect(point.measuredJPerOutputToken).toBeUndefined();
  });

  it('preserves a zero measured power value (not falsy-coerced away)', () => {
    // Guards against a refactor switching the gate from typeof===number to truthiness.
    const e = entry({ avg_power_w: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredAvgPower).toBeDefined();
    expect(point.measuredAvgPower!.y).toBe(0);
  });

  it('emits measuredJPerTotalToken when joules_per_total_token is present', () => {
    const e = entry({ joules_per_total_token: 0.93 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredJPerTotalToken).toBeDefined();
    expect(point.measuredJPerTotalToken!.y).toBe(0.93);
    expect(point.measuredJPerTotalToken!.roof).toBe(false);
  });

  it('emits J/output and J/total independently — different denominators', () => {
    // 8k1k workload: J/output ≈ 9 × J/total (input is ~8x output, so output/total ≈ 1/9).
    const e = entry({ joules_per_output_token: 2.04, joules_per_total_token: 0.23 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredJPerOutputToken!.y).toBe(2.04);
    expect(point.measuredJPerTotalToken!.y).toBe(0.23);
  });

  it('omits measuredJPerTotalToken on rows that predate the field', () => {
    // Rows ingested before joules_per_total_token was added still have avg_power_w
    // and joules_per_output_token. The new field must be absent (not 0) so the
    // chart correctly drops them from the J/total view rather than plotting fake data.
    const e = entry({ avg_power_w: 458, joules_per_output_token: 2.04 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredAvgPower).toBeDefined();
    expect(point.measuredJPerOutputToken).toBeDefined();
    expect(point.measuredJPerTotalToken).toBeUndefined();
  });
});

// ===========================================================================
// createChartDataPoint — per-stage measured power / energy (disagg prefill/decode)
// ===========================================================================
describe('createChartDataPoint per-stage measured power fields', () => {
  it('emits measuredPrefillAvgPower when prefill_avg_power_w is present', () => {
    const e = entry({ prefill_avg_power_w: 920.3 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredPrefillAvgPower).toBeDefined();
    expect(point.measuredPrefillAvgPower!.y).toBe(920.3);
    expect(point.measuredPrefillAvgPower!.roof).toBe(false);
  });

  it('emits measuredDecodeAvgPower when decode_avg_power_w is present', () => {
    const e = entry({ decode_avg_power_w: 612.1 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredDecodeAvgPower).toBeDefined();
    expect(point.measuredDecodeAvgPower!.y).toBe(612.1);
    expect(point.measuredDecodeAvgPower!.roof).toBe(false);
  });

  it('emits measuredJPerInputToken when joules_per_input_token is present', () => {
    const e = entry({ joules_per_input_token: 0.27 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredJPerInputToken).toBeDefined();
    expect(point.measuredJPerInputToken!.y).toBe(0.27);
    expect(point.measuredJPerInputToken!.roof).toBe(false);
  });

  it('omits all per-stage fields on legacy rows predating per-stage attribution', () => {
    // Single-node / pre-disagg runs emit avg_power_w only, no prefill/decode split.
    const e = entry({ avg_power_w: 685.5 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredPrefillAvgPower).toBeUndefined();
    expect(point.measuredDecodeAvgPower).toBeUndefined();
    expect(point.measuredJPerInputToken).toBeUndefined();
  });

  it('emits prefill and decode independently — the disagg per-stage split', () => {
    // GB300 disagg: prefill GPUs run compute-bound (higher W) than decode GPUs.
    const e = entry({ prefill_avg_power_w: 948, decode_avg_power_w: 631 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredPrefillAvgPower!.y).toBe(948);
    expect(point.measuredDecodeAvgPower!.y).toBe(631);
    expect(point.measuredPrefillAvgPower!.y).toBeGreaterThan(point.measuredDecodeAvgPower!.y);
  });

  it('preserves a zero per-stage power value (not falsy-coerced away)', () => {
    // Same typeof===number gate as total power — 0 W must survive, not be dropped.
    const e = entry({ prefill_avg_power_w: 0, decode_avg_power_w: 0 });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredPrefillAvgPower).toBeDefined();
    expect(point.measuredPrefillAvgPower!.y).toBe(0);
    expect(point.measuredDecodeAvgPower).toBeDefined();
    expect(point.measuredDecodeAvgPower!.y).toBe(0);
  });

  it('carries total and per-stage power together on a full disagg row', () => {
    const e = entry({
      avg_power_w: 853,
      prefill_avg_power_w: 948,
      decode_avg_power_w: 631,
      joules_per_input_token: 0.18,
      joules_per_output_token: 1.64,
    });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');
    expect(point.measuredAvgPower!.y).toBe(853);
    expect(point.measuredPrefillAvgPower!.y).toBe(948);
    expect(point.measuredDecodeAvgPower!.y).toBe(631);
    expect(point.measuredJPerInputToken!.y).toBe(0.18);
    expect(point.measuredJPerOutputToken!.y).toBe(1.64);
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

  it('computes infrastructure total, input, and output tokens-per-dollar fields', () => {
    const e = entry({
      tput_per_gpu: 1000,
      output_tput_per_gpu: 500,
      input_tput_per_gpu: 200,
    });
    const point = createChartDataPoint('2025-01-01', e, 'median_e2el', 'tput_per_gpu', 'h100');

    expect(point.tokensPerDollarH!.y).toBeCloseTo(3_600_000 / 2.8, 5);
    expect(point.tokensPerDollarN!.y).toBeCloseTo(3_600_000 / 1.4, 5);
    expect(point.tokensPerDollarR!.y).toBeCloseTo(3_600_000 / 0.7, 5);

    // Output: outputTokensPerHour = 500 * 3600 = 1,800,000
    expect(point.outputTokensPerDollarH!.y).toBeCloseTo(1_800_000 / 2.8, 5);
    expect(point.outputTokensPerDollarN!.y).toBeCloseTo(1_800_000 / 1.4, 5);
    expect(point.outputTokensPerDollarR!.y).toBeCloseTo(1_800_000 / 0.7, 5);

    // Input: inputTokensPerHour = 200 * 3600 = 720,000
    expect(point.inputTokensPerDollarH!.y).toBeCloseTo(720_000 / 2.8, 5);
    expect(point.inputTokensPerDollarN!.y).toBeCloseTo(720_000 / 1.4, 5);
    expect(point.inputTokensPerDollarR!.y).toBeCloseTo(720_000 / 0.7, 5);
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

// ---------------------------------------------------------------------------
// metricTitle / metricLabel
// ---------------------------------------------------------------------------
describe('metricTitle', () => {
  const chartDef = {
    chartType: 'interactivity',
    heading: 'vs. Interactivity',
    x: 'median_intvty',
    x_scale_field: 'median_intvty',
    x_label: 'Interactivity (tok/s/user)',
    x_labelZh: '交互性 (tok/s/user)',
    y: 'tput_per_gpu',
    y_tpPerGpu_title: 'Token Throughput per GPU',
    y_tpPerGpu_titleZh: '每 GPU token 吞吐量',
    y_tokensPerDollarH_title: 'Total Tokens per $1 TCO',
  } as ChartDefinition;

  it('returns English title for locale en', () => {
    expect(metricTitle(chartDef, 'y_tpPerGpu', 'en')).toBe('Token Throughput per GPU');
  });

  it('returns Chinese title for locale zh', () => {
    expect(metricTitle(chartDef, 'y_tpPerGpu', 'zh')).toBe('每 GPU token 吞吐量');
  });

  it('falls back to English when Zh field is missing', () => {
    expect(metricTitle(chartDef, 'y_tokensPerDollarH', 'zh')).toBe('Total Tokens per $1 TCO');
  });

  it('returns empty string for unknown metric', () => {
    expect(metricTitle(chartDef, 'y_unknown', 'en')).toBe('');
  });
});

describe('metricLabel', () => {
  const chartDef = {
    chartType: 'interactivity',
    heading: 'vs. Interactivity',
    x: 'median_intvty',
    x_scale_field: 'median_intvty',
    x_label: 'Interactivity (tok/s/user)',
    x_labelZh: '交互性 (tok/s/user)',
    y: 'tput_per_gpu',
    y_tpPerGpu_label: 'Token Throughput per GPU (tok/s/gpu)',
    y_tpPerGpu_labelZh: '每 GPU token 吞吐量（tok/s/gpu）',
    y_tokensPerDollarH_label: 'Total Tokens per $1 TCO (tok/$)',
  } as ChartDefinition;

  it('returns English label for locale en', () => {
    expect(metricLabel(chartDef, 'y_tpPerGpu', 'en')).toBe('Token Throughput per GPU (tok/s/gpu)');
  });

  it('returns Chinese label for locale zh', () => {
    expect(metricLabel(chartDef, 'y_tpPerGpu', 'zh')).toBe('每 GPU token 吞吐量（tok/s/gpu）');
  });

  it('falls back to English when Zh field is missing', () => {
    expect(metricLabel(chartDef, 'y_tokensPerDollarH', 'zh')).toBe(
      'Total Tokens per $1 TCO (tok/$)',
    );
  });

  it('returns empty string for unknown metric', () => {
    expect(metricLabel(chartDef, 'y_unknown', 'en')).toBe('');
  });
});

describe('xAxisLabel', () => {
  it('preserves exact English and resolves the Chinese sibling for every consumer', () => {
    const chartDef = {
      x_label: 'End-to-end Latency (s)',
      x_labelZh: '端到端延迟 (s)',
    } as ChartDefinition;

    expect(xAxisLabel(chartDef, 'en')).toBe('End-to-end Latency (s)');
    expect(xAxisLabel(chartDef, 'zh')).toBe('端到端延迟 (s)');
  });
});
