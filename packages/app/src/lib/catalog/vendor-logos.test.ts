import { readFileSync } from 'node:fs';

import { GPU_VENDORS } from '@semianalysisai/inferencex-constants';

import { isMonochromeLogo } from './model-logos';
import { describe, expect, it } from 'bun:test';

import {
  VENDOR_LOGO_ICONS,
  VENDOR_MARK_HREFS,
  getAxisVendorIcon,
  getLineLabelVendorIcon,
  getHwVendorLogo,
} from './vendor-logos';

const pathsOf = (svg: string) =>
  [...svg.matchAll(/<path d="(?<d>[^"]+)"/gu)].map((m) => m.groups?.d);

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

  it('uses the export-safe public Google mark for TPU hardware badges', () => {
    for (const key of ['tpuv7', 'tpuv7_vllm', 'tpuv7_vllm_fp8']) {
      expect(getLineLabelVendorIcon(key)).toBe(VENDOR_LOGO_ICONS.Google);
      expect(getAxisVendorIcon(key)?.monochrome).toBe(true);
    }
    expect(getHwVendorLogo('Google')).toBe('google.svg');
    expect(isMonochromeLogo('google.svg')).toBe(true);
    const svg = readFileSync('public/logos/google.svg', 'utf8').trim();
    expect([...svg.matchAll(/fill="(?<fill>[^"]+)"/gu)].map((match) => match.groups?.fill)).toEqual(
      ['#000000', '#000000', '#000000', '#000000'],
    );
    expect(getAxisVendorIcon('tpuv7')?.href).toBe(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  });

  it('gives Trainium3 the Amazon smile cropped from the wordmark on every surface', () => {
    const wordmark = readFileSync('public/logos/amazon.svg', 'utf8');
    const smile = [...wordmark.matchAll(/<path d="(?<d>[^"]+)" fill="#ff9900"/giu)].map((m) =>
      m.groups?.d?.split(/\s+/u).join(' '),
    );
    const file = readFileSync('public/logos/amazon-smile.svg', 'utf8').trim();
    expect(smile).toHaveLength(2);
    expect(pathsOf(file)).toEqual(smile);
    expect(getHwVendorLogo('AWS')).toBe('amazon-smile.svg');
    expect(isMonochromeLogo('amazon-smile.svg')).toBe(false);

    const axis = getAxisVendorIcon('trn3_vllm');
    expect(axis?.monochrome).toBe(false);
    expect(axis?.href).toBe(`data:image/svg+xml,${encodeURIComponent(file)}`);
    expect(getLineLabelVendorIcon('trn3')).toBe(VENDOR_LOGO_ICONS.AWS);
    expect(pathsOf(decodeURIComponent(VENDOR_MARK_HREFS.AWS ?? ''))).toEqual(smile);
  });

  it('has a mark for every vendor in the hardware registry', () => {
    for (const vendor of new Set(Object.values(GPU_VENDORS))) {
      // Jalapeño (OpenAI) only ever appears as a line label, never as a chip or bar.
      if (vendor === 'OpenAI') continue;
      expect(getHwVendorLogo(vendor), vendor).toBeDefined();
      expect(VENDOR_MARK_HREFS[vendor], vendor).toBeDefined();
      expect(VENDOR_LOGO_ICONS[vendor], vendor).toBeDefined();
    }
  });

  it('returns no icon for unknown hardware', () => {
    expect(getLineLabelVendorIcon('unknown-hw')).toBeUndefined();
  });

  it('fills every line-label mark with the white label text color', () => {
    for (const icon of Object.values(VENDOR_LOGO_ICONS)) {
      const svg = decodeURIComponent(icon.href);
      expect(svg).toContain('#ffffff');
      expect(svg).not.toContain('#000000');
    }
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
