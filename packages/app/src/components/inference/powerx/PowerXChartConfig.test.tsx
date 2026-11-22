// @test-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi, mock } from 'bun:test';

import { POWER_PERCENT_TDP_METRIC, type PowerXSelection } from './powerx-views';

const mocks = { locale: 'en' as 'en' | 'zh', track: vi.fn() };
mock.module('@/lib/i18n/use-locale', () => ({ useLocale: () => mocks.locale }));
mock.module('@/lib/analytics/analytics', () => ({ track: mocks.track }));
mock.module('@/hooks/useMediaQuery', () => ({
  useIsMobileViewport: () => false,
  useIsCoarsePointer: () => false,
  useMediaQuery: () => false,
}));
mock.module('@/components/inference/InferenceContext', () => ({
  useInferenceAnalyticsContext: () => ({}),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { TooltipProvider } from '@/components/ui/tooltip';

import { PowerXChartConfig, PowerXViewTabs, powerXPinFor } from './PowerXChartConfig';

const noop = () => {};
const markup = (node: React.ReactNode) => {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);
  return container;
};
/** Client render for clicks; returns the container and an unmount. */
function mount(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<TooltipProvider>{node}</TooltipProvider>));
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}
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

describe('PowerXChartConfig', () => {
  it('disables the modeled boundaries when energy is per input token', () => {
    const container = markup(
      <PowerXChartConfig
        selection={{ metric: 'y_measuredJPerInputToken', compare: 'none' }}
        onSelectionChange={noop}
        role="all"
        onRoleChange={noop}
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
      <PowerXChartConfig
        selection={{ metric: 'y_itModeledWatts', compare: 'none' }}
        onSelectionChange={noop}
        role="all"
        onRoleChange={noop}
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
      <PowerXChartConfig
        selection={facilityTotal}
        onSelectionChange={noop}
        role="decode"
        onRoleChange={noop}
      />,
    );
    const boundary = container.querySelector<HTMLElement>('[data-testid="powerx-boundary"]')!;
    expect(boundary.closest<HTMLElement>('[data-locked]')).not.toBeNull();
    expect(pressed(container, 'powerx-boundary')).toEqual(['GPU']);
    expect(pressed(container, 'powerx-energy-per')).toEqual(['Output']);
    expect(container.querySelector('[data-testid="powerx-pin-line"]')?.textContent).toContain(
      'Set by Decode GPUs',
    );
    const all = markup(
      <PowerXChartConfig
        selection={facilityTotal}
        onSelectionChange={noop}
        role="all"
        onRoleChange={noop}
      />,
    );
    expect(pressed(all, 'powerx-boundary')).toEqual(['Facility']);
    expect(pressed(all, 'powerx-energy-per')).toEqual(['All tokens']);
    expect(all.querySelector('[data-locked]')).toBeNull();
    expect(all.querySelector('[data-testid="powerx-pin-line"]')).toBeNull();
  });

  it('lets Prefill GPUs pick Input and writes it to the stored choice', () => {
    const onSelectionChange = vi.fn();
    const { container, unmount } = mount(
      <PowerXChartConfig
        selection={facilityTotal}
        onSelectionChange={onSelectionChange}
        role="prefill"
        onRoleChange={noop}
      />,
    );
    expect(
      buttons(container, 'powerx-energy-per')
        .filter((button) => !button.disabled)
        .map((button) => button.textContent),
    ).toEqual(['Output', 'Input']);
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="powerx-energy-per-input"]')!
        .click(),
    );
    expect(onSelectionChange).toHaveBeenCalledWith({
      metric: 'y_measuredJPerInputToken',
      compare: 'none',
    });
    unmount();
  });

  it('reports the previous role and ignores a click on the current one', () => {
    mocks.track.mockClear();
    const onRoleChange = vi.fn();
    const { container, unmount } = mount(
      <PowerXChartConfig
        selection={facilityTotal}
        onSelectionChange={noop}
        role="all"
        onRoleChange={onRoleChange}
      />,
    );
    const click = (role: string) =>
      act(() =>
        container.querySelector<HTMLButtonElement>(`[data-testid="powerx-role-${role}"]`)!.click(),
      );
    click('all');
    expect(onRoleChange).not.toHaveBeenCalled();
    click('split');
    expect(onRoleChange).toHaveBeenCalledWith('split');
    expect(mocks.track).toHaveBeenCalledWith(
      'powerx_role_changed',
      expect.objectContaining({ role: 'split', previous_role: 'all' }),
    );
    unmount();
  });

  it('shows Compare at only on Breakdown', () => {
    const breakdown = { view: 'area' as const, onViewChange: noop, pues: [1.3] };
    const energy = markup(
      <PowerXChartConfig
        selection={facilityTotal}
        onSelectionChange={noop}
        role="all"
        onRoleChange={noop}
        breakdown={breakdown}
      />,
    );
    expect(energy.querySelector('[data-testid="powerx-compare-at"]')).toBeNull();
    const where = markup(
      <PowerXChartConfig
        selection={{ metric: 'y_measuredAvgPower', compare: 'breakdown' }}
        onSelectionChange={noop}
        role="all"
        onRoleChange={noop}
        breakdown={breakdown}
      />,
    );
    expect(where.querySelector('[data-testid="powerx-compare-at"]')).not.toBeNull();
    expect(where.querySelector('[data-testid="powerx-boundary"]')).toBeNull();
  });
});

describe('PowerXViewTabs', () => {
  it('sends the analytics id of the picked tab', () => {
    mocks.track.mockClear();
    const { container, unmount } = mount(
      <PowerXViewTabs selection={facilityTotal} onSelectionChange={noop} />,
    );
    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="powerx-tab-power"]')!.click(),
    );
    expect(mocks.track).toHaveBeenCalledWith('inference_powerx_tab_selected', { tab: 'draw' });
    unmount();
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

  it('has no pin line on Breakdown', () => {
    expect(
      powerXPinFor({ metric: 'y_measuredAvgPower', compare: 'breakdown' }, 'decode', 'en'),
    ).toBeNull();
  });

  it('speaks Chinese on /zh', () => {
    const pin = powerXPinFor(facilityTotal, 'decode', 'zh')!;
    expect(pin.by).toBe('解码 GPU');
    expect(pin.what).toBe('功耗边界为 GPU，能耗计量为输出');
  });
});
