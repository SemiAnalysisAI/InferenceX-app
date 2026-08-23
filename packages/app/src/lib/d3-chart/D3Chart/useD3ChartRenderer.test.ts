// @vitest-environment jsdom
import * as d3 from 'd3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  animateTransitionGeometry,
  captureTransitionGeometry,
  createZoomFrameBatcher,
  metricRenderCallbackContext,
} from './useD3ChartRenderer';
import type { RenderContext } from './types';

function transitionDuration(element: SVGElement): number | undefined {
  return Object.values(
    (
      element as SVGElement & {
        __transition?: Record<string, { duration: number }>;
      }
    ).__transition ?? {},
  )[0]?.duration;
}

afterEach(() => {
  d3.select(document.body).selectAll('*').interrupt('data-update');
  document.body.innerHTML = '';
});

describe('createZoomFrameBatcher', () => {
  it('coalesces a burst and executes only its final transform work', () => {
    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const cancelFrame = vi.fn();
    const batcher = createZoomFrameBatcher(requestFrame, cancelFrame);
    const first = vi.fn();
    const final = vi.fn();

    batcher.schedule(first);
    batcher.schedule(final);

    expect(requestFrame).toHaveBeenCalledTimes(1);
    frames[0](16);
    expect(first).not.toHaveBeenCalled();
    expect(final).toHaveBeenCalledTimes(1);
  });

  it('cancels pending work and permits a later frame', () => {
    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const cancelFrame = vi.fn();
    const batcher = createZoomFrameBatcher(requestFrame, cancelFrame);
    const cancelled = vi.fn();
    const later = vi.fn();

    batcher.schedule(cancelled);
    batcher.cancel();
    batcher.schedule(later);

    expect(cancelFrame).toHaveBeenCalledWith(1);
    expect(requestFrame).toHaveBeenCalledTimes(2);
    frames[1](32);
    expect(cancelled).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledTimes(1);
  });

  it('flushes the latest pending work synchronously and cancels its frame', () => {
    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const cancelFrame = vi.fn();
    const batcher = createZoomFrameBatcher(requestFrame, cancelFrame);
    const first = vi.fn();
    const final = vi.fn();

    batcher.schedule(first);
    batcher.schedule(final);
    batcher.flush();

    expect(cancelFrame).toHaveBeenCalledWith(1);
    expect(first).not.toHaveBeenCalled();
    expect(final).toHaveBeenCalledTimes(1);
    frames[0](16);
    expect(final).toHaveBeenCalledTimes(1);
  });
});

describe('metricRenderCallbackContext', () => {
  it('keeps base scales for decorations and exposes the zoomed rendered scales', () => {
    const baseXScale = { id: 'base-x' };
    const baseYScale = { id: 'base-y' };
    const renderedXScale = { id: 'rendered-x' };
    const renderedYScale = { id: 'rendered-y' };
    const baseContext = {
      layout: {},
      tooltipElement: {},
      xScale: baseXScale,
      yScale: baseYScale,
      width: 400,
      height: 300,
    };

    const context = metricRenderCallbackContext(
      baseContext as unknown as RenderContext,
      renderedXScale as unknown as RenderContext['xScale'],
      renderedYScale as unknown as RenderContext['yScale'],
    );

    expect(context.xScale).toBe(baseXScale);
    expect(context.yScale).toBe(baseYScale);
    expect(context.renderedXScale).toBe(renderedXScale);
    expect(context.renderedYScale).toBe(renderedYScale);
  });
});

describe('coordinate transitions', () => {
  it('animates visible official and overlay geometry for 300ms while hidden marks snap', () => {
    const svg = d3.select(document.body).append('svg');
    const group = svg.append('g') as unknown as d3.Selection<SVGGElement, unknown, any, any>;
    const point = (className: string, opacity?: number) => {
      const selection = group
        .append('g')
        .attr('class', className)
        .attr('transform', 'translate(0,0)');
      if (opacity !== undefined) selection.style('opacity', opacity);
      return selection.node()!;
    };
    const roofline = (className: string, opacity?: number) => {
      const selection = group.append('path').attr('class', className).attr('d', 'M0,0L1,1');
      if (opacity !== undefined) selection.style('opacity', opacity);
      return selection.node()!;
    };
    const visibleOfficialPoint = point('dot-group');
    const hiddenOfficialPoint = point('dot-group', 0);
    const visibleOverlayPoint = point('unofficial-overlay-pt');
    const hiddenOverlayPoint = point('unofficial-overlay-pt', 0);
    const visibleOfficialRoofline = roofline('roofline-path');
    const hiddenOfficialRoofline = roofline('roofline-path', 0);
    const visibleOverlayRoofline = roofline('overlay-roofline-path');
    const hiddenOverlayRoofline = roofline('overlay-roofline-path', 0);
    const previous = captureTransitionGeometry(group);

    expect(previous.transforms.size).toBe(2);
    expect(previous.paths.size).toBe(2);

    for (const element of [
      visibleOfficialPoint,
      hiddenOfficialPoint,
      visibleOverlayPoint,
      hiddenOverlayPoint,
    ]) {
      element.setAttribute('transform', 'translate(100,100)');
    }
    for (const element of [
      visibleOfficialRoofline,
      hiddenOfficialRoofline,
      visibleOverlayRoofline,
      hiddenOverlayRoofline,
    ]) {
      element.setAttribute('d', 'M100,100L200,200');
    }

    animateTransitionGeometry(group, previous, 300);

    expect(visibleOfficialPoint.getAttribute('transform')).toBe('translate(0,0)');
    expect(visibleOverlayPoint.getAttribute('transform')).toBe('translate(0,0)');
    expect(hiddenOfficialPoint.getAttribute('transform')).toBe('translate(100,100)');
    expect(hiddenOverlayPoint.getAttribute('transform')).toBe('translate(100,100)');
    expect(visibleOfficialRoofline.getAttribute('d')).toBe('M0,0L1,1');
    expect(visibleOverlayRoofline.getAttribute('d')).toBe('M0,0L1,1');
    expect(hiddenOfficialRoofline.getAttribute('d')).toBe('M100,100L200,200');
    expect(hiddenOverlayRoofline.getAttribute('d')).toBe('M100,100L200,200');

    expect(transitionDuration(visibleOfficialPoint)).toBe(300);
    expect(transitionDuration(visibleOverlayPoint)).toBe(300);
    expect(transitionDuration(visibleOfficialRoofline)).toBe(300);
    expect(transitionDuration(visibleOverlayRoofline)).toBe(300);
    expect(transitionDuration(hiddenOfficialPoint)).toBeUndefined();
    expect(transitionDuration(hiddenOverlayPoint)).toBeUndefined();
    expect(transitionDuration(hiddenOfficialRoofline)).toBeUndefined();
    expect(transitionDuration(hiddenOverlayRoofline)).toBeUndefined();
  });
});
