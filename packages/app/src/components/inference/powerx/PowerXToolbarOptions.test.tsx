// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POWER_PERCENT_TDP_METRIC, type PowerXSelection } from './powerx-views';

const mocks = vi.hoisted(() => ({ locale: 'en' as 'en' | 'zh' }));
vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => mocks.locale }));
vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsMobileViewport: () => false,
  useIsCoarsePointer: () => false,
  useMediaQuery: () => false,
}));
vi.mock('@/components/inference/InferenceContext', () => ({
  useInferenceAnalyticsContext: () => ({}),
  useInferenceDisplay: () => ({ selectedXAxisMode: 'default', defaultXAxisMode: 'default' }),
  useInferenceActions: () => ({ setSelectedXAxisMode: vi.fn() }),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { PowerXEnergyPowerOptions, powerXPinFor } from './PowerXToolbarOptions';

const noop = () => {};
const markup = (node: React.ReactNode) => {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(node);
  return container;
};
const buttons = (container: Element, testId: string) => [
  ...container.querySelectorAll<HTMLButtonElement>(`[data-testid="${testId}"] button`),
];
const pressed = (container: Element, testId: string) =>
  buttons(container, testId)
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.textContent);

const facilityTotal: PowerXSelection = {
  metric: 'y_utilityModeledJPerTotalToken',
  compare: 'none',
};

describe('PowerXEnergyPowerOptions', () => {
  it('disables the modeled boundaries when energy is per input token', () => {
    const container = markup(
      <PowerXEnergyPowerOptions
        selection={{ metric: 'y_measuredJPerInputToken', compare: 'none' }}
        onSelectionChange={noop}
        role="all"
      />,
    );
    expect(buttons(container, 'powerx-boundary').map((button) => button.disabled)).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });

  it('disables % of TDP on the IT boundary of Power draw', () => {
    const container = markup(
      <PowerXEnergyPowerOptions
        selection={{ metric: 'y_itModeledWatts', compare: 'none' }}
        onSelectionChange={noop}
        role="all"
      />,
    );
    expect(pressed(container, 'powerx-boundary')).toEqual(['IT']);
    expect(buttons(container, 'powerx-unit').map((button) => button.disabled)).toEqual([
      false,
      true,
    ]);
  });

  it('shows the pinned values as locked under Decode GPUs without touching the stored pick', () => {
    const container = markup(
      <PowerXEnergyPowerOptions selection={facilityTotal} onSelectionChange={noop} role="decode" />,
    );
    const boundary = container.querySelector<HTMLElement>('[data-testid="powerx-boundary"]')!;
    const per = container.querySelector<HTMLElement>('[data-testid="powerx-energy-per"]')!;
    expect(boundary.dataset.locked).toBe('');
    expect(per.dataset.locked).toBe('');
    expect(pressed(container, 'powerx-boundary')).toEqual(['GPU']);
    expect(pressed(container, 'powerx-energy-per')).toEqual(['Output']);
    const all = markup(
      <PowerXEnergyPowerOptions selection={facilityTotal} onSelectionChange={noop} role="all" />,
    );
    expect(pressed(all, 'powerx-boundary')).toEqual(['Facility']);
    expect(pressed(all, 'powerx-energy-per')).toEqual(['All tokens']);
    expect(all.querySelector('[data-locked]')).toBeNull();
  });

  it('lets Prefill GPUs pick Input and writes it to the stored choice', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onSelectionChange = vi.fn();
    act(() =>
      root.render(
        <PowerXEnergyPowerOptions
          selection={facilityTotal}
          onSelectionChange={onSelectionChange}
          role="prefill"
        />,
      ),
    );
    const per = container.querySelector<HTMLElement>('[data-testid="powerx-energy-per"]')!;
    expect(per.dataset.locked).toBeUndefined();
    expect(buttons(container, 'powerx-energy-per').map((button) => button.textContent)).toEqual([
      'Output',
      'Input',
    ]);
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="powerx-energy-per-input"]')!
        .click(),
    );
    expect(onSelectionChange).toHaveBeenCalledWith({
      metric: 'y_measuredJPerInputToken',
      compare: 'none',
    });
    act(() => root.unmount());
    container.remove();
  });
});

describe('powerXPinFor', () => {
  afterEach(() => {
    mocks.locale = 'en';
  });

  it('has no pin line on All GPUs', () => {
    expect(powerXPinFor(facilityTotal, 'all', 'en')).toBeNull();
  });

  it('names the role, what it set and why on Energy per token', () => {
    const pin = powerXPinFor(facilityTotal, 'decode', 'en')!;
    expect(pin.by).toBe('Decode GPUs');
    expect(pin.what).toBe('Boundary GPU, Energy per Output');
    expect(pin.reasons).toHaveLength(3);
  });

  it('adds the headroom reason on % of TDP under a role', () => {
    const tdp: PowerXSelection = { metric: POWER_PERCENT_TDP_METRIC, compare: 'none' };
    const pin = powerXPinFor(tdp, 'split', 'en')!;
    expect(pin.what).toBe('Boundary GPU, Statistic Avg');
    expect(pin.reasons.some((reason) => reason.includes('Headroom'))).toBe(true);
    const watts = powerXPinFor({ metric: 'y_measuredAvgPower', compare: 'none' }, 'split', 'en')!;
    expect(watts.reasons.some((reason) => reason.includes('Headroom'))).toBe(false);
  });

  it('has no pin line on Breakdown or Over time', () => {
    expect(
      powerXPinFor({ metric: 'y_measuredAvgPower', compare: 'breakdown' }, 'decode', 'en'),
    ).toBeNull();
  });

  it('speaks Chinese on /zh', () => {
    const pin = powerXPinFor(facilityTotal, 'decode', 'zh')!;
    expect(pin.by).toBe('解码 GPU');
    expect(pin.what).toBe('统计口径 GPU，能耗计量 输出');
  });
});
