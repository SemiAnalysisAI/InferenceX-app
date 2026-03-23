import { describe, it, expect, vi } from 'vitest';

import {
  POINT_SIZE,
  HOVER_POINT_SIZE,
  STROKE_WIDTH,
  HOVER_STROKE_WIDTH,
  SHAPE_CONFIG,
  getShapeConfig,
  applyNormalState,
  applyHoverState,
  formatLargeNumber,
  logTickFormat,
} from '@/lib/chart-rendering';

// ===========================================================================
// SHAPE_CONFIG
// ===========================================================================
describe('SHAPE_CONFIG', () => {
  it('bf16 config has type "path" with SVG path strings', () => {
    expect(SHAPE_CONFIG.bf16.type).toBe('path');
    expect(SHAPE_CONFIG.bf16.normal.d).toMatch(/^M /);
    expect(SHAPE_CONFIG.bf16.hover.d).toMatch(/^M /);
  });

  it('int4 config has type "path" with diamond paths', () => {
    expect(SHAPE_CONFIG.int4.type).toBe('path');
    expect(SHAPE_CONFIG.int4.normal.d).toMatch(/^M /);
    // int4 diamond paths differ from bf16 triangle paths
    expect(SHAPE_CONFIG.int4.normal.d).not.toBe(SHAPE_CONFIG.bf16.normal.d);
  });

  it('fp8 config has type "rect" with position/size attributes', () => {
    expect(SHAPE_CONFIG.fp8.type).toBe('rect');
    expect(SHAPE_CONFIG.fp8.normal).toHaveProperty('x');
    expect(SHAPE_CONFIG.fp8.normal).toHaveProperty('y');
    expect(SHAPE_CONFIG.fp8.normal).toHaveProperty('width');
    expect(SHAPE_CONFIG.fp8.normal).toHaveProperty('height');
  });

  it('default config has type "circle" with radius', () => {
    expect(SHAPE_CONFIG.default.type).toBe('circle');
    expect(SHAPE_CONFIG.default.normal.r).toBe(POINT_SIZE);
  });

  it('hover sizes are larger than normal sizes', () => {
    expect(HOVER_POINT_SIZE).toBeGreaterThan(POINT_SIZE);
    expect(HOVER_STROKE_WIDTH).toBeGreaterThanOrEqual(STROKE_WIDTH);
    expect(SHAPE_CONFIG.default.hover.r).toBeGreaterThan(SHAPE_CONFIG.default.normal.r);
  });
});

// ===========================================================================
// getShapeConfig
// ===========================================================================
describe('getShapeConfig', () => {
  it('returns bf16 config for "bf16"', () => {
    expect(getShapeConfig('bf16')).toBe(SHAPE_CONFIG.bf16);
  });

  it('returns int4 config for "int4"', () => {
    expect(getShapeConfig('int4')).toBe(SHAPE_CONFIG.int4);
  });

  it('returns fp8 config for "fp8"', () => {
    expect(getShapeConfig('fp8')).toBe(SHAPE_CONFIG.fp8);
  });

  it('returns default config for "fp16"', () => {
    expect(getShapeConfig('fp16')).toBe(SHAPE_CONFIG.default);
  });

  it('returns default config for empty string', () => {
    expect(getShapeConfig('')).toBe(SHAPE_CONFIG.default);
  });

  it('returns default config for unknown precision', () => {
    expect(getShapeConfig('fp32')).toBe(SHAPE_CONFIG.default);
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
  function mockScale(min: number, max: number) {
    return { domain: () => [min, max] } as any;
  }

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
    // domain [1, 100] → logRange = 2
    const formatter = logTickFormat(mockScale(1, 100));
    expect(formatter(10)).toBe(formatLargeNumber(10)); // power of 10
    expect(formatter(50)).toBe(''); // not power of 10
  });
});

// ===========================================================================
// applyNormalState
// ===========================================================================
describe('applyNormalState', () => {
  function mockSelection() {
    return { attr: vi.fn().mockReturnThis() } as any;
  }

  it('sets path attributes for bf16 precision', () => {
    const sel = mockSelection();
    applyNormalState(sel, 'bf16');
    expect(sel.attr).toHaveBeenCalledWith('d', SHAPE_CONFIG.bf16.normal.d);
    expect(sel.attr).toHaveBeenCalledWith('stroke-width', STROKE_WIDTH);
  });

  it('sets rect attributes for fp8 precision', () => {
    const sel = mockSelection();
    applyNormalState(sel, 'fp8');
    expect(sel.attr).toHaveBeenCalledWith('x', SHAPE_CONFIG.fp8.normal.x);
    expect(sel.attr).toHaveBeenCalledWith('y', SHAPE_CONFIG.fp8.normal.y);
    expect(sel.attr).toHaveBeenCalledWith('width', SHAPE_CONFIG.fp8.normal.width);
    expect(sel.attr).toHaveBeenCalledWith('height', SHAPE_CONFIG.fp8.normal.height);
    expect(sel.attr).toHaveBeenCalledWith('stroke-width', STROKE_WIDTH);
  });

  it('sets circle attributes for default precision', () => {
    const sel = mockSelection();
    applyNormalState(sel, 'fp16');
    expect(sel.attr).toHaveBeenCalledWith('r', POINT_SIZE);
    expect(sel.attr).toHaveBeenCalledWith('stroke-width', STROKE_WIDTH);
  });

  it('sets diamond path for int4 precision', () => {
    const sel = mockSelection();
    applyNormalState(sel, 'int4');
    expect(sel.attr).toHaveBeenCalledWith('d', SHAPE_CONFIG.int4.normal.d);
  });
});

// ===========================================================================
// applyHoverState
// ===========================================================================
describe('applyHoverState', () => {
  function mockSelection() {
    return { attr: vi.fn().mockReturnThis() } as any;
  }

  it('sets hover path attributes for bf16', () => {
    const sel = mockSelection();
    applyHoverState(sel, 'bf16');
    expect(sel.attr).toHaveBeenCalledWith('d', SHAPE_CONFIG.bf16.hover.d);
    expect(sel.attr).toHaveBeenCalledWith('stroke-width', HOVER_STROKE_WIDTH);
  });

  it('sets hover rect attributes for fp8', () => {
    const sel = mockSelection();
    applyHoverState(sel, 'fp8');
    expect(sel.attr).toHaveBeenCalledWith('x', SHAPE_CONFIG.fp8.hover.x);
    expect(sel.attr).toHaveBeenCalledWith('width', SHAPE_CONFIG.fp8.hover.width);
    expect(sel.attr).toHaveBeenCalledWith('stroke-width', HOVER_STROKE_WIDTH);
  });

  it('sets hover circle attributes for default', () => {
    const sel = mockSelection();
    applyHoverState(sel, 'fp16');
    expect(sel.attr).toHaveBeenCalledWith('r', HOVER_POINT_SIZE);
    expect(sel.attr).toHaveBeenCalledWith('stroke-width', HOVER_STROKE_WIDTH);
  });
});

// ===========================================================================
// getShapeConfig — fp4 and other unmapped precisions
// ===========================================================================
describe('getShapeConfig — fp4 and precision edge cases', () => {
  it('returns default (circle) config for fp4 precision', () => {
    const config = getShapeConfig('fp4');
    expect(config).toBe(SHAPE_CONFIG.default);
    expect(config.type).toBe('circle');
  });

  it('each known precision returns a distinct config object', () => {
    const configs = new Set([
      getShapeConfig('bf16'),
      getShapeConfig('int4'),
      getShapeConfig('fp8'),
    ]);
    expect(configs.size).toBe(3);
  });

  it('bf16 uses path type (triangle), not rect or circle', () => {
    const config = getShapeConfig('bf16');
    expect(config.type).toBe('path');
    // Triangle path contains 3 points — verify it starts with M and has 2 L commands
    const normal = config.normal as { d: string; strokeWidth: number };
    expect(normal.d).toContain('L');
    expect(normal.d).toContain('Z');
  });

  it('int4 uses path type (diamond) distinct from bf16 triangle', () => {
    const config = getShapeConfig('int4');
    expect(config.type).toBe('path');
    // Diamond has 4 vertices with 3 L commands
    const normal = config.normal as { d: string; strokeWidth: number };
    const normalLCount = (normal.d.match(/L/g) || []).length;
    expect(normalLCount).toBe(3);
  });

  it('fp8 rect hover dimensions are larger than normal dimensions', () => {
    const config = getShapeConfig('fp8');
    const hover = config.hover as {
      x: number;
      y: number;
      width: number;
      height: number;
      strokeWidth: number;
    };
    const normal = config.normal as {
      x: number;
      y: number;
      width: number;
      height: number;
      strokeWidth: number;
    };
    expect(hover.width).toBeGreaterThan(normal.width);
    expect(hover.height).toBeGreaterThan(normal.height);
    // Hover position is further from origin (more negative)
    expect(hover.x).toBeLessThan(normal.x);
    expect(hover.y).toBeLessThan(normal.y);
  });
});

// ===========================================================================
// applyNormalState / applyHoverState — full int4 hover and fp4 fallback
// ===========================================================================
describe('applyNormalState / applyHoverState — additional coverage', () => {
  function mockSelection() {
    return { attr: vi.fn().mockReturnThis() } as any;
  }

  it('applyHoverState sets hover diamond path for int4', () => {
    const sel = mockSelection();
    applyHoverState(sel, 'int4');
    expect(sel.attr).toHaveBeenCalledWith('d', SHAPE_CONFIG.int4.hover.d);
    expect(sel.attr).toHaveBeenCalledWith('stroke-width', HOVER_STROKE_WIDTH);
  });

  it('applyNormalState treats fp4 as default circle', () => {
    const sel = mockSelection();
    applyNormalState(sel, 'fp4');
    expect(sel.attr).toHaveBeenCalledWith('r', POINT_SIZE);
    expect(sel.attr).toHaveBeenCalledWith('stroke-width', STROKE_WIDTH);
  });

  it('applyHoverState treats fp4 as default circle with hover radius', () => {
    const sel = mockSelection();
    applyHoverState(sel, 'fp4');
    expect(sel.attr).toHaveBeenCalledWith('r', HOVER_POINT_SIZE);
    expect(sel.attr).toHaveBeenCalledWith('stroke-width', HOVER_STROKE_WIDTH);
  });

  it('applyNormalState for fp8 sets all 5 rect attributes', () => {
    const sel = mockSelection();
    applyNormalState(sel, 'fp8');
    // fp8 rect needs x, y, width, height, stroke-width = 5 attr calls
    expect(sel.attr).toHaveBeenCalledTimes(5);
  });

  it('applyNormalState for bf16 sets path d and stroke-width (2 attr calls)', () => {
    const sel = mockSelection();
    applyNormalState(sel, 'bf16');
    expect(sel.attr).toHaveBeenCalledTimes(2);
  });

  it('applyNormalState for default circle sets r and stroke-width (2 attr calls)', () => {
    const sel = mockSelection();
    applyNormalState(sel, 'fp16');
    expect(sel.attr).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// logTickFormat — additional edge cases
// ===========================================================================
describe('logTickFormat — edge cases', () => {
  function mockScale(min: number, max: number) {
    return { domain: () => [min, max] } as any;
  }

  it('shows all labels at narrow zoom (logRange < 2) including non-powers-of-10', () => {
    // domain [100, 500] → logRange = log10(500) - log10(100) ≈ 0.7
    const formatter = logTickFormat(mockScale(100, 500));
    expect(formatter(150)).toBe(formatLargeNumber(150));
    expect(formatter(250)).toBe(formatLargeNumber(250));
    expect(formatter(350)).toBe(formatLargeNumber(350));
  });

  it('handles logRange just below 2 (domain [1, 99])', () => {
    // logRange ≈ 1.996 < 2, so all labels shown
    const formatter = logTickFormat(mockScale(1, 99));
    expect(formatter(50)).toBe(formatLargeNumber(50));
    expect(formatter(75)).toBe(formatLargeNumber(75));
  });

  it('handles very wide range (logRange > 4) showing only powers of 10', () => {
    // domain [1, 100000] → logRange = 5
    const formatter = logTickFormat(mockScale(1, 100_000));
    expect(formatter(10)).toBe(formatLargeNumber(10));
    expect(formatter(100)).toBe(formatLargeNumber(100));
    expect(formatter(1000)).toBe(formatLargeNumber(1000));
    expect(formatter(10_000)).toBe(formatLargeNumber(10_000));
    expect(formatter(100_000)).toBe(formatLargeNumber(100_000));
    // Non-powers are suppressed
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
    // domain [0.01, 1000] → logRange = 5
    const formatter = logTickFormat(mockScale(0.01, 1000));
    // 0.1 is 10^(-1), so it should be shown
    expect(formatter(0.1)).not.toBe('');
    // 0.5 is not a power of 10
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
    // 1001 / 1000 = 1.001 → toFixed(1) = "1.0k"
    expect(formatLargeNumber(1001)).toBe('1.0k');
  });

  it('formats 999999 (just below 1M boundary) in thousands', () => {
    // 999999 / 1000 = 999.999 → toFixed(1) = "1000.0k"
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
    // 0.5 is below 1000, delegates to formatNumber which calls toString
    expect(formatLargeNumber(0.5)).toBe('0.5');
  });
});
