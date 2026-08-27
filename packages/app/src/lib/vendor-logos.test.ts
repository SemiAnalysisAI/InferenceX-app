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

  it('returns no icon for unknown hardware or vendors without a public logo', () => {
    expect(getLineLabelVendorIcon('unknown-hw')).toBeUndefined();
    // Anonymized preview silicon (Teacup Jalapeño) has no official mark.
    expect(getLineLabelVendorIcon('jalapeno')).toBeUndefined();
  });

  it('inlines brand colors in the data URIs', () => {
    expect(decodeURIComponent(VENDOR_LOGO_ICONS.NVIDIA.href)).toContain('#76B900');
    expect(decodeURIComponent(VENDOR_LOGO_ICONS.AMD.href)).toContain('#000000');
  });
});
