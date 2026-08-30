// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  locale: { value: 'en' as 'en' | 'zh' },
}));

vi.mock('@/lib/analytics', () => ({ track: mocks.track }));
vi.mock('@/lib/use-locale', () => ({ useLocale: () => mocks.locale.value }));

import AxisMetricFooter from './AxisMetricFooter';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.track.mockClear();
  mocks.locale.value = 'en';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(props?: Partial<React.ComponentProps<typeof AxisMetricFooter>>) {
  act(() => {
    root.render(
      <AxisMetricFooter
        chartId="chart-0"
        metricKey="tokensPerDollar"
        xAxisKind="interactivity"
        xAxisLabel="Interactivity (tok/s/user)"
        {...props}
      />,
    );
  });
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('AxisMetricFooter', () => {
  it('renders notices in a dedicated section only when provided', () => {
    render();
    expect(container.querySelector('[data-testid="axis-metric-notices-chart-0"]')).toBeNull();
    render({ notices: <span data-testid="footer-notice">KV offload ON</span> });
    const notices = container.querySelector('[data-testid="axis-metric-notices-chart-0"]');
    expect(notices).not.toBeNull();
    expect(notices!.querySelector('[data-testid="footer-notice"]')!.textContent).toBe(
      'KV offload ON',
    );
  });

  it('renders one collapsed row per axis', () => {
    render();
    const xRow = container.querySelector('[data-testid="axis-metric-row-x-chart-0"]');
    const yRow = container.querySelector('[data-testid="axis-metric-row-y-chart-0"]');
    expect(xRow).not.toBeNull();
    expect(yRow).not.toBeNull();
    expect(xRow!.getAttribute('aria-expanded')).toBe('false');
    expect(yRow!.getAttribute('aria-expanded')).toBe('false');
    expect(xRow!.textContent).toContain('X-axis: Interactivity (tok/s/user)');
    expect(yRow!.textContent).toContain('Y-axis: Total Tokens per $1 USD');
    // Bodies exist for aria-controls but stay hidden until toggled.
    const xBody = container.querySelector<HTMLElement>(
      '[data-testid="axis-metric-body-x-chart-0"]',
    );
    expect(xBody!.hidden).toBe(true);
    expect(xRow!.getAttribute('aria-controls')).toBe(xBody!.id);
  });

  it('expands the x-axis row with an explanation and no formula', () => {
    render();
    const xRow = container.querySelector('[data-testid="axis-metric-row-x-chart-0"]')!;
    click(xRow);
    expect(xRow.getAttribute('aria-expanded')).toBe('true');
    const xBody = container.querySelector<HTMLElement>(
      '[data-testid="axis-metric-body-x-chart-0"]',
    )!;
    expect(xBody.hidden).toBe(false);
    expect(xBody.textContent).toContain('rate at which a single user receives generated tokens');
    // The x-axis row has no formula; the y-axis formula lives in the (still hidden) y body.
    expect(xBody.querySelector('code')).toBeNull();
    const yBody = container.querySelector<HTMLElement>(
      '[data-testid="axis-metric-body-y-chart-0"]',
    )!;
    expect(yBody.hidden).toBe(true);
  });

  it('expands the y-axis row with explanation plus formula, then collapses', () => {
    render();
    const yRow = container.querySelector('[data-testid="axis-metric-row-y-chart-0"]')!;
    click(yRow);
    const yBody = container.querySelector<HTMLElement>(
      '[data-testid="axis-metric-body-y-chart-0"]',
    )!;
    expect(yBody.hidden).toBe(false);
    const formula = container.querySelector('[data-testid="axis-metric-formula-chart-0"]')!;
    expect(formula.textContent).toBe(
      'tok/$ = total tokens per GPU-hour ÷ cache-aware gross token revenue per GPU-hour ($)',
    );
    click(yRow);
    expect(yRow.getAttribute('aria-expanded')).toBe('false');
    expect(yBody.hidden).toBe(true);
  });

  it('tracks toggle analytics with chart, axis, metric, and expanded state', () => {
    render();
    const yRow = container.querySelector('[data-testid="axis-metric-row-y-chart-0"]')!;
    click(yRow);
    expect(mocks.track).toHaveBeenCalledWith('axis_metric_footer_toggled', {
      chart: 'chart-0',
      axis: 'y',
      metric: 'tokensPerDollar',
      expanded: true,
    });
    click(yRow);
    expect(mocks.track).toHaveBeenLastCalledWith('axis_metric_footer_toggled', {
      chart: 'chart-0',
      axis: 'y',
      metric: 'tokensPerDollar',
      expanded: false,
    });
  });

  it('shows the percentile prefix for TTFT x-axes', () => {
    render({ xAxisKind: 'ttft', xAxisLabel: 'P90 Time To First Token (s)' });
    const xRow = container.querySelector('[data-testid="axis-metric-row-x-chart-0"]')!;
    expect(xRow.textContent).toContain('X-axis: P90 Time To First Token (s)');
  });

  it('renders Chinese strings on /zh pages', () => {
    mocks.locale.value = 'zh';
    render({ metricKey: 'tpPerMw', xAxisKind: 'e2eLatency', xAxisLabel: 'End-to-end Latency (s)' });
    const xRow = container.querySelector('[data-testid="axis-metric-row-x-chart-0"]')!;
    const yRow = container.querySelector('[data-testid="axis-metric-row-y-chart-0"]')!;
    expect(xRow.textContent).toContain('X 轴：端到端延迟（s）');
    expect(yRow.textContent).toContain('Y 轴：每全电源配置兆瓦 token 吞吐量');
    click(yRow);
    const formula = container.querySelector('[data-testid="axis-metric-formula-chart-0"]')!;
    expect(formula.textContent).toContain('每芯片全电源配置功率（MW）');
  });
});
