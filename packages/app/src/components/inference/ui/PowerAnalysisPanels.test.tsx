// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import { PowerXSurfaceProvider } from '@/components/inference/ui/powerx-surface';
import type { BenchmarkRow } from '@/lib/api/api';
import { getHardwareConfig } from '@/lib/catalog/constants';
import { modelSystemPower } from '@/lib/power/modeled-system-power';
import { getDisplayLabel } from '@/lib/shared/utils';

vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));
vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));
vi.mock('@/hooks/useUrlState', () => ({
  useUrlState: () => ({ getUrlParam: () => null, setUrlParams: () => {} }),
}));
vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ resolveColor: (key: string) => `var(--${key})` }),
}));
vi.mock('@/providers/unofficial-run-provider', () => ({
  useUnofficialRun: () => ({ runIndexByUrl: {} }),
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
  hwKey: 'b200_sglang' | 'b200_vllm',
  conc: number,
  interactivity: number,
  watts: number,
): InferenceData {
  const framework = hwKey === 'b200_sglang' ? 'sglang' : 'vllm';
  return {
    id,
    hwKey,
    hw: 'B200',
    framework,
    model: MODEL,
    precision: 'fp8',
    physicalChips: 8,
    tp: 8,
    decode_tp: 8,
    conc,
    date: '2026-09-23',
    run_url: 'https://example.invalid/runs/900000001',
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
const label = (hwKey: string) => getDisplayLabel(getHardwareConfig(hwKey, MODEL));
const SGLANG_TITLE = `${label('b200_sglang')} FP8 across load`;
const VLLM_TITLE = `${label('b200_vllm')} FP8 across load`;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <PowerXSurfaceProvider>
        <PowerAnalysisPanels
          data={[...sglang, ...vllm]}
          xField="mean_tpot_intvty"
          xLabel="Interactivity (output tok/s/user)"
          chartId="chart-0"
          placement="before"
          layout="inline"
        />
      </PowerXSurfaceProvider>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

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
  it('opens under the compared chip on first render, with the across-load controls', () => {
    expect(container.querySelector('[data-testid="power-chip-compare-value"]')?.textContent).toBe(
      '60 tok/s/user',
    );
    expect(drilldowns()).toHaveLength(1);
    expect(drilldownTitle()).toBe(VLLM_TITLE);
    // The drill-down sits inside the compared chip's row, which is the active one.
    const row = expandedRow();
    expect(
      row?.closest('li')?.querySelector('[data-testid="power-chip-compare-drilldown"]'),
    ).not.toBeNull();
    expect(row?.getAttribute('aria-pressed')).toBe('true');
    const drilldown = drilldowns()[0];
    expect(drilldown.querySelector('[data-testid="power-breakdown-source"]')).not.toBeNull();
    const views = [
      ...drilldown.querySelectorAll<HTMLButtonElement>(
        '[data-testid="power-breakdown-view"] button',
      ),
    ];
    expect(views.map((button) => button.textContent)).toEqual(['Stacked bars', 'Stacked area']);
    expect(drilldown.querySelector('[data-testid="power-breakdown-collapse"]')).not.toBeNull();
    expect(drilldown.querySelector('[data-testid="chart-buttons"]')).not.toBeNull();
    // One stack legend for the whole view: the compact panel adds none of its own.
    expect(container.querySelector('[data-testid="power-breakdown-legend"]')).toBeNull();
  });

  it('opens on the stacked area view and switches the compact panel to stacked bars', () => {
    const drilldown = '[data-testid="power-chip-compare-drilldown"]';
    expect(
      container
        .querySelector(`${drilldown} [data-testid="power-breakdown-view-area"]`)
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    const bars = container.querySelector<HTMLButtonElement>(
      `${drilldown} [data-testid="power-breakdown-view-bars"]`,
    )!;
    expect(bars.getAttribute('aria-pressed')).toBe('false');
    act(() => bars.click());
    expect(
      container
        .querySelector(`${drilldown} [data-testid="power-breakdown-view-bars"]`)
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      container.querySelector(
        '[data-testid="power-chip-compare-drilldown"] [data-testid="d3-chart-stub"]',
      ),
    ).not.toBeNull();
  });

  it('follows the slider to the chip nearest the new interactivity', () => {
    moveSlider(0);
    expect(container.querySelector('[data-testid="power-chip-compare-value"]')?.textContent).toBe(
      '20 tok/s/user',
    );
    expect(drilldowns()).toHaveLength(1);
    expect(drilldownTitle()).toBe(SGLANG_TITLE);
  });

  it('stays collapsed after Collapse until a bar is clicked, even when the slider moves', () => {
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
  });

  it('pins to a clicked bar, and clicking the open bar closes it', () => {
    act(() => rowFor(SGLANG_TITLE)!.click());
    expect(drilldownTitle()).toBe(SGLANG_TITLE);
    expect(rowFor(SGLANG_TITLE)?.getAttribute('aria-expanded')).toBe('true');
    act(() => rowFor(SGLANG_TITLE)!.click());
    expect(drilldowns()).toHaveLength(0);
  });
});
