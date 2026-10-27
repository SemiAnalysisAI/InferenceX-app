// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import type * as MediaQueryHooks from '@/hooks/useMediaQuery';
import type { BenchmarkRow } from '@/lib/api/api';
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

import PowerPartsList from './PowerPartsList';
import { PowerXSurfaceProvider } from './powerx-surface';
import {
  buildPowerBreakdownsWithOverlays,
  breakdownSeriesAtBoundary,
} from '../utils/power-breakdown';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

const [series] = buildPowerBreakdownsWithOverlays(official, undefined);

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
});

// The three largest IT parts; the facility overhead is listed last and always folds.
