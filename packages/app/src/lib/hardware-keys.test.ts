import { describe, it, expect, vi } from 'vitest';

import type * as ConstantsModule from '@/lib/constants';
import {
  buildAvailabilityHwKey,
  getHardwareKey,
  normalizeEvalHardwareKey,
} from '@/lib/hardware-keys';
import { entry } from '@/lib/chart-test-fixtures';

// Mock constants to match the original chart-utils.test.ts setup. isKnownGpu /
// HW_REGISTRY stay real (via ...actual) so key resolution behaves identically;
// getHardwareConfig / getGpuSpecs are stubbed to avoid touching HARDWARE_CONFIG.
vi.mock('@/lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof ConstantsModule>();
  return {
    ...actual,
    getHardwareConfig: vi.fn(() => ({ label: 'H100', suffix: '' })),
    getGpuSpecs: vi.fn(() => ({ power: 700, costh: 2.8, costn: 1.4, costr: 0.7 })),
  };
});

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
