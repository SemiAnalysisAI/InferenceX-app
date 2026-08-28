import { act, createElement, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, vi } from 'vitest';

import { setupChartStructure } from '@/lib/d3-chart/chart-setup';
import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import { computeToggle } from '@/hooks/useTogglableSet';

vi.mock('@/lib/d3-chart/chart-setup', { spy: true });
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));

declare global {
  var __scatterLegendState: { current: Record<string, any> | null };
  var __scatterInferenceState: { current: Record<string, unknown> };
  var __scatterOverlayState: { current: Record<string, unknown> };
  var __scatterTraceAvailabilityState: { current: Record<number, boolean> | undefined };
  var __scatterLogAvailabilityState: { current: Record<number, boolean> | undefined };
}
const availabilityIdsGlobal = vi.hoisted(() => ({
  traceIds: [] as number[],
  logIds: [] as number[],
}));
vi.hoisted(() => {
  globalThis.__scatterLegendState = { current: null };
  globalThis.__scatterInferenceState = { current: {} };
  globalThis.__scatterOverlayState = { current: {} };
  globalThis.__scatterTraceAvailabilityState = { current: undefined };
  globalThis.__scatterLogAvailabilityState = { current: undefined };
});

vi.mock('@/components/ui/chart-legend', () => ({
  default: (props: Record<string, any>) => {
    globalThis.__scatterLegendState.current = props;
    return props.keyIndicators ?? null;
  },
}));
vi.mock('@/components/inference/InferenceContext', () => ({
  useInferenceActions: () => globalThis.__scatterInferenceState.current,
  useInferenceData: () => globalThis.__scatterInferenceState.current,
  useInferenceDisplay: () => globalThis.__scatterInferenceState.current,
  useInferenceFilters: () => globalThis.__scatterInferenceState.current,
}));
vi.mock('@/components/unofficial-run-provider', () => ({
  useUnofficialRun: () => globalThis.__scatterOverlayState.current,
}));

export const legendState = globalThis.__scatterLegendState;
export const inferenceState = globalThis.__scatterInferenceState;
export const logAvailabilityState = globalThis.__scatterLogAvailabilityState;
export const overlayState = globalThis.__scatterOverlayState;
export const traceAvailabilityState = globalThis.__scatterTraceAvailabilityState;
export const availabilityState = availabilityIdsGlobal;
vi.mock('@/hooks/api/use-trace-availability', () => ({
  useTraceAvailability: (ids: number[]) => {
    availabilityIdsGlobal.traceIds = ids ?? [];
    return { data: globalThis.__scatterTraceAvailabilityState.current, isPending: false };
  },
}));
vi.mock('@/hooks/api/use-log-availability', () => ({
  useLogAvailability: (ids: number[]) => {
    availabilityIdsGlobal.logIds = ids ?? [];
    return { data: globalThis.__scatterLogAvailabilityState.current, isPending: false };
  },
}));

import ScatterGraph from './ScatterGraph';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const originalGetBBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox');

export const point = (
  hwKey: string,
  precision: string,
  x: number,
  y: number,
  tp: number,
): InferenceData =>
  ({ hwKey, precision, x, y, tp, conc: 16, framework: 'vllm' }) as unknown as InferenceData;

export const POINTS: InferenceData[] = [
  point('h100', 'fp8', 1, 1, 1),
  point('h100', 'fp8', 100, 1000, 8),
  point('h100', 'fp4', 40, 400, 4),
  point('b200', 'fp8', 50, 500, 4),
  point('b200', 'fp8', 60, 600, 8),
];

export const HARDWARE_CONFIG = {
  h100: { name: 'H100', label: 'H100', gpu: 'H100' },
  b200: { name: 'B200', label: 'B200', gpu: 'B200' },
};

const CHART_DEFINITION = { chartType: 'interactivity' } as unknown as ChartDefinition;
export const noop = () => {};

export function baseInferenceState() {
  return {
    activeHwTypes: new Set(['h100', 'b200']),
    hardwareConfig: HARDWARE_CONFIG,
    toggleHwType: noop,
    removeHwType: noop,
    hwTypesWithData: new Set(['h100', 'b200']),
    resolveComparisonSelection: (proposed: Set<string>) => ({
      result: proposed,
      keptGroup: null,
      droppedGroups: [],
    }),
    toggleComparisonSelection: (prev: Set<string>, item: string, allItems: Set<string>) =>
      computeToggle(prev, item, allItems),
    selectedPrecisions: ['fp8'],
    selectedYAxisMetric: 'y',
    tokenRevenuePriceSource: 'normalized' as const,
    tokenRevenuePricing: {
      source: 'normalized' as const,
      inputPerMillion: 1,
      outputPerMillion: 1,
    },
    openRouterModelId: null,
    openRouterPricingLoading: false,
    openRouterPricingError: null,
    setTokenRevenuePriceSource: noop,
    quickFilters: { vendors: [], frameworks: [], deployment: [], spec: [] },
    availableQuickFilters: { vendors: [], frameworks: [], deployment: [], spec: [] },
    availableRuns: {},
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
    showConcurrencyLabels: false,
    setShowConcurrencyLabels: noop,
    showGradientLabels: false,
    setShowGradientLabels: noop,
    showLineLabels: false,
    setShowLineLabels: noop,
  };
}

export function baseOverlayState() {
  return {
    isUnofficialRun: false,
    activeOverlayHwTypes: new Set<string>(),
    allOverlayHwTypes: new Set<string>(),
    localOfficialOverride: null,
    setUnifiedOverlaySelection: noop,
    resetOverlaySelection: noop,
    runIndexByUrl: {},
    unofficialRunInfos: [],
  };
}

export function mountChart(props?: Partial<Parameters<typeof ScatterGraph>[0]>) {
  let forceUpdate: () => void = noop;
  function Harness() {
    const [version, bump] = useReducer((value: number) => value + 1, 0);
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
  act(() => root.render(createElement(Harness)));
  return {
    container,
    rerender: () => act(() => forceUpdate()),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

export const dotGroups = (container: HTMLElement, hwKey?: string) =>
  [...container.querySelectorAll<SVGGElement>('.dot-group')].filter(
    (node) => !hwKey || node.dataset.hwKey === hwKey,
  );

export const rebuildCount = () => vi.mocked(setupChartStructure).mock.calls.length;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: () =>
      ({
        x: 0,
        y: 0,
        width: 48,
        height: 12,
        top: 0,
        right: 48,
        bottom: 12,
        left: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  });
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
  legendState.current = null;
  traceAvailabilityState.current = undefined;
  logAvailabilityState.current = undefined;
  availabilityState.traceIds = [];
  availabilityState.logIds = [];
  vi.mocked(setupChartStructure).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalGetBBox) {
    Object.defineProperty(SVGElement.prototype, 'getBBox', originalGetBBox);
  } else {
    Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
  }
});

export { ScatterGraph };
