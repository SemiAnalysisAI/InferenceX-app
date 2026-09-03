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

import { MetricExplanation } from './MetricExplanation';
import ChartNotices from './ChartNotices';

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

describe('MetricExplanation', () => {
  it('preserves the full cost-basis explanation and formula in selector help', () => {
    act(() => root.render(<MetricExplanation metricKey="tokensPerDollarN" />));
    expect(container.textContent).toContain('infrastructure spend');
    expect(container.textContent).toContain('Neocloud Giant');
    expect(container.querySelector('code')!.textContent).toBe(
      'tok/$ = (total tok/s/chip × 3,600) ÷ all-in cost per chip-hour ($)',
    );
  });

  it('renders the complete Chinese explanation and formula', () => {
    mocks.locale.value = 'zh';
    act(() => root.render(<MetricExplanation metricKey="tpPerMw" />));
    expect(container.textContent).toContain('计算公式');
    expect(container.querySelector('code')!.textContent).toContain('每芯片全电源配置功率（MW）');
  });
});

describe('ChartNotices', () => {
  it('leaves no empty footer when there are no operational notes', () => {
    act(() => root.render(<ChartNotices chartId="chart-0" />));
    expect(container.innerHTML).toBe('');
  });

  it('keeps notices visible and excluded from chart exports without axis rows', () => {
    act(() => root.render(<ChartNotices chartId="chart-0" notices={<span>KV offload ON</span>} />));
    const notices = container.querySelector('[data-testid="chart-notices-chart-0"]')!;
    expect(notices.textContent).toBe('KV offload ON');
    expect(notices.classList.contains('no-export')).toBe(true);
    expect(container.querySelector('button')).toBeNull();
  });
});
