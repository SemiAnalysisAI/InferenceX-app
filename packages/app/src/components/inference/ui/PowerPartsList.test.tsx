// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import type * as MediaQueryHooks from '@/hooks/useMediaQuery';
import type { BenchmarkRow } from '@/lib/api/api';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { modelSystemPower } from '@/lib/power/modeled-system-power';

let locale: 'en' | 'zh' = 'en';
const track = vi.fn();
vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => locale }));
vi.mock('@/lib/analytics/analytics', () => ({
  track: (...args: unknown[]) => track(...args),
}));
// jsdom has no media queries: the viewport is flipped per test for the phone branch.
const media = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/useMediaQuery', async (importOriginal) => ({
  ...(await importOriginal<typeof MediaQueryHooks>()),
  useIsMobileViewport: () => media.mobile,
}));

import PowerPartsList, {
  foldPowerPartRows,
  partBarStyle,
  PHONE_VISIBLE_PARTS,
  SPARKLINE_HEIGHT,
} from './PowerPartsList';
import { PowerXSurfaceProvider } from './powerx-surface';
import {
  buildPowerBreakdownsWithOverlays,
  breakdownSeriesAtBoundary,
  partTarget,
  powerPartRows,
  type PowerLayerHighlight,
} from '../utils/power-breakdown';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const RUN_URL = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/777/attempts/1';
const metric = (y: number) => ({ y, roof: false });

const breakdownRow = (gpuWatts: number) =>
  ({
    model: 'qwen3.5',
    hardware: 'b200',
    framework: 'sglang',
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
  conc: number,
  interactivity: number,
  watts: number,
  runUrl = 'https://example.invalid/runs/900000001',
): InferenceData {
  return {
    id,
    hwKey: 'b200_sglang',
    hw: 'B200',
    framework: 'sglang',
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
    modeledSystemPower: modelSystemPower(breakdownRow(watts)),
  } as unknown as InferenceData;
}

const official = [point(1, 64, 20, 640), point(2, 16, 45, 520), point(3, 4, 80, 380)];
const overlay = [point(21, 64, 22, 660, RUN_URL), point(22, 16, 48, 530, RUN_URL)];
const [series] = buildPowerBreakdownsWithOverlays(official, undefined);
const [, overlaySeries] = buildPowerBreakdownsWithOverlays([...official, ...overlay], {
  points: overlay,
  runIndexByUrl: { [RUN_URL]: 3 },
  runInfos: [
    { id: 1, branch: 'main' },
    { id: 2, branch: 'b' },
    { id: 3, branch: 'c' },
    { id: 777, branch: 'parts-list' },
  ],
});

let container: HTMLDivElement;
let root: Root;
const onHover = vi.fn();
const onTogglePin = vi.fn();
// The phone branch is PowerX only: the list renders inside the surface provider.
let powerX = false;

beforeEach(() => {
  locale = 'en';
  media.mobile = false;
  powerX = false;
  track.mockClear();
  onHover.mockClear();
  onTogglePin.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (props: Partial<React.ComponentProps<typeof PowerPartsList>> = {}) => {
  const list = (
    <PowerPartsList
      series={series}
      entry={series.points[1]}
      color="var(--b200_sglang)"
      highlight={null}
      onHover={onHover}
      onTogglePin={onTogglePin}
      {...props}
    />
  );
  return act(() =>
    root.render(powerX ? <PowerXSurfaceProvider>{list}</PowerXSurfaceProvider> : list),
  );
};
const mouse = (element: Element, type: string) =>
  act(() => {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  });
const rows = () => [
  ...container.querySelectorAll<HTMLButtonElement>('[data-testid="power-part-row"]'),
];
const row = (category: string) =>
  container.querySelector<HTMLButtonElement>(
    `[data-testid="power-part-row"][data-category="${category}"]`,
  )!;
const text = (element: Element, testId: string) =>
  element.querySelector(`[data-testid="${testId}"]`)?.textContent;

describe('PowerPartsList', () => {
  it('heads the list with the compared point and lists its parts heaviest first, facility last', () => {
    render();
    expect(container.querySelector('[data-testid="power-parts-heading"]')?.textContent).toBe(
      'B200 (SGLang) FP8 · c16 · 45 tok/s/user',
    );
    const items = rows();
    expect(items[0].dataset.category).toBe('gpu');
    expect(items[0].querySelector('span')?.textContent).toBe('GPU');
    expect(row('facility').querySelector('span')?.textContent).toBe('Facility (PUE)');
    expect(items[0].dataset.band).toBe('gpu');
    expect(row('nic').dataset.band).toBe('server');
    expect(row('fans').dataset.band).toBe('fansPsu');
    expect(text(items[0], 'power-part-watts')).toBe('520 W');
    expect(items.at(-1)!.dataset.category).toBe('facility');
    expect(items.at(-1)!.closest('li')?.className).toContain('border-t');
    const watts = items.slice(0, -1).map((item) => Number(item.dataset.share));
    for (let index = 1; index < watts.length; index += 1) {
      expect(watts[index]).toBeLessThanOrEqual(watts[index - 1]);
    }
    // Empty parts are left out: a B200 chassis has no measured Grace socket.
    expect(items.map((item) => item.dataset.category)).not.toContain('measuredCpu');
    expect(items.map((item) => item.dataset.category).toSorted()).toEqual(
      [...series.categories].toSorted(),
    );
  });

  it('shows each IT share of IT summing to 100 % and the facility share of the facility total', () => {
    render();
    const itRows = rows().slice(0, -1);
    expect(itRows.reduce((sum, item) => sum + Number(item.dataset.share), 0)).toBeCloseTo(1, 9);
    expect(text(row('gpu'), 'power-part-share')).toMatch(/^\d+%$/u);
    expect(
      row('gpu').querySelector('[data-testid="power-part-share"]')?.getAttribute('title'),
    ).toBe('Share of IT W/GPU');
    expect(
      row('facility').querySelector('[data-testid="power-part-share"]')?.getAttribute('title'),
    ).toBe('Share of facility W/GPU');
    const facility = powerPartRows(series, series.points[1]).at(-1)!;
    expect(Number(row('facility').dataset.share)).toBeCloseTo(facility.share, 9);
  });

  it('scales every sparkline to its own max, with the dot on the compared point', () => {
    render();
    for (const item of rows()) {
      const spark = item.querySelector<SVGSVGElement>('[data-testid="power-part-sparkline"]')!;
      const history = powerPartRows(series, series.points[1]).find(
        (part) => part.category === item.dataset.category,
      )!.history;
      expect(Number(spark.dataset.max)).toBe(Math.max(...history));
      // The part's peak touches the top of its own box (1 px inset).
      const ys = (spark.querySelector('path[fill="none"]')?.getAttribute('d') ?? '')
        .split(/[ML]/u)
        .filter(Boolean)
        .map((pair) => Number(pair.split(',')[1]));
      expect(Math.min(...ys)).toBe(1);
      expect(Math.max(...ys)).toBeLessThanOrEqual(SPARKLINE_HEIGHT - 1);
    }
    // The GPU part peaks at c64, the first point, so its dot (c16) sits below the top.
    const gpuDot = row('gpu').querySelector('circle')!;
    expect(Number(gpuDot.getAttribute('cx'))).toBe(36);
    expect(Number(gpuDot.getAttribute('cy'))).toBeGreaterThan(1);
    // A fixed part is flat: every y is the top of its own scale.
    const cpuYs = (row('cpu').querySelector('path[fill="none"]')?.getAttribute('d') ?? '')
      .split(/[ML]/u)
      .filter(Boolean)
      .map((pair) => Number(pair.split(',')[1]));
    expect(new Set(cpuYs)).toEqual(new Set([1]));
  });

  it('draws measured bars solid and modeled bars at their band step with a dashed edge', () => {
    render();
    const measured = row('gpu').querySelector<HTMLElement>('[data-testid="power-part-bar"]')!;
    const modeled = row('fans').querySelector<HTMLElement>('[data-testid="power-part-bar"]')!;
    expect(measured.style.width).toBe('100%');
    expect(measured.style.backgroundColor).toContain('90%');
    expect(measured.style.borderLeft).toBe('');
    expect(modeled.style.backgroundColor).toContain('34%');
    expect(modeled.style.borderLeft).toContain('dashed');
    expect(Number.parseFloat(modeled.style.width)).toBeLessThan(100);
    const server = row('nic').querySelector<HTMLElement>('[data-testid="power-part-bar"]')!;
    expect(server.style.backgroundColor).toContain('50%');
    // The facility bar sits on the hatch tint, not its (transparent) step.
    expect(partBarStyle(powerPartRows(series, series.points[1]).at(-1)!, 'red')).toMatchObject({
      backgroundColor: 'color-mix(in oklab, red 18%, transparent)',
      borderLeft: '2px dashed red',
    });
  });

  it('names each row’s basis in its title: measured, modeled fixed or modeled moving with load', () => {
    render();
    expect(row('gpu').getAttribute('title')).toBe('Measured');
    expect(row('fans').getAttribute('title')).toBe('Modeled · moves with load');
    expect(row('psuLoss').getAttribute('title')).toBe('Modeled · moves with load');
    expect(row('cpu').getAttribute('title')).toBe('Modeled · fixed');
    expect(row('nic').getAttribute('title')).toBe('Modeled · fixed');
    expect(row('facility').getAttribute('title')).toBe('Modeled · moves with load');
  });

  it('hovers a row as its part target, pins on click and reports both', () => {
    render();
    mouse(row('fans'), 'mouseover');
    expect(onHover).toHaveBeenLastCalledWith(partTarget('fans'));
    expect(onHover).toHaveBeenLastCalledWith({ band: 'fansPsu', category: 'fans' });
    expect(track).toHaveBeenCalledWith('powerx_breakdown_part_hovered', { category: 'fans' });
    mouse(row('fans'), 'mouseout');
    expect(onHover).toHaveBeenLastCalledWith(null);
    mouse(row('nic'), 'click');
    expect(onTogglePin).toHaveBeenCalledWith(partTarget('nic'));
    expect(track).toHaveBeenCalledWith('powerx_breakdown_part_pinned', { category: 'nic' });
  });

  it('reflects the shared highlight: the hovered row, its band’s siblings, and a pin', () => {
    const highlight: PowerLayerHighlight = { ...partTarget('fans'), pinned: true };
    render({ highlight });
    expect(row('fans').dataset.emphasis).toBe('highlighted');
    expect(row('fans').getAttribute('aria-pressed')).toBe('true');
    expect(row('fans').getAttribute('title')).toBe('Modeled · moves with load · Pinned');
    expect(row('cpu').dataset.emphasis).toBe('plain');
    expect(row('gpu').dataset.emphasis).toBe('plain');
    render({ highlight: { band: 'fansPsu', category: null, pinned: false } });
    expect(row('fans').dataset.emphasis).toBe('band');
    expect(row('psuLoss').dataset.emphasis).toBe('band');
    expect(row('cpu').dataset.emphasis).toBe('plain');
    expect(row('gpu').dataset.emphasis).toBe('plain');
    render({ highlight: { band: 'server', category: null, pinned: false } });
    expect(row('cpu').dataset.emphasis).toBe('band');
    expect(row('nic').dataset.emphasis).toBe('band');
    expect(row('fans').dataset.emphasis).toBe('plain');
    expect(row('fans').getAttribute('aria-pressed')).toBe('false');
  });

  it('follows the compared point and the boundary', () => {
    render({ entry: series.points[0] });
    expect(container.querySelector('[data-testid="power-parts-heading"]')?.textContent).toBe(
      'B200 (SGLang) FP8 · c64 · 20 tok/s/user',
    );
    expect(text(row('gpu'), 'power-part-watts')).toBe('640 W');
    expect(Number(row('gpu').querySelector('circle')?.getAttribute('cx'))).toBe(1);
    const itSeries = breakdownSeriesAtBoundary(series, false);
    render({ series: itSeries, entry: itSeries.points[0] });
    expect(rows().map((item) => item.dataset.category)).not.toContain('facility');
  });

  it('colours an overlay run’s list with the run colour and names the run', () => {
    render({ series: overlaySeries, entry: overlaySeries.points[1], color: overlayRunColor(3) });
    expect(container.querySelector('[data-testid="power-parts-heading"]')?.textContent).toContain(
      'parts-list',
    );
    expect(text(row('gpu'), 'power-part-watts')).toBe('530 W');
    const bar = row('gpu').querySelector<HTMLElement>('[data-testid="power-part-bar"]')!;
    expect(bar.style.backgroundColor).toContain('--overlay-run-3');
    expect(row('gpu').querySelector('circle')?.getAttribute('fill')).toBe(overlayRunColor(3));
    expect(row('gpu').querySelector('path')?.getAttribute('fill')).toBe(overlayRunColor(3));
  });

  it('renders Chinese labels', () => {
    locale = 'zh';
    render();
    expect(row('gpu').querySelector('span')?.textContent).toBe('GPU');
    expect(row('fans').querySelector('span')?.textContent).toBe('风扇');
    expect(row('facility').querySelector('span')?.textContent).toBe('机房开销（PUE）');
    expect(row('fans').getAttribute('title')).toBe('建模 · 随负载变化');
    expect(row('cpu').getAttribute('title')).toBe('建模 · 固定');
    expect(row('gpu').getAttribute('title')).toBe('实测');
    expect(container.querySelector('ul')?.getAttribute('aria-label')).toBe('对比点处的功耗部件');
    expect(
      row('gpu').querySelector('[data-testid="power-part-share"]')?.getAttribute('title'),
    ).toBe('占 IT W/GPU 的比例');
  });
});

const STRINGS_EN_CATEGORIES = {
  gpu: 'GPU',
  measuredCpu: 'Grace CPU',
  cpu: 'CPU',
  memory: 'Memory',
  nic: 'NICs',
  nvswitch: 'NVSwitch',
  storage: 'Storage',
  other: 'PCIe & misc',
  fans: 'Fans',
  psuLoss: 'PSU loss',
  network: 'Network share',
  facility: 'Facility (PUE)',
};

const categories = () => rows().map((item) => item.dataset.category);
const toggle = () =>
  container.querySelector<HTMLButtonElement>('[data-testid="power-parts-toggle"]');
const rest = () => container.querySelector<HTMLUListElement>('[data-testid="power-parts-rest"]');
const parts = powerPartRows(series, series.points[1]);
// The three largest IT parts; the facility overhead is listed last and always folds.
const heaviest = parts
  .filter((part) => part.category !== 'facility')
  .toSorted((a, b) => b.watts - a.watts)
  .slice(0, PHONE_VISIBLE_PARTS)
  .map((part) => part.category);
// The list's own order (heaviest first, facility last) filtered to the three largest.
const topThree = parts.filter((part) => heaviest.includes(part.category)).map((p) => p.category);

describe('PowerPartsList on a PowerX phone', () => {
  beforeEach(() => {
    media.mobile = true;
    powerX = true;
  });

  it('folds to the three largest parts and an All N parts row that opens the rest in place', () => {
    render();
    expect(parts.length).toBeGreaterThan(PHONE_VISIBLE_PARTS);
    expect(
      container.querySelector<HTMLElement>('[data-testid="power-parts-list"]')?.dataset.folded,
    ).toBe('true');
    expect(categories()).toEqual(topThree);
    expect(categories()[0]).toBe('gpu');
    expect(categories()).not.toContain('fans');
    // The facility overhead outweighs several IT parts but stays in the remainder.
    expect(parts.at(-1)!.category).toBe('facility');
    expect(parts.at(-1)!.watts).toBeGreaterThan(parts.find((p) => p.category === 'fans')!.watts);
    expect(categories()).not.toContain('facility');
    // 56 px two-line rows that keep the bar and the sparkline.
    for (const item of rows()) {
      expect(item.className).toContain('min-h-14');
      expect(
        item.querySelector('[data-testid="power-part-bar"]')?.parentElement?.className,
      ).toContain('h-2');
      expect(item.querySelector('[data-testid="power-part-sparkline"]')).not.toBeNull();
      expect(item.querySelector('span')?.textContent).toBe(
        STRINGS_EN_CATEGORIES[item.dataset.category as keyof typeof STRINGS_EN_CATEGORIES],
      );
    }
    const button = toggle()!;
    expect(button.textContent).toBe(`All ${parts.length} parts · across load`);
    expect(button.className).toContain('min-h-11');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe(rest()!.id);
    expect(rest()!.children).toHaveLength(0);
    act(() => button.click());
    expect(toggle()!.getAttribute('aria-expanded')).toBe('true');
    expect(categories()).toEqual(parts.map((part) => part.category));
    expect(rest()!.querySelectorAll('[data-testid="power-part-row"]')).toHaveLength(
      parts.length - PHONE_VISIBLE_PARTS,
    );
    expect(track).toHaveBeenCalledWith('powerx_parts_expanded', {
      expanded: true,
      hw: 'b200_sglang',
    });
    // The facility row keeps its rule at the end of the remainder.
    expect(rest()!.querySelector('li:last-child')?.className).toContain('border-t');
    act(() => toggle()!.click());
    expect(categories()).toEqual(topThree);
    expect(track).toHaveBeenLastCalledWith('powerx_parts_expanded', {
      expanded: false,
      hw: 'b200_sglang',
    });
    // Rows in the folded list still hover and pin their part.
    mouse(row('gpu'), 'mouseover');
    expect(onHover).toHaveBeenLastCalledWith(partTarget('gpu'));
    mouse(row('gpu'), 'click');
    expect(onTogglePin).toHaveBeenCalledWith(partTarget('gpu'));
  });

  it('keeps a pinned part visible when it sits in the folded remainder', () => {
    render({ highlight: { ...partTarget('fans'), pinned: true } });
    expect(categories()).toEqual([...topThree, 'fans']);
    expect(row('fans').getAttribute('aria-pressed')).toBe('true');
    expect(toggle()!.textContent).toBe(`All ${parts.length} parts · across load`);
    expect(toggle()!.getAttribute('aria-expanded')).toBe('false');
    // Open, the list keeps its order: the pinned row stays in the remainder, where a tap
    // pinned it, and rejoins the visible rows when the list folds.
    act(() => toggle()!.click());
    expect(categories()).toEqual(parts.map((part) => part.category));
    expect(rest()!.querySelector('[data-category="fans"]')).not.toBeNull();
    expect(row('fans').getAttribute('aria-pressed')).toBe('true');
    act(() => toggle()!.click());
    expect(categories()).toEqual([...topThree, 'fans']);
    render({ highlight: { ...partTarget('facility'), pinned: true } });
    expect(categories()).toEqual([...topThree, 'facility']);
    expect(row('facility').closest('li')?.className).toContain('border-t');
    // A hovered (unpinned) part and a pinned band add nothing to the visible rows.
    render({ highlight: { ...partTarget('fans'), pinned: false } });
    expect(categories()).toEqual(topThree);
    render({ highlight: { band: 'fansPsu', category: null, pinned: true } });
    expect(categories()).toEqual(topThree);
    // A pinned part among the three largest changes nothing either.
    render({ highlight: { ...partTarget('gpu'), pinned: true } });
    expect(categories()).toEqual(topThree);
    expect(foldPowerPartRows(parts, 'fans').shown.map((part) => part.category)).toEqual([
      ...topThree,
      'fans',
    ]);
    expect(foldPowerPartRows(parts, null).rest).toHaveLength(parts.length - PHONE_VISIBLE_PARTS);
  });

  it('keeps the full list from md up and outside PowerX', () => {
    media.mobile = false;
    render();
    expect(categories()).toEqual(parts.map((part) => part.category));
    expect(toggle()).toBeNull();
    expect(rows()[0].className).not.toContain('min-h-14');
    media.mobile = true;
    powerX = false;
    render();
    expect(categories()).toEqual(parts.map((part) => part.category));
    expect(toggle()).toBeNull();
    expect(
      container.querySelector<HTMLElement>('[data-testid="power-parts-list"]')?.dataset.folded,
    ).toBeUndefined();
  });

  it('shows every part when a chip has three or fewer', () => {
    const itSeries = breakdownSeriesAtBoundary(series, false);
    render({ series: itSeries, entry: itSeries.points[0] });
    expect(parts.length - 1).toBeGreaterThan(PHONE_VISIBLE_PARTS);
    expect(rows()).toHaveLength(PHONE_VISIBLE_PARTS);
    expect(toggle()!.textContent).toBe(`All ${parts.length - 1} parts · across load`);
    expect(categories()).not.toContain('facility');
  });

  it('colours an overlay run’s folded list and its remainder with the run colour', () => {
    render({ series: overlaySeries, entry: overlaySeries.points[1], color: overlayRunColor(3) });
    expect(container.querySelector('[data-testid="power-parts-heading"]')?.textContent).toContain(
      'parts-list',
    );
    expect(rows()).toHaveLength(PHONE_VISIBLE_PARTS);
    act(() => toggle()!.click());
    expect(rows().length).toBeGreaterThan(PHONE_VISIBLE_PARTS);
    for (const item of rows()) {
      const bar = item.querySelector<HTMLElement>('[data-testid="power-part-bar"]')!;
      expect(bar.style.backgroundColor).toContain('--overlay-run-3');
      expect(item.querySelector('circle')?.getAttribute('fill')).toBe(overlayRunColor(3));
    }
  });

  it('renders the Chinese toggle label', () => {
    locale = 'zh';
    render();
    expect(toggle()!.textContent).toBe(`全部 ${parts.length} 项 · 随负载变化`);
    expect(row('gpu').querySelector('span')?.textContent).toBe('GPU');
  });
});
