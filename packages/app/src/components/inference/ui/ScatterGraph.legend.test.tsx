// @test-environment jsdom
import { act, createElement, Fragment, Suspense, use, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, mock } from 'bun:test';
import { settle } from '@/test/helpers';

import type { ChartDefinition } from '@/components/inference/types';
import { computeToggle } from '@/hooks/useTogglableSet';

import {
  POINTS,
  ScatterGraph,
  baseInferenceState,
  inferenceState,
  legendState,
} from './ScatterGraph.test-harness';

const actual = { ...(await import('@/lib/d3-chart/dynamic-margins')) };
mock.module('@/lib/d3-chart/dynamic-margins', () => ({
  ...actual,
  measureTextWidth: (text: string, font: string) =>
    text.length * Number.parseFloat(font.split(' ')[1]) * 0.58,
}));
const ALL = new Set(['h100', 'b200']);
const CHART_DEFINITION = {
  chartType: 'interactivity',
  y_roofline: 'lower_right',
} as unknown as ChartDefinition;

function Gate({ pending, hold }: { pending: Promise<void>; hold: boolean }) {
  if (hold) use(pending);
  return null;
}

const clickLegend = (hw: string) =>
  act(() =>
    legendState.current!.legendItems.find((item: { hw?: string }) => item.hw === hw).onClick(),
  );

/**
 * A provider whose toggle builds the next set from the set it rendered with, like
 * InferenceProvider. The gate keeps any selection other than the first one rendering, so a
 * deferred commit stays pending across the next click.
 */
function mount(initial: Set<string>) {
  const { promise, resolve } = Promise.withResolvers<void>();
  const committed: { current: Set<string> } = { current: initial };
  function Provider() {
    const [active, setActive] = useState(initial);
    inferenceState.current = {
      ...baseInferenceState(),
      activeHwTypes: active,
      toggleHwType: (hw: string) => setActive(computeToggle(active, hw, ALL)),
    };
    useLayoutEffect(() => {
      committed.current = active;
    });
    return createElement(
      Fragment,
      null,
      createElement(ScatterGraph, {
        chartId: 'chart-test',
        modelLabel: 'DeepSeek-R1-0528',
        data: POINTS,
        xLabel: 'Interactivity (tok/s/user)',
        yLabel: 'Output Throughput per GPU',
        chartDefinition: CHART_DEFINITION,
        transitionDuration: 0,
        caption: [...active].join(','),
      }),
      createElement(
        Suspense,
        { fallback: null },
        createElement(Gate, { pending: promise, hold: active !== initial }),
      ),
    );
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(createElement(Provider)));
  return {
    click: clickLegend,
    committed,
    release: async () => {
      resolve();
      await settle();
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('ScatterGraph legend toggles', () => {
  it('keeps both picks when a second toggle lands while the first one renders', async () => {
    const chart = mount(new Set(ALL));
    chart.click('h100');
    chart.click('b200');
    await chart.release();
    expect([...chart.committed.current].toSorted()).toEqual(['b200', 'h100']);
    chart.unmount();
  });

  it('adds then solos an inactive entry clicked twice in a row', async () => {
    const chart = mount(new Set(['h100']));
    chart.click('b200');
    chart.click('b200');
    await chart.release();
    expect([...chart.committed.current]).toEqual(['b200']);
    chart.unmount();
  });
});
