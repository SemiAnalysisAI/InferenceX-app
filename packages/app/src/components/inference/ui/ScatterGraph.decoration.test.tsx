// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import {
  POINTS,
  baseInferenceState,
  dotGroups,
  inferenceState,
  mountChart,
  point,
  rebuildCount,
  traceAvailabilityState,
} from './ScatterGraph.test-harness';
import { pointLabelText } from './point-label';

const datedPoint = (date: string, x: number, y: number) => ({
  ...point('h100', 'fp8', x, y, 8),
  date,
});

describe('pointLabelText', () => {
  it('keeps decode mode out of mixed agentic point labels', () => {
    const standard = point('h100', 'fp8', 1, 1, 8);
    standard.benchmark_type = 'agentic_traces';
    standard.spec_decoding = 'none';
    const mtp = { ...standard, spec_decoding: 'mtp' };
    const eagle = { ...standard, spec_decoding: 'eagle' };

    expect(pointLabelText(standard, false)).toBe('8\nC=16');
    expect(pointLabelText(mtp, false)).toBe('8\nC=16');
    expect(pointLabelText(eagle, false)).toBe('8\nC=16');
  });

  it('keeps fixed-sequence labels unchanged', () => {
    const fixed = point('h100', 'fp8', 1, 1, 8);
    fixed.benchmark_type = 'single_turn';
    fixed.spec_decoding = 'mtp';

    expect(pointLabelText(fixed, false)).toBe('8\nC=16');
  });
});

describe('ScatterGraph toggle decoration', () => {
  it('renders all points and rooflines after mount', () => {
    const { container, unmount } = mountChart();

    expect(dotGroups(container)).toHaveLength(POINTS.length);
    expect(container.querySelectorAll('.roofline-path').length).toBeGreaterThan(0);
    expect(rebuildCount()).toBeGreaterThan(0);
    unmount();
  });

  it('keeps speculative decoding out of point decorations and shows only KV offload', () => {
    const standard = {
      ...point('h100', 'fp8', 1, 1, 1),
      benchmark_type: 'agentic_traces',
      spec_decoding: 'none',
      offload_mode: 'off',
    } as InferenceData;
    const mtp = {
      ...point('h100', 'fp8', 20, 200, 2),
      benchmark_type: 'agentic_traces',
      spec_decoding: 'mtp',
      offload_mode: 'off',
    } as InferenceData;
    const mtpWithOffload = {
      ...point('h100', 'fp8', 40, 400, 4),
      benchmark_type: 'agentic_traces',
      spec_decoding: 'mtp',
      offload_mode: 'on',
    } as InferenceData;
    const fixedMtp = {
      ...point('h100', 'fp8', 100, 1000, 8),
      benchmark_type: 'single_turn',
      spec_decoding: 'mtp',
      offload_mode: 'off',
    } as InferenceData;

    inferenceState.current = {
      ...baseInferenceState(),
      selectedSequence: 'agentic-traces',
    };
    const { container, unmount } = mountChart({
      data: [standard, mtp, mtpWithOffload, fixedMtp],
    });
    const groups = dotGroups(container);

    expect(container.querySelector('.spec-decode-marker')).toBeNull();
    expect(groups[1].querySelector('.offload-halo')).toBeNull();
    expect(groups[2].querySelector('.offload-halo')).not.toBeNull();
    expect(container.querySelector('[data-testid="spec-decode-marker-key"]')).toBeNull();
    expect(container.querySelector('[data-testid="offload-halo-key"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="agentic-optimization-note"]')).not.toBeNull();
    unmount();
  });

  it('refreshes point tooltip handlers when async trace availability resolves', () => {
    const agenticPoint = {
      ...point('h100', 'fp8', 20, 200, 2),
      id: 42,
      benchmark_type: 'agentic_traces',
    } as InferenceData;
    inferenceState.current = {
      ...baseInferenceState(),
      selectedSequence: 'agentic-traces',
    };
    const { container, rerender, unmount } = mountChart({ data: [agenticPoint] });
    const dot = container.querySelector<SVGGElement>('.dot-group')!;

    act(() =>
      dot.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 20, clientY: 20 })),
    );
    expect(document.querySelector('[data-action="view-charts"]')).toBeNull();

    traceAvailabilityState.current = { 42: true };
    rerender();
    act(() =>
      dot.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 20, clientY: 20 })),
    );

    expect(document.querySelector('[data-action="view-charts"]')?.getAttribute('href')).toBe(
      '/inference/agentic/42',
    );
    unmount();
  });

  it('hides a toggled-off hw via opacity without rebuilding the chart', () => {
    const { container, rerender, unmount } = mountChart();
    const buildsAfterMount = rebuildCount();

    inferenceState.current = {
      ...inferenceState.current,
      activeHwTypes: new Set(['h100']),
    };
    rerender();

    for (const dot of dotGroups(container, 'b200')) {
      expect(dot.style.opacity).toBe('0');
      expect(dot.style.pointerEvents).toBe('none');
    }
    for (const dot of dotGroups(container, 'h100').filter((d) => d.dataset.precision === 'fp8')) {
      expect(dot.style.opacity).toBe('1');
      expect(dot.style.pointerEvents).toBe('auto');
    }
    const b200Roofline = container.querySelector<SVGPathElement>(
      '.roofline-path[data-hw-key="b200"]',
    );
    expect(b200Roofline).not.toBeNull();
    expect(b200Roofline!.style.opacity).toBe('0');

    // The whole point: a legend toggle is a restyle, not a teardown/rebuild.
    expect(rebuildCount()).toBe(buildsAfterMount);
    unmount();
  });

  it('recolors remaining series when the active set changes, without rebuilding', () => {
    const { container, rerender, unmount } = mountChart();
    const buildsAfterMount = rebuildCount();
    const h100Fill = () =>
      dotGroups(container, 'h100')[0].querySelector('.visible-shape')!.getAttribute('fill');
    const before = h100Fill();

    // h100 and b200 share the NVIDIA hue zone: dropping one redistributes
    // the remaining hues (dynamic-colors), so the dots must actually recolor.
    inferenceState.current = {
      ...inferenceState.current,
      activeHwTypes: new Set(['h100']),
    };
    rerender();

    expect(h100Fill()).not.toBe(before);
    expect(rebuildCount()).toBe(buildsAfterMount);
    unmount();
  });

  it('swaps point shapes when a second precision is selected, without rebuilding', () => {
    const { container, rerender, unmount } = mountChart();
    const buildsAfterMount = rebuildCount();
    const fp4Dot = () => dotGroups(container, 'h100').find((d) => d.dataset.precision === 'fp4')!;

    // Single precision: fp4 points are hidden circles.
    expect(fp4Dot().style.opacity).toBe('0');
    expect(fp4Dot().querySelector('.visible-shape')!.tagName.toLowerCase()).toBe('circle');

    inferenceState.current = {
      ...inferenceState.current,
      selectedPrecisions: ['fp8', 'fp4'],
    };
    rerender();

    // Second precision becomes visible as the square shape (slot 2).
    expect(fp4Dot().style.opacity).toBe('1');
    const shape = fp4Dot().querySelector<SVGElement>('.visible-shape')!;
    expect(shape.tagName.toLowerCase()).toBe('rect');
    expect(shape.dataset.shapeKey).toBe('square');
    expect(rebuildCount()).toBe(buildsAfterMount);
    unmount();
  });

  it('updates scale-dependent geometry without rebuilding chart structure', () => {
    const { container, rerender, unmount } = mountChart();
    const buildsAfterMount = rebuildCount();
    const b200Dot = dotGroups(container, 'b200')[0];
    const transformBefore = b200Dot.getAttribute('transform');

    inferenceState.current = {
      ...inferenceState.current,
      activeHwTypes: new Set(['b200']),
    };
    rerender();

    expect(rebuildCount()).toBe(buildsAfterMount);
    expect(dotGroups(container, 'b200')[0]).toBe(b200Dot);
    expect(b200Dot.getAttribute('transform')).not.toBe(transformBefore);
    unmount();
  });

  it('keeps identical configs from different dates distinct during metric updates', () => {
    const chartProps = {
      data: [datedPoint('2026-05-15', 20, 200), datedPoint('2026-06-15', 80, 800)],
      xExtentOverride: [0, 100] as [number, number],
      yExtentOverride: [0, 1000] as [number, number],
      transitionDuration: 0,
    };
    const { container, rerender, unmount } = mountChart(chartProps);
    const groups = dotGroups(container);
    const buildsAfterMount = rebuildCount();

    expect(groups).toHaveLength(2);
    expect(groups[0].getAttribute('transform')).not.toBe(groups[1].getAttribute('transform'));

    chartProps.data = [datedPoint('2026-05-15', 30, 300), datedPoint('2026-06-15', 70, 700)];
    rerender();

    const updatedGroups = dotGroups(container);
    const pointsByDate = new Map(
      updatedGroups.map((group) => {
        const datum = (group as SVGGElement & { __data__: InferenceData }).__data__;
        return [datum.date, { datum, transform: group.getAttribute('transform') }] as const;
      }),
    );
    expect(updatedGroups).toEqual(groups);
    expect(pointsByDate.size).toBe(2);
    expect(pointsByDate.get('2026-05-15')?.datum).toMatchObject({ x: 30, y: 300 });
    expect(pointsByDate.get('2026-06-15')?.datum).toMatchObject({ x: 70, y: 700 });
    expect(pointsByDate.get('2026-05-15')?.transform).not.toBe(
      pointsByDate.get('2026-06-15')?.transform,
    );
    expect(rebuildCount()).toBe(buildsAfterMount);
    unmount();
  });

  it('refreshes bound metadata when a single-date series advances at fixed coordinates', () => {
    const chartProps = {
      data: [datedPoint('2026-05-15', 20, 200)],
      xExtentOverride: [0, 100] as [number, number],
      yExtentOverride: [0, 1000] as [number, number],
      transitionDuration: 0,
    };
    const { container, rerender, unmount } = mountChart(chartProps);
    const group = dotGroups(container)[0];
    const buildsAfterMount = rebuildCount();

    chartProps.data = [datedPoint('2026-06-15', 20, 200)];
    rerender();

    const updatedGroup = dotGroups(container)[0];
    const datum = (updatedGroup as SVGGElement & { __data__: InferenceData }).__data__;
    expect(updatedGroup).toBe(group);
    expect(datum.date).toBe('2026-06-15');
    expect(rebuildCount()).toBe(buildsAfterMount);
    unmount();
  });

  it('updates rooflines and dots in the same domain-change phase', () => {
    const { container, rerender, unmount } = mountChart({ transitionDuration: 0 });
    const b200Roofline = container.querySelector<SVGPathElement>(
      '.roofline-path[data-hw-key="b200"]',
    )!;
    const b200Dot = dotGroups(container, 'b200')[0];
    const pathBefore = b200Roofline.getAttribute('d');
    const transformBefore = b200Dot.getAttribute('transform');

    inferenceState.current = {
      ...inferenceState.current,
      activeHwTypes: new Set(['b200']),
    };
    rerender();

    expect(b200Roofline.getAttribute('d')).not.toBe(pathBefore);
    expect(b200Dot.getAttribute('transform')).not.toBe(transformBefore);
    unmount();
  });
});
