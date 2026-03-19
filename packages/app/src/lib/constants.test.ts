import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  GPU_ALIAS_TO_CANONICAL,
  GPU_KEY_ALIASES,
  GPU_SPECS,
  HARDWARE_CONFIG,
  MODEL_ORDER,
  getGpuSpecs,
  getHardwareConfig,
  getModelSortIndex,
} from '@/lib/constants';

// ===========================================================================
// GPU_KEY_ALIASES / GPU_ALIAS_TO_CANONICAL
// ===========================================================================
describe('GPU_KEY_ALIASES', () => {
  it('maps gb200_dynamo-trt to its legacy trtllm key', () => {
    expect(GPU_KEY_ALIASES['gb200_dynamo-trt']).toContain('gb200_dynamo-trtllm');
  });

  it('maps gb200_dynamo-trt_mtp to its legacy trtllm_mtp key', () => {
    expect(GPU_KEY_ALIASES['gb200_dynamo-trt_mtp']).toContain('gb200_dynamo-trtllm_mtp');
  });

  it('alias keys all exist in HARDWARE_CONFIG', () => {
    for (const aliases of Object.values(GPU_KEY_ALIASES)) {
      for (const alias of aliases) {
        expect(HARDWARE_CONFIG).toHaveProperty(alias);
      }
    }
  });
});

describe('GPU_ALIAS_TO_CANONICAL', () => {
  it('maps legacy trtllm key back to canonical trt key', () => {
    expect(GPU_ALIAS_TO_CANONICAL['gb200_dynamo-trtllm']).toBe('gb200_dynamo-trt');
  });

  it('maps legacy trtllm_mtp key back to canonical trt_mtp key', () => {
    expect(GPU_ALIAS_TO_CANONICAL['gb200_dynamo-trtllm_mtp']).toBe('gb200_dynamo-trt_mtp');
  });

  it('is the inverse of GPU_KEY_ALIASES', () => {
    for (const [canonical, aliases] of Object.entries(GPU_KEY_ALIASES)) {
      for (const alias of aliases) {
        expect(GPU_ALIAS_TO_CANONICAL[alias]).toBe(canonical);
      }
    }
  });

  it('does not contain canonical keys as alias targets (no reflexive entries)', () => {
    for (const canonical of Object.keys(GPU_KEY_ALIASES)) {
      expect(GPU_ALIAS_TO_CANONICAL[canonical]).toBeUndefined();
    }
  });
});

// ===========================================================================
// getHardwareConfig
// ===========================================================================
describe('getHardwareConfig', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the config for an exact key match', () => {
    const config = getHardwareConfig('h100');
    expect(config).toBe(HARDWARE_CONFIG.h100);
  });

  it('returns the config for a compound exact key match (e.g. h100_vllm)', () => {
    const config = getHardwareConfig('h100_vllm');
    expect(config).toBe(HARDWARE_CONFIG.h100_vllm);
  });

  it('falls back to base key when the full key is not in HARDWARE_CONFIG', () => {
    // 'h100_nonexistent' is not in config; base key split on [-_] → 'h100'
    const config = getHardwareConfig('h100_nonexistent');
    expect(config).toBe(HARDWARE_CONFIG.h100);
  });

  it('falls back to base key for dash-separated unknown suffix', () => {
    // 'h200-customsuffix' → base 'h200' which IS in config
    const config = getHardwareConfig('h200-customsuffix');
    expect(config).toBe(HARDWARE_CONFIG.h200);
  });

  it('returns the unknown config when key is completely unrecognized (no base match)', () => {
    const config = getHardwareConfig('completelynew');
    expect(config).toBe(HARDWARE_CONFIG.unknown);
  });

  it('returns the unknown config when neither key nor base is in config', () => {
    // 'completelynew_variant' → base 'completelynew' → also not in config → unknown
    const config = getHardwareConfig('completelynew_variant');
    expect(config).toBe(HARDWARE_CONFIG.unknown);
  });

  it('always returns an object with required fields (name, label, color)', () => {
    for (const hwKey of ['h100', 'h200', 'unknown', 'b200', 'gb200']) {
      const config = getHardwareConfig(hwKey);
      expect(typeof config.name).toBe('string');
      expect(typeof config.label).toBe('string');
      expect(typeof config.color).toBe('string');
    }
  });

  it('logs a console.warn for unknown keys', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getHardwareConfig('not-a-real-gpu');
    // first warn: the key itself not found; second warn: base key also not found
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not-a-real-gpu'));
    warnSpy.mockRestore();
  });

  it('GPU_SPECS has non-zero power for all entries', () => {
    for (const [, specs] of Object.entries(GPU_SPECS)) {
      expect(specs.power).toBeGreaterThan(0);
    }
  });

  it('GPU_SPECS has non-negative cost rates for all entries', () => {
    for (const specs of Object.values(GPU_SPECS)) {
      expect(specs.costh).toBeGreaterThanOrEqual(0);
      expect(specs.costn).toBeGreaterThanOrEqual(0);
      expect(specs.costr).toBeGreaterThanOrEqual(0);
    }
  });
});

// ===========================================================================
// getGpuSpecs
// ===========================================================================
describe('getGpuSpecs', () => {
  it('returns specs for a base GPU key', () => {
    const specs = getGpuSpecs('h100');
    expect(specs.power).toBe(1.73);
    expect(specs.costh).toBe(1.3);
    expect(specs.costn).toBe(1.69);
    expect(specs.costr).toBe(1.3);
  });

  it('extracts base from compound key (e.g. h100_vllm)', () => {
    const specs = getGpuSpecs('h100_vllm');
    expect(specs.power).toBe(1.73);
  });

  it('extracts base from dash-separated key (e.g. h200-dynamo-trt)', () => {
    const specs = getGpuSpecs('h200-dynamo-trt');
    expect(specs.power).toBe(1.73);
    expect(specs.costh).toBe(1.41);
  });

  it('returns zero specs for unknown GPU', () => {
    const specs = getGpuSpecs('nonexistent');
    expect(specs.power).toBe(0);
    expect(specs.costh).toBe(0);
    expect(specs.costn).toBe(0);
    expect(specs.costr).toBe(0);
  });

  it('returns correct specs for all base GPUs in GPU_SPECS', () => {
    for (const [base, specs] of Object.entries(GPU_SPECS)) {
      const result = getGpuSpecs(base);
      expect(result).toBe(specs);
    }
  });
});

// ===========================================================================
// getColorFamily
// each test uses vi.resetModules() + dynamic import to get a fresh module
// instance, preventing vendor counter / cache state from leaking between tests.
// ===========================================================================
describe('getColorFamily', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // Helper to assert a palette is a non-empty array of CSS color strings
  function isColorPalette(palette: unknown): void {
    expect(Array.isArray(palette)).toBe(true);
    expect((palette as string[]).length).toBeGreaterThan(0);
    for (const color of palette as string[]) {
      expect(typeof color).toBe('string');
      expect(color.length).toBeGreaterThan(0);
    }
  }

  it('returns a non-empty color array for h-prefixed (NVIDIA) GPUs', async () => {
    const { getColorFamily } = await import('@/lib/constants');
    isColorPalette(getColorFamily('h100'));
  });

  it('returns a non-empty color array for b-prefixed (NVIDIA) GPUs', async () => {
    const { getColorFamily } = await import('@/lib/constants');
    isColorPalette(getColorFamily('b200'));
  });

  it('returns a non-empty color array for gb-prefixed (NVIDIA) GPUs', async () => {
    const { getColorFamily } = await import('@/lib/constants');
    isColorPalette(getColorFamily('gb200'));
  });

  it('returns a non-empty color array for mi-prefixed (AMD) GPUs', async () => {
    const { getColorFamily } = await import('@/lib/constants');
    isColorPalette(getColorFamily('mi300x'));
  });

  it('returns a non-empty color array for unrecognized GPU vendor prefixes', async () => {
    const { getColorFamily } = await import('@/lib/constants');
    isColorPalette(getColorFamily('custom-gpu'));
  });

  it('AMD and NVIDIA palettes are distinct (vendor detection routes correctly)', async () => {
    const { getColorFamily } = await import('@/lib/constants');
    const nvidia = getColorFamily('h100');
    const amd = getColorFamily('mi300x');
    // palettes from different vendors must not be identical arrays
    expect(nvidia).not.toEqual(amd);
  });

  it('NVIDIA and unknown palettes are distinct', async () => {
    const { getColorFamily } = await import('@/lib/constants');
    const nvidia = getColorFamily('h100');
    const unknown = getColorFamily('custom-gpu');
    expect(nvidia).not.toEqual(unknown);
  });

  it('returns the same array reference for the same GPU key (caching)', async () => {
    const { getColorFamily } = await import('@/lib/constants');
    const first = getColorFamily('h100');
    const second = getColorFamily('h100');
    expect(first).toBe(second); // strict reference equality
  });

  it('does not share cached assignment across different GPU keys', async () => {
    const { getColorFamily } = await import('@/lib/constants');
    const a = getColorFamily('h100');
    const b = getColorFamily('h200');
    expect(a).not.toBe(b);
  });

  it('rotates through palettes: two different NVIDIA GPUs get different arrays', async () => {
    const { getColorFamily } = await import('@/lib/constants');
    const first = getColorFamily('h100');
    const second = getColorFamily('h200');
    // rotation means the second assignment cycles to the next palette
    expect(first).not.toBe(second);
    expect(first).not.toEqual(second);
  });

  it('rotates through palettes: two different AMD GPUs get different arrays', async () => {
    const { getColorFamily } = await import('@/lib/constants');
    const first = getColorFamily('mi300x');
    const second = getColorFamily('mi300a');
    expect(first).not.toBe(second);
    expect(first).not.toEqual(second);
  });
});

// ===========================================================================
// getModelSortIndex
// ===========================================================================
describe('getModelSortIndex', () => {
  it('returns correct index for "gb300" hardware', () => {
    expect(getModelSortIndex('gb300')).toBe(MODEL_ORDER.indexOf('gb300'));
  });

  it('returns correct index for "gb200" (starts with "gb")', () => {
    expect(getModelSortIndex('gb200')).toBe(MODEL_ORDER.indexOf('gb'));
  });

  it('returns correct index for "gb200_trt" (starts with "gb")', () => {
    expect(getModelSortIndex('gb200_trt')).toBe(MODEL_ORDER.indexOf('gb'));
  });

  it('returns correct index for "b300" hardware', () => {
    expect(getModelSortIndex('b300')).toBe(MODEL_ORDER.indexOf('b300'));
  });

  it('returns correct index for "b200" (starts with "b")', () => {
    expect(getModelSortIndex('b200')).toBe(MODEL_ORDER.indexOf('b'));
  });

  it('returns correct index for "h100" hardware', () => {
    const idx = MODEL_ORDER.indexOf('h100');
    expect(getModelSortIndex('h100')).toBe(idx);
  });

  it('returns correct index for "h100_vllm" (starts with "h100")', () => {
    // h100 doesn't start with "gb", "b", "mi355x", "h200", "mi325x"
    // but does start with "h100"
    const idx = MODEL_ORDER.indexOf('h100');
    expect(getModelSortIndex('h100_vllm')).toBe(idx);
  });

  it('returns correct index for "h200" hardware', () => {
    const idx = MODEL_ORDER.indexOf('h200');
    expect(getModelSortIndex('h200')).toBe(idx);
  });

  it('returns correct index for "mi300x" hardware', () => {
    const idx = MODEL_ORDER.indexOf('mi300x');
    expect(getModelSortIndex('mi300x')).toBe(idx);
  });

  it('returns MODEL_ORDER.length for unknown hardware', () => {
    expect(getModelSortIndex('unknown_gpu')).toBe(MODEL_ORDER.length);
  });

  it('returns MODEL_ORDER.length for empty string', () => {
    expect(getModelSortIndex('')).toBe(MODEL_ORDER.length);
  });

  it('gb300 sorts before gb200 (gb300 precedes gb in MODEL_ORDER)', () => {
    expect(MODEL_ORDER.indexOf('gb300')).toBeLessThan(MODEL_ORDER.indexOf('gb'));
  });

  it('b300 sorts before b200 (b300 precedes b in MODEL_ORDER)', () => {
    expect(MODEL_ORDER.indexOf('b300')).toBeLessThan(MODEL_ORDER.indexOf('b'));
  });

  it('h200 sorts before h100', () => {
    expect(MODEL_ORDER.indexOf('h200')).toBeLessThan(MODEL_ORDER.indexOf('h100'));
  });

  it('MODEL_ORDER contains expected entries', () => {
    expect(MODEL_ORDER).toContain('gb300');
    expect(MODEL_ORDER).toContain('gb');
    expect(MODEL_ORDER).toContain('b300');
    expect(MODEL_ORDER).toContain('b');
    expect(MODEL_ORDER).toContain('h200');
    expect(MODEL_ORDER).toContain('h100');
  });
});

// ===========================================================================
// MODEL_ORDER
// ===========================================================================
describe('MODEL_ORDER', () => {
  it('is a non-empty array', () => {
    expect(MODEL_ORDER.length).toBeGreaterThan(0);
  });

  it('has all unique entries', () => {
    expect(new Set(MODEL_ORDER).size).toBe(MODEL_ORDER.length);
  });

  it('contains only lowercase strings', () => {
    for (const entry of MODEL_ORDER) {
      expect(entry).toBe(entry.toLowerCase());
    }
  });
});
