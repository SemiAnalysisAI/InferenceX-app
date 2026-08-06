import { describe, expect, it } from 'vitest';

import { RATIO_CAP_HI, RATIO_CAP_LO, ratioColor } from './InteractivityTables';

describe('ratioColor', () => {
  it('renders 1.0× as near-neutral and produces dark text', () => {
    const { background, color } = ratioColor(1);
    expect(background).toMatch(/^rgb\(/u);
    expect(color).toBe('#0a0a0a');
  });

  it('produces visibly distinct colors for common positive ratios', () => {
    // The whole point of bumping the cap from 3× to 30× and switching to HSL:
    // common ratios from 2× up through 20× must land at clearly different
    // greens rather than all saturating to the same deep color.
    const ratios = [2, 5, 7, 10, 20];
    const backgrounds = ratios.map((r) => ratioColor(r).background);
    expect(new Set(backgrounds).size).toBe(ratios.length);
  });

  it('produces a monotonically darker green for higher ratios (higher-better)', () => {
    // Each step up in ratio should reduce HSL lightness (=> lower luminance)
    // until the saturation cap. Use a coarse luminance proxy via the green
    // channel of the rgb() string.
    const greens = [1.5, 2, 5, 10, 20, 33].map((r) => {
      const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/u.exec(ratioColor(r).background);
      if (!m) throw new Error('rgb parse failed');
      return Number(m[1]) + Number(m[2]) + Number(m[3]); // r+g+b as a luminance proxy
    });
    for (let i = 1; i < greens.length; i++) {
      expect(greens[i]).toBeLessThan(greens[i - 1]);
    }
  });

  it('clamps beyond RATIO_CAP_HI / RATIO_CAP_LO', () => {
    expect(ratioColor(RATIO_CAP_HI).background).toBe(ratioColor(RATIO_CAP_HI * 10).background);
    expect(ratioColor(RATIO_CAP_LO).background).toBe(ratioColor(RATIO_CAP_LO / 10).background);
  });

  it('is log-symmetric: reciprocal ratios swap red/green at equal magnitude', () => {
    // ratioColor(2) and ratioColor(0.5) should be mirror images (same lightness,
    // opposite hues). Compare the dominant channel: 2× should be green-dominant
    // (g > r), 0.5× should be red-dominant (r > g).
    const up = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/u.exec(ratioColor(2).background);
    const down = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/u.exec(ratioColor(0.5).background);
    if (!up || !down) throw new Error('rgb parse failed');
    expect(Number(up[2])).toBeGreaterThan(Number(up[1]));
    expect(Number(down[1])).toBeGreaterThan(Number(down[2]));
  });

  it("inverts hue for direction='lower'", () => {
    // For lower-is-better, a ratio > 1 means "other is worse" → red.
    const higher = ratioColor(5, 'higher');
    const lower = ratioColor(5, 'lower');
    const hi = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/u.exec(higher.background);
    const lo = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/u.exec(lower.background);
    if (!hi || !lo) throw new Error('rgb parse failed');
    // higher-better at 5× → green-dominant; lower-better at 5× → red-dominant.
    expect(Number(hi[2])).toBeGreaterThan(Number(hi[1]));
    expect(Number(lo[1])).toBeGreaterThan(Number(lo[2]));
  });

  it('switches text color to white once background luminance drops', () => {
    // Deep ratios should produce white text (background too dark for black).
    expect(ratioColor(30).color).toBe('#ffffff');
    expect(ratioColor(1 / 30).color).toBe('#ffffff');
    // Near 1×, text should stay dark.
    expect(ratioColor(1.5).color).toBe('#0a0a0a');
  });
});
