// @vitest-environment jsdom

import * as d3 from 'd3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { attachOverlayXMarkerHandlers } from './overlay-x-marker';
import {
  TOUCH_ONLY_QUERY,
  installTouchInputTracking,
  isTouchCompatMouseEvent,
  resetTouchInputTrackingForTests,
} from './touch-input';

const setHoverNone = (hoverNone: boolean, query = TOUCH_ONLY_QUERY) => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q === query ? hoverNone : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
};

const pointerEvent = (type: string, pointerType: string) => {
  const event = new Event(type, { bubbles: true }) as Event & { pointerType: string };
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  return event;
};

describe('isTouchCompatMouseEvent', () => {
  beforeEach(() => {
    installTouchInputTracking();
    resetTouchInputTrackingForTests();
    setHoverNone(false);
  });

  it('treats plain mouse hover on a hover-capable device as mouse input', () => {
    expect(isTouchCompatMouseEvent(new MouseEvent('mouseenter'))).toBe(false);
  });

  it('treats mouse events right after a touch as touch compatibility events', () => {
    document.dispatchEvent(new Event('touchstart', { bubbles: true }));
    expect(isTouchCompatMouseEvent(new MouseEvent('mouseenter'))).toBe(true);
  });

  it('treats mouse events after a touch pointerdown as touch compatibility events', () => {
    document.dispatchEvent(pointerEvent('pointerdown', 'touch'));
    expect(isTouchCompatMouseEvent(new MouseEvent('mousemove'))).toBe(true);
  });

  it('returns to mouse input once a real mouse moves on a hybrid device', () => {
    document.dispatchEvent(pointerEvent('pointerdown', 'touch'));
    document.dispatchEvent(pointerEvent('pointermove', 'mouse'));
    expect(isTouchCompatMouseEvent(new MouseEvent('mouseenter'))).toBe(false);
  });

  it('honors sourceCapabilities.firesTouchEvents', () => {
    const event = new MouseEvent('mouseenter');
    Object.defineProperty(event, 'sourceCapabilities', { value: { firesTouchEvents: true } });
    expect(isTouchCompatMouseEvent(event)).toBe(true);
  });

  it('treats touch-only devices as touch', () => {
    setHoverNone(true);
    expect(isTouchCompatMouseEvent(new MouseEvent('mouseenter'))).toBe(true);
  });

  it('keeps mouse hover in pointer-less environments that only report hover: none', () => {
    setHoverNone(true, '(hover: none)');
    expect(isTouchCompatMouseEvent(new MouseEvent('mouseenter'))).toBe(false);
  });
});

describe('attachOverlayXMarkerHandlers on touch', () => {
  let tooltipEl: HTMLDivElement;

  beforeEach(() => {
    installTouchInputTracking();
    resetTouchInputTrackingForTests();
    setHoverNone(false);
    document.body.innerHTML =
      '<svg><g class="pts"></g></svg><div id="tt" style="display:none"></div>';
    tooltipEl = document.querySelector('#tt') as HTMLDivElement;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const setup = () => {
    const pinTooltip = vi.fn();
    const points = d3
      .select(document.querySelector('.pts') as SVGGElement)
      .selectAll<SVGGElement, { id: number }>('g.pt')
      .data([{ id: 1 }])
      .join('g')
      .attr('class', 'pt');
    points.append('path').attr('class', 'marker');
    attachOverlayXMarkerHandlers(points as any, {
      markerSelector: '.marker',
      normalPath: 'M0 0',
      hoverPath: 'M1 1',
      tooltip: d3.select(tooltipEl),
      handle: { isPinned: () => false, pinTooltip },
      content: (_d, pinned) => (pinned ? 'pinned' : 'hover'),
      position: () => ({ left: 0, top: 0 }),
    });
    return { node: points.node() as SVGGElement, pinTooltip };
  };

  it('shows the hover tooltip for mouse hover', () => {
    const { node } = setup();
    node.dispatchEvent(new MouseEvent('mouseenter'));
    expect(tooltipEl.style.display).toBe('block');
    expect(tooltipEl.innerHTML).toBe('hover');
  });

  it('skips the hover tooltip for a tap and pins on the click', () => {
    const { node, pinTooltip } = setup();
    document.dispatchEvent(new Event('touchstart', { bubbles: true }));
    node.dispatchEvent(new MouseEvent('mouseenter'));
    expect(tooltipEl.style.display).toBe('none');
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(tooltipEl.innerHTML).toBe('pinned');
    expect(pinTooltip).toHaveBeenCalledWith({ id: 1 }, true);
  });
});
