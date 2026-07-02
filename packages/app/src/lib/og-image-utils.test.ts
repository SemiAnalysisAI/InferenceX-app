import { describe, it, expect } from 'vitest';

import {
  decimalsForStep,
  money,
  moneyForStep,
  niceAxis,
  niceStep,
  ogTitleFontSize,
  ogWrapSubtitle,
} from './og-image-utils';

// ---------------------------------------------------------------------------
// money
// ---------------------------------------------------------------------------

describe('money', () => {
  it('formats values >= 10 to 1 decimal', () => {
    expect(money(10)).toBe('$10.0');
    expect(money(18.999)).toBe('$19.0');
    expect(money(100)).toBe('$100.0');
  });

  it('formats values >= 1 and < 10 to 2 decimals', () => {
    expect(money(1)).toBe('$1.00');
    expect(money(9.99)).toBe('$9.99');
    expect(money(5.5)).toBe('$5.50');
  });

  it('formats values < 1 to 3 decimals', () => {
    expect(money(0.5)).toBe('$0.500');
    expect(money(0.001)).toBe('$0.001');
    expect(money(0.123)).toBe('$0.123');
  });

  it('formats zero', () => {
    expect(money(0)).toBe('$0.000');
  });
});

// ---------------------------------------------------------------------------
// decimalsForStep
// ---------------------------------------------------------------------------

describe('decimalsForStep', () => {
  it('returns 0 for step >= 1', () => {
    expect(decimalsForStep(1)).toBe(0);
    expect(decimalsForStep(5)).toBe(0);
    expect(decimalsForStep(10)).toBe(0);
  });

  it('returns 1 for step 0.1', () => {
    expect(decimalsForStep(0.1)).toBe(1);
  });

  it('returns 2 for step 0.01', () => {
    expect(decimalsForStep(0.01)).toBe(2);
  });

  it('returns 3 for step 0.001', () => {
    expect(decimalsForStep(0.001)).toBe(3);
  });

  it('handles step 0.5 as 1 decimal', () => {
    expect(decimalsForStep(0.5)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// moneyForStep
// ---------------------------------------------------------------------------

describe('moneyForStep', () => {
  it('formats with 0 decimals for step >= 1', () => {
    expect(moneyForStep(5, 1)).toBe('$5');
    expect(moneyForStep(10, 5)).toBe('$10');
  });

  it('formats with 1 decimal for step 0.1', () => {
    expect(moneyForStep(0.5, 0.1)).toBe('$0.5');
    expect(moneyForStep(1.5, 0.1)).toBe('$1.5');
  });

  it('formats with 2 decimals for step 0.01', () => {
    expect(moneyForStep(1.25, 0.01)).toBe('$1.25');
  });

  it('ensures all ticks in an axis use the same precision as the step', () => {
    const step = 0.5;
    // All values should have the same decimal count regardless of integer-ness
    expect(moneyForStep(0, step)).toBe('$0.0');
    expect(moneyForStep(0.5, step)).toBe('$0.5');
    expect(moneyForStep(1, step)).toBe('$1.0');
  });
});

// ---------------------------------------------------------------------------
// niceStep
// ---------------------------------------------------------------------------

describe('niceStep', () => {
  it('picks step=1 for a span of ~4 with 5 ticks', () => {
    expect(niceStep(4, 5)).toBe(1);
  });

  it('picks step=2 for a span of ~8 with 5 ticks', () => {
    expect(niceStep(8, 5)).toBe(2);
  });

  it('picks step=5 for a span of ~20 with 5 ticks', () => {
    expect(niceStep(20, 5)).toBe(5);
  });

  it('picks step=10 for a span of ~40 with 5 ticks', () => {
    expect(niceStep(40, 5)).toBe(10);
  });

  it('picks step=0.1 for a span of 0.4 with 5 ticks', () => {
    expect(niceStep(0.4, 5)).toBe(0.1);
  });

  it('picks step=0.5 for a span of ~2 with 5 ticks', () => {
    expect(niceStep(2, 5)).toBe(0.5);
  });

  it('handles targetCount=1 without dividing by zero', () => {
    // targetCount=1 → uses max(1, 0)=1 → rawStep = span/1
    expect(niceStep(10, 1)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// niceAxis
// ---------------------------------------------------------------------------

describe('niceAxis', () => {
  it('returns a degenerate axis when max <= min', () => {
    const result = niceAxis(5, 5);
    expect(result.min).toBe(5);
    expect(result.max).toBe(6);
    expect(result.step).toBe(1);
    expect(result.ticks).toEqual([5]);
  });

  it('produces ticks that span [niceMin, niceMax]', () => {
    const { min, max, ticks } = niceAxis(0, 10);
    expect(ticks[0]).toBe(min);
    expect(ticks.at(-1)).toBe(max);
  });

  it('produces evenly spaced ticks', () => {
    const { ticks, step } = niceAxis(0, 10);
    for (let i = 1; i < ticks.length; i++) {
      expect(Math.abs(ticks[i] - ticks[i - 1] - step)).toBeLessThan(1e-8);
    }
  });

  it('snaps min down and max up to the step grid', () => {
    const { min, max, step } = niceAxis(0.3, 9.7);
    expect(min % step).toBeCloseTo(0);
    expect(max % step).toBeCloseTo(0);
    expect(min).toBeLessThanOrEqual(0.3);
    expect(max).toBeGreaterThanOrEqual(9.7);
  });

  it('handles a sub-dollar cost range (0–0.5)', () => {
    const { min, max, step, ticks } = niceAxis(0, 0.5);
    expect(min).toBe(0);
    expect(max).toBeGreaterThanOrEqual(0.5);
    expect(step).toBeLessThan(1);
    expect(ticks.length).toBeGreaterThan(1);
    // All ticks should be representable to the step's decimal precision
    for (const t of ticks) {
      expect(Math.abs(t - parseFloat(t.toFixed(10)))).toBeLessThan(1e-9);
    }
  });

  it('handles a large cost range (0–100)', () => {
    const { min, max, step, ticks } = niceAxis(0, 100);
    expect(min).toBe(0);
    expect(max).toBeGreaterThanOrEqual(100);
    expect(step).toBeGreaterThanOrEqual(1);
    expect(ticks.length).toBeGreaterThan(1);
  });

  it('handles a range starting above zero (5–15)', () => {
    const { min, max } = niceAxis(5, 15);
    expect(min).toBeLessThanOrEqual(5);
    expect(max).toBeGreaterThanOrEqual(15);
  });

  it('respects a custom targetCount', () => {
    // With targetCount=3 we expect fewer, larger ticks than default 5
    const three = niceAxis(0, 10, 3);
    const five = niceAxis(0, 10, 5);
    expect(three.step).toBeGreaterThanOrEqual(five.step);
  });

  it('produces money-friendly axis for a cost chart 0–0.3', () => {
    // Typical sub-dollar per-token cost range
    const { step, ticks } = niceAxis(0, 0.3);
    // Each tick should be expressible as a money string without NaN/Infinity
    for (const t of ticks) {
      const label = moneyForStep(t, step);
      expect(label).toMatch(/^\$[\d.]+$/u);
    }
  });
});

// ---------------------------------------------------------------------------
// ogTitleFontSize
// ---------------------------------------------------------------------------

describe('ogTitleFontSize', () => {
  it('returns 72 for short titles (<= 35 chars)', () => {
    expect(ogTitleFontSize(0)).toBe(72);
    expect(ogTitleFontSize(35)).toBe(72);
  });

  it('returns 64 for medium titles (36–50 chars)', () => {
    expect(ogTitleFontSize(36)).toBe(64);
    expect(ogTitleFontSize(50)).toBe(64);
  });

  it('returns 56 for long titles (> 50 chars)', () => {
    expect(ogTitleFontSize(51)).toBe(56);
    expect(ogTitleFontSize(120)).toBe(56);
  });
});

// ---------------------------------------------------------------------------
// ogWrapSubtitle
// ---------------------------------------------------------------------------

describe('ogWrapSubtitle', () => {
  it('returns the subtitle unchanged when it fits', () => {
    const short = 'A short subtitle.';
    expect(ogWrapSubtitle(short, 20)).toBe(short);
  });

  it('truncates and appends ellipsis when subtitle is too long', () => {
    // Use a very long subtitle with a very long title to leave little space
    const longTitle = 'A'.repeat(80);
    const longSubtitle = 'B '.repeat(200);
    const result = ogWrapSubtitle(longSubtitle, longTitle.length);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThan(longSubtitle.length);
  });

  it('truncates at a word boundary (no partial words before ellipsis)', () => {
    // Construct a subtitle where truncation would land mid-word
    const subtitle = 'Hello world this is a test sentence for wrapping behavior';
    const longTitle = 'A'.repeat(55); // forces smaller font → fewer chars per line
    const result = ogWrapSubtitle(subtitle, longTitle.length);
    if (result.endsWith('…')) {
      // The character just before '…' should be a space or follow a space
      const withoutEllipsis = result.slice(0, -1);
      expect(withoutEllipsis).not.toMatch(/\S$/u); // must end after word boundary
    }
  });

  it('returns empty string when no subtitle space is available (very long title)', () => {
    // An extremely long title at tiny font will consume all textBoxHeight
    const veryLongTitle = 'A'.repeat(500);
    const result = ogWrapSubtitle('Some subtitle text', veryLongTitle.length);
    expect(result).toBe('');
  });

  it('accepts custom contentWidth and textBoxHeight', () => {
    // Narrow box forces truncation sooner
    const subtitle = 'Word '.repeat(100);
    const narrow = ogWrapSubtitle(subtitle, 30, 400, 200);
    const wide = ogWrapSubtitle(subtitle, 30, 1200, 600);
    expect(narrow.length).toBeLessThan(wide.length);
  });

  it('is idempotent — wrapping an already-wrapped subtitle changes nothing', () => {
    const subtitle = 'This is a moderately long subtitle that should fit in a normal OG image.';
    const once = ogWrapSubtitle(subtitle, 40);
    const twice = ogWrapSubtitle(once, 40);
    expect(twice).toBe(once);
  });
});
