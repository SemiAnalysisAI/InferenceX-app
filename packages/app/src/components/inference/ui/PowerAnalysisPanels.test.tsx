// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import { PowerXSurfaceProvider } from '@/components/inference/ui/powerx-surface';
import type * as MediaQueryHooks from '@/hooks/useMediaQuery';
import type { BenchmarkRow } from '@/lib/api/api';
import { getHardwareConfig } from '@/lib/catalog/constants';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { modelSystemPower } from '@/lib/power/modeled-system-power';
import { getDisplayLabel } from '@/lib/shared/utils';

const urlState = vi.hoisted(() => ({
  params: {} as Record<string, string | undefined>,
  setUrlParams: vi.fn(),
}));
const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));
vi.mock('@/lib/analytics/analytics', () => ({ track }));
vi.mock('@/hooks/useUrlState', () => ({
  useUrlState: () => ({
    getUrlParam: (key: string) => urlState.params[key],
    setUrlParams: urlState.setUrlParams,
  }),
}));
vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ resolveColor: (key: string) => `var(--${key})` }),
}));
// The overlay-run context, set per test for the `?unofficialrun=` cases.
const unofficial = vi.hoisted(() => ({
  runIndexByUrl: {} as Record<string, number>,
  unofficialRunInfos: [] as { id: number; branch: string }[],
}));
vi.mock('@/providers/unofficial-run-provider', () => ({
  useUnofficialRun: () => unofficial,
}));
// jsdom has no media queries: the pointer type and the viewport are flipped per test for
// the touch and phone branches.
const media = vi.hoisted(() => ({ coarsePointer: false, mobile: false }));
vi.mock('@/hooks/useMediaQuery', async (importOriginal) => ({
  ...(await importOriginal<typeof MediaQueryHooks>()),
  useIsCoarsePointer: () => media.coarsePointer,
  useIsMobileViewport: () => media.mobile,
}));
// The breakdown plot is D3 against a measured layout; jsdom has none, so the chart is a stub.
vi.mock('@/lib/d3-chart/D3Chart', () => ({
  D3Chart: () => <div data-testid="d3-chart-stub" />,
}));
vi.mock('@/components/ui/chart-buttons', () => ({
  ChartButtons: () => <div data-testid="chart-buttons" />,
}));

import PowerAnalysisPanels from './PowerAnalysisPanels';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const metric = (y: number) => ({ y, roof: false });
const MODEL = 'dsv4pro';

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
  hwKey: 'b200_sglang' | 'b200_vllm' | 'h200_sglang',
  conc: number,
  interactivity: number,
  watts: number,
  runUrl = 'https://example.invalid/runs/900000001',
): InferenceData {
  const framework = hwKey === 'b200_vllm' ? 'vllm' : 'sglang';
  return {
    id,
    hwKey,
    hw: hwKey.startsWith('h200') ? 'H200' : 'B200',
    framework,
    model: MODEL,
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

// Two chips whose sweeps overlap: the slider lands at sqrt(30 × 120) = 60, exactly on a
// vLLM point, and its lowest stop (20 tok/s/user) is exactly an SGLang point.
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
// A lighter chip that the registry lists after B200: the old watts order put it first.

const label = (hwKey: string) => getDisplayLabel(getHardwareConfig(hwKey, MODEL));
const SGLANG_TITLE = `${label('b200_sglang')} FP8 across load`;
const VLLM_TITLE = `${label('b200_vllm')} FP8 across load`;

let container: HTMLDivElement;
let root: Root;

const mount = (data: InferenceData[], overlayData: InferenceData[] = []) => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <PowerXSurfaceProvider>
        <PowerAnalysisPanels
          data={data}
          overlayData={overlayData}
          xField="mean_tpot_intvty"
          xLabel="Interactivity (output tok/s/user)"
          chartId="chart-0"
          placement="before"
        />
      </PowerXSurfaceProvider>,
    );
  });
};
const unmount = () => {
  act(() => root.unmount());
  container.remove();
};

beforeEach(() => {
  urlState.params = {};
  urlState.setUrlParams.mockClear();
  track.mockClear();
  media.coarsePointer = false;
  media.mobile = false;
  unofficial.runIndexByUrl = {};
  unofficial.unofficialRunInfos = [];
  mount([...sglang, ...vllm]);
});

afterEach(unmount);

const drilldowns = () => container.querySelectorAll('[data-testid="power-chip-compare-drilldown"]');
const drilldownTitle = () =>
  container.querySelector('[data-testid="power-chip-compare-drilldown"] h3')?.textContent;
const expandedRow = () =>
  container.querySelector<HTMLButtonElement>(
    '[data-testid="power-chip-compare-row"][aria-expanded="true"]',
  );
const rowFor = (title: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('[data-testid="power-chip-compare-row"]')].find(
    (row) => title.startsWith(row.querySelector('span span span.truncate')?.textContent ?? '\0'),
  );
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

describe('PowerAnalysisPanels inline drill-down', () => {
  it('follows the slider to the chip nearest the new interactivity, parts list included', () => {
    const heading = () =>
      container.querySelector('[data-testid="power-parts-heading"]')?.textContent;
    expect(heading()).toBe(`${label('b200_vllm')} FP8 · c16 · 60 tok/s/user`);
    moveSlider(0);
    expect(container.querySelector('[data-testid="power-chip-compare-value"]')?.textContent).toBe(
      '20 tok/s/user',
    );
    expect(drilldowns()).toHaveLength(1);
    expect(drilldownTitle()).toBe(SGLANG_TITLE);
    // The list re-reads the new chip at its c64 point: GPU 640 W, the heaviest row first.
    expect(heading()).toBe(`${label('b200_sglang')} FP8 · c64 · 20 tok/s/user`);
    const rows = [...container.querySelectorAll<HTMLElement>('[data-testid="power-part-row"]')];
    expect(rows[0].dataset.category).toBe('gpu');
    expect(rows[0].querySelector('[data-testid="power-part-watts"]')?.textContent).toBe('640 W');
    // PowerX counts the facility overhead by default: a facility row and band.
    expect(rows.map((row) => row.dataset.category)).toContain('facility');
    expect(
      container.querySelectorAll('[data-testid="power-chip-compare-segment"][data-band="facility"]')
        .length,
    ).toBeGreaterThan(0);
  });

  it('stays collapsed after Collapse until a bar is clicked, even when the slider moves, and a second click closes it', () => {
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="power-breakdown-collapse"]')!
        .click(),
    );
    expect(drilldowns()).toHaveLength(0);
    expect(expandedRow()).toBeNull();
    moveSlider(0);
    expect(drilldowns()).toHaveLength(0);
    act(() => rowFor(VLLM_TITLE)!.click());
    expect(drilldowns()).toHaveLength(1);
    expect(drilldownTitle()).toBe(VLLM_TITLE);
    // Clicking the open bar closes it again.
    act(() => rowFor(VLLM_TITLE)!.click());
    expect(drilldowns()).toHaveLength(0);
  });
});

const rows = () => [
  ...container.querySelectorAll<HTMLButtonElement>('[data-testid="power-chip-compare-row"]'),
];
const partRows = () => [
  ...container.querySelectorAll<HTMLButtonElement>('[data-testid="power-part-row"]'),
];
const partsToggle = () =>
  container.querySelector<HTMLButtonElement>('[data-testid="power-parts-toggle"]');
const cardName = (row: HTMLElement) => row.querySelector('.truncate')?.textContent;
const segmentsOf = (row: HTMLElement) => [
  ...row.querySelectorAll<HTMLElement>('[data-testid="power-chip-compare-segment"]'),
];

describe('PowerAnalysisPanels on a PowerX phone (compact chip cards, folded parts)', () => {
  const phone = (data = [...sglang, ...vllm], overlayData: InferenceData[] = []) => {
    unmount();
    media.mobile = true;
    media.coarsePointer = true;
    mount(data, overlayData);
  };

  it('colours an overlay run’s compact card and its folded parts with the run colour', () => {
    const RUN_URL = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/777/attempts/1';
    const overlay = [
      point(31, 'h200_sglang', 64, 25, 300, RUN_URL),
      point(32, 'h200_sglang', 16, 50, 250, RUN_URL),
      point(33, 'h200_sglang', 4, 90, 200, RUN_URL),
    ];
    unofficial.runIndexByUrl = { [RUN_URL]: 0 };
    unofficial.unofficialRunInfos = [{ id: 777, branch: 'phone-rows' }];
    phone([...sglang, ...vllm, ...overlay], overlay);
    const cards = rows();
    // Official chips first, the overlay line after them.
    expect(cards).toHaveLength(3);
    const card = cards[2];
    expect(card.dataset.layout).toBe('compact');
    expect(cardName(card)).toContain('phone-rows');
    expect(card.querySelector('span[aria-hidden]')?.getAttribute('style')).toContain(
      overlayRunColor(0),
    );
    for (const segment of segmentsOf(card)) {
      expect(segment.getAttribute('style')).toContain('--overlay-run-0');
      expect(segment.textContent).toBe('');
    }
    // Its drill-down lists the run's parts in the run colour, folded like an official chip's.
    if (card.getAttribute('aria-expanded') !== 'true') act(() => card.click());
    expect(cardName(expandedRow()!)).toContain('phone-rows');
    expect(container.querySelector('[data-testid="power-parts-heading"]')?.textContent).toContain(
      'phone-rows',
    );
    expect(partRows()).toHaveLength(3);
    for (const item of partRows()) {
      expect(
        item.querySelector<HTMLElement>('[data-testid="power-part-bar"]')?.getAttribute('style'),
      ).toContain('--overlay-run-0');
    }
    expect(partsToggle()!.textContent).toMatch(/^All \d+ parts · across load$/u);
  });
});
