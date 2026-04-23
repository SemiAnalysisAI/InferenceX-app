// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ChartDefinition,
  HardwareConfig,
  InferenceData,
  OverlayData,
} from '@/components/inference/types';

vi.mock('@/lib/constants', () => ({
  getModelSortIndex: () => 0,
}));

import ParetoUpliftPanel from './ParetoUpliftPanel';

let container: HTMLDivElement;
let root: Root;

function renderUi(ui: React.ReactNode) {
  act(() => root.render(ui));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

interface PtOpts {
  ttft?: number;
  p99_ttft?: number;
  tpot?: number;
  e2el?: number;
  intvty?: number;
}

function pt(x: number, y: number, hwKey: string, date: string, opts: PtOpts = {}): InferenceData {
  return {
    date,
    x,
    y,
    tp: 1,
    conc: 1,
    hwKey,
    precision: 'fp8',
    tpPerGpu: { y, roof: false },
    tpPerMw: { y, roof: false },
    costh: { y, roof: false },
    costn: { y, roof: false },
    costr: { y, roof: false },
    costhi: { y, roof: false },
    costni: { y, roof: false },
    costri: { y, roof: false },
    median_ttft: opts.ttft,
    p99_ttft: opts.p99_ttft,
    median_tpot: opts.tpot,
    median_e2el: opts.e2el,
    median_intvty: opts.intvty,
  };
}

const interactivityChartDef: ChartDefinition = {
  chartType: 'interactivity',
  heading: 'vs. Interactivity',
  x: 'median_intvty',
  x_label: 'Interactivity (tok/s/user)',
  y: 'tput_per_gpu',
  y_tpPerGpu: 'tpPerGpu.y',
  y_tpPerGpu_label: 'Token Throughput per GPU',
  y_tpPerGpu_title: 'Token Throughput per GPU',
  y_tpPerGpu_roofline: 'upper_left',
};

const hardwareConfig: HardwareConfig = {
  h100: { name: 'h100', label: 'H100', suffix: '(TRT)', gpu: 'H100 TRT' },
  b200: { name: 'b200', label: 'B200', suffix: '(TRT)', gpu: 'B200 TRT' },
};

const baseProps = {
  chartDefinition: interactivityChartDef,
  selectedYAxisMetric: 'y_tpPerGpu',
  hardwareConfig,
  activeHwTypes: new Set(['h100', 'b200']),
  activeDates: new Set<string>(),
  selectedPrecisions: ['fp8'],
  selectedRunDate: '2025-04-17',
  selectedDates: [] as string[],
  selectedDateRange: { startDate: '', endDate: '' },
  isTimelineMode: false,
  chartType: 'interactivity',
};

describe('ParetoUpliftPanel', () => {
  it('renders nothing when there are no comparison dates and no overlay', () => {
    const data = [pt(10, 300, 'h100', '2025-04-17'), pt(20, 200, 'h100', '2025-04-17')];
    renderUi(<ParetoUpliftPanel {...baseProps} data={data} />);
    expect(container.querySelector('[data-testid="pareto-uplift-panel"]')).toBeNull();
  });

  it('renders a GPU × metric table with a primary Pareto row plus scalar time-stat rows', () => {
    // Reference (main date): Pareto-valid upper_left front with 2× throughput and halved latencies.
    const data = [
      pt(10, 300, 'h100', '2025-04-17', {
        ttft: 0.05,
        p99_ttft: 0.1,
        tpot: 0.02,
        e2el: 0.5,
        intvty: 50,
      }),
      pt(20, 200, 'h100', '2025-04-17', {
        ttft: 0.04,
        p99_ttft: 0.08,
        tpot: 0.015,
        e2el: 0.4,
        intvty: 60,
      }),
      pt(10, 150, 'h100', '2025-04-10', {
        ttft: 0.1,
        p99_ttft: 0.2,
        tpot: 0.04,
        e2el: 1,
        intvty: 25,
      }),
      pt(20, 100, 'h100', '2025-04-10', {
        ttft: 0.08,
        p99_ttft: 0.16,
        tpot: 0.03,
        e2el: 0.8,
        intvty: 30,
      }),
    ];
    renderUi(<ParetoUpliftPanel {...baseProps} data={data} selectedDates={['2025-04-10']} />);

    const panel = container.querySelector('[data-testid="pareto-uplift-panel"]');
    expect(panel).not.toBeNull();

    const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers[0]).toBe('GPU');
    expect(headers[1]).toBe('Metric');
    expect(headers[2]).toContain('2025-04-10');

    const rows = [...container.querySelectorAll('tbody tr')];
    // 1 primary (Pareto) + 5 scalar metrics (Median TTFT, P99 TTFT, Median TPOT, Median E2EL, Interactivity)
    expect(rows).toHaveLength(6);

    // First row: GPU name, "Token Throughput per GPU" metric label, +% cell (Pareto).
    const firstCells = rows[0].querySelectorAll('td');
    expect(firstCells[0].textContent).toContain('H100');
    expect(firstCells[1].textContent).toContain('Token Throughput per GPU');
    expect(firstCells[2].textContent).toMatch(/\+/);

    // Subsequent rows carry no GPU label (only first row does).
    expect(rows[1].querySelectorAll('td')[0].textContent).toBe('');
    // Time-stat metrics present in order.
    const metricLabels = rows.map((r) => r.querySelectorAll('td')[1].textContent);
    expect(metricLabels).toEqual([
      'Token Throughput per GPU',
      'Median TTFT',
      'P99 TTFT',
      'Median TPOT',
      'Median E2EL',
      'Interactivity',
    ]);

    // TTFT row: ref mean 0.045, hist mean 0.09 → ratio 2 → "+100%"
    const ttftCell = rows[1].querySelectorAll('td')[2];
    expect(ttftCell.textContent).toContain('+100.0%');

    // Interactivity (higher is better): ref mean 55, hist mean 27.5 → ratio 2 → "+100%"
    const intvtyCell = rows[5].querySelectorAll('td')[2];
    expect(intvtyCell.textContent).toContain('+100.0%');
  });

  it('uses overlay data as the reference when an unofficial PR run is present', () => {
    const overlayData: OverlayData = {
      data: [
        pt(10, 600, 'h100', '2025-04-17', { ttft: 0.025, intvty: 100 }),
        pt(20, 400, 'h100', '2025-04-17', { ttft: 0.02, intvty: 120 }),
      ],
      hardwareConfig,
      label: 'feat/new-kernel',
    };
    const data = [
      pt(10, 300, 'h100', '2025-04-17', { ttft: 0.05, intvty: 50 }),
      pt(20, 200, 'h100', '2025-04-17', { ttft: 0.04, intvty: 60 }),
    ];
    renderUi(<ParetoUpliftPanel {...baseProps} data={data} overlayData={overlayData} />);
    const panel = container.querySelector('[data-testid="pareto-uplift-panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('feat/new-kernel');

    const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers.some((h) => h?.includes('2025-04-17'))).toBe(true);
  });

  it('renders scalar rows even when the primary Pareto row is not computable', () => {
    // Only 1 point on the reference side — too few for a Pareto front.
    const data = [
      pt(10, 300, 'h100', '2025-04-17', { ttft: 0.05 }),
      pt(10, 150, 'h100', '2025-04-10', { ttft: 0.1 }),
    ];
    renderUi(<ParetoUpliftPanel {...baseProps} data={data} selectedDates={['2025-04-10']} />);
    const rows = [...container.querySelectorAll('tbody tr')];
    const labels = rows.map((r) => r.querySelectorAll('td')[1].textContent);
    expect(labels).not.toContain('Token Throughput per GPU');
    expect(labels).toContain('Median TTFT');
  });

  it('hides rows whose hwKey has no usable historical overlap', () => {
    const data = [
      pt(10, 300, 'h100', '2025-04-17', { ttft: 0.05 }),
      pt(20, 200, 'h100', '2025-04-17', { ttft: 0.04 }),
      // b200 has main-date data but no historical date data.
      pt(10, 300, 'b200', '2025-04-17', { ttft: 0.05 }),
      pt(20, 200, 'b200', '2025-04-17', { ttft: 0.04 }),
      pt(10, 150, 'h100', '2025-04-10', { ttft: 0.1 }),
      pt(20, 100, 'h100', '2025-04-10', { ttft: 0.08 }),
    ];
    renderUi(<ParetoUpliftPanel {...baseProps} data={data} selectedDates={['2025-04-10']} />);
    const gpuLabels = [...container.querySelectorAll('tbody tr')]
      .map((r) => r.querySelectorAll('td')[0].textContent)
      .filter((s) => s && s.length > 0);
    expect(gpuLabels).toContain('H100 (TRT)');
    expect(gpuLabels).not.toContain('B200 (TRT)');
  });
});
