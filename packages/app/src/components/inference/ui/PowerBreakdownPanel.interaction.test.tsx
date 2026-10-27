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

const track = vi.hoisted(() => vi.fn());
// The locale and the pointer type are flipped per test: zh copy, touch scrub.
const env = vi.hoisted(() => ({ locale: 'en' as 'en' | 'zh', coarsePointer: false }));
vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => env.locale }));
vi.mock('@/lib/analytics/analytics', () => ({ track }));
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
import PowerBreakdownPanel, {
  layerStyle,
  nearestColumnIndex,
  swatchStyle,
} from './PowerBreakdownPanel';
import { COARSE_POINTER_QUERY } from '@/hooks/useMediaQuery';

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
  env.locale = 'en';
  env.coarsePointer = false;
  // jsdom has no media queries (pointer type) or canvas text (the cursor label's width).
  window.matchMedia = ((query: string) => ({
    matches: env.coarsePointer && query === COARSE_POINTER_QUERY,
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
/** A finger (or a mouse, when said so) on the plot: jsdom reads client x as plot x. */
const pointer = (element: Element, type: string, init: PointerEventInit = {}) =>
  act(() => {
    element.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
        ...init,
      }),
    );
  });
const legendItems = () => [
  ...container.querySelectorAll<HTMLButtonElement>('[data-testid="power-breakdown-legend-item"]'),
];
const legendItem = (band: string) =>
  container.querySelector<HTMLButtonElement>(
    `[data-testid="power-breakdown-legend-item"][data-band="${band}"]`,
  )!;
const swatch = (item: HTMLElement) => item.querySelector('span[title]') as HTMLElement;
const swatchOf = (part: HTMLElement) => part.querySelector('span') as HTMLElement;
const areas = () => [
  ...container.querySelectorAll<SVGPathElement>('[data-testid="power-breakdown-area"]'),
];
const area = (band: string) =>
  container.querySelector<SVGPathElement>(
    `[data-testid="power-breakdown-area"][data-band="${band}"]`,
  )!;
const pattern = (band: string) =>
  container.querySelector<SVGPatternElement>(`pattern.breakdown-hatch[data-band="${band}"]`);
const endLabels = () => [
  ...container.querySelectorAll<SVGGElement>('[data-testid="power-breakdown-end-label"]'),
];
const partRows = () => [
  ...container.querySelectorAll<HTMLButtonElement>('[data-testid="power-part-row"]'),
];
const partRow = (category: string) =>
  container.querySelector<HTMLButtonElement>(
    `[data-testid="power-part-row"][data-category="${category}"]`,
  )!;
const rowPoint = (row: HTMLElement) =>
  row.querySelector('[data-testid="power-chip-compare-point"]')?.textContent;

/** The B200 fixture's layers: no Grace socket on HGX; the facility counted off PowerX. */
const LAYERS = ['gpu', 'server', 'fansPsu', 'network', 'facility'];

describe('PowerBreakdownPanel six-layer breakdown', () => {
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

  it('draws the layers in the chip colour at fixed opacity steps, modeled layers hatched', () => {
    const paths = areas();
    expect(paths.map((path) => path.dataset.band)).toEqual(LAYERS);
    // Measured: the chip colour at its step. Modeled: that layer's own hatch pattern.
    expect(area('gpu').getAttribute('fill')).toBe('var(--b200_sglang)');
    expect(area('gpu').getAttribute('fill-opacity')).toBe('0.9');
    for (const band of ['server', 'fansPsu', 'network', 'facility']) {
      expect(area(band).getAttribute('fill')).toBe(`url(#chart-0-power-breakdown-${band}-hatch)`);
      expect(area(band).getAttribute('fill-opacity')).toBe('1');
    }
    for (const path of paths) {
      expect(path.dataset.emphasis).toBe('plain');
      expect(path.getAttribute('opacity')).toBe('1');
    }
    // One pattern per modeled layer: stripes at its angle on the chip colour's tint.
    expect(pattern('gpu')).toBeNull();
    expect(pattern('server')?.getAttribute('patternTransform')).toBe('rotate(45)');
    expect(pattern('fansPsu')?.getAttribute('patternTransform')).toBe('rotate(135)');
    expect(pattern('network')?.getAttribute('patternTransform')).toBe('rotate(0)');
    expect(pattern('facility')?.getAttribute('patternTransform')).toBe('rotate(90)');
    expect(pattern('server')?.querySelector('.hatch-bg')?.getAttribute('fill')).toBe(
      'var(--b200_sglang)',
    );
    expect(pattern('server')?.querySelector('.hatch-bg')?.getAttribute('fill-opacity')).toBe('0.5');
    expect(pattern('facility')?.querySelector('.hatch-bg')?.getAttribute('fill-opacity')).toBe(
      '0.18',
    );
    expect(pattern('server')?.querySelector('.hatch-line')?.getAttribute('stroke')).toBe(
      'var(--b200_sglang)',
    );
    const edges = [...container.querySelectorAll<SVGPathElement>('.breakdown-edge')];
    expect(edges).toHaveLength(LAYERS.length);
    expect(edges[0].getAttribute('stroke')).toBe('var(--b200_sglang)');
    expect(edges[0].getAttribute('stroke-width')).toBe('1');
    expect(edges[0].getAttribute('stroke-opacity')).toBe('0.9');
    // The chip's total is the top edge, drawn heavier.
    expect(edges.at(-1)!.getAttribute('stroke-width')).toBe('2');
    expect(container.querySelector('[data-category].breakdown-area')).toBeNull();
  });

  it('draws no labels at the right edge and keeps the fixed margin', () => {
    expect(endLabels()).toHaveLength(0);
    expect(
      container.querySelector<HTMLElement>('[data-testid="d3-chart-stub"]')?.dataset.marginRight,
    ).toBe('18');
  });

  it('lists one legend row per layer, top first, with its description and basis', () => {
    const items = legendItems();
    expect(items.map((item) => item.dataset.band)).toEqual([...LAYERS].toReversed());
    expect(items.map((item) => item.textContent)).toEqual([
      'Facility overheadPUE 1.3 · Modeled',
      'Network shareScale-out switch + its optics · Modeled',
      'Fans + PSU lossMoves with load · Modeled',
      'Server partsCPUs, memory, NICs, NVSwitch, drives · Modeled',
      'Measured GPUGPU board power from telemetry · Measured',
    ]);
    expect(swatch(legendItem('gpu')).getAttribute('title')).toBe('Measured');
    expect(swatch(legendItem('server')).getAttribute('title')).toBe('Modeled');
    // Swatches repeat the plot: a solid step when measured, stripes at the layer's angle when modeled.
    expect(swatch(legendItem('gpu')).style.backgroundColor).toBe(
      'color-mix(in oklab, var(--b200_sglang) 90%, transparent)',
    );
    expect(swatch(legendItem('gpu')).style.backgroundImage).toBe('');
    expect(swatch(legendItem('server')).style.backgroundImage).toContain(
      'repeating-linear-gradient(135deg',
    );
    expect(swatch(legendItem('fansPsu')).style.backgroundImage).toContain(
      'repeating-linear-gradient(225deg',
    );
    expect(swatch(legendItem('facility')).style.backgroundColor).toBe(
      'color-mix(in oklab, var(--b200_sglang) 18%, transparent)',
    );
    for (const item of items) {
      expect(swatch(item).style.border).toBe('1px solid var(--b200_sglang)');
      expect(item.getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('keeps every part in the tooltip under its layer subtotal', () => {
    const probe = container.querySelector('[data-testid="tooltip-probe"]')!;
    const rows = [...probe.querySelectorAll('tr')].map((row) => ({
      band: (row as HTMLElement).dataset.band ?? null,
      category: (row as HTMLElement).dataset.category ?? null,
      text: row.textContent ?? '',
    }));
    // Top layer first, as the stack reads; a single-part layer is its own row.
    expect(rows.map((row) => row.band).filter(Boolean)).toEqual([...LAYERS].toReversed());
    expect(rows[0]).toMatchObject({ band: 'facility', category: null });
    expect(rows[0].text).toContain('Facility overhead (PUE 1.3)');
    expect(rows[0].text).toContain('Modeled');
    expect(rows[1]).toMatchObject({ band: 'network', category: null });
    // A layer made of several parts lists them under its subtotal.
    const fansPsu = rows.findIndex((row) => row.band === 'fansPsu');
    const server = rows.findIndex((row) => row.band === 'server');
    const gpu = rows.findIndex((row) => row.band === 'gpu');
    expect(rows.slice(fansPsu + 1, server).map((row) => row.category)).toEqual(['psuLoss', 'fans']);
    const serverParts = rows.slice(server + 1, gpu).map((row) => row.category);
    expect(serverParts).toContain('nic');
    expect(serverParts).toContain('nvswitch');
    expect(serverParts).not.toContain('gpu');
    expect(serverParts).not.toContain('fans');
    expect(rows[gpu].text).toContain('Measured GPU');
    expect(rows[gpu].text).toContain('Measured');
    expect(rows[gpu + 1].text).toContain('All in Measured');
    expect(rows.at(-1)!.text).toContain('All in Measured');
    for (const row of rows.filter((entry) => entry.band)) {
      expect(row.text).toMatch(/\d+ W\d+%$/u);
    }
  });

  it('raises the hovered legend layer and fades the rest, in the plot and the tooltip', () => {
    mouse(legendItem('server'), 'mouseover');
    expect(area('server').dataset.emphasis).toBe('highlighted');
    // The layer keeps its own step and hatch; only its edge thickens.
    expect(area('server').getAttribute('fill')).toBe('url(#chart-0-power-breakdown-server-hatch)');
    expect(area('server').getAttribute('fill-opacity')).toBe('1');
    expect(area('server').getAttribute('opacity')).toBe('1');
    expect(
      container.querySelector('.breakdown-edge[data-band="server"]')?.getAttribute('stroke-width'),
    ).toBe('1.5');
    for (const band of ['gpu', 'fansPsu', 'network', 'facility']) {
      expect(area(band).dataset.emphasis).toBe('faded');
      expect(area(band).getAttribute('opacity')).toBe('0.25');
    }
    expect(area('gpu').getAttribute('fill-opacity')).toBe('0.9');
    expect(legendItem('gpu').dataset.emphasis).toBe('faded');
    expect(swatch(legendItem('gpu')).style.opacity).toBe('0.25');
    expect(swatch(legendItem('server')).style.opacity).toBe('1');
    expect(
      container.querySelector('[data-testid="tooltip-probe"] tr[data-band="server"]')?.className,
    ).toContain('bg-muted/60');
    expect(
      container.querySelector('[data-testid="tooltip-probe"] tr[data-band="gpu"]')?.className,
    ).not.toContain('bg-muted/60');
    // The list marks the layer's rows as siblings, without fading anything.
    expect(partRow('nic').dataset.emphasis).toBe('band');
    expect(partRow('fans').dataset.emphasis).toBe('plain');
    expect(partRow('gpu').dataset.emphasis).toBe('plain');
    mouse(legendItem('server'), 'mouseout');
    for (const path of areas()) expect(path.dataset.emphasis).toBe('plain');
  });

  it('pins on click, keeps the pin through hover-out, unpins on a second click or Escape', () => {
    mouse(legendItem('server'), 'click');
    expect(legendItem('server').getAttribute('aria-pressed')).toBe('true');
    expect(area('server').dataset.emphasis).toBe('highlighted');
    mouse(legendItem('server'), 'mouseout');
    mouse(legendItem('facility'), 'mouseover');
    expect(area('server').dataset.emphasis).toBe('highlighted');
    expect(area('facility').dataset.emphasis).toBe('faded');
    mouse(legendItem('server'), 'click');
    expect(legendItem('server').getAttribute('aria-pressed')).toBe('false');
    expect(area('server').dataset.emphasis).toBe('plain');

    mouse(legendItem('gpu'), 'click');
    expect(legendItem('gpu').getAttribute('aria-pressed')).toBe('true');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(legendItem('gpu').getAttribute('aria-pressed')).toBe('false');
    for (const path of areas()) expect(path.dataset.emphasis).toBe('plain');
  });

  it('names the layer under the pointer in the plot and labels it with its W/GPU', () => {
    const hit = container.querySelector<SVGRectElement>('[data-testid="power-breakdown-hit"]')!;
    // jsdom has no layout: the pointer reads as client coordinates in plot space.
    mouse(hit, 'mousemove', { clientX: 40, clientY: 380 - 40 - 56 - 2 });
    const label = container.querySelector<SVGElement>(
      '[data-testid="power-breakdown-cursor-label"]',
    );
    expect(label?.dataset.band).toBe('gpu');
    expect(label?.textContent).toMatch(/^Measured GPU · \d+ W$/u);
    expect(area('gpu').dataset.emphasis).toBe('highlighted');
    expect(legendItem('gpu').dataset.emphasis).toBe('highlighted');
    expect(partRow('gpu').dataset.emphasis).toBe('band');
    // Above the stack there is no layer: nothing is highlighted.
    mouse(hit, 'mousemove', { clientX: 40, clientY: 1 });
    expect(container.querySelector('[data-testid="power-breakdown-cursor-label"]')).toBeNull();
    expect(area('gpu').dataset.emphasis).toBe('plain');
  });

  it('lists the parts of the compared point beside the plot and lights a layer from a row', () => {
    const rows = partRows();
    expect(rows.length).toBeGreaterThanOrEqual(9);
    expect(rows[0].dataset.category).toBe('gpu');
    expect(rows.at(-1)!.dataset.category).toBe('facility');
    // Off PowerX the list reads the point nearest the comparison middle (60 tok/s/user);
    // c16 (45) and c4 (80) tie on a log scale and the higher-interactivity point wins.
    expect(container.querySelector('[data-testid="power-parts-heading"]')?.textContent).toBe(
      'B200 (SGLang) FP8 · c4 · 80 tok/s/user',
    );
    expect(rows[0].querySelector('[data-testid="power-part-watts"]')?.textContent).toBe('380 W');
    mouse(partRow('fans'), 'mouseover');
    expect(partRow('fans').dataset.emphasis).toBe('highlighted');
    expect(area('fansPsu').dataset.emphasis).toBe('highlighted');
    expect(area('gpu').dataset.emphasis).toBe('faded');
    expect(area('server').dataset.emphasis).toBe('faded');
    expect(legendItem('fansPsu').dataset.emphasis).toBe('highlighted');
    // The hovered part is bold in the tooltip; its layer subtotal is not the hovered thing.
    expect(
      container.querySelector('[data-testid="tooltip-probe"] tr[data-category="fans"]')?.className,
    ).toContain('font-semibold');
    expect(
      container.querySelector('[data-testid="tooltip-probe"] tr[data-band="fansPsu"]')?.className,
    ).not.toContain('bg-muted/60');
    mouse(partRow('fans'), 'mouseout');
    expect(area('fansPsu').dataset.emphasis).toBe('plain');
    // A click pins the row; Escape unpins.
    mouse(partRow('psuLoss'), 'click');
    expect(partRow('psuLoss').getAttribute('aria-pressed')).toBe('true');
    mouse(partRow('psuLoss'), 'mouseout');
    expect(area('fansPsu').dataset.emphasis).toBe('highlighted');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(partRow('psuLoss').getAttribute('aria-pressed')).toBe('false');
    expect(area('fansPsu').dataset.emphasis).toBe('plain');
  });

  it('switches to stacked bars with the same hatched segments per column', () => {
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="power-breakdown-view-bars"]')!
        .click(),
    );
    expect(areas()).toHaveLength(0);
    const bars = [
      ...container.querySelectorAll<SVGRectElement>('[data-testid="power-breakdown-bar"]'),
    ];
    expect(bars).toHaveLength(LAYERS.length * sglang.length);
    const bar = (band: string) => bars.find((item) => item.dataset.band === band)!;
    expect(bar('gpu').getAttribute('fill')).toBe('var(--b200_sglang)');
    expect(bar('gpu').getAttribute('fill-opacity')).toBe('0.9');
    expect(bar('gpu').getAttribute('stroke')).toBe('var(--b200_sglang)');
    expect(bar('gpu').getAttribute('stroke-opacity')).toBe('0.9');
    expect(bar('server').getAttribute('fill')).toBe('url(#chart-0-power-breakdown-server-hatch)');
    expect(bar('facility').getAttribute('fill')).toBe(
      'url(#chart-0-power-breakdown-facility-hatch)',
    );
    expect(pattern('facility')).not.toBeNull();
    mouse(legendItem('network'), 'mouseover');
    expect(bar('network').dataset.emphasis).toBe('highlighted');
    expect(bar('network').getAttribute('stroke-width')).toBe('1.5');
    expect(bar('gpu').dataset.emphasis).toBe('faded');
    expect(bar('gpu').getAttribute('opacity')).toBe('0.25');
    expect(bar('gpu').getAttribute('fill-opacity')).toBe('0.9');
  });
});

describe('layerStyle', () => {
  it('describes the highlighted, faded and plain states, keeping each layer its own step', () => {
    expect(layerStyle('server', { band: 'server', category: 'nic', pinned: true })).toEqual({
      emphasis: 'highlighted',
      fillOpacity: 1,
      opacity: 1,
      strokeWidth: 1.5,
      strokeOpacity: 1,
    });
    expect(layerStyle('gpu', { band: 'server', category: null, pinned: false })).toMatchObject({
      emphasis: 'faded',
      fillOpacity: 0.9,
      opacity: 0.25,
      strokeWidth: 1,
    });
    expect(layerStyle('gpu', null)).toMatchObject({
      emphasis: 'plain',
      fillOpacity: 0.9,
      opacity: 1,
      strokeOpacity: 0.9,
    });
    expect(layerStyle('measuredCpu', null).fillOpacity).toBe(0.72);
    // Hatched layers carry their tint in the pattern, so the element itself is opaque.
    expect(layerStyle('facility', null).fillOpacity).toBe(1);
    expect(layerStyle('fansPsu', null).fillOpacity).toBe(1);
  });
});

describe('swatchStyle', () => {
  it('repeats a layer as a CSS box: solid step when measured, striped at its angle when modeled', () => {
    expect(swatchStyle('gpu', 'red')).toEqual({
      backgroundColor: 'color-mix(in oklab, red 90%, transparent)',
      border: '1px solid red',
      opacity: 1,
    });
    expect(swatchStyle('measuredCpu', 'red').backgroundColor).toBe(
      'color-mix(in oklab, red 72%, transparent)',
    );
    expect(swatchStyle('server', 'red')).toEqual({
      backgroundColor: 'color-mix(in oklab, red 50%, transparent)',
      backgroundImage: 'repeating-linear-gradient(135deg, red 0 2px, transparent 2px 6px)',
      border: '1px solid red',
      opacity: 1,
    });
    expect(swatchStyle('fansPsu', 'red').backgroundImage).toContain('225deg');
    expect(swatchStyle('network', 'red').backgroundImage).toContain('90deg');
    expect(swatchStyle('facility', 'red')).toMatchObject({
      backgroundColor: 'color-mix(in oklab, red 18%, transparent)',
      backgroundImage: 'repeating-linear-gradient(180deg, red 0 2px, transparent 2px 6px)',
    });
    expect(
      swatchStyle('gpu', 'red', { band: 'server', category: null, pinned: false }).opacity,
    ).toBe(0.25);
  });
});

describe('PowerBreakdownPanel unofficial-run overlays', () => {
  it('draws an overlay series in its run colour with the same layers, hatches, list and pin', () => {
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
    expect(paths.map((path) => path.dataset.band)).toEqual(LAYERS);
    expect(area('gpu').getAttribute('fill')).toBe(overlayRunColor(2));
    expect(area('gpu').getAttribute('fill-opacity')).toBe('0.9');
    expect(area('server').getAttribute('fill')).toBe('url(#chart-2-power-breakdown-server-hatch)');
    expect(pattern('server')?.querySelector('.hatch-bg')?.getAttribute('fill')).toBe(
      overlayRunColor(2),
    );
    expect(pattern('server')?.querySelector('.hatch-line')?.getAttribute('stroke')).toBe(
      overlayRunColor(2),
    );
    expect(container.querySelector('.breakdown-edge')?.getAttribute('stroke')).toBe(
      overlayRunColor(2),
    );
    expect(endLabels()).toHaveLength(0);
    expect(swatch(legendItem('gpu')).style.backgroundColor).toContain('--overlay-run-2');
    expect(swatch(legendItem('server')).style.backgroundImage).toContain('--overlay-run-2');
    // The parts list is the overlay run's, in the run colour, with the run tag in its heading.
    const heading = container.querySelector('[data-testid="power-parts-heading"]')?.textContent;
    expect(heading).toContain('single-hue');
    expect(heading).toMatch(/c\d+ · \d+ tok\/s\/user$/u);
    const bar = partRow('gpu').querySelector<HTMLElement>('[data-testid="power-part-bar"]');
    expect(bar?.style.backgroundColor).toContain('--overlay-run-2');
    expect(
      partRow('gpu')
        .querySelector('[data-testid="power-part-sparkline"] circle')
        ?.getAttribute('fill'),
    ).toBe(overlayRunColor(2));
    mouse(legendItem('server'), 'click');
    expect(area('server').dataset.emphasis).toBe('highlighted');
    expect(legendItem('server').getAttribute('aria-pressed')).toBe('true');
    // The official line is still its own, vendor-coloured series.
    const select = container.querySelector('[data-testid="power-breakdown-source"]');
    expect(select?.textContent).toContain('single-hue');
  });
});

describe('PowerAnalysisPanels per-chip compared point', () => {
  const drilldownHits = () => [
    ...container.querySelectorAll<SVGRectElement>(
      '[data-testid="power-chip-compare-drilldown"] [data-testid="power-breakdown-hit"]',
    ),
  ];
  const drilldownTitle = () =>
    container.querySelector('[data-testid="power-chip-compare-drilldown"] h3')?.textContent;
  const marker = () =>
    container.querySelector<SVGRectElement>('[data-testid="power-breakdown-compared"]');
  const partsHeading = () =>
    container.querySelector('[data-testid="power-parts-heading"]')?.textContent;
  const chipRows = () => [
    ...container.querySelectorAll<HTMLButtonElement>('[data-testid="power-chip-compare-row"]'),
  ];
  const chipRow = (name: string) =>
    chipRows().find((row) => row.querySelector('span span span.truncate')?.textContent === name)!;
  const sliderValue = () =>
    container.querySelector('[data-testid="power-chip-compare-value"]')?.textContent;
  const moveSlider = (step: number) => {
    const slider = container.querySelector<HTMLInputElement>(
      '[data-testid="power-chip-compare-target"]',
    )!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        slider,
        String(step),
      );
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const renderInline = (data: InferenceData[], overlayData: InferenceData[] = []) =>
    render(
      <PowerXSurfaceProvider>
        <PowerAnalysisPanels
          data={data}
          overlayData={overlayData}
          xField="mean_tpot_intvty"
          xLabel="Interactivity (output tok/s/user)"
          chartId="chart-4"
          placement="before"
          layout="inline"
        />
      </PowerXSurfaceProvider>,
    );

  beforeEach(() => track.mockClear());

  it('pins the clicked column for that chip only and keeps the drill-down on it', () => {
    renderInline([...sglang, ...vllm]);
    // The slider lands on vLLM c16 at 60 tok/s/user; the SGLang row reads its own nearest point.
    expect(drilldownTitle()).toBe('B200 (vLLM) FP8 across load');
    expect(rowPoint(chipRow('B200 (vLLM) FP8'))).toBe('c16 · 60 tok/s/user');
    const sglangBefore = rowPoint(chipRow('B200 (SGLang) FP8'));
    expect(marker()).not.toBeNull();
    const markerBefore = marker()!.getAttribute('x');
    // Columns sit in interactivity order: c64 (30), c16 (60), c4 (100), c1 (150).
    const hits = drilldownHits();
    expect(hits).toHaveLength(4);
    mouse(hits[0], 'click');
    expect(rowPoint(chipRow('B200 (vLLM) FP8'))).toBe('c64 · 30 tok/s/user');
    expect(chipRow('B200 (vLLM) FP8').dataset.pinned).toBe('true');
    expect(
      chipRow('B200 (vLLM) FP8')
        .querySelector('[data-testid="power-chip-compare-unpin"]')
        ?.getAttribute('title'),
    ).toBe('Pinned to c64 · click to follow the slider');
    expect(rowPoint(chipRow('B200 (SGLang) FP8'))).toBe(sglangBefore);
    expect(chipRow('B200 (SGLang) FP8').dataset.pinned).toBeUndefined();
    expect(sliderValue()).toBe('60 tok/s/user');
    // The drill-down stays on the clicked chip; its outline and list move to the column.
    expect(drilldownTitle()).toBe('B200 (vLLM) FP8 across load');
    expect(marker()!.getAttribute('x')).not.toBe(markerBefore);
    expect(partsHeading()).toBe('B200 (vLLM) FP8 · c64 · 30 tok/s/user');
    expect(track).toHaveBeenCalledWith('powerx_breakdown_point_pinned', {
      hw: 'b200_vllm',
      concurrency: 64,
    });
    // A second column replaces the pin; still one pinned chip.
    mouse(drilldownHits()[2], 'click');
    expect(rowPoint(chipRow('B200 (vLLM) FP8'))).toBe('c4 · 100 tok/s/user');
    expect(partsHeading()).toBe('B200 (vLLM) FP8 · c4 · 100 tok/s/user');
    expect(chipRows().filter((row) => row.dataset.pinned === 'true')).toHaveLength(1);
  });

  it('keeps the pin through opening another chip and collapsing, drops it when the slider moves', () => {
    renderInline([...sglang, ...vllm]);
    const order = chipRows().map(
      (row) => row.querySelector('span span span.truncate')?.textContent,
    );
    mouse(drilldownHits()[2], 'click');
    expect(rowPoint(chipRow('B200 (vLLM) FP8'))).toBe('c4 · 100 tok/s/user');
    // Another chip's drill-down: the vLLM pin stays on its row.
    mouse(chipRow('B200 (SGLang) FP8'), 'click');
    expect(drilldownTitle()).toBe('B200 (SGLang) FP8 across load');
    expect(chipRow('B200 (vLLM) FP8').dataset.pinned).toBe('true');
    expect(rowPoint(chipRow('B200 (vLLM) FP8'))).toBe('c4 · 100 tok/s/user');
    // Collapsed: still pinned; reopened: the outline and the list are back on c4.
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="power-breakdown-collapse"]')!
        .click(),
    );
    expect(container.querySelector('[data-testid="power-chip-compare-drilldown"]')).toBeNull();
    expect(chipRow('B200 (vLLM) FP8').dataset.pinned).toBe('true');
    mouse(chipRow('B200 (vLLM) FP8'), 'click');
    expect(drilldownTitle()).toBe('B200 (vLLM) FP8 across load');
    expect(partsHeading()).toBe('B200 (vLLM) FP8 · c4 · 100 tok/s/user');
    expect(marker()).not.toBeNull();
    // The slider is the global control: every pin goes, the rows keep their order.
    moveSlider(0);
    expect(sliderValue()).toBe('20 tok/s/user');
    expect(chipRows().filter((row) => row.dataset.pinned === 'true')).toHaveLength(0);
    expect(rowPoint(chipRow('B200 (vLLM) FP8'))).toBe('c64 · 30 tok/s/user');
    expect(
      chipRows().map((row) => row.querySelector('span span span.truncate')?.textContent),
    ).toEqual(order);
  });

  it('draws the slider as a guide, labels it only off the compared column, and unpins from it', () => {
    renderInline([...sglang, ...vllm]);
    const guide = () =>
      container.querySelector<SVGLineElement>('[data-testid="power-breakdown-guide"]');
    const guideLabel = () =>
      container.querySelector<SVGTextElement>('[data-testid="power-breakdown-guide-label"]');
    const guideHit = () =>
      container.querySelector<SVGRectElement>('[data-testid="power-breakdown-guide-hit"]');
    // Not pinned: the guide sits on the compared column (vLLM c16 at 60), so no label.
    expect(guide()).not.toBeNull();
    expect(guideLabel()).toBeNull();
    expect(guideHit()?.getAttribute('pointer-events')).toBe('none');
    const guideX = Number(guide()!.getAttribute('x1'));
    const markerX = Number(marker()!.getAttribute('x'));
    const markerWidth = Number(marker()!.getAttribute('width'));
    expect(guideX).toBeGreaterThan(markerX);
    expect(guideX).toBeLessThan(markerX + markerWidth);
    // Pinned to c1 (150): the outline moves, the guide stays at the slider and says so.
    mouse(drilldownHits()[3], 'click');
    expect(rowPoint(chipRow('B200 (vLLM) FP8'))).toBe('c1 · 150 tok/s/user');
    expect(Number(guide()!.getAttribute('x1'))).toBe(guideX);
    expect(guideLabel()?.textContent).toBe('60');
    expect(guideHit()?.getAttribute('pointer-events')).toBe('all');
    // The guide is the way back: a click on it follows the slider again.
    mouse(guideHit()!, 'click');
    expect(chipRow('B200 (vLLM) FP8').dataset.pinned).toBeUndefined();
    expect(rowPoint(chipRow('B200 (vLLM) FP8'))).toBe('c16 · 60 tok/s/user');
    expect(guideLabel()).toBeNull();
    expect(track).toHaveBeenCalledWith('powerx_breakdown_point_unpinned', {
      hw: 'b200_vllm',
      concurrency: 1,
    });
    // So is the column under it while pinned; a column click elsewhere pins again.
    mouse(drilldownHits()[0], 'click');
    expect(rowPoint(chipRow('B200 (vLLM) FP8'))).toBe('c64 · 30 tok/s/user');
    mouse(drilldownHits()[1], 'click');
    expect(chipRow('B200 (vLLM) FP8').dataset.pinned).toBeUndefined();
    expect(rowPoint(chipRow('B200 (vLLM) FP8'))).toBe('c16 · 60 tok/s/user');
  });

  it('teaches the click in the cursor label: compare here, or this is the compared column', () => {
    renderInline([...sglang, ...vllm]);
    const hint = () =>
      container.querySelector('[data-testid="power-breakdown-cursor-hint"]')?.textContent;
    const hits = drilldownHits();
    // Hovering the GPU band of the compared column (c16): the second line says so.
    mouse(hits[1], 'mousemove', { clientX: 200, clientY: 380 - 40 - 56 - 2 });
    expect(
      container.querySelector('[data-testid="power-breakdown-cursor-label"]')?.textContent,
    ).toMatch(/^Measured GPU · /u);
    expect(hint()).toBe('Compared here');
    // Another column invites the click at its concurrency.
    mouse(hits[0], 'mousemove', { clientX: 40, clientY: 380 - 40 - 56 - 2 });
    expect(hint()).toBe('Click to compare at c64');
    mouse(hits[0], 'mouseleave');
    expect(container.querySelector('[data-testid="power-breakdown-cursor-hint"]')).toBeNull();
  });

  it('pins a point of an unofficial-run series by its own key', () => {
    renderInline([...sglang, ...overlay], overlay);
    const overlayRow = chipRows().find((row) => row.textContent?.includes('single-hue'))!;
    const overlayName = overlayRow.querySelector('span span span.truncate')!.textContent!;
    expect(chipRows().map((row) => row.dataset.pinned)).toEqual([undefined, undefined]);
    mouse(overlayRow, 'click');
    expect(drilldownTitle()).toContain('single-hue');
    const officialBefore = rowPoint(chipRow('B200 (SGLang) FP8'));
    // The overlay's columns: c64 (22), c16 (48), c4 (85).
    mouse(drilldownHits()[0], 'click');
    expect(rowPoint(chipRow(overlayName))).toBe('c64 · 22 tok/s/user');
    expect(chipRow(overlayName).dataset.pinned).toBe('true');
    expect(rowPoint(chipRow('B200 (SGLang) FP8'))).toBe(officialBefore);
    expect(chipRow('B200 (SGLang) FP8').dataset.pinned).toBeUndefined();
    expect(partsHeading()).toContain('single-hue');
    expect(partsHeading()).toMatch(/c64 · 22 tok\/s\/user$/u);
    expect(track).toHaveBeenCalledWith('powerx_breakdown_point_pinned', {
      hw: 'b200_sglang',
      concurrency: 64,
    });
  });
});

describe('PowerChipCompare legend highlight', () => {
  it('lights the hovered layer on every chip bar and in the open drill-down, and pins on click', () => {
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
    const legend = [
      ...container.querySelectorAll<HTMLButtonElement>(
        '[data-testid="power-chip-compare-legend-item"]',
      ),
    ];
    // PowerX counts IT only by default: no facility layer.
    expect(legend.map((item) => item.dataset.band)).toEqual([
      'gpu',
      'server',
      'fansPsu',
      'network',
    ]);
    expect(legend.map((item) => item.textContent)).toEqual([
      'GPU· Measured',
      'Server parts· Modeled (hatched)',
      'Fans + PSU loss· Modeled (hatched)',
      'Network share· Modeled (hatched)',
    ]);
    const item = legend[1];
    expect(item.querySelector('span[title]')?.getAttribute('title')).toBe('Modeled (hatched)');
    // The shared legend's swatches are the stack's steps and hatches on the muted foreground.
    const legendSwatch = (index: number) =>
      legend[index].querySelector('span[title]') as HTMLElement;
    expect(legendSwatch(0).style.backgroundColor).toBe(
      'color-mix(in oklab, var(--muted-foreground) 90%, transparent)',
    );
    expect(legendSwatch(1).style.backgroundImage).toContain('repeating-linear-gradient(135deg');
    expect(legendSwatch(2).style.backgroundImage).toContain('repeating-linear-gradient(225deg');
    const segments = (band: string) => [
      ...container.querySelectorAll<HTMLElement>(
        `[data-testid="power-chip-compare-segment"][data-band="${band}"]`,
      ),
    ];
    expect(segments('server')).toHaveLength(2);
    expect(segments('facility')).toHaveLength(0);
    // Each chip's segments repeat the plot in that chip's colour; a layer made of several
    // parts lists them in its title.
    const gpuSegment = segments('gpu')[0];
    expect(gpuSegment.style.backgroundColor).toContain('90%');
    expect(gpuSegment.style.backgroundColor).toContain('var(--b200_');
    expect(gpuSegment.style.backgroundImage).toBe('');
    expect(gpuSegment.getAttribute('title')).toMatch(/^GPU: \d+ W$/u);
    const serverSegment = segments('server')[0];
    expect(serverSegment.style.backgroundImage).toContain('repeating-linear-gradient(135deg');
    expect(serverSegment.style.backgroundImage).toContain('var(--b200_');
    const serverTitle = serverSegment.getAttribute('title') ?? '';
    expect(serverTitle).toMatch(/^Server parts: \d+ W · /u);
    expect(serverTitle).toContain('NICs');
    expect(serverTitle).toContain('NVSwitch');
    expect(serverTitle).not.toContain('PSU loss');
    expect(segments('fansPsu')[0].getAttribute('title')).toContain('PSU loss');
    expect(segments('network')[0].getAttribute('title')).toMatch(/^Network share: \d+ W$/u);
    mouse(item, 'mouseover');
    for (const segment of segments('server')) {
      expect(segment.dataset.emphasis).toBe('highlighted');
      expect(segment.style.opacity).toBe('1');
      expect(segment.style.backgroundColor).toContain('50%');
    }
    for (const segment of segments('gpu')) {
      expect(segment.dataset.emphasis).toBe('faded');
      expect(segment.style.opacity).toBe('0.25');
    }
    expect(area('server').dataset.emphasis).toBe('highlighted');
    expect(area('gpu').dataset.emphasis).toBe('faded');
    mouse(item, 'click');
    expect(item.getAttribute('aria-pressed')).toBe('true');
    mouse(item, 'mouseout');
    expect(area('server').dataset.emphasis).toBe('highlighted');
    // Hovering a segment itself does not steal a pin; unpinning restores every layer.
    mouse(segments('gpu')[0], 'mouseover');
    expect(segments('gpu')[0].dataset.emphasis).toBe('faded');
    mouse(item, 'click');
    expect(item.getAttribute('aria-pressed')).toBe('false');
    for (const segment of segments('gpu')) expect(segment.dataset.emphasis).toBe('plain');
    expect(area('gpu').dataset.emphasis).toBe('plain');
    // The drill-down's list follows the slider's chip and point: vLLM c16 at 60 tok/s/user.
    expect(container.querySelector('[data-testid="power-parts-heading"]')?.textContent).toBe(
      'B200 (vLLM) FP8 · c16 · 60 tok/s/user',
    );
    // A part row hovered in the list raises its layer on every chip bar too.
    mouse(partRow('fans'), 'mouseover');
    for (const segment of segments('fansPsu')) expect(segment.dataset.emphasis).toBe('highlighted');
    for (const segment of segments('server')) expect(segment.dataset.emphasis).toBe('faded');
    expect(partRow('fans').dataset.emphasis).toBe('highlighted');
    mouse(partRow('fans'), 'mouseout');
  });
});

describe('nearestColumnIndex', () => {
  it('picks the column whose centre is closest to the finger, whatever the hit bands', () => {
    expect(nearestColumnIndex([], 10)).toBeNull();
    expect(nearestColumnIndex([80, 200, 340, 460], -50)).toBe(0);
    expect(nearestColumnIndex([80, 200, 340, 460], 139)).toBe(0);
    expect(nearestColumnIndex([80, 200, 340, 460], 141)).toBe(1);
    expect(nearestColumnIndex([80, 200, 340, 460], 900)).toBe(3);
  });
});

describe('PowerAnalysisPanels touch scrub (PowerX on a coarse pointer)', () => {
  const renderInline = (data: InferenceData[], overlayData: InferenceData[] = []) =>
    render(
      <PowerXSurfaceProvider>
        <PowerAnalysisPanels
          data={data}
          overlayData={overlayData}
          xField="mean_tpot_intvty"
          xLabel="Interactivity (output tok/s/user)"
          chartId="chart-5"
          placement="before"
          layout="inline"
        />
      </PowerXSurfaceProvider>,
    );
  const hits = () => [
    ...container.querySelectorAll<SVGRectElement>(
      '[data-testid="power-chip-compare-drilldown"] [data-testid="power-breakdown-hit"]',
    ),
  ];
  const readout = () =>
    container.querySelector<HTMLElement>('[data-testid="power-breakdown-readout"]');
  const readoutPoint = () =>
    container.querySelector('[data-testid="power-breakdown-readout-point"]')?.textContent;
  const readoutTotal = () =>
    container.querySelector('[data-testid="power-breakdown-readout-total"]')?.textContent;
  const readoutParts = () => [
    ...container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="power-breakdown-readout-part"]',
    ),
  ];
  const readoutSource = () =>
    container.querySelector('[data-testid="power-breakdown-readout-source"]')?.textContent;
  const rule = () =>
    container.querySelector<SVGLineElement>('[data-testid="power-breakdown-scrub-rule"]');
  const cursorLabel = () => container.querySelector('[data-testid="power-breakdown-cursor-label"]');
  const compareButton = () =>
    container.querySelector<HTMLButtonElement>('[data-testid="power-breakdown-compare-at"]');
  const chipRows = () => [
    ...container.querySelectorAll<HTMLButtonElement>('[data-testid="power-chip-compare-row"]'),
  ];
  const chipRow = (name: string) =>
    chipRows().find((row) => row.querySelector('span span span.truncate')?.textContent === name)!;
  const sliderValue = () =>
    container.querySelector('[data-testid="power-chip-compare-value"]')?.textContent;
  const marker = () =>
    container.querySelector<SVGRectElement>('[data-testid="power-breakdown-compared"]');
  // The stub plot is 517 px wide on even spacing: columns centre at 78, 207, 336, 465.
  const AT = { c64: 60, c16: 210, c4: 330, c1: 470 };

  beforeEach(() => {
    track.mockClear();
    env.coarsePointer = true;
  });

  it('shows the compared point above the plot and the slider action as a button', () => {
    renderInline([...sglang, ...vllm]);
    // The slider lands on vLLM c16 at 60 tok/s/user: that is what the readout reads.
    expect(readout()?.dataset.source).toBe('compared');
    expect(readout()?.dataset.concurrency).toBe('16');
    expect(readoutPoint()).toBe('c16 · 60 tok/s/user');
    const rowTotal = chipRow('B200 (vLLM) FP8').querySelector('.font-semibold')?.textContent;
    expect(readoutTotal()).toBe(rowTotal?.replace(' WIT', ' W/GPUIT'));
    expect(
      readout()?.querySelector<HTMLElement>('[data-testid="power-basis-pill"]')?.dataset.basis,
    ).toBe('it');
    // One chip per layer in stack order with the plot's swatches; PowerX counts IT only.
    expect(readoutParts().map((part) => part.dataset.band)).toEqual([
      'gpu',
      'server',
      'fansPsu',
      'network',
    ]);
    expect(readoutParts().map((part) => part.textContent)).toEqual([
      expect.stringMatching(/^GPU\d+$/u),
      expect.stringMatching(/^Server\d+$/u),
      expect.stringMatching(/^Fans \+ PSU\d+$/u),
      expect.stringMatching(/^Network\d+$/u),
    ]);
    expect(swatchOf(readoutParts()[0]).style.backgroundColor).toBe(
      'color-mix(in oklab, var(--b200_vllm) 90%, transparent)',
    );
    expect(swatchOf(readoutParts()[1]).style.backgroundImage).toContain(
      'repeating-linear-gradient(135deg',
    );
    expect(readoutSource()).toBe('Compared point · drag across the chart to read others');
    // Nothing scrubbed, nothing pinned: no rule, the slider already reads this point.
    expect(rule()).toBeNull();
    expect(compareButton()?.textContent).toBe('Compare chips at 60 tok/s/user');
    expect(compareButton()?.disabled).toBe(true);
    // The plot carries no tooltip on touch: the readout is the detail.
    expect(container.querySelector('[data-testid="tooltip-probe"]')?.innerHTML).toBe('');
  });

  it('scrubs the nearest column into the readout, moves the slider from the button', () => {
    renderInline([...sglang, ...vllm]);
    const columns = hits();
    expect(columns).toHaveLength(4);
    // A finger on the plot reads the column nearest its x, wherever the hit band is.
    pointer(columns[1], 'pointerdown', { clientX: AT.c64, clientY: 200 });
    expect(readout()?.dataset.source).toBe('scrub');
    expect(readoutPoint()).toBe('c64 · 30 tok/s/user');
    expect(rule()?.dataset.index).toBe('0');
    expect(container.querySelector('circle.breakdown-scrub-dot')?.getAttribute('fill')).toBe(
      'var(--b200_vllm)',
    );
    expect(readoutSource()).toBe('Drag to read · tap to hold');
    expect(cursorLabel()).toBeNull();
    // The compat mouse events a touch synthesises never draw the hover label.
    mouse(columns[1], 'mousemove', { clientX: AT.c64, clientY: 380 - 40 - 56 - 2 });
    expect(cursorLabel()).toBeNull();
    pointer(columns[1], 'pointermove', { clientX: AT.c4, clientY: 180 });
    expect(readoutPoint()).toBe('c4 · 100 tok/s/user');
    expect(rule()?.dataset.index).toBe('2');
    // The scrub keeps the slider and every row where they were.
    expect(sliderValue()).toBe('60 tok/s/user');
    expect(chipRows().filter((row) => row.dataset.pinned === 'true')).toHaveLength(0);
    pointer(columns[1], 'pointerup', { clientX: AT.c4, clientY: 180 });
    expect(readout()?.dataset.source).toBe('scrub');
    expect(readoutPoint()).toBe('c4 · 100 tok/s/user');
    // The explicit action: the slider moves to the scrubbed interactivity.
    expect(compareButton()?.textContent).toBe('Compare chips at 100 tok/s/user');
    expect(compareButton()?.disabled).toBe(false);
    act(() => compareButton()!.click());
    expect(sliderValue()).toBe('100 tok/s/user');
    expect(track).toHaveBeenCalledWith('powerx_compare_at_scrub', {
      hw: 'b200_vllm',
      concurrency: 4,
      interactivity: 100,
      source: 'scrub',
    });
    expect(chipRows().filter((row) => row.dataset.pinned === 'true')).toHaveLength(0);
    expect(readout()?.dataset.source).toBe('compared');
    expect(readoutPoint()).toBe('c4 · 100 tok/s/user');
    expect(rule()).toBeNull();
    expect(compareButton()?.disabled).toBe(true);
  });

  it('holds the column on a tap through the compared-point pin, and a cancelled gesture restores', () => {
    renderInline([...sglang, ...vllm]);
    const markerBefore = marker()!.getAttribute('x');
    // A tap: the finger lands and lifts without a drag, so the browser clicks the column.
    pointer(hits()[0], 'pointerdown', { clientX: AT.c64, clientY: 200 });
    pointer(hits()[0], 'pointerup', { clientX: AT.c64, clientY: 200 });
    mouse(hits()[0], 'click', { clientX: AT.c64, clientY: 200 });
    expect(chipRow('B200 (vLLM) FP8').dataset.pinned).toBe('true');
    expect(track).toHaveBeenCalledWith('powerx_breakdown_point_pinned', {
      hw: 'b200_vllm',
      concurrency: 64,
    });
    expect(marker()!.getAttribute('x')).not.toBe(markerBefore);
    expect(readout()?.dataset.source).toBe('pinned');
    expect(readoutPoint()).toBe('c64 · 30 tok/s/user');
    expect(readoutSource()).toBe('Pinned · tap the pin in its row to follow the slider');
    expect(rule()).toBeNull();
    expect(sliderValue()).toBe('60 tok/s/user');
    expect(compareButton()?.textContent).toBe('Compare chips at 30 tok/s/user');
    expect(compareButton()?.disabled).toBe(false);
    // Scrubbing again reads other columns; a page scroll (pointercancel) restores the hold.
    pointer(hits()[0], 'pointerdown', { clientX: AT.c1, clientY: 200 });
    expect(readout()?.dataset.source).toBe('scrub');
    expect(readoutPoint()).toBe('c1 · 150 tok/s/user');
    pointer(hits()[0], 'pointercancel', { clientX: AT.c1, clientY: 260 });
    expect(readout()?.dataset.source).toBe('pinned');
    expect(readoutPoint()).toBe('c64 · 30 tok/s/user');
    expect(rule()).toBeNull();
    // The row's pin marker lets the chip follow the slider again; the readout follows.
    const unpin = chipRow('B200 (vLLM) FP8').querySelector<HTMLElement>(
      '[data-testid="power-chip-compare-unpin"]',
    )!;
    mouse(unpin, 'click');
    expect(chipRow('B200 (vLLM) FP8').dataset.pinned).toBeUndefined();
    expect(readout()?.dataset.source).toBe('compared');
    expect(readoutPoint()).toBe('c16 · 60 tok/s/user');
  });

  it('holds the compared column itself on a tap, so the readout says pinned', () => {
    renderInline([...sglang, ...vllm]);
    // The slider's column (vLLM c16): the finger lands there and lifts.
    pointer(hits()[1], 'pointerdown', { clientX: AT.c16, clientY: 200 });
    expect(readout()?.dataset.source).toBe('scrub');
    pointer(hits()[1], 'pointerup', { clientX: AT.c16, clientY: 200 });
    mouse(hits()[1], 'click', { clientX: AT.c16, clientY: 200 });
    expect(chipRow('B200 (vLLM) FP8').dataset.pinned).toBe('true');
    expect(readout()?.dataset.source).toBe('pinned');
    expect(readoutPoint()).toBe('c16 · 60 tok/s/user');
    expect(rule()).toBeNull();
  });

  it('ignores a mouse pointer, which keeps the hover label and the click', () => {
    renderInline([...sglang, ...vllm]);
    pointer(hits()[0], 'pointerdown', { pointerType: 'mouse', clientX: AT.c64, clientY: 200 });
    expect(readout()?.dataset.source).toBe('compared');
    expect(rule()).toBeNull();
    env.coarsePointer = false;
    act(() => root.render(<div />));
    renderInline([...sglang, ...vllm]);
    expect(readout()).toBeNull();
    expect(compareButton()).toBeNull();
    mouse(hits()[0], 'mousemove', { clientX: AT.c64, clientY: 380 - 40 - 56 - 2 });
    expect(cursorLabel()?.textContent).toMatch(/^Measured GPU · /u);
  });

  it('reads an unofficial-run series in its run colour', () => {
    renderInline([...sglang, ...overlay], overlay);
    const overlayRow = chipRows().find((row) => row.textContent?.includes('single-hue'))!;
    mouse(overlayRow, 'click');
    expect(
      container.querySelector('[data-testid="power-chip-compare-drilldown"] h3')?.textContent,
    ).toContain('single-hue');
    expect(swatchOf(readoutParts()[0]).style.backgroundColor).toContain('--overlay-run-2');
    expect(swatchOf(readoutParts()[1]).style.backgroundImage).toContain('--overlay-run-2');
    // The overlay's columns: c64 (22), c16 (48), c4 (85); its own compared point first.
    pointer(hits()[0], 'pointerdown', { clientX: AT.c64, clientY: 200 });
    expect(readoutPoint()).toBe('c64 · 22 tok/s/user');
    expect(container.querySelector('circle.breakdown-scrub-dot')?.getAttribute('fill')).toBe(
      overlayRunColor(2),
    );
    expect(compareButton()?.textContent).toBe('Compare chips at 22 tok/s/user');
  });

  it('speaks Chinese', () => {
    env.locale = 'zh';
    renderInline([...sglang, ...vllm]);
    expect(readoutSource()).toBe('当前对比点 · 在图上拖动可读取其他数据点');
    expect(readoutParts().map((part) => part.textContent?.replace(/\d+$/u, ''))).toEqual([
      'GPU',
      '服务器',
      '风扇 + 电源',
      '网络',
    ]);
    expect(readoutParts()[1].getAttribute('title')).toBe('服务器部件 · 建模');
    pointer(hits()[0], 'pointerdown', { clientX: AT.c4, clientY: 200 });
    expect(readoutSource()).toBe('拖动读取 · 点按固定');
    expect(compareButton()?.textContent).toBe('在 100 tok/s/user 处对比各芯片');
    expect(
      container.querySelector('[data-testid="power-chip-compare-drilldown"] p')?.textContent,
    ).toBe('在图上拖动可读取任一数据点；点按可将其固定为对比点（虚线框标出）。');
  });
});
