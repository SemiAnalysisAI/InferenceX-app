// @vitest-environment jsdom
import React, { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { useFirstChartRenderTiming } from './use-first-chart-render-timing';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics/analytics', () => ({ track }));

let container: HTMLDivElement;
let root: Root;

async function loadHook() {
  vi.resetModules();
  const timingModule = await import('./use-first-chart-render-timing');
  return timingModule.useFirstChartRenderTiming;
}

function Chart({ useTiming }: { useTiming: typeof useFirstChartRenderTiming }) {
  const ref = useRef<HTMLDivElement>(null);
  useTiming(ref);
  return <div ref={ref} data-testid="chart-root" />;
}

function drawPoint() {
  const point = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  point.setAttribute('class', 'dot-group');
  container.querySelector('[data-testid="chart-root"]')!.append(point);
}

beforeEach(() => {
  track.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useFirstChartRenderTiming', () => {
  it('waits for the first data point, then reports once with the time since navigation', async () => {
    const useTiming = await loadHook();
    vi.spyOn(performance, 'now').mockReturnValue(1234.6);
    act(() => root.render(<Chart useTiming={useTiming} />));
    expect(track).not.toHaveBeenCalled();

    await act(async () => {
      drawPoint();
      drawPoint();
      await Promise.resolve();
    });

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('inference_chart_rendered', {
      ms_since_navigation: 1235,
      soft_navigation: false,
      route: window.location.pathname,
    });
  });

  it('does not report again for later charts in the same navigation', async () => {
    const useTiming = await loadHook();
    act(() => root.render(<Chart useTiming={useTiming} />));
    await act(async () => {
      drawPoint();
      await Promise.resolve();
    });
    act(() => root.render(<Chart key="second" useTiming={useTiming} />));
    await act(async () => {
      drawPoint();
      await Promise.resolve();
    });

    expect(track).toHaveBeenCalledTimes(1);
  });

  it('reports again after a soft navigation, timed from that navigation', async () => {
    const useTiming = await loadHook();
    const { markNavigationStart } = await import('@/lib/analytics/navigation-timing');
    const now = vi.spyOn(performance, 'now').mockReturnValue(800);
    act(() => root.render(<Chart useTiming={useTiming} />));
    await act(async () => {
      drawPoint();
      await Promise.resolve();
    });

    window.history.pushState(null, '', '/inference/kimi-k3');
    now.mockReturnValue(60_000);
    markNavigationStart(window.location.pathname);
    now.mockReturnValue(60_420);
    await act(async () => {
      drawPoint();
      await Promise.resolve();
    });
    await act(async () => {
      drawPoint();
      await Promise.resolve();
    });

    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith('inference_chart_rendered', {
      ms_since_navigation: 420,
      soft_navigation: true,
      route: '/inference/kimi-k3',
    });
  });
});
