import { readFileSync } from 'node:fs';

import { GPU_VENDORS } from '@semianalysisai/inferencex-constants';

import { isMonochromeLogo } from './model-logos';
import { describe, expect, it } from 'bun:test';

import {
  VENDOR_LOGO_ICONS,
  VENDOR_MARK_HREFS,
  getAxisVendorIcon,
  getLineLabelVendorIcon,
  getHwVendorDarkLogo,
  getHwVendorLogo,
  vendorMarkVariants,
} from './vendor-logos';

const pathsOf = (svg: string) => [...svg.matchAll(/ d="(?<d>[^"]+)"/gu)].map((m) => m.groups?.d);

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

  it('gives Trainium3 the official AWS logo, Squid Ink in light mode and white in dark', () => {
    const light = readFileSync('public/logos/aws.svg', 'utf8').trim();
    const dark = readFileSync('public/logos/aws-dark.svg', 'utf8').trim();
    expect(light).toContain('fill="#161D26"');
    expect(dark).toBe(light.replace('#161D26', '#FFFFFF'));
    expect(getHwVendorLogo('AWS')).toBe('aws.svg');
    expect(getHwVendorDarkLogo('AWS')).toBe('aws-dark.svg');
    expect(getHwVendorDarkLogo('NVIDIA')).toBeUndefined();

    const axis = getAxisVendorIcon('trn3_vllm');
    expect(axis?.href).toBe(`data:image/svg+xml,${encodeURIComponent(light)}`);
    expect(axis?.darkHref).toBe(`data:image/svg+xml,${encodeURIComponent(dark)}`);
    expect(vendorMarkVariants(axis!)).toEqual([
      { href: axis!.href, className: 'dark:hidden' },
      { href: axis!.darkHref!, className: 'hidden dark:inline' },
    ]);
    expect(getLineLabelVendorIcon('trn3')).toBe(VENDOR_LOGO_ICONS.AWS);
    expect(pathsOf(decodeURIComponent(VENDOR_MARK_HREFS.AWS ?? ''))).toEqual(pathsOf(light));
  });

  it('keeps one image per mark for vendors without a dark variant', () => {
    expect(vendorMarkVariants(getAxisVendorIcon('mi355x')!)).toEqual([
      { href: getAxisVendorIcon('mi355x')!.href, className: 'dark:invert' },
    ]);
    expect(vendorMarkVariants(getAxisVendorIcon('b200')!)[0]?.className).toBe('');
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
