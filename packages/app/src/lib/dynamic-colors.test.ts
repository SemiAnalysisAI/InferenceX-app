import { describe, expect, it } from 'vitest';

import { VENDOR_OKLCH_ZONES } from '@semianalysisai/inferencex-constants';

import { generateVendorColors, getVendor } from './dynamic-colors';

function hueOf(color: string): number {
  const match = /^oklch\([\d.]+ [\d.]+ (?<hue>[\d.]+)\)$/.exec(color);
  expect(match, `expected oklch color, got ${color}`).not.toBeNull();
  return Number(match!.groups!.hue);
}

describe('getVendor', () => {
  it('classifies registered GPU base keys through GPU_VENDORS', () => {
    expect(getVendor('h100_vllm')).toBe('nvidia');
    expect(getVendor('mi300x_sglang')).toBe('amd');
  });

  it('classifies keys that lead with a literal vendor token', () => {
    // CollectiveX series keys carry the dataset's explicit vendor rather than a
    // registered GPU key (their SKUs, e.g. "h200-dgxc", are not registry keys).
    expect(getVendor('nvidia_h200-dgxc_normal_ep8')).toBe('nvidia');
    expect(getVendor('amd_mi355x-oam_normal_ep8')).toBe('amd');
  });

  it('falls back to unknown for unclassifiable keys', () => {
    expect(getVendor('h200-dgxc_normal_ep8')).toBe('unknown');
  });
});

describe('generateVendorColors', () => {
  it('places vendor-prefixed keys in their vendor hue zones', () => {
    const colors = generateVendorColors(['nvidia_series-a', 'amd_series-b'], 'light');
    const nvidia = VENDOR_OKLCH_ZONES.nvidia;
    const amd = VENDOR_OKLCH_ZONES.amd;
    expect(hueOf(colors['nvidia_series-a'])).toBeGreaterThanOrEqual(nvidia.start);
    expect(hueOf(colors['nvidia_series-a'])).toBeLessThanOrEqual(nvidia.end);
    expect(hueOf(colors['amd_series-b'])).toBeGreaterThanOrEqual(amd.start);
    expect(hueOf(colors['amd_series-b'])).toBeLessThanOrEqual(amd.end);
  });

  it('keeps unclassifiable keys in the unknown zone', () => {
    const colors = generateVendorColors(['mystery_series'], 'dark');
    const unknown = VENDOR_OKLCH_ZONES.unknown;
    expect(hueOf(colors['mystery_series'])).toBeGreaterThanOrEqual(unknown.start);
    expect(hueOf(colors['mystery_series'])).toBeLessThanOrEqual(unknown.end);
  });
});
