import { describe, expect, it } from 'vitest';

/**
 * Extracted logic from useChartZoom's .filter() and .wheelDelta() for unit testing.
 * Mirrors the inline functions in useChartZoom.ts.
 */
function wheelFilter(event: { type: string; shiftKey: boolean; ctrlKey: boolean; button: number }) {
  if (event.type === 'wheel') return event.shiftKey && !event.ctrlKey;
  return !event.ctrlKey && !event.button;
}

function wheelDelta(event: { deltaY: number; deltaX: number; deltaMode: number }) {
  const delta = event.deltaY || event.deltaX;
  return -delta * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002);
}

describe('useChartZoom wheel filter', () => {
  it('rejects bare wheel (no modifier)', () => {
    expect(wheelFilter({ type: 'wheel', shiftKey: false, ctrlKey: false, button: 0 })).toBe(false);
  });

  it('accepts Shift+wheel', () => {
    expect(wheelFilter({ type: 'wheel', shiftKey: true, ctrlKey: false, button: 0 })).toBe(true);
  });

  it('rejects Ctrl+wheel (trackpad pinch — should fall through to browser zoom)', () => {
    expect(wheelFilter({ type: 'wheel', shiftKey: false, ctrlKey: true, button: 0 })).toBe(false);
  });

  it('rejects Shift+Ctrl+wheel (ambiguous — let browser handle)', () => {
    expect(wheelFilter({ type: 'wheel', shiftKey: true, ctrlKey: true, button: 0 })).toBe(false);
  });

  it('allows left-button mousedown', () => {
    expect(wheelFilter({ type: 'mousedown', shiftKey: false, ctrlKey: false, button: 0 })).toBe(
      true,
    );
  });

  it('rejects right-click', () => {
    expect(wheelFilter({ type: 'mousedown', shiftKey: false, ctrlKey: false, button: 2 })).toBe(
      false,
    );
  });

  it('rejects Ctrl+click (context menu on macOS)', () => {
    expect(wheelFilter({ type: 'mousedown', shiftKey: false, ctrlKey: true, button: 0 })).toBe(
      false,
    );
  });
});

describe('useChartZoom wheelDelta', () => {
  it('scroll down (deltaY > 0) zooms out', () => {
    expect(wheelDelta({ deltaY: 100, deltaX: 0, deltaMode: 0 })).toBeCloseTo(-0.2);
  });

  it('scroll up (deltaY < 0) zooms in', () => {
    expect(wheelDelta({ deltaY: -100, deltaX: 0, deltaMode: 0 })).toBeCloseTo(0.2);
  });

  it('falls back to deltaX when deltaY is 0 (macOS Shift+scroll axis swap)', () => {
    expect(wheelDelta({ deltaY: 0, deltaX: -120, deltaMode: 0 })).toBeCloseTo(0.24);
  });

  it('prefers deltaY when both are nonzero', () => {
    expect(wheelDelta({ deltaY: 50, deltaX: 120, deltaMode: 0 })).toBeCloseTo(-0.1);
  });

  it('handles deltaMode 1 (line-based scrolling)', () => {
    expect(wheelDelta({ deltaY: 3, deltaX: 0, deltaMode: 1 })).toBeCloseTo(-0.15);
  });

  it('handles deltaMode 2 (page-based scrolling)', () => {
    expect(wheelDelta({ deltaY: 1, deltaX: 0, deltaMode: 2 })).toBeCloseTo(-1);
  });
});
