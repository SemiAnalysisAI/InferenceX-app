import { describe, expect, it } from 'vitest';
import { hsl } from 'd3';

import { VENDOR_OKLCH_ZONES, VENDOR_HSL_ZONES } from '@semianalysisai/inferencex-constants';

import {
  generateHighContrastGpuDateColors,
  generateGpuDateColors,
  generateVendorColors,
  getVendor,
} from './dynamic-colors';

function hueOf(color: string): number {
  const match = /^oklch\([\d.]+ [\d.]+ (?<hue>[\d.]+)\)$/.exec(color);
  expect(match, `expected oklch color, got ${color}`).not.toBeNull();
  return Number(match!.groups!.hue);
}

describe('getVendor', () => {
  it('classifies registered GPU base keys through GPU_VENDORS', () => {
    expect(getVendor('h100_vllm')).toBe('nvidia');
    expect(getVendor('mi300x_sglang')).toBe('amd');
    expect(getVendor('jalapeno_teacup')).toBe('teacup');
    expect(getVendor('tpuv7')).toBe('google');
    expect(getVendor('tpuv7_vllm')).toBe('google');
  });

  it('classifies keys that lead with a literal vendor token', () => {
    // CollectiveX series keys carry the dataset's explicit vendor rather than a
    // registered GPU key (their SKUs, e.g. "h200-dgxc", are not registry keys).
    expect(getVendor('nvidia_h200-dgxc_normal_ep8')).toBe('nvidia');
    expect(getVendor('amd_mi355x-oam_normal_ep8')).toBe('amd');
    expect(getVendor('google_ironwood_normal_tp8')).toBe('google');
  });

  it('falls back to unknown for unclassifiable keys', () => {
    expect(getVendor('h200-dgxc_normal_ep8')).toBe('unknown');
  });
});

describe('generateVendorColors', () => {
  it('places vendor-prefixed keys in their vendor hue zones', () => {
    const colors = generateVendorColors(
      ['nvidia_series-a', 'amd_series-b', 'jalapeno_teacup'],
      'light',
    );
    const nvidia = VENDOR_OKLCH_ZONES.nvidia;
    const amd = VENDOR_OKLCH_ZONES.amd;
    const teacup = VENDOR_OKLCH_ZONES.teacup;
    expect(hueOf(colors['nvidia_series-a'])).toBeGreaterThanOrEqual(nvidia.start);
    expect(hueOf(colors['nvidia_series-a'])).toBeLessThanOrEqual(nvidia.end);
    expect(hueOf(colors['amd_series-b'])).toBeGreaterThanOrEqual(amd.start);
    expect(hueOf(colors['amd_series-b'])).toBeLessThanOrEqual(amd.end);
    expect(hueOf(colors.jalapeno_teacup)).toBeGreaterThanOrEqual(teacup.start);
    expect(hueOf(colors.jalapeno_teacup)).toBeLessThanOrEqual(teacup.end);
  });

  it('keeps unclassifiable keys in the unknown zone', () => {
    const colors = generateVendorColors(['mystery_series'], 'dark');
    const unknown = VENDOR_OKLCH_ZONES.unknown;
    expect(hueOf(colors['mystery_series'])).toBeGreaterThanOrEqual(unknown.start);
    expect(hueOf(colors['mystery_series'])).toBeLessThanOrEqual(unknown.end);
  });
});

function lightnessOf(color: string): number {
  const match = /^oklch\((?<l>[\d.]+) [\d.]+ [\d.]+\)$/u.exec(color);
  expect(match, `expected oklch color, got ${color}`).not.toBeNull();
  return Number(match!.groups!.l);
}

describe('generateHighContrastGpuDateColors', () => {
  const bases = { h200_sglang: '#1f77b4', mi355x_vllm: '#d62728' };

  it('gives every date of one GPU the same hue and chroma', () => {
    const colors = generateHighContrastGpuDateColors(bases, 4, 'light');
    const hues = [0, 1, 2, 3].map((di) => hueOf(colors[`${di}_h200_sglang`]));
    expect(new Set(hues).size).toBe(1);
  });

  it('keeps different GPUs on different hues', () => {
    const colors = generateHighContrastGpuDateColors(bases, 3, 'light');
    expect(hueOf(colors['0_h200_sglang'])).not.toBeCloseTo(hueOf(colors['0_mi355x_vllm']), 0);
  });

  it('ramps lightness oldest → newest, matching the non-HC ramp direction', () => {
    const colors = generateHighContrastGpuDateColors(bases, 3, 'light');
    const ls = [0, 1, 2].map((di) => lightnessOf(colors[`${di}_h200_sglang`]));
    expect(ls[0]).toBeGreaterThan(ls[1]);
    expect(ls[1]).toBeGreaterThan(ls[2]);
  });

  it('separates consecutive dates enough to be noticeable', () => {
    for (const theme of ['light', 'dark'] as const) {
      const colors = generateHighContrastGpuDateColors(bases, 4, theme);
      const ls = [0, 1, 2, 3].map((di) => lightnessOf(colors[`${di}_mi355x_vllm`]));
      for (let i = 1; i < ls.length; i++) {
        expect(ls[i - 1] - ls[i], `${theme} step ${i}`).toBeGreaterThan(0.08);
      }
    }
  });

  it('keeps the full span inside theme bounds even for a very dark base', () => {
    const colors = generateHighContrastGpuDateColors({ gpu: '#0a0a1e' }, 2, 'dark');
    const ls = [0, 1].map((di) => lightnessOf(colors[`${di}_gpu`]));
    expect(Math.min(...ls)).toBeGreaterThanOrEqual(0.44);
    expect(Math.max(...ls)).toBeLessThanOrEqual(0.95);
    expect(ls[0] - ls[1]).toBeCloseTo(0.36, 2);
  });

  it('holds a single date at the base lightness', () => {
    const colors = generateHighContrastGpuDateColors(bases, 1, 'light');
    expect(Object.keys(colors)).toEqual(['0_h200_sglang', '0_mi355x_vllm']);
  });

  it('falls back to the base color when it cannot be parsed', () => {
    const colors = generateHighContrastGpuDateColors({ gpu: 'var(--foreground)' }, 2, 'light');
    expect(colors['0_gpu']).toBe('var(--foreground)');
    expect(colors['1_gpu']).toBe('var(--foreground)');
  });
});

describe('TPUv7 vendor colors', () => {
  it.each(['light', 'dark'] as const)(
    'keeps Google distinct across normal and historical charts (%s)',
    (theme) => {
      const keys = ['tpuv7_vllm', 'b200_vllm', 'b300_vllm', 'mystery_series'];
      const colors = generateVendorColors(keys, theme);
      expect(colors.tpuv7_vllm).toBe('#F4B400');
      expect(colors.tpuv7_vllm).not.toBe(colors.mystery_series);
      const historical = generateGpuDateColors(keys, 2, theme);
      const hue = hueOf(historical['0_tpuv7_vllm']);
      expect(hue).toBeGreaterThan(80);
      expect(hue).toBeLessThan(90);
      expect(generateGpuDateColors(keys, 1, theme)['0_tpuv7_vllm']).toBe('#F4B400');
      expect(hueOf(historical['1_tpuv7_vllm'])).toBe(hue);
      expect(historical['0_tpuv7_vllm']).not.toBe(historical['1_tpuv7_vllm']);
    },
  );

  it('reserves a separate Google HSL band', () => {
    const hue = hsl('#F4B400').h;
    expect(
      VENDOR_HSL_ZONES.google.some(({ start, span }) => hue >= start && hue < start + span),
    ).toBe(true);
    for (const [vendor, segments] of Object.entries(VENDOR_HSL_ZONES)) {
      if (vendor === 'google') continue;
      for (const segment of segments) {
        expect(segment.start >= 60 || segment.start + segment.span <= 40).toBe(true);
      }
    }
  });
});
