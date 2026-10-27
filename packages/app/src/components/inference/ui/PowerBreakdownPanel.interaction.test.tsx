// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import { PowerXSurfaceProvider } from '@/components/inference/ui/powerx-surface';
import type { BenchmarkRow } from '@/lib/api/api';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { modelSystemPower } from '@/lib/power/modeled-system-power';

const RUN_URL = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/777/attempts/1';

vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));
vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));
vi.mock('@/hooks/useUrlState', () => ({
  useUrlState: () => ({ getUrlParam: () => null, setUrlParams: () => {} }),
}));
vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ resolveColor: (key: string) => `var(--${key})` }),
}));
vi.mock('@/providers/unofficial-run-provider', () => ({
  useUnofficialRun: () => ({
    runIndexByUrl: { [RUN_URL]: 2 },
    unofficialRunInfos: [
      { id: 1, branch: 'main', url: 'u1' },
      { id: 2, branch: 'powerx', url: 'u2' },
      { id: 777, branch: 'single-hue', url: RUN_URL },
    ],
  }),
}));
vi.mock('@/components/ui/chart-buttons', () => ({
  ChartButtons: () => <div data-testid="chart-buttons" />,
}));
// jsdom has no measured layout, so the chart shell is replaced by one that runs the
// panel's custom D3 layers against fixed scales; the layers' own output is what is tested.
vi.mock('@/lib/d3-chart/D3Chart', async () => {
  const ReactModule = await import('react');
  const d3 = await import('d3');
  const PLOT_WIDTH = 600;
  function D3Chart(props: {
    data: unknown[];
    height: number;
    margin: { top: number; right: number; bottom: number; left: number };
    xScale: { domain: [number, number] };
    yScale: { domain: [number, number] };
    layers: { render?: (group: unknown, ctx: unknown) => unknown }[];
    tooltip?: { content: (d: unknown, pinned: boolean) => string };
  }) {
    const svgRef = ReactModule.useRef<SVGSVGElement>(null);
    const tooltipRef = ReactModule.useRef<HTMLDivElement>(null);
    ReactModule.useLayoutEffect(() => {
      const svg = d3.select(svgRef.current!);
      let g = svg.select<SVGGElement>('g.root');
      if (g.empty()) {
        g = svg.append('g').attr('class', 'root');
        g.append('g').attr('class', 'zoom');
      }
      const zoomGroup = g.select<SVGGElement>('g.zoom');
      const width = PLOT_WIDTH - props.margin.left - props.margin.right;
      const height = props.height - props.margin.top - props.margin.bottom;
      const xScale = d3.scaleLinear().domain(props.xScale.domain).range([0, width]);
      const yScale = d3.scaleLinear().domain(props.yScale.domain).range([height, 0]).nice();
      const ctx = {
        layout: { svg, g, zoomGroup, width, height, margin: props.margin },
        tooltipElement: tooltipRef.current!,
        xScale,
        yScale,
        width,
        height,
      };
      for (const layer of props.layers) layer.render?.(zoomGroup, ctx);
      if (props.tooltip && tooltipRef.current) {
        tooltipRef.current.innerHTML = props.tooltip.content(props.data[0], false);
      }
    });
    return (
      <div>
        <svg ref={svgRef} data-testid="d3-chart-stub" data-margin-right={props.margin.right} />
        <div ref={tooltipRef} data-testid="tooltip-probe" />
      </div>
    );
  }
  return { D3Chart };
});

import PowerAnalysisPanels from './PowerAnalysisPanels';
import PowerBreakdownPanel, { layerStyle } from './PowerBreakdownPanel';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const metric = (y: number) => ({ y, roof: false });

const breakdownRow = (gpuWatts: number, framework: string) =>
  ({
    model: 'qwen3.5',
    hardware: 'b200',
    framework,
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc: 1,
    offload_mode: 'off',
    image: 'lmsysorg/sglang:v0.5.19-cu130',
    date: '2026-09-23',
    run_url: 'https://example.invalid/runs/900000001',
    metrics: {
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: gpuWatts,
      avg_total_gpu_power_w: gpuWatts * 8,
      median_intvty: 100,
    },
  }) as unknown as BenchmarkRow;

function point(
  id: number,
  hwKey: 'b200_sglang' | 'b200_vllm',
  conc: number,
  interactivity: number,
  watts: number,
  runUrl = 'https://example.invalid/runs/900000001',
): InferenceData {
  const framework = hwKey === 'b200_sglang' ? 'sglang' : 'vllm';
  return {
    id,
    hwKey,
    hw: 'B200',
    framework,
    model: 'dsv4pro',
    precision: 'fp8',
    physicalChips: 8,
    tp: 8,
    decode_tp: 8,
    conc,
    date: '2026-09-23',
    run_url: runUrl,
    benchmark_type: 'single_turn',
    disagg: false,
    x: interactivity,
    y: watts,
    mean_tpot_intvty: interactivity,
    median_intvty: interactivity,
    output_tput_per_gpu: 50,
    measuredAvgPower: metric(watts),
    measuredJPerOutputToken: metric(10),
    utilityModeledWatts: metric(1),
    modeledSystemPower: modelSystemPower(breakdownRow(watts, framework)),
  } as unknown as InferenceData;
}

const sglang = [
  point(1, 'b200_sglang', 64, 20, 640),
  point(2, 'b200_sglang', 16, 45, 520),
  point(3, 'b200_sglang', 4, 80, 380),
  point(4, 'b200_sglang', 1, 120, 250),
];
const vllm = [
  point(11, 'b200_vllm', 64, 30, 700),
  point(12, 'b200_vllm', 16, 60, 560),
  point(13, 'b200_vllm', 4, 100, 420),
  point(14, 'b200_vllm', 1, 150, 300),
];
const overlay = [
  point(21, 'b200_sglang', 64, 22, 660, RUN_URL),
  point(22, 'b200_sglang', 16, 48, 530, RUN_URL),
  point(23, 'b200_sglang', 4, 85, 390, RUN_URL),
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // The edge labels need a `sm` viewport; jsdom has no media queries or canvas text.
  window.matchMedia = ((query: string) => ({
    matches: query === '(min-width: 640px)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (element: React.ReactElement) => act(() => root.render(element));
const mouse = (element: Element, type: string, init: MouseEventInit = {}) =>
  act(() => {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
  });
const legendItems = () => [
  ...container.querySelectorAll<HTMLButtonElement>('[data-testid="power-breakdown-legend-item"]'),
];
const legendItem = (category: string) =>
  container.querySelector<HTMLButtonElement>(
    `[data-testid="power-breakdown-legend-item"][data-category="${category}"]`,
  )!;
const areas = () => [
  ...container.querySelectorAll<SVGPathElement>('[data-testid="power-breakdown-area"]'),
];
const area = (category: string) =>
  container.querySelector<SVGPathElement>(
    `[data-testid="power-breakdown-area"][data-category="${category}"]`,
  )!;
const endLabels = () => [
  ...container.querySelectorAll<SVGGElement>('[data-testid="power-breakdown-end-label"]'),
];

describe('PowerBreakdownPanel single-hue layers', () => {
  beforeEach(() => {
    render(
      <PowerBreakdownPanel
        chartId="chart-0"
        data={[...sglang, ...vllm]}
        xField="mean_tpot_intvty"
        xLabel="Interactivity (output tok/s/user)"
      />,
    );
  });

  it('draws every layer in the chip colour at a descending opacity step with a 1 px edge', () => {
    const paths = areas();
    expect(paths.length).toBeGreaterThanOrEqual(9);
    const categories = paths.map((path) => path.dataset.category);
    expect(categories[0]).toBe('gpu');
    expect(categories.at(-1)).toBe('facility');
    const opacities = paths.map((path) => Number(path.getAttribute('fill-opacity')));
    expect(opacities[0]).toBe(0.92);
    expect(opacities.at(-1)).toBe(0.14);
    for (let index = 1; index < opacities.length; index += 1) {
      expect(opacities[index]).toBeLessThan(opacities[index - 1]);
    }
    for (const path of paths) {
      expect(path.getAttribute('fill')).toBe('var(--b200_sglang)');
      expect(path.dataset.emphasis).toBe('plain');
      expect(path.getAttribute('opacity')).toBe('1');
    }
    const edges = [...container.querySelectorAll<SVGPathElement>('.breakdown-edge')];
    expect(edges).toHaveLength(paths.length);
    expect(edges[0].getAttribute('stroke')).toBe('var(--b200_sglang)');
    expect(edges[0].getAttribute('stroke-width')).toBe('1');
    expect(edges[0].getAttribute('stroke-opacity')).toBe('0.6');
    expect(container.querySelector('pattern')).toBeNull();
  });

  it('lists one legend row per layer in stack order, swatch and name only', () => {
    const items = legendItems();
    expect(items.map((item) => item.dataset.category)).toEqual(
      areas().map((path) => path.dataset.category),
    );
    expect(items[0].textContent).toBe('Measured GPU');
    expect(items.at(-1)?.textContent).toBe('Facility overhead');
    expect(items[0].querySelector('span[title]')?.getAttribute('title')).toContain('Measured');
    expect(items[1].querySelector('span[title]')?.getAttribute('title')).toContain('Modeled');
    expect((items[1].querySelector('span[title]') as HTMLElement).style.border).toContain('dashed');
    for (const item of items) expect(item.getAttribute('aria-pressed')).toBe('false');
  });

  it('raises the hovered legend layer and fades the rest, in the plot and the tooltip', () => {
    mouse(legendItem('nic'), 'mouseover');
    expect(area('nic').dataset.emphasis).toBe('highlighted');
    expect(area('nic').getAttribute('fill-opacity')).toBe('1');
    expect(area('nic').getAttribute('opacity')).toBe('1');
    expect(
      container.querySelector('.breakdown-edge[data-category="nic"]')?.getAttribute('stroke-width'),
    ).toBe('1.5');
    for (const path of areas().filter((candidate) => candidate !== area('nic'))) {
      expect(path.dataset.emphasis).toBe('faded');
      expect(path.getAttribute('opacity')).toBe('0.25');
    }
    expect(legendItem('gpu').dataset.emphasis).toBe('faded');
    expect(
      container.querySelector('[data-testid="tooltip-probe"] tr[data-category="nic"]')?.className,
    ).toContain('font-semibold');
    expect(
      container.querySelector('[data-testid="tooltip-probe"] tr[data-category="gpu"]')?.className,
    ).not.toContain('font-semibold');
    mouse(legendItem('nic'), 'mouseout');
    for (const path of areas()) expect(path.dataset.emphasis).toBe('plain');
  });

  it('pins on click, keeps the pin through hover-out, unpins on a second click or Escape', () => {
    mouse(legendItem('psuLoss'), 'click');
    expect(legendItem('psuLoss').getAttribute('aria-pressed')).toBe('true');
    expect(area('psuLoss').dataset.emphasis).toBe('highlighted');
    mouse(legendItem('psuLoss'), 'mouseout');
    mouse(legendItem('fans'), 'mouseover');
    expect(area('psuLoss').dataset.emphasis).toBe('highlighted');
    expect(area('fans').dataset.emphasis).toBe('faded');
    mouse(legendItem('psuLoss'), 'click');
    expect(legendItem('psuLoss').getAttribute('aria-pressed')).toBe('false');
    expect(area('psuLoss').dataset.emphasis).toBe('plain');

    mouse(legendItem('memory'), 'click');
    expect(legendItem('memory').getAttribute('aria-pressed')).toBe('true');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(legendItem('memory').getAttribute('aria-pressed')).toBe('false');
    for (const path of areas()) expect(path.dataset.emphasis).toBe('plain');
  });

  it('labels every layer at the right edge in stack order without overlap, widening the margin', () => {
    const labels = endLabels();
    expect(labels.map((label) => label.dataset.category)).toEqual(
      areas().map((path) => path.dataset.category),
    );
    expect(labels[0].querySelector('.breakdown-end-label-name')?.textContent).toBe('Measured GPU');
    expect(labels[0].querySelector('.breakdown-end-label-watts')?.textContent).toMatch(/^\d+ W$/u);
    const ys = labels.map((label) => Number(label.querySelector('text')?.getAttribute('y')));
    for (let index = 1; index < ys.length; index += 1) {
      expect(ys[index - 1] - ys[index]).toBeGreaterThanOrEqual(12);
    }
    const marginRight = Number(
      container.querySelector<HTMLElement>('[data-testid="d3-chart-stub"]')?.dataset.marginRight,
    );
    expect(marginRight).toBeGreaterThan(18);
    const textX = Number(labels[0].querySelector('text')?.getAttribute('x'));
    expect(textX + 'Facility overhead 999 W'.length * 6.2).toBeLessThanOrEqual(600 - 65 + 1);
    // Hovering an edge label highlights its layer like the legend does.
    mouse(labels[3], 'mouseenter');
    expect(area(labels[3].dataset.category!).dataset.emphasis).toBe('highlighted');
    mouse(labels[3], 'mouseleave');
    expect(area(labels[3].dataset.category!).dataset.emphasis).toBe('plain');
  });

  it('names the band under the pointer in the plot and labels it with its W/GPU', () => {
    const hit = container.querySelector<SVGRectElement>('[data-testid="power-breakdown-hit"]')!;
    // jsdom has no layout: the pointer reads as client coordinates in plot space.
    mouse(hit, 'mousemove', { clientX: 40, clientY: 380 - 40 - 56 - 2 });
    const label = container.querySelector<SVGElement>(
      '[data-testid="power-breakdown-cursor-label"]',
    );
    expect(label?.dataset.category).toBe('gpu');
    expect(label?.textContent).toMatch(/^Measured GPU · \d+ W$/u);
    expect(area('gpu').dataset.emphasis).toBe('highlighted');
    expect(legendItem('gpu').dataset.emphasis).toBe('highlighted');
    // Above the stack there is no band: nothing is highlighted.
    mouse(hit, 'mousemove', { clientX: 40, clientY: 1 });
    expect(container.querySelector('[data-testid="power-breakdown-cursor-label"]')).toBeNull();
    expect(area('gpu').dataset.emphasis).toBe('plain');
  });

  it('skips the edge labels below the sm breakpoint', () => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    act(() => root.unmount());
    root = createRoot(container);
    render(
      <PowerBreakdownPanel
        chartId="chart-1"
        data={[...sglang, ...vllm]}
        xField="mean_tpot_intvty"
        xLabel="Interactivity (output tok/s/user)"
      />,
    );
    expect(endLabels()).toHaveLength(0);
    expect(
      container.querySelector<HTMLElement>('[data-testid="d3-chart-stub"]')?.dataset.marginRight,
    ).toBe('18');
  });
});

describe('layerStyle', () => {
  it('describes the highlighted, faded and plain states', () => {
    expect(layerStyle('nic', 4, 12, { category: 'nic', pinned: true })).toEqual({
      emphasis: 'highlighted',
      fillOpacity: 1,
      opacity: 1,
      strokeWidth: 1.5,
      strokeOpacity: 1,
    });
    expect(layerStyle('gpu', 0, 12, { category: 'nic', pinned: false })).toMatchObject({
      emphasis: 'faded',
      fillOpacity: 0.92,
      opacity: 0.25,
      strokeWidth: 1,
    });
    expect(layerStyle('gpu', 0, 12, null)).toMatchObject({
      emphasis: 'plain',
      fillOpacity: 0.92,
      opacity: 1,
      strokeOpacity: 0.6,
    });
  });
});

describe('PowerBreakdownPanel unofficial-run overlays', () => {
  it('draws an overlay series in its run colour with the same ramp, pin and edge labels', () => {
    render(
      <PowerBreakdownPanel
        chartId="chart-2"
        data={[...sglang, ...overlay]}
        overlayData={overlay}
        selectedKey="b200_sglang|fp8|run2"
        xField="mean_tpot_intvty"
        xLabel="Interactivity (output tok/s/user)"
      />,
    );
    const paths = areas();
    expect(paths.length).toBeGreaterThanOrEqual(9);
    for (const path of paths) expect(path.getAttribute('fill')).toBe(overlayRunColor(2));
    expect(Number(paths[0].getAttribute('fill-opacity'))).toBe(0.92);
    expect(container.querySelector('.breakdown-edge')?.getAttribute('stroke')).toBe(
      overlayRunColor(2),
    );
    expect(endLabels()).toHaveLength(paths.length);
    expect(endLabels()[0].querySelector('line')?.getAttribute('stroke')).toBe(overlayRunColor(2));
    expect(
      (legendItem('gpu').querySelector('span[title]') as HTMLElement).style.backgroundColor,
    ).toContain('--overlay-run-2');
    mouse(legendItem('nic'), 'click');
    expect(area('nic').dataset.emphasis).toBe('highlighted');
    expect(legendItem('nic').getAttribute('aria-pressed')).toBe('true');
    // The official line is still its own, vendor-coloured series.
    const select = container.querySelector('[data-testid="power-breakdown-source"]');
    expect(select?.textContent).toContain('single-hue');
  });
});

describe('PowerChipCompare legend highlight', () => {
  it('lights the hovered part on every chip bar and in the open drill-down, and pins on click', () => {
    render(
      <PowerXSurfaceProvider>
        <PowerAnalysisPanels
          data={[...sglang, ...vllm]}
          xField="mean_tpot_intvty"
          xLabel="Interactivity (output tok/s/user)"
          chartId="chart-3"
          placement="before"
          layout="inline"
        />
      </PowerXSurfaceProvider>,
    );
    const item = container.querySelector<HTMLButtonElement>(
      '[data-testid="power-chip-compare-legend-item"][data-category="nic"]',
    )!;
    expect(item.textContent).toBe('NICs');
    expect(item.querySelector('span[title]')?.getAttribute('title')).toBe('Modeled');
    const segments = (category: string) => [
      ...container.querySelectorAll<HTMLElement>(
        `[data-testid="power-chip-compare-segment"][data-category="${category}"]`,
      ),
    ];
    expect(segments('nic')).toHaveLength(2);
    // Each chip's ramp runs over its own parts: GPU most opaque, in that chip's colour.
    const gpuSegment = segments('gpu')[0];
    expect(gpuSegment.style.backgroundColor).toContain('92%');
    expect(gpuSegment.style.backgroundColor).toContain('var(--b200_');
    mouse(item, 'mouseover');
    for (const segment of segments('nic')) {
      expect(segment.dataset.emphasis).toBe('highlighted');
      expect(segment.style.backgroundColor).toContain('100%');
    }
    for (const segment of segments('gpu')) {
      expect(segment.dataset.emphasis).toBe('faded');
      expect(segment.style.opacity).toBe('0.25');
    }
    expect(area('nic').dataset.emphasis).toBe('highlighted');
    expect(area('gpu').dataset.emphasis).toBe('faded');
    mouse(item, 'click');
    expect(item.getAttribute('aria-pressed')).toBe('true');
    mouse(item, 'mouseout');
    expect(area('nic').dataset.emphasis).toBe('highlighted');
    // Hovering a segment itself does not steal a pin; unpinning restores every part.
    mouse(segments('gpu')[0], 'mouseover');
    expect(segments('gpu')[0].dataset.emphasis).toBe('faded');
    mouse(item, 'click');
    expect(item.getAttribute('aria-pressed')).toBe('false');
    for (const segment of segments('gpu')) expect(segment.dataset.emphasis).toBe('plain');
    expect(area('gpu').dataset.emphasis).toBe('plain');
  });
});
