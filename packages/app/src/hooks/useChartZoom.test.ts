import { describe, expect, it } from 'vitest';

import { zoomEventFilter } from './useChartZoom';

/**
 * Extracted logic from useChartZoom's .wheelDelta() for unit testing.
 * Mirrors the inline function in useChartZoom.ts.
 */
function wheelDelta(event: { deltaY: number; deltaX: number; deltaMode: number }) {
  const delta = event.deltaY || event.deltaX;
  return -delta * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002);
}

describe('useChartZoom wheel and mouse filter', () => {
  it('rejects bare wheel (no modifier)', () => {
    expect(zoomEventFilter({ type: 'wheel', shiftKey: false, ctrlKey: false, button: 0 })).toBe(
      false,
    );
  });

  it('accepts Shift+wheel', () => {
    expect(zoomEventFilter({ type: 'wheel', shiftKey: true, ctrlKey: false, button: 0 })).toBe(
      true,
    );
  });

  it('rejects Ctrl+wheel (trackpad pinch — should fall through to browser zoom)', () => {
    expect(zoomEventFilter({ type: 'wheel', shiftKey: false, ctrlKey: true, button: 0 })).toBe(
      false,
    );
  });

  it('rejects Shift+Ctrl+wheel (ambiguous — let browser handle)', () => {
    expect(zoomEventFilter({ type: 'wheel', shiftKey: true, ctrlKey: true, button: 0 })).toBe(
      false,
    );
  });

  it('allows left-button mousedown', () => {
    expect(zoomEventFilter({ type: 'mousedown', shiftKey: false, ctrlKey: false, button: 0 })).toBe(
      true,
    );
  });

  it('rejects right-click', () => {
    expect(zoomEventFilter({ type: 'mousedown', shiftKey: false, ctrlKey: false, button: 2 })).toBe(
      false,
    );
  });

  it('rejects Ctrl+click (context menu on macOS)', () => {
    expect(zoomEventFilter({ type: 'mousedown', shiftKey: false, ctrlKey: true, button: 0 })).toBe(
      false,
    );
  });
});

describe('useChartZoom touch filter', () => {
  it('rejects a single-finger touchstart so the page can scroll', () => {
    expect(zoomEventFilter({ type: 'touchstart', touches: [{}] })).toBe(false);
  });

  it('rejects a touchstart with no touches', () => {
    expect(zoomEventFilter({ type: 'touchstart', touches: [] })).toBe(false);
    expect(zoomEventFilter({ type: 'touchstart' })).toBe(false);
  });

  it('accepts a two-finger touchstart (pinch / two-finger pan)', () => {
    expect(zoomEventFilter({ type: 'touchstart', touches: [{}, {}] })).toBe(true);
  });

  it('ignores ctrlKey/button on touch events (TouchEvent has no button)', () => {
    expect(zoomEventFilter({ type: 'touchstart', ctrlKey: true, touches: [{}, {}] })).toBe(true);
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
