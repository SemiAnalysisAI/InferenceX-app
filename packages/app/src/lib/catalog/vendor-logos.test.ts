import { readFileSync } from 'node:fs';

import { isMonochromeLogo } from './model-logos';
import { describe, expect, it } from 'vitest';

import {
  VENDOR_LOGO_ICONS,
  getAxisVendorIcon,
  getLineLabelVendorIcon,
  getHwVendorLogo,
} from './vendor-logos';

describe('vendor logo icons', () => {
  it('maps NVIDIA hardware keys to the full-color NVIDIA mark', () => {
    for (const key of ['gb300', 'gb200', 'b300', 'b200', 'h100', 'vr200']) {
      expect(getLineLabelVendorIcon(key)).toBe(VENDOR_LOGO_ICONS.NVIDIA);
    }
  });

  it('maps AMD hardware keys to the full-color AMD mark', () => {
    for (const key of ['mi300x', 'mi325x', 'mi355x']) {
      expect(getLineLabelVendorIcon(key)).toBe(VENDOR_LOGO_ICONS.AMD);
    }
  });

  it('resolves suffixed hardware keys through the base key', () => {
    expect(getLineLabelVendorIcon('mi355x_dsv4')).toBe(VENDOR_LOGO_ICONS.AMD);
    expect(getLineLabelVendorIcon('gb200_dynamo')).toBe(VENDOR_LOGO_ICONS.NVIDIA);
  });

  it('maps Jalapeño (OpenAI) to the OpenAI mark', () => {
    expect(getLineLabelVendorIcon('jalapeno')).toBe(VENDOR_LOGO_ICONS.OpenAI);
  });

  it('uses the same export-safe Google mark for TPU labels and hardware badges', () => {
    for (const key of ['tpuv7', 'tpuv7_vllm', 'tpuv7_vllm_fp8']) {
      expect(getLineLabelVendorIcon(key)).toBe(VENDOR_LOGO_ICONS.Google);
      expect(getAxisVendorIcon(key)?.monochrome).toBe(true);
      expect(getAxisVendorIcon(key)?.href).toBe(VENDOR_LOGO_ICONS.Google.href);
    }
    expect(getHwVendorLogo('Google')).toBe('google.svg');
    expect(isMonochromeLogo('google.svg')).toBe(true);
    const svg = readFileSync('public/logos/google.svg', 'utf8').trim();
    expect([...svg.matchAll(/fill="(?<fill>[^"]+)"/gu)].map((match) => match.groups?.fill)).toEqual(
      ['#000000', '#000000', '#000000', '#000000'],
    );
    expect(VENDOR_LOGO_ICONS.Google.href).toBe(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  });

  it('returns no icon for unknown hardware', () => {
    expect(getLineLabelVendorIcon('unknown-hw')).toBeUndefined();
  });

  it('uses the black PNG eye mark for NVIDIA so it stays visible on green pills', () => {
    expect(VENDOR_LOGO_ICONS.NVIDIA.href).toMatch(/^data:image\/png;base64,/);
  });

  it('inlines brand colors in the SVG data URIs', () => {
    expect(decodeURIComponent(VENDOR_LOGO_ICONS.AMD.href)).toContain('#000000');
    expect(decodeURIComponent(VENDOR_LOGO_ICONS.OpenAI.href)).toContain('#ffffff');
  });
});

describe('getAxisVendorIcon', () => {
  it('returns the full-color NVIDIA mark that is never inverted', () => {
    const icon = getAxisVendorIcon('b200');
    expect(icon?.monochrome).toBe(false);
    expect(decodeURIComponent(icon?.href ?? '')).toContain('#76B900');
  });

  it('returns the monochrome AMD arrow so dark mode can invert it', () => {
    expect(getAxisVendorIcon('mi355x_dsv4')?.monochrome).toBe(true);
  });

  it('has no mark for unknown hardware', () => {
    expect(getAxisVendorIcon('unknown-hw')).toBeUndefined();
  });
});
