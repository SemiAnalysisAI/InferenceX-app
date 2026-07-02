import { describe, it, expect, vi } from 'vitest';
import iwanthue from 'iwanthue';

import { generateHighContrastColors } from '@/lib/chart-colors';

// spy-wrap iwanthue (real implementation) so the palette-cache tests can
// assert how often the expensive clustering actually runs.
vi.mock('iwanthue', { spy: true });

// ---------------------------------------------------------------------------
// generateHighContrastColors
// ---------------------------------------------------------------------------

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
