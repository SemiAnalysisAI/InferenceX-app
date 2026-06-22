// @vitest-environment jsdom
/**
 * Integration tests for the ScatterGraph toggle decoration path.
 *
 * Core behavior under test: legend hw toggles, precision toggles, and color
 * changes restyle the existing SVG (opacity / fill / shape) WITHOUT tearing
 * down and rebuilding the chart structure — the ~300ms main-thread long task
 * behind the failing field INP. A rebuild is detected via a spy on
 * setupChartStructure, which every full chart render must call.
 */
import { act, createElement, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as d3 from 'd3';

import { setupChartStructure } from '@/lib/d3-chart/chart-setup';
import type { ChartDefinition, InferenceData } from '@/components/inference/types';

// ── Module mocks ───────────────────────────────────────────────────────────
vi.mock('@/lib/d3-chart/chart-setup', { spy: true });
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));
// The legend is React-rendered (covered elsewhere) — keep the tree light.
vi.mock('@/components/ui/chart-legend', () => ({ default: () => null }));

const inferenceState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@/components/inference/InferenceContext', () => ({
  useInference: () => inferenceState.current,
}));

const overlayState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@/components/unofficial-run-provider', () => ({
  useUnofficialRun: () => overlayState.current,
}));

import ScatterGraph from './ScatterGraph';

// ── Environment stubs ────────────────────────────────────────────────────────
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
const point = (hwKey: string, precision: string, x: number, y: number, tp: number): InferenceData =>
  ({ hwKey, precision, x, y, tp, conc: 16, framework: 'vllm' }) as unknown as InferenceData;

// h100 owns both axis extremes so hiding b200 / showing fp4 keeps the niced
// domains identical — exactly the toggle case that must not rebuild.
const POINTS: InferenceData[] = [
  point('h100', 'fp8', 1, 1, 1),
  point('h100', 'fp8', 100, 1000, 8),
  point('h100', 'fp4', 40, 400, 4),
  point('b200', 'fp8', 50, 500, 4),
  point('b200', 'fp8', 60, 600, 8),
];

const HARDWARE_CONFIG = {
  h100: { name: 'H100', label: 'H100', gpu: 'H100' },
  b200: { name: 'B200', label: 'B200', gpu: 'B200' },
};

const CHART_DEFINITION = { chartType: 'interactivity' } as unknown as ChartDefinition;

const noop = () => {};

function baseInferenceState() {
  return {
    activeHwTypes: new Set(['h100', 'b200']),
    hardwareConfig: HARDWARE_CONFIG,
    toggleHwType: noop,
    removeHwType: noop,
    hwTypesWithData: new Set(['h100', 'b200']),
    selectedPrecisions: ['fp8'],
    selectedYAxisMetric: 'y',
    quickFilters: { vendors: [], frameworks: [], disagg: [], spec: [] },
    availableQuickFilters: { vendors: [], frameworks: [], disagg: [], spec: [] },
    availableRuns: null,
    selectedRunId: '',
    hideNonOptimal: false,
    setHideNonOptimal: noop,
    hidePointLabels: false,
    setHidePointLabels: noop,
    selectAllHwTypes: noop,
    highContrast: false,
    setHighContrast: noop,
    logScale: false,
    setLogScale: noop,
    scaleType: 'auto',
    isLegendExpanded: false,
    setIsLegendExpanded: noop,
    useAdvancedLabels: false,
    setUseAdvancedLabels: noop,
    showGradientLabels: false,
    setShowGradientLabels: noop,
    showLineLabels: false,
    setShowLineLabels: noop,
    showSpeedOverlay: false,
    setShowSpeedOverlay: noop,
    showMinecraftOverlay: false,
    setShowMinecraftOverlay: noop,
    trackedConfigs: [],
    addTrackedConfig: noop,
    removeTrackedConfig: noop,
  };
}

function baseOverlayState() {
  return {
    isUnofficialRun: false,
    activeOverlayHwTypes: new Set<string>(),
    setActiveOverlayHwTypes: noop,
    allOverlayHwTypes: new Set<string>(),
    toggleOverlayHwType: noop,
    resetOverlayHwTypes: noop,
    localOfficialOverride: null,
    setLocalOfficialOverride: noop,
    runIndexByUrl: {},
    unofficialRunInfos: [],
  };
}

// ── Harness ──────────────────────────────────────────────────────────────────
function mountChart(props?: Partial<Parameters<typeof ScatterGraph>[0]>) {
  let forceUpdate: () => void = noop;
  function Harness() {
    // ScatterGraph and D3Chart are React.memo'd; mocked context hooks bypass
    // React's context subscription, so re-renders are driven through a
    // version-bumped caption prop.
    const [version, bump] = useReducer((v: number) => v + 1, 0);
    forceUpdate = bump;
    return createElement(ScatterGraph, {
      chartId: 'chart-test',
      modelLabel: 'DeepSeek-R1-0528',
      data: POINTS,
      xLabel: 'Interactivity (tok/s/user)',
      yLabel: 'Output Throughput per GPU',
      chartDefinition: CHART_DEFINITION,
      transitionDuration: 0,
      caption: `v${version}`,
      ...props,
    });
  }

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(Harness));
  });
  return {
    container,
    rerender: () => act(() => forceUpdate()),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const dotGroups = (container: HTMLElement, hwKey?: string) =>
  [...container.querySelectorAll<SVGGElement>('.dot-group')].filter(
    (n) => !hwKey || n.dataset.hwKey === hwKey,
  );

const rebuildCount = () => vi.mocked(setupChartStructure).mock.calls.length;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  // Charts measure their container; jsdom reports 0 — give them real space.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    right: 800,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  inferenceState.current = baseInferenceState();
  overlayState.current = baseOverlayState();
  vi.mocked(setupChartStructure).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ScatterGraph toggle decoration', () => {
  it('renders all points and rooflines after mount', () => {
    const { container, unmount } = mountChart();

    expect(dotGroups(container)).toHaveLength(POINTS.length);
    expect(container.querySelectorAll('.roofline-path').length).toBeGreaterThan(0);
    expect(rebuildCount()).toBeGreaterThan(0);
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

  it('rebuilds when the scale domain actually changes (data refresh path intact)', () => {
    const { rerender, unmount } = mountChart();
    const buildsAfterMount = rebuildCount();

    // Hiding the hw that owns the axis extremes changes the visible domain —
    // axes must rescale, which is a legitimate full render.
    inferenceState.current = {
      ...inferenceState.current,
      activeHwTypes: new Set(['b200']),
    };
    rerender();

    expect(rebuildCount()).toBeGreaterThan(buildsAfterMount);
    unmount();
  });

  it('animates rooflines together with dots on a domain-changing toggle', () => {
    // Real transition duration: the rebuild restores each surviving element to
    // its old position/path and schedules a "data-update" transition that only
    // starts on the next timer tick. Regression: the decoration effect used to
    // re-apply final roofline `d` attrs in the same commit, so the curve
    // teleported to its destination while the dots animated.
    const { container, rerender, unmount } = mountChart({ transitionDuration: 750 });

    const b200Roofline = () =>
      container.querySelector<SVGPathElement>('.roofline-path[data-hw-key="b200"]')!;
    const b200Dot = () => dotGroups(container, 'b200')[0];
    const dBefore = b200Roofline().getAttribute('d');
    const dotTransformBefore = b200Dot().getAttribute('transform');
    expect(dBefore).toBeTruthy();

    // Hide the extreme-owning hw → domains shrink → full render + animation.
    inferenceState.current = {
      ...inferenceState.current,
      activeHwTypes: new Set(['b200']),
    };
    rerender();

    // At commit end the transitions are scheduled but have not ticked: both
    // the roofline path and the dots must still sit at their OLD coordinates,
    // each with a pending transition toward the new ones.
    expect(b200Roofline().getAttribute('d')).toBe(dBefore);
    expect(b200Dot().getAttribute('transform')).toBe(dotTransformBefore);
    expect((b200Roofline() as unknown as { __transition?: object }).__transition).toBeTruthy();
    expect((b200Dot() as unknown as { __transition?: object }).__transition).toBeTruthy();

    // jsdom can't run the SVG transform interpolator (no transform.baseVal),
    // so cancel the scheduled transitions before teardown.
    d3.select(container).selectAll('.dot-group, .roofline-path').interrupt('data-update');
    unmount();
  });

  it('keeps unofficial-run overlay markers rendered through official toggles', () => {
    const overlayPoints = [point('h100', 'fp8', 30, 300, 2), point('h100', 'fp8', 35, 350, 4)].map(
      (p) => ({ ...p, run_url: 'https://github.com/o/r/actions/runs/123' }),
    );
    overlayState.current = {
      ...baseOverlayState(),
      isUnofficialRun: true,
      activeOverlayHwTypes: new Set(['h100']),
      allOverlayHwTypes: new Set(['h100']),
      runIndexByUrl: { 'https://github.com/o/r/actions/runs/123': 0 },
      unofficialRunInfos: [
        { id: '123', branch: 'test-branch', url: 'https://github.com/o/r/actions/runs/123' },
      ],
    };
    const { container, rerender, unmount } = mountChart({
      overlayData: {
        data: overlayPoints,
        hardwareConfig: HARDWARE_CONFIG,
      } as unknown as Parameters<typeof ScatterGraph>[0]['overlayData'],
    });
    const buildsAfterMount = rebuildCount();

    expect(container.querySelectorAll('.unofficial-overlay-pt')).toHaveLength(2);
    expect(container.querySelectorAll('.overlay-roofline-path').length).toBeGreaterThan(0);

    // Toggling an official hw must not rebuild or disturb overlay markers.
    inferenceState.current = {
      ...inferenceState.current,
      activeHwTypes: new Set(['h100']),
    };
    rerender();

    expect(container.querySelectorAll('.unofficial-overlay-pt')).toHaveLength(2);
    expect(rebuildCount()).toBe(buildsAfterMount);
    unmount();
  });

  it('applies quick filters to unofficial-run overlay markers', () => {
    const overlayPoints = [point('h100', 'fp8', 30, 300, 2), point('h100', 'fp8', 35, 350, 4)].map(
      (p) => ({ ...p, run_url: 'https://github.com/o/r/actions/runs/123' }),
    );
    overlayState.current = {
      ...baseOverlayState(),
      isUnofficialRun: true,
      activeOverlayHwTypes: new Set(['h100']),
      allOverlayHwTypes: new Set(['h100']),
      runIndexByUrl: { 'https://github.com/o/r/actions/runs/123': 0 },
      unofficialRunInfos: [
        { id: '123', branch: 'test-branch', url: 'https://github.com/o/r/actions/runs/123' },
      ],
    };
    // Overlay points are all NVIDIA (h100); an AMD-only quick filter must hide them,
    // exactly as it would the official points.
    inferenceState.current = {
      ...baseInferenceState(),
      quickFilters: { vendors: ['AMD'], frameworks: [], disagg: [], spec: [] },
    };
    const { container, unmount } = mountChart({
      overlayData: {
        data: overlayPoints,
        hardwareConfig: HARDWARE_CONFIG,
      } as unknown as Parameters<typeof ScatterGraph>[0]['overlayData'],
    });

    expect(container.querySelectorAll('.unofficial-overlay-pt')).toHaveLength(0);
    unmount();
  });
});
