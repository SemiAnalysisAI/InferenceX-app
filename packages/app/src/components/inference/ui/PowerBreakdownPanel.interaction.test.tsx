// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import { PowerXSurfaceProvider } from '@/components/inference/ui/powerx-surface';
import type { BenchmarkRow } from '@/lib/api/api';
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
    xAxis?: {
      tickValues?: (scale: unknown) => number[];
      tickFormat?: (d: number) => string;
    };
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
      // The x axis as D3Chart draws it: the tick values for this scale, then their format.
      const ticks = props.xAxis?.tickValues?.(xScale) ?? [];
      g.selectAll('g.x-axis-stub')
        .data([null])
        .join('g')
        .attr('class', 'x-axis-stub')
        .selectAll('text')
        .data(ticks)
        .join('text')
        .attr('data-testid', 'x-tick')
        .text((d) => props.xAxis?.tickFormat?.(d) ?? String(d));
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
import { nearestColumnIndex, sliderGuideRange } from './PowerBreakdownPanel';
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
const area = (band: string) =>
  container.querySelector<SVGPathElement>(
    `[data-testid="power-breakdown-area"][data-band="${band}"]`,
  )!;
const partRow = (category: string) =>
  container.querySelector<HTMLButtonElement>(
    `[data-testid="power-part-row"][data-category="${category}"]`,
  )!;
const rowPoint = (row: HTMLElement) =>
  row.querySelector('[data-testid="power-chip-compare-point"]')?.textContent;

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

describe('sliderGuideRange', () => {
  it("says whether the slider is past, before or within a chip's points", () => {
    const xs = [2.1, 2.4, 5.2];
    expect(sliderGuideRange(30, xs)).toBe('above');
    expect(sliderGuideRange(1, xs)).toBe('below');
    expect(sliderGuideRange(3, xs)).toBeNull();
    expect(sliderGuideRange(5.2, xs)).toBeNull();
    expect(sliderGuideRange(null, xs)).toBeNull();
    expect(sliderGuideRange(3, [])).toBeNull();
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

  const sliderValue = () =>
    container.querySelector('[data-testid="power-chip-compare-value"]')?.textContent;

  // The stub plot is 517 px wide on even spacing: columns centre at 78, 207, 336, 465.
  const AT = { c64: 60, c16: 210, c4: 330, c1: 470 };

  beforeEach(() => {
    track.mockClear();
    env.coarsePointer = true;
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
});

describe('PowerAnalysisPanels on a single-digit tok/s/user sweep', () => {
  // An agentic sweep that never leaves 2-5 tok/s/user: ten points whose whole-number
  // labels were 2, 2, 2, 3, 3, 3, 3, 5, 5, 5.
  const INTERACTIVITY = [2.06, 2.08, 2.4, 2.66, 2.99, 3.06, 3.32, 4.75, 5.11, 5.16];
  const CONCURRENCY = [12, 10, 8, 7, 6, 4, 5, 3, 2, 1];
  const sweep = INTERACTIVITY.map((x, index) =>
    point(40 + index, 'b200_vllm', CONCURRENCY[index], x, 300 - index * 10),
  );
  const renderInline = () =>
    render(
      <PowerXSurfaceProvider>
        <PowerAnalysisPanels
          data={sweep}
          xField="mean_tpot_intvty"
          xLabel="Interactivity (output tok/s/user)"
          chartId="chart-6"
          placement="before"
        />
      </PowerXSurfaceProvider>,
    );
  const drilldown = () =>
    container.querySelector<HTMLElement>('[data-testid="power-chip-compare-drilldown"]')!;
  const tickLabels = () =>
    [...drilldown().querySelectorAll('[data-testid="x-tick"]')].map((tick) => tick.textContent);
  const readout = () =>
    drilldown().querySelector<HTMLElement>('[data-testid="power-breakdown-readout"]');
  const tiles = () => [
    ...drilldown().querySelectorAll<HTMLButtonElement>(
      '[data-testid="power-breakdown-readout-part"]',
    ),
  ];

  beforeEach(() => track.mockClear());

  it('labels the x axis with distinct values that name real points', () => {
    renderInline();
    const labels = tickLabels();
    expect(labels.length).toBeGreaterThan(4);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) {
      const value = Number(label);
      expect(INTERACTIVITY.some((x) => Math.abs(x - value) <= 0.05)).toBe(true);
    }
  });

  it('keeps the slider guide value above the plot, clear of the reference labels', () => {
    env.coarsePointer = true;
    renderInline();
    const hits = drilldown().querySelectorAll('[data-testid="power-breakdown-hit"]');
    // Hold the lowest-interactivity column, so the slider guide sits off it and is labelled.
    act(() =>
      (hits[0] as SVGRectElement).dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    const label = drilldown().querySelector<SVGTextElement>(
      '[data-testid="power-breakdown-guide-label"]',
    );
    expect(label).not.toBeNull();
    expect(label!.textContent).toMatch(/^Slider \d+\.\d tok\/s\/user$/);
    expect(label!.dataset.range).toBe('within');
    // In the margin above the plot, outside the clipped plot group the reference labels use.
    expect(Number(label!.getAttribute('y'))).toBeLessThan(0);
    expect(label!.closest('g.zoom')).toBeNull();
  });

  it('reads the held point as an even grid of layer tiles and lets it follow the slider again', () => {
    env.coarsePointer = true;
    renderInline();
    const hits = drilldown().querySelectorAll('[data-testid="power-breakdown-hit"]');
    act(() =>
      (hits[0] as SVGRectElement).dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    expect(readout()?.dataset.source).toBe('pinned');
    expect(
      readout()?.querySelector('[data-testid="power-breakdown-readout-point"]')?.textContent,
    ).toBe('c12 · 2.1 tok/s/user');
    // One tile per layer, each with its W/GPU and its share, and the shares add up.
    const shares = tiles().map((tile) =>
      Number(
        tile
          .querySelector('[data-testid="power-breakdown-readout-part-share"]')!
          .textContent!.replace('%', ''),
      ),
    );
    expect(tiles().length).toBeGreaterThanOrEqual(3);
    for (const tile of tiles()) {
      expect(
        tile.querySelector('[data-testid="power-breakdown-readout-part-watts"]')?.textContent,
      ).toMatch(/^\d[\d,]* W$/);
    }
    expect(Math.abs(shares.reduce((sum, share) => sum + share, 0) - 100)).toBeLessThanOrEqual(
      tiles().length,
    );
    expect(
      drilldown().querySelectorAll('[data-testid="power-breakdown-readout-bar"] [data-band]'),
    ).toHaveLength(tiles().length);
    // Isolating a layer marks exactly that tile pressed; the others read faded.
    act(() => tiles()[1].click());
    expect(tiles().map((tile) => tile.getAttribute('aria-pressed'))).toEqual(
      tiles().map((_, index) => String(index === 1)),
    );
    expect(tiles()[0].dataset.emphasis).toBe('faded');
    // The held point names itself and offers the way back to the slider.
    const follow = drilldown().querySelector<HTMLButtonElement>(
      '[data-testid="power-breakdown-readout-follow"]',
    );
    expect(follow?.textContent).toBe('Follow slider');
    act(() => follow!.click());
    expect(readout()?.dataset.source).toBe('compared');
    expect(drilldown().querySelector('[data-testid="power-breakdown-readout-follow"]')).toBeNull();
  });
});
