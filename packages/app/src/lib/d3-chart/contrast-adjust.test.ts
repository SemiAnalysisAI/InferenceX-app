import { describe, expect, it } from 'vitest';

import { adjustForContrast, contrastRatio } from './contrast-colors';

// Chart backgrounds (`--card`) and series colours measured on the agentic
// chart, converted from their OKLCH tokens to sRGB.
const DARK_CARD: [number, number, number] = [19, 20, 22];
const LIGHT_CARD: [number, number, number] = [234, 235, 236];
const H200_DARK: [number, number, number] = [0, 115, 76]; // ~3.5:1 on dark
const VERA_RUBIN_LIGHT: [number, number, number] = [134, 170, 46]; // ~2.3:1 on light

/** Hue angle in degrees, to check the adjusted colour stays the same colour. */
const hue = ([r, g, b]: [number, number, number]) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

describe('adjustForContrast', () => {
  it('lightens a dark series colour until it is readable on the dark chart', () => {
    expect(contrastRatio(H200_DARK, DARK_CARD)).toBeLessThan(4.5);
    const out = adjustForContrast(H200_DARK, DARK_CARD);
    expect(contrastRatio(out, DARK_CARD)).toBeGreaterThanOrEqual(4.5);
    expect(out[1]).toBeGreaterThan(H200_DARK[1]);
    expect(Math.abs(hue(out) - hue(H200_DARK))).toBeLessThan(12);
  });

  it('darkens a light series colour until it is readable on the light chart', () => {
    expect(contrastRatio(VERA_RUBIN_LIGHT, LIGHT_CARD)).toBeLessThan(3);
    const out = adjustForContrast(VERA_RUBIN_LIGHT, LIGHT_CARD);
    expect(contrastRatio(out, LIGHT_CARD)).toBeGreaterThanOrEqual(4.5);
    expect(out[1]).toBeLessThan(VERA_RUBIN_LIGHT[1]);
    expect(Math.abs(hue(out) - hue(VERA_RUBIN_LIGHT))).toBeLessThan(12);
  });

  it('leaves a colour that already passes untouched', () => {
    const white: [number, number, number] = [255, 255, 255];
    expect(adjustForContrast(white, DARK_CARD)).toBe(white);
  });
});
