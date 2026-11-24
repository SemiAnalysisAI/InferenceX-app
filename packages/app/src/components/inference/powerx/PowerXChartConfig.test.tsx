// @test-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, mock } from 'bun:test';

import { POWER_PERCENT_TDP_METRIC, type PowerXSelection } from './powerx-views';

mock.module('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));
mock.module('@/lib/analytics/analytics', () => ({ track: vi.fn() }));
mock.module('@/hooks/useMediaQuery', () => ({
  useIsMobileViewport: () => false,
  useIsCoarsePointer: () => false,
  useMediaQuery: () => false,
}));
mock.module('@/components/inference/InferenceContext', () => ({
  useInferenceAnalyticsContext: () => ({}),
}));

import { TooltipProvider } from '@/components/ui/tooltip';

import { PowerXChartConfig, powerXPinFor } from './PowerXChartConfig';

const noop = () => {};
const markup = (selection: PowerXSelection, role: 'all' | 'decode' = 'all') => {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(
    <TooltipProvider>
      <PowerXChartConfig
        selection={selection}
        onSelectionChange={noop}
        role={role}
        onRoleChange={noop}
      />
    </TooltipProvider>,
  );
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

describe('PowerXChartConfig', () => {
  it('disables the modeled boundaries when energy is per input token', () => {
    const container = markup({ metric: 'y_measuredJPerInputToken', compare: 'none' });
    expect(buttons(container, 'powerx-boundary').map((button) => button.disabled)).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });

  it('disables % of TDP on the IT boundary of Power draw', () => {
    const container = markup({ metric: 'y_itModeledWatts', compare: 'none' });
    expect(pressed(container, 'powerx-boundary')).toEqual(['IT']);
    expect(buttons(container, 'powerx-unit').map((button) => button.disabled)).toEqual([
      false,
      true,
    ]);
  });

  it('shows the pinned values as locked under Decode GPUs without touching the stored pick', () => {
    const container = markup(facilityTotal, 'decode');
    const boundary = container.querySelector<HTMLElement>('[data-testid="powerx-boundary"]')!;
    expect(boundary.closest<HTMLElement>('[data-locked]')).not.toBeNull();
    expect(pressed(container, 'powerx-boundary')).toEqual(['GPU']);
    expect(pressed(container, 'powerx-energy-per')).toEqual(['Output']);
    expect(container.querySelector('[data-testid="powerx-pin-line"]')?.textContent).toContain(
      'Set by Decode GPUs',
    );
    const all = markup(facilityTotal);
    expect(pressed(all, 'powerx-boundary')).toEqual(['Facility']);
    expect(pressed(all, 'powerx-energy-per')).toEqual(['All tokens']);
    expect(all.querySelector('[data-locked]')).toBeNull();
    expect(all.querySelector('[data-testid="powerx-pin-line"]')).toBeNull();
  });
});

describe('powerXPinFor', () => {
  it('adds the headroom reason on % of TDP under a role', () => {
    const tdp: PowerXSelection = { metric: POWER_PERCENT_TDP_METRIC, compare: 'none' };
    const pin = powerXPinFor(tdp, 'split', 'en')!;
    expect(pin.what).toBe('Boundary GPU, Statistic Avg');
    expect(pin.reasons.some((reason) => reason.includes('Headroom'))).toBe(true);
    const watts = powerXPinFor({ metric: 'y_measuredAvgPower', compare: 'none' }, 'split', 'en')!;
    expect(watts.reasons.some((reason) => reason.includes('Headroom'))).toBe(false);
  });
});
