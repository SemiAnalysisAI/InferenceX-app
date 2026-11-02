import { describe, expect, it } from 'vitest';

import { BASE_ARTWORK_HEIGHT, LOGO_METRICS, logoSize } from './logo-metrics';
import { SUPPORTER_GROUPS } from './supporter-groups';

const wallLogos = [...new Set(SUPPORTER_GROUPS.flatMap((g) => g.logos.map((l) => l.logo)))];

describe('logo wall sizing', () => {
  it('has measured geometry for every logo on the wall, including Other', () => {
    const missing = wallLogos.filter((file) => !(file in LOGO_METRICS));
    expect(missing).toEqual([]);
  });

  it('renders a square mark at the base artwork height', () => {
    expect(logoSize('openai.svg').height).toBe(BASE_ARTWORK_HEIGHT);
  });

  it('makes wordmarks shorter but wider than square marks', () => {
    const mark = logoSize('openai.svg');
    for (const file of ['lambda.svg', 'oracle.svg', 'meta.svg']) {
      const word = logoSize(file);
      expect(word.height, file).toBeLessThan(mark.height);
      expect(word.width, file).toBeGreaterThan(mark.width);
    }
    // Longer wordmarks get shorter still, so their footprint stays balanced.
    expect(logoSize('tensorwave.svg').height).toBeLessThan(logoSize('lambda.svg').height);
  });

  it('enlarges files with built-in padding so the artwork itself matches', () => {
    // nvidia-color.svg artwork fills 66% of its square canvas.
    const nvidia = logoSize('nvidia-color.svg');
    const { aspect, fill } = LOGO_METRICS['nvidia-color.svg'];
    expect(nvidia.height * fill).toBeCloseTo(BASE_ARTWORK_HEIGHT * aspect ** -0.5, 0);
  });

  it('flips only mostly-dark artwork in dark mode', () => {
    expect(logoSize('openai.svg').invertInDark).toBe(true);
    expect(logoSize('lambda.svg').invertInDark).toBe(true);
    for (const file of ['google-color.svg', 'microsoft.svg', 'nvidia-color.svg', 'oracle.svg']) {
      expect(logoSize(file).invertInDark, file).toBe(false);
    }
  });

  it('sizes the TokenSpeed mark + wordmark as a wide logo that flips in dark mode', () => {
    const tokenspeed = logoSize('tokenspeed.webp');
    expect(tokenspeed.width / tokenspeed.height).toBeGreaterThan(5);
    expect(tokenspeed.height).toBeLessThan(BASE_ARTWORK_HEIGHT);
    expect(tokenspeed.invertInDark).toBe(true);
  });

  it('falls back to a square base size for an unmeasured logo', () => {
    expect(logoSize('not-measured.svg')).toEqual({
      height: BASE_ARTWORK_HEIGHT,
      width: BASE_ARTWORK_HEIGHT,
      invertInDark: false,
    });
  });
});
