// @vitest-environment jsdom
import * as d3 from 'd3';
import { describe, expect, it, vi } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import { renderOffloadHalo } from '@/components/inference/utils/offload-halo';
import { IdBitset } from '@/lib/benchmarks/benchmark-presence';

import {
  POINTS,
  baseInferenceState,
  dispatchAtPoint,
  inferenceState,
  mountChart,
  point,
  rebuildCount,
  presenceState,
  scatterPoints,
} from './ScatterGraph.test-harness';
import { pointLabelText } from './point-label';

vi.mock('@/lib/d3-chart/dynamic-margins', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  measureTextWidth: (text: string, font: string) =>
    text.length * Number.parseFloat(font.split(' ')[1]) * 0.58,
}));

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

    expect(pointLabelText(standard, true, false, true)).toBe('8\nC=16');
    expect(pointLabelText(mtp, true, false, true)).toBe('8\nC=16');
    expect(pointLabelText(eagle, true, false, true)).toBe('8\nC=16');
  });

  it('omits concurrency unless the advanced toggle enables it', () => {
    const standard = point('h100', 'fp8', 1, 1, 8);
    standard.benchmark_type = 'agentic_traces';
    standard.spec_decoding = 'none';

    expect(pointLabelText(standard, true, false, false)).toBe('8');
    expect(pointLabelText(standard, true, false, true)).toBe('8\nC=16');
  });

  it('keeps fixed-sequence labels unchanged', () => {
    const fixed = point('h100', 'fp8', 1, 1, 8);
    fixed.benchmark_type = 'single_turn';
    fixed.spec_decoding = 'mtp';

    expect(pointLabelText(fixed, true, false, true)).toBe('8\nC=16');
  });
});

describe('ScatterGraph toggle decoration', () => {
  it('renders all points and rooflines after mount', () => {
    const { container, unmount } = mountChart();

    expect(scatterPoints(container)).toHaveLength(POINTS.length);
    expect(container.querySelectorAll('.roofline-path').length).toBeGreaterThan(0);
    expect(rebuildCount()).toBeGreaterThan(0);
    unmount();
  });

  it('requests presence only when a persisted point is shown, fixed-sequence included', () => {
    const unpersisted = mountChart();
    expect(presenceState.enabled).toBe(false);
    unpersisted.unmount();

    const fixed = {
      ...point('h100', 'fp8', 10, 100, 1),
      id: 96255,
      benchmark_type: 'single_turn',
    } as InferenceData;
    const { unmount } = mountChart({ data: [fixed] });

    expect(presenceState.enabled).toBe(true);
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
    const { container, rerender, unmount } = mountChart({
      data: [standard, mtp, mtpWithOffload, fixedMtp],
    });
    const before = scatterPoints(container);

    expect(container.querySelector('.spec-decode-marker')).toBeNull();
    expect(before[1].halo).toBeNull();
    expect(before[2].halo).toBe('var(--foreground)');
    expect(container.querySelector('[data-testid="spec-decode-marker-key"]')).toBeNull();
    expect(container.querySelector('[data-testid="offload-halo-key"]')).toBeNull();
    expect(container.querySelector('[data-testid="agentic-optimization-note"]')).toBeNull();
    const builds = rebuildCount();
    inferenceState.current = { ...inferenceState.current, showOffloadingLabel: false };
    rerender();
    const hidden = scatterPoints(container);
    expect(hidden.map((entry) => entry.halo)).toEqual([null, null, null, null]);
    expect(hidden.map((entry) => [entry.key, entry.x, entry.y])).toEqual(
      before.map((entry) => [entry.key, entry.x, entry.y]),
    );
    expect(rebuildCount()).toBe(builds);
    inferenceState.current = { ...inferenceState.current, showOffloadingLabel: true };
    rerender();
    expect(scatterPoints(container).map((entry) => entry.halo)).toEqual([
      null,
      null,
      'var(--foreground)',
      null,
    ]);
    unmount();
  });

  it('reads current trace availability without changing metric identity', () => {
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
    const buildsAfterMount = rebuildCount();
    const layer = container.querySelector('.canvas-point-layer');
    const [target] = scatterPoints(container);

    dispatchAtPoint(container, 'click', target);
    expect(document.querySelector('[data-action="view-charts"]')).toBeNull();
    expect(target.attrs['has-trace']).toBeUndefined();

    presenceState.current = { trace: new IdBitset([42, 1]), log: new IdBitset([]) };
    rerender();
    expect(rebuildCount()).toBe(buildsAfterMount);
    expect(container.querySelector('.canvas-point-layer')).toBe(layer);
    expect(scatterPoints(container)[0].attrs['has-trace']).toBe('true');
    for (let click = 0; click < 2; click++) dispatchAtPoint(container, 'click', target);

    expect(document.querySelector('[data-action="view-charts"]')?.getAttribute('href')).toBe(
      '/infx/inference/agentic/42',
    );
    unmount();
  });

  it('does not measure point-label collisions while point labels are hidden', () => {
    inferenceState.current = {
      ...baseInferenceState(),
      showPointLabels: false,
    };
    let pointLabelMeasurements = 0;
    vi.spyOn(
      SVGElement.prototype as unknown as { getBBox: () => DOMRect },
      'getBBox',
    ).mockImplementation(function (this: SVGElement) {
      if (this.classList.contains('point-label')) pointLabelMeasurements++;
      return {
        x: 0,
        y: 0,
        width: 48,
        height: 12,
        top: 0,
        right: 48,
        bottom: 12,
        left: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    const { unmount } = mountChart();

    expect(pointLabelMeasurements).toBe(0);
    unmount();
  });

  it('keeps point-label visibility synchronized while the chart is empty', () => {
    const chartProps = { data: [] as InferenceData[] };
    inferenceState.current = {
      ...baseInferenceState(),
      showPointLabels: false,
    };
    const { container, rerender, unmount } = mountChart(chartProps);

    inferenceState.current = {
      ...inferenceState.current,
      showPointLabels: true,
    };
    rerender();
    chartProps.data = POINTS;
    rerender();
    const label = container.querySelector<SVGTextElement>('.point-label');
    expect(label?.style.display).toBe('');

    inferenceState.current = {
      ...inferenceState.current,
      showPointLabels: false,
    };
    rerender();
    expect(label?.isConnected).toBe(false);
    expect(container.querySelector('.point-label')).toBeNull();
    unmount();
  });

  it('rechecks point-label collisions when line-label obstacles change', () => {
    inferenceState.current = {
      ...baseInferenceState(),
      showPointLabels: true,
      showLineLabels: false,
    };
    const getBBox = vi.spyOn(
      SVGElement.prototype as unknown as { getBBox: () => DOMRect },
      'getBBox',
    );
    const { rerender, unmount } = mountChart();
    getBBox.mockClear();

    inferenceState.current = {
      ...inferenceState.current,
      showLineLabels: true,
    };
    rerender();

    expect(
      getBBox.mock.contexts.some(
        (element) => element instanceof SVGElement && element.classList.contains('point-label'),
      ),
    ).toBe(true);
    unmount();
  });

  it('updates each annotation while another keeps point labels visible', () => {
    inferenceState.current = {
      ...baseInferenceState(),
      showPointLabels: true,
    };
    const { container, rerender, unmount } = mountChart({
      data: [{ ...point('h100', 'fp8', 20, 200, 8), ep: 1 }],
    });
    const anchor = container.querySelector('.point-label-anchor');
    const buildsAfterMount = rebuildCount();
    const lines = () =>
      [...container.querySelectorAll('.point-label tspan')].map((span) => span.textContent);
    expect(lines()).toEqual(['8']);

    const changes = [
      { useAdvancedLabels: true, expected: ['8', 'TP8'] },
      { showConcurrencyLabels: true, expected: ['8', 'TP8', 'C=16'] },
      { useAdvancedLabels: false, expected: ['8', 'C=16'] },
      { showPointLabels: false, expected: ['C=16'] },
      { useAdvancedLabels: true, expected: ['TP8', 'C=16'] },
      { showConcurrencyLabels: false, expected: ['TP8'] },
    ];
    for (const { expected, ...change } of changes) {
      inferenceState.current = { ...inferenceState.current, ...change };
      rerender();
      expect(lines()).toEqual(expected);
      expect(container.querySelector('.point-label-anchor')).toBe(anchor);
      expect(rebuildCount()).toBe(buildsAfterMount);
    }
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

    const b200 = scatterPoints(container, 'b200');
    expect(b200.length).toBeGreaterThan(0);
    for (const entry of b200) {
      expect(entry.opacity).toBe(0);
      expect(entry.interactive).toBe(false);
    }
    const h100 = scatterPoints(container, 'h100').filter(
      (entry) => entry.attrs.precision === 'fp8',
    );
    expect(h100.length).toBeGreaterThan(0);
    for (const entry of h100) {
      expect(entry.opacity).toBe(1);
      expect(entry.interactive).toBe(true);
    }
    const b200Roofline = container.querySelector<SVGPathElement>(
      '.roofline-path[data-hw-key="b200"]',
    );
    expect(b200Roofline).not.toBeNull();
    expect(b200Roofline!.style.opacity).toBe('0');

    expect(rebuildCount()).toBe(buildsAfterMount);
    unmount();
  });

  it('clears the Pareto fade from every faded mark when the frontier is turned off', () => {
    inferenceState.current = { ...baseInferenceState(), showParetoFrontier: true };
    const { container, rerender, unmount } = mountChart({
      data: [...POINTS, point('h100', 'fp8', 70, 300, 2)],
    });
    const faded = () =>
      [...container.querySelectorAll<SVGElement>('svg *')].filter(
        (node) => node.style.filter !== '',
      );
    expect(faded().length).toBeGreaterThan(0);
    expect(scatterPoints(container, 'b200').every((entry) => entry.faded)).toBe(true);
    expect(scatterPoints(container, 'h100').some((entry) => entry.faded)).toBe(false);

    inferenceState.current = { ...inferenceState.current, showParetoFrontier: false };
    rerender();
    expect(faded()).toEqual([]);
    expect(scatterPoints(container).some((entry) => entry.faded)).toBe(false);
    unmount();
  });

  it('recolors remaining series when the active set changes, without rebuilding', () => {
    const { container, rerender, unmount } = mountChart();
    const buildsAfterMount = rebuildCount();
    const h100Fill = () => scatterPoints(container, 'h100')[0].color;
    const before = h100Fill();

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
    const fp4Dot = () =>
      scatterPoints(container, 'h100').find((entry) => entry.attrs.precision === 'fp4')!;

    expect(fp4Dot().opacity).toBe(0);
    expect(fp4Dot().shape).toBe('circle');

    inferenceState.current = {
      ...inferenceState.current,
      selectedPrecisions: ['fp8', 'fp4'],
    };
    rerender();

    expect(fp4Dot().opacity).toBe(1);
    expect(fp4Dot().shape).toBe('square');
    expect(rebuildCount()).toBe(buildsAfterMount);
    unmount();
  });

  it('updates scale-dependent geometry without rebuilding chart structure', () => {
    const { container, rerender, unmount } = mountChart();
    const buildsAfterMount = rebuildCount();
    const layer = container.querySelector('.canvas-point-layer');
    const b200Before = scatterPoints(container, 'b200')[0];

    inferenceState.current = {
      ...inferenceState.current,
      activeHwTypes: new Set(['b200']),
    };
    rerender();

    expect(rebuildCount()).toBe(buildsAfterMount);
    expect(container.querySelector('.canvas-point-layer')).toBe(layer);
    const b200After = scatterPoints(container, 'b200')[0];
    expect(b200After.key).toBe(b200Before.key);
    expect([b200After.x, b200After.y]).not.toEqual([b200Before.x, b200Before.y]);
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
    const before = scatterPoints(container);
    const buildsAfterMount = rebuildCount();

    expect(before).toHaveLength(2);
    expect([before[0].x, before[0].y]).not.toEqual([before[1].x, before[1].y]);

    chartProps.data = [datedPoint('2026-05-15', 30, 300), datedPoint('2026-06-15', 70, 700)];
    rerender();

    const after = scatterPoints(container);
    const pointsByDate = new Map(
      after.map((entry) => [(entry.datum as InferenceData).date, entry] as const),
    );
    expect(after.map((entry) => entry.key)).toEqual(before.map((entry) => entry.key));
    expect(pointsByDate.size).toBe(2);
    expect(pointsByDate.get('2026-05-15')?.datum).toMatchObject({ x: 30, y: 300 });
    expect(pointsByDate.get('2026-06-15')?.datum).toMatchObject({ x: 70, y: 700 });
    expect(pointsByDate.get('2026-05-15')?.x).not.toBe(pointsByDate.get('2026-06-15')?.x);
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
    const [before] = scatterPoints(container);
    const buildsAfterMount = rebuildCount();

    chartProps.data = [datedPoint('2026-06-15', 20, 200)];
    rerender();

    const [after] = scatterPoints(container);
    expect(after.key).toBe(before.key);
    expect((after.datum as InferenceData).date).toBe('2026-06-15');
    expect(rebuildCount()).toBe(buildsAfterMount);
    unmount();
  });

  it('updates rooflines and dots in the same domain-change phase', () => {
    const { container, rerender, unmount } = mountChart({ transitionDuration: 0 });
    const b200Roofline = container.querySelector<SVGPathElement>(
      '.roofline-path[data-hw-key="b200"]',
    )!;
    const b200Before = scatterPoints(container, 'b200')[0];
    const pathBefore = b200Roofline.getAttribute('d');

    inferenceState.current = {
      ...inferenceState.current,
      activeHwTypes: new Set(['b200']),
    };
    rerender();

    expect(b200Roofline.getAttribute('d')).not.toBe(pathBefore);
    const b200After = scatterPoints(container, 'b200')[0];
    expect([b200After.x, b200After.y]).not.toEqual([b200Before.x, b200Before.y]);
    unmount();
  });
});

function pointGroup() {
  const svg = d3.create('svg:svg');
  return svg.append('g') as unknown as d3.Selection<SVGGElement, InferenceData, null, undefined>;
}

function recordCount(root: Node, run: () => void): number {
  const observer = new MutationObserver(() => undefined);
  observer.observe(root, { attributes: true, childList: true, subtree: true });
  run();
  const count = observer.takeRecords().length;
  observer.disconnect();
  return count;
}

const offloaded = { offload_mode: 'on' } as InferenceData;

describe('offload halo decoration', () => {
  it('draws the offload halo', () => {
    const group = pointGroup();
    renderOffloadHalo(group, offloaded, 'red');

    expect(group.select('.offload-halo').attr('stroke')).toBe('red');
    expect(group.select('.offload-halo').attr('stroke-dasharray')).toBe('3 2');
  });

  it('writes nothing when re-rendered with the same state', () => {
    const group = pointGroup();
    renderOffloadHalo(group, offloaded, 'red');

    expect(recordCount(group.node()!, () => renderOffloadHalo(group, offloaded, 'red'))).toBe(0);
  });

  it('restyles and removes on real changes', () => {
    const group = pointGroup();
    renderOffloadHalo(group, offloaded, 'red');

    renderOffloadHalo(group, offloaded, 'blue');
    expect(group.select('.offload-halo').attr('stroke')).toBe('blue');

    renderOffloadHalo(group, { offload_mode: 'off' } as InferenceData, 'blue');
    expect(group.select('.offload-halo').empty()).toBe(true);
  });
});
