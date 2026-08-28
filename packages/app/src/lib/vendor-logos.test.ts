import { describe, expect, it } from 'vitest';

import { VENDOR_LOGO_ICONS, getLineLabelVendorIcon } from './vendor-logos';

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

  it('maps Jalapeño (Teacup/OpenAI) to the OpenAI mark', () => {
    expect(getLineLabelVendorIcon('jalapeno')).toBe(VENDOR_LOGO_ICONS.Teacup);
  });

  it('returns no icon for unknown hardware', () => {
    expect(getLineLabelVendorIcon('unknown-hw')).toBeUndefined();
  });

  it('uses the black PNG eye mark for NVIDIA so it stays visible on green pills', () => {
    expect(VENDOR_LOGO_ICONS.NVIDIA.href).toMatch(/^data:image\/png;base64,/);
  });

  it('inlines brand colors in the SVG data URIs', () => {
    expect(decodeURIComponent(VENDOR_LOGO_ICONS.AMD.href)).toContain('#000000');
    expect(decodeURIComponent(VENDOR_LOGO_ICONS.Teacup.href)).toContain('#ffffff');
  });
});
