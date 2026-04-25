import { describe, it, expect, vi } from 'vitest';

import {
  POINT_SIZE,
  HOVER_POINT_SIZE,
  STROKE_WIDTH,
  HOVER_STROKE_WIDTH,
  SHAPE_CONFIG,
  SHAPE_ORDER,
  getShapeConfig,
  getShapeKeyForPrecision,
  applyNormalState,
  applyHoverState,
  formatLargeNumber,
  logTickFormat,
} from '@/lib/chart-rendering';

function mockScale(min: number, max: number) {
  return { domain: () => [min, max] } as any;
}

// ===========================================================================
// SHAPE_CONFIG (keyed by shape name)
// ===========================================================================
describe('SHAPE_CONFIG', () => {
  it('circle config has type "circle" with radius', () => {
    expect(SHAPE_CONFIG.circle.type).toBe('circle');
    expect(SHAPE_CONFIG.circle.normal.r).toBe(POINT_SIZE);
  });

  it('square config has type "rect" with position/size attributes', () => {
    expect(SHAPE_CONFIG.square.type).toBe('rect');
    expect(SHAPE_CONFIG.square.normal).toHaveProperty('x');
    expect(SHAPE_CONFIG.square.normal).toHaveProperty('y');
    expect(SHAPE_CONFIG.square.normal).toHaveProperty('width');
    expect(SHAPE_CONFIG.square.normal).toHaveProperty('height');
  });

  it('triangle config has type "path" with an SVG path string', () => {
    expect(SHAPE_CONFIG.triangle.type).toBe('path');
    expect(SHAPE_CONFIG.triangle.normal.d).toMatch(/^M /);
    expect(SHAPE_CONFIG.triangle.hover.d).toMatch(/^M /);
  });

  it('diamond config has type "path" with a distinct path from triangle', () => {
    expect(SHAPE_CONFIG.diamond.type).toBe('path');
    expect(SHAPE_CONFIG.diamond.normal.d).not.toBe(SHAPE_CONFIG.triangle.normal.d);
  });

  it('hover sizes are larger than normal sizes', () => {
    expect(HOVER_POINT_SIZE).toBeGreaterThan(POINT_SIZE);
    expect(HOVER_STROKE_WIDTH).toBeGreaterThanOrEqual(STROKE_WIDTH);
    expect(SHAPE_CONFIG.circle.hover.r).toBeGreaterThan(SHAPE_CONFIG.circle.normal.r);
  });
});

// ===========================================================================
// SHAPE_ORDER
// ===========================================================================
describe('SHAPE_ORDER', () => {
  it('assigns circle → square → triangle → diamond in that order', () => {
    expect([...SHAPE_ORDER]).toEqual(['circle', 'square', 'triangle', 'diamond']);
  });
});

// ===========================================================================
// getShapeKeyForPrecision (positional)
// ===========================================================================
describe('getShapeKeyForPrecision', () => {
  it('first selected precision maps to circle', () => {
    expect(getShapeKeyForPrecision('fp8', ['fp8', 'fp4'])).toBe('circle');
  });

  it('second selected precision maps to square', () => {
    expect(getShapeKeyForPrecision('fp4', ['fp8', 'fp4'])).toBe('square');
  });

  it('third selected precision maps to triangle', () => {
    expect(getShapeKeyForPrecision('bf16', ['fp8', 'fp4', 'bf16'])).toBe('triangle');
  });

  it('fourth selected precision maps to diamond', () => {
    expect(getShapeKeyForPrecision('int4', ['fp8', 'fp4', 'bf16', 'int4'])).toBe('diamond');
  });

  it('precision not in selected list falls back to circle', () => {
    expect(getShapeKeyForPrecision('bf16', ['fp8', 'fp4'])).toBe('circle');
  });

  it('precision beyond the 4th slot falls back to circle', () => {
    expect(getShapeKeyForPrecision('x', ['a', 'b', 'c', 'd', 'x'])).toBe('circle');
  });

  it('empty selectedPrecisions falls back to circle', () => {
    expect(getShapeKeyForPrecision('fp4', [])).toBe('circle');
  });
});

// ===========================================================================
// getShapeConfig
// ===========================================================================
describe('getShapeConfig', () => {
  it('returns the shape config for a given shape key', () => {
    expect(getShapeConfig('circle')).toBe(SHAPE_CONFIG.circle);
    expect(getShapeConfig('square')).toBe(SHAPE_CONFIG.square);
    expect(getShapeConfig('triangle')).toBe(SHAPE_CONFIG.triangle);
    expect(getShapeConfig('diamond')).toBe(SHAPE_CONFIG.diamond);
  });
});

// ===========================================================================
// applyNormalState
// ===========================================================================
describe('applyNormalState', () => {
  function mockSelection() {
    return { attr: vi.fn().mockReturnThis() } as any;
  }

  it('sets path attributes for triangle', () => {
    const sel = mockSelection();
    applyNormalState(sel, 'triangle');
    expect(sel.attr).toHaveBeenCalledWith('d', SHAPE_CONFIG.triangle.normal.d);
    expect(sel.attr).toHaveBeenCalledWith('stroke-width', STROKE_WIDTH);
  });

  it('sets rect attributes for square (5 attr calls)', () => {
    const sel = mockSelection();
    applyNormalState(sel, 'square');
    expect(sel.attr).toHaveBeenCalledWith('x', SHAPE_CONFIG.square.normal.x);
    expect(sel.attr).toHaveBeenCalledWith('y', SHAPE_CONFIG.square.normal.y);
    expect(sel.attr).toHaveBeenCalledWith('width', SHAPE_CONFIG.square.normal.width);
    expect(sel.attr).toHaveBeenCalledWith('height', SHAPE_CONFIG.square.normal.height);
    expect(sel.attr).toHaveBeenCalledWith('stroke-width', STROKE_WIDTH);
    expect(sel.attr).toHaveBeenCalledTimes(5);
  });

  it('sets circle attributes (2 attr calls)', () => {
    const sel = mockSelection();
    applyNormalState(sel, 'circle');
    expect(sel.attr).toHaveBeenCalledWith('r', POINT_SIZE);
    expect(sel.attr).toHaveBeenCalledWith('stroke-width', STROKE_WIDTH);
    expect(sel.attr).toHaveBeenCalledTimes(2);
  });

  it('sets diamond path', () => {
    const sel = mockSelection();
    applyNormalState(sel, 'diamond');
    expect(sel.attr).toHaveBeenCalledWith('d', SHAPE_CONFIG.diamond.normal.d);
  });
});

// ===========================================================================
// applyHoverState
// ===========================================================================
describe('applyHoverState', () => {
  function mockSelection() {
    return { attr: vi.fn().mockReturnThis() } as any;
  }

  it('sets hover path attributes for triangle', () => {
    const sel = mockSelection();
    applyHoverState(sel, 'triangle');
    expect(sel.attr).toHaveBeenCalledWith('d', SHAPE_CONFIG.triangle.hover.d);
    expect(sel.attr).toHaveBeenCalledWith('stroke-width', HOVER_STROKE_WIDTH);
  });

  it('sets hover rect attributes for square', () => {
    const sel = mockSelection();
    applyHoverState(sel, 'square');
    expect(sel.attr).toHaveBeenCalledWith('x', SHAPE_CONFIG.square.hover.x);
    expect(sel.attr).toHaveBeenCalledWith('width', SHAPE_CONFIG.square.hover.width);
    expect(sel.attr).toHaveBeenCalledWith('stroke-width', HOVER_STROKE_WIDTH);
  });

  it('sets hover circle attributes', () => {
    const sel = mockSelection();
    applyHoverState(sel, 'circle');
    expect(sel.attr).toHaveBeenCalledWith('r', HOVER_POINT_SIZE);
    expect(sel.attr).toHaveBeenCalledWith('stroke-width', HOVER_STROKE_WIDTH);
  });

  it('sets hover diamond path', () => {
    const sel = mockSelection();
    applyHoverState(sel, 'diamond');
    expect(sel.attr).toHaveBeenCalledWith('d', SHAPE_CONFIG.diamond.hover.d);
    expect(sel.attr).toHaveBeenCalledWith('stroke-width', HOVER_STROKE_WIDTH);
  });
});

// ===========================================================================
// formatLargeNumber
// ===========================================================================
describe('formatLargeNumber', () => {
  it('formats evenly divisible millions without decimal', () => {
    expect(formatLargeNumber(2_000_000)).toBe('2M');
  });

  it('formats non-evenly divisible millions with 1 decimal', () => {
    expect(formatLargeNumber(1_500_000)).toBe('1.5M');
  });

  it('formats evenly divisible thousands without decimal', () => {
    expect(formatLargeNumber(5_000)).toBe('5k');
  });

  it('formats non-evenly divisible thousands with 1 decimal', () => {
    expect(formatLargeNumber(2_500)).toBe('2.5k');
  });

  it('delegates to formatNumber for values under 1000', () => {
    expect(formatLargeNumber(999)).toBe('999');
  });

  it('delegates to formatNumber for zero', () => {
    expect(formatLargeNumber(0)).toBe('0');
  });

  it('handles negative millions', () => {
    expect(formatLargeNumber(-2_000_000)).toBe('-2M');
  });

  it('handles negative thousands', () => {
    expect(formatLargeNumber(-5_000)).toBe('-5k');
  });

  it('handles exactly 1000 (boundary)', () => {
    expect(formatLargeNumber(1000)).toBe('1k');
  });

  it('handles exactly 1_000_000 (boundary)', () => {
    expect(formatLargeNumber(1_000_000)).toBe('1M');
  });
});

// ===========================================================================
// logTickFormat
// ===========================================================================
describe('logTickFormat', () => {
  it('shows all labels when logRange < 2', () => {
    const formatter = logTickFormat(mockScale(10, 50));
    expect(formatter(25)).toBe(formatLargeNumber(25));
    expect(formatter(10)).toBe(formatLargeNumber(10));
  });

  it('shows only powers of 10 when logRange >= 2', () => {
    const formatter = logTickFormat(mockScale(1, 10_000));
    expect(formatter(100)).toBe(formatLargeNumber(100));
    expect(formatter(1000)).toBe(formatLargeNumber(1000));
    expect(formatter(200)).toBe('');
    expect(formatter(500)).toBe('');
  });

  it('shows label for 1 (10^0) when zoomed out', () => {
    const formatter = logTickFormat(mockScale(1, 100_000));
    expect(formatter(1)).toBe(formatLargeNumber(1));
  });

  it('returns empty string for non-power-of-10 when zoomed out', () => {
    const formatter = logTickFormat(mockScale(1, 100_000));
    expect(formatter(50)).toBe('');
  });

  it('treats logRange of exactly 2 as zoomed out', () => {
    const formatter = logTickFormat(mockScale(1, 100));
    expect(formatter(10)).toBe(formatLargeNumber(10));
    expect(formatter(50)).toBe('');
  });
});

// ===========================================================================
// logTickFormat — additional edge cases
// ===========================================================================
describe('logTickFormat — edge cases', () => {
  it('shows all labels at narrow zoom (logRange < 2) including non-powers-of-10', () => {
    const formatter = logTickFormat(mockScale(100, 500));
    expect(formatter(150)).toBe(formatLargeNumber(150));
    expect(formatter(250)).toBe(formatLargeNumber(250));
    expect(formatter(350)).toBe(formatLargeNumber(350));
  });

  it('handles logRange just below 2 (domain [1, 99])', () => {
    const formatter = logTickFormat(mockScale(1, 99));
    expect(formatter(50)).toBe(formatLargeNumber(50));
    expect(formatter(75)).toBe(formatLargeNumber(75));
  });

  it('handles very wide range (logRange > 4) showing only powers of 10', () => {
    const formatter = logTickFormat(mockScale(1, 100_000));
    expect(formatter(10)).toBe(formatLargeNumber(10));
    expect(formatter(100)).toBe(formatLargeNumber(100));
    expect(formatter(1000)).toBe(formatLargeNumber(1000));
    expect(formatter(10_000)).toBe(formatLargeNumber(10_000));
    expect(formatter(100_000)).toBe(formatLargeNumber(100_000));
    expect(formatter(5000)).toBe('');
    expect(formatter(20_000)).toBe('');
  });

  it('formats 10000 as "10k" when it is a power-of-10 tick in wide range', () => {
    const formatter = logTickFormat(mockScale(1, 1_000_000));
    expect(formatter(10_000)).toBe('10k');
  });

  it('formats 1000000 as "1M" when it is a power-of-10 tick in wide range', () => {
    const formatter = logTickFormat(mockScale(1, 10_000_000));
    expect(formatter(1_000_000)).toBe('1M');
  });

  it('shows 0.1 as a power of 10 when domain includes sub-1 values', () => {
    const formatter = logTickFormat(mockScale(0.01, 1000));
    expect(formatter(0.1)).not.toBe('');
    expect(formatter(0.5)).toBe('');
  });
});

// ===========================================================================
// formatLargeNumber — additional edge cases
// ===========================================================================
describe('formatLargeNumber — additional edge cases', () => {
  it('formats 999 (just below 1000 boundary) as plain number', () => {
    expect(formatLargeNumber(999)).toBe('999');
  });

  it('formats 1001 (just above 1000 boundary) with decimal', () => {
    expect(formatLargeNumber(1001)).toBe('1.0k');
  });

  it('formats 999999 (just below 1M boundary) in thousands', () => {
    expect(formatLargeNumber(999_999)).toBe('1000.0k');
  });

  it('formats 1000001 (just above 1M boundary) with decimal', () => {
    expect(formatLargeNumber(1_000_001)).toBe('1.0M');
  });

  it('formats negative values just below -1000', () => {
    expect(formatLargeNumber(-1001)).toBe('-1.0k');
  });

  it('formats negative values just below -1M', () => {
    expect(formatLargeNumber(-1_500_000)).toBe('-1.5M');
  });

  it('formats small positive values without suffix', () => {
    expect(formatLargeNumber(42)).toBe('42');
    expect(formatLargeNumber(1)).toBe('1');
  });

  it('formats 10000 (exactly 10k)', () => {
    expect(formatLargeNumber(10_000)).toBe('10k');
  });

  it('formats 2500000 (2.5M)', () => {
    expect(formatLargeNumber(2_500_000)).toBe('2.5M');
  });

  it('formats small decimals via formatNumber', () => {
    expect(formatLargeNumber(0.5)).toBe('0.5');
  });
});
