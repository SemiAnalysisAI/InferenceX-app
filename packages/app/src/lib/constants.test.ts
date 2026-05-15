import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import {
  GPU_ALIAS_TO_CANONICAL,
  GPU_KEY_ALIASES,
  getGpuSpecs,
  getHardwareConfig,
  getModelSortIndex,
  hardwareKeyMatchesAnyBase,
  hardwareKeyMatchesBase,
  isKnownGpu,
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

  it('alias keys resolve to known GPUs', () => {
    for (const aliases of Object.values(GPU_KEY_ALIASES)) {
      for (const alias of aliases) {
        expect(isKnownGpu(alias)).toBe(true);
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
// hardwareKeyMatchesBase / hardwareKeyMatchesAnyBase
// ===========================================================================
describe('hardwareKeyMatchesBase', () => {
  it('matches exact registry key and prefixed variants', () => {
    expect(hardwareKeyMatchesBase('h100', 'h100')).toBe(true);
    expect(hardwareKeyMatchesBase('h100_vllm', 'h100')).toBe(true);
    expect(hardwareKeyMatchesBase('gb200_dynamo-trt_mtp', 'gb200')).toBe(true);
  });

  it('does not match a different GPU prefix', () => {
    expect(hardwareKeyMatchesBase('h200_vllm', 'h100')).toBe(false);
    expect(hardwareKeyMatchesBase('mi300x_trt', 'mi325x')).toBe(false);
    expect(hardwareKeyMatchesBase('h1000_foo', 'h100')).toBe(false);
  });
});

describe('hardwareKeyMatchesAnyBase', () => {
  it('matches either base in a slug pair', () => {
    expect(hardwareKeyMatchesAnyBase('h100_sglang', ['h100', 'h200'])).toBe(true);
    expect(hardwareKeyMatchesAnyBase('h200', ['h100', 'h200'])).toBe(true);
    expect(hardwareKeyMatchesAnyBase('b200_trt', ['h100', 'h200'])).toBe(false);
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

  it('returns the config for a base key', () => {
    const config = getHardwareConfig('h100');
    expect(config).toEqual({
      name: 'h100',
      label: 'H100',
      suffix: '',
      gpu: "NVIDIA 'Hopper' H100",
    });
  });

  it('returns the config for a compound key (e.g. h100_vllm)', () => {
    const config = getHardwareConfig('h100_vllm');
    expect(config).toEqual({
      name: 'h100-vllm',
      label: 'H100',
      suffix: '(vLLM)',
      gpu: "NVIDIA 'Hopper' H100 vLLM",
    });
  });

  it('derives config for any key with a known base GPU', () => {
    const config = getHardwareConfig('h100_nonexistent');
    expect(config.label).toBe('H100');
    expect(config.suffix).toBe('(NONEXISTENT)');
  });

  it('handles GB200 NVL72 label vs gpu name divergence', () => {
    const config = getHardwareConfig('gb200_dynamo-trt');
    expect(config.label).toBe('GB200 NVL72');
    expect(config.gpu).toBe("NVIDIA 'Blackwell' GB200 Dynamo TRT");
  });

  it('returns unknown config when base GPU is not recognised', () => {
    const config = getHardwareConfig('completelynew');
    expect(config.label).toBe('Unknown');
  });

  it('returns unknown config when neither key nor base is recognised', () => {
    const config = getHardwareConfig('completelynew_variant');
    expect(config.label).toBe('Unknown');
  });

  it('always returns an object with required fields (name, label)', () => {
    for (const hwKey of ['h100', 'h200', 'unknown', 'b200', 'gb200']) {
      const config = getHardwareConfig(hwKey);
      expect(typeof config.name).toBe('string');
      expect(typeof config.label).toBe('string');
    }
  });

  it('logs a console.warn for unknown keys', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getHardwareConfig('not-a-real-gpu');
    // first warn: the key itself not found; second warn: base key also not found
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not-a-real-gpu'));
    warnSpy.mockRestore();
  });

  it('HW_REGISTRY has non-zero power for all entries', () => {
    for (const entry of Object.values(HW_REGISTRY)) {
      expect(entry.power).toBeGreaterThan(0);
    }
  });

  it('HW_REGISTRY has non-negative cost rates for all entries', () => {
    for (const entry of Object.values(HW_REGISTRY)) {
      expect(entry.costh).toBeGreaterThanOrEqual(0);
      expect(entry.costn).toBeGreaterThanOrEqual(0);
      expect(entry.costr).toBeGreaterThanOrEqual(0);
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

  it('returns correct specs for all base GPUs in HW_REGISTRY', () => {
    for (const [base, entry] of Object.entries(HW_REGISTRY)) {
      const result = getGpuSpecs(base);
      expect(result.power).toBe(entry.power);
      expect(result.costh).toBe(entry.costh);
    }
  });
});

// ===========================================================================
// getModelSortIndex
// ===========================================================================
describe('getModelSortIndex', () => {
  it('extracts base key from compound keys', () => {
    expect(getModelSortIndex('h100_vllm')).toBe(getModelSortIndex('h100'));
    expect(getModelSortIndex('gb200_dynamo-trt')).toBe(getModelSortIndex('gb200'));
  });

  it('gb300 sorts before gb200', () => {
    expect(getModelSortIndex('gb300')).toBeLessThan(getModelSortIndex('gb200'));
  });

  it('b300 sorts before b200', () => {
    expect(getModelSortIndex('b300')).toBeLessThan(getModelSortIndex('b200'));
  });

  it('h200 sorts before h100', () => {
    expect(getModelSortIndex('h200')).toBeLessThan(getModelSortIndex('h100'));
  });

  it('returns a high index for unknown hardware', () => {
    expect(getModelSortIndex('unknown_gpu')).toBeGreaterThanOrEqual(9);
  });

  it('returns a high index for empty string', () => {
    expect(getModelSortIndex('')).toBeGreaterThanOrEqual(9);
  });
});
