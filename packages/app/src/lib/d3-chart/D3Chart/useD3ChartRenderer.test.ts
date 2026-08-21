import { describe, expect, it, vi } from 'vitest';

import { createZoomFrameBatcher, metricRenderCallbackContext } from './useD3ChartRenderer';
import type { RenderContext } from './types';

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
