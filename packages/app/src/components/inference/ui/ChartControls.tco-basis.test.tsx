// @vitest-environment jsdom

import React, { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Model, Sequence } from '@/lib/catalog/data-mappings';

import type InferenceChartControls from './ChartControls';

const mocks = vi.hoisted(() => ({ inference: { current: {} as Record<string, unknown> } }));

vi.mock('@/components/inference/InferenceContext', () => ({
  useInferenceActions: () => mocks.inference.current,
  useInferenceData: () => mocks.inference.current,
  useInferenceDisplay: () => mocks.inference.current,
  useInferenceFilters: () => mocks.inference.current,
}));
vi.mock('@/components/ui/tco-basis-toggle', () => ({
  TcoBasisToggle: () => <div data-testid="tco-basis-toggle" />,
}));
vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));
vi.mock('@/lib/runtime/use-feature-gate', () => ({ useFeatureGate: () => false }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Controls = typeof InferenceChartControls;

function inferenceState(overrides: Record<string, unknown>) {
  const noop = vi.fn();
  return {
    selectedModel: Model.DeepSeek_V4_Pro,
    selectedSequence: Sequence.OneK_OneK,
    selectedPrecisions: ['fp4'],
    selectedGPUs: [],
    selectedDateRange: { startDate: '', endDate: '' },
    quickFilters: { power: [] },
    graphs: [],
    availableGPUs: [],
    dateRangeAvailableDates: [],
    isCheckingAvailableDates: false,
    availablePrecisions: ['fp4'],
    availableSequences: [Sequence.OneK_OneK, Sequence.AgenticTraces],
    availableModels: [Model.DeepSeek_V4_Pro, Model.Qwen3_5],
    selectedYAxisMetric: 'y_costh',
    tokenRevenuePriceSource: 'normalized',
    tokenRevenuePricing: null,
    openRouterModelId: null,
    openRouterPricingLoading: false,
    openRouterPricingError: null,
    selectedXAxisMetric: undefined,
    selectedXAxisMode: 'interactivity',
    defaultXAxisMode: 'interactivity',
    selectedPercentile: 'p90',
    fixedSequenceStatistic: 'median',
    scaleType: 'auto',
    powerCompare: 'none',
    setSelectedModel: noop,
    setSelectedSequence: noop,
    setSelectedPrecisions: noop,
    setSelectedYAxisMetric: noop,
    setTokenRevenuePriceSource: noop,
    setSelectedGPUs: noop,
    setSelectedDateRange: noop,
    setSelectedXAxisMetric: noop,
    setSelectedXAxisMode: noop,
    setFixedSequenceStatistic: noop,
    setScaleType: noop,
    setPowerCompare: noop,
    ...overrides,
  };
}

// The selector scope is a build-time flag read when the modules load, so each case reloads them.
async function loadChartControls(scope?: 'always'): Promise<Controls> {
  if (scope) vi.stubEnv('NEXT_PUBLIC_TCO_BASIS_SELECTOR', scope);
  vi.resetModules();
  const module = await import('./ChartControls');
  return module.default;
}

function chartConfigGrid(element: ParentNode): HTMLElement {
  return element.querySelector<HTMLElement>('[data-testid="inference-chart-configuration"] > div')!;
}

function serverGrid(markup: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return chartConfigGrid(host);
}

function slotAfterYAxis(grid: HTMLElement): Element | null {
  return grid
    .querySelector('[data-testid="yaxis-metric-selector"]')!
    .closest(String.raw`.space-y-1\.5`)!.nextElementSibling;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
});

function mount(ChartControls: Controls, props: ComponentProps<Controls>) {
  act(() => root.render(<ChartControls {...props} />));
  return chartConfigGrid(container);
}

describe('ChartControls TCO basis selector scope', () => {
  it('adds the TCO column only while the scoped toggle is visible', async () => {
    const ChartControls = await loadChartControls();
    mocks.inference.current = inferenceState({
      selectedModel: Model.Qwen3_5,
      selectedSequence: Sequence.EightK_OneK,
    });
    const server = serverGrid(renderToStaticMarkup(<ChartControls showXAxisMode showTcoBasis />));
    expect(server.className).not.toContain('xl:grid-cols');
    expect(server.querySelector('[aria-hidden="true"].hidden')).toBeNull();

    const grid = mount(ChartControls, { showXAxisMode: true, showTcoBasis: true });
    expect(grid.className).toContain('xl:grid-cols-[11rem_minmax(0,1fr)_10rem]');
    expect(slotAfterYAxis(grid)?.querySelector('[data-testid="tco-basis-toggle"]')).not.toBeNull();

    mocks.inference.current = inferenceState({ selectedModel: Model.DeepSeek_V4_Pro });
    const hidden = mount(ChartControls, { showXAxisMode: true, showTcoBasis: true });
    expect(hidden.querySelector('[data-testid="tco-basis-toggle"]')).toBeNull();
    expect(hidden.className).not.toContain('xl:grid-cols');
  });

  it('reserves the xl column before mount so the toggle never resizes the Y-axis', async () => {
    const ChartControls = await loadChartControls('always');
    mocks.inference.current = inferenceState({ selectedModel: Model.DeepSeek_V4_Pro });
    const server = serverGrid(renderToStaticMarkup(<ChartControls showXAxisMode />));
    expect(server.className).toContain('xl:grid-cols-[11rem_minmax(0,1fr)_10rem]');
    expect(slotAfterYAxis(server)?.outerHTML).toBe(
      '<div aria-hidden="true" class="hidden xl:block"></div>',
    );

    const grid = mount(ChartControls, { showXAxisMode: true });
    expect(grid.className).toBe(server.className);
    expect(slotAfterYAxis(grid)?.querySelector('[data-testid="tco-basis-toggle"]')).not.toBeNull();
    expect(grid.querySelector('[aria-hidden="true"].hidden')).toBeNull();
  });

  it('keeps the reserved column empty for metrics without a cost', async () => {
    const ChartControls = await loadChartControls('always');
    mocks.inference.current = inferenceState({ selectedYAxisMetric: 'y_tpPerGpu' });
    const grid = mount(ChartControls, { showXAxisMode: true });

    expect(grid.className).toContain('xl:grid-cols-[11rem_minmax(0,1fr)_10rem]');
    expect(grid.querySelector('[data-testid="tco-basis-toggle"]')).toBeNull();
    expect(slotAfterYAxis(grid)?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the wider AgentX axis column when reserving the TCO column', async () => {
    const ChartControls = await loadChartControls('always');
    mocks.inference.current = inferenceState({ selectedSequence: Sequence.AgenticTraces });
    const grid = mount(ChartControls, { showXAxisMode: true });

    expect(grid.className).toContain('sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]');
    expect(grid.className).toContain('xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_10rem]');
  });

  it('shows the toggle without reserving a column outside the inference view', async () => {
    const ChartControls = await loadChartControls('always');
    mocks.inference.current = inferenceState({});
    const grid = mount(ChartControls, {});

    expect(grid.className).not.toContain('xl:grid-cols');
    expect(grid.querySelector('[data-testid="tco-basis-toggle"]')).not.toBeNull();
    expect(grid.querySelector('[aria-hidden="true"].hidden')).toBeNull();
  });
});
