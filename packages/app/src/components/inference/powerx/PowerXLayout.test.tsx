// @vitest-environment jsdom

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { InferenceData } from '@/components/inference/types';
import { type PowerXSelection } from './powerx-views';

const mocks = vi.hoisted(() => ({
  locale: 'en' as 'en' | 'zh',
  track: vi.fn(),
}));
vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => mocks.locale }));
vi.mock('@/lib/analytics/analytics', () => ({ track: mocks.track }));
// jsdom has no matchMedia: render the desktop layout.
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsMobileViewport: () => false,
  useIsCoarsePointer: () => false,
  useMediaQuery: () => false,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import {
  defaultReadoutPoint,
  PowerXCountControls,
  PowerXReadout,
  PowerXSplitBy,
} from './PowerXLayout';

const render = (node: React.ReactNode, locale: 'en' | 'zh' = 'en') => {
  mocks.locale = locale;
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);
  return container;
};
const noop = () => {};

const where: PowerXSelection = { metric: 'y_measuredAvgPower', compare: 'breakdown' };

describe('PowerXCountControls', () => {
  it('disables the IT and facility Counts unless energy is per output token', () => {
    const container = render(
      <PowerXCountControls
        selection={{ metric: 'y_measuredJPerInputToken', compare: 'none' }}
        onSelectionChange={noop}
      />,
    );
    const buttons = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-testid="powerx-boundary"] button'),
    ];
    expect(buttons.map((button) => button.disabled)).toEqual([false, true, true, true]);
  });

  it('disables % of TDP on the IT and facility Power draw boundaries', () => {
    const container = render(
      <PowerXCountControls
        selection={{ metric: 'y_itModeledWatts', compare: 'none' }}
        onSelectionChange={noop}
      />,
    );
    const count = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-testid="powerx-boundary"] button'),
    ];
    expect(count.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ]);
    const showAs = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-testid="powerx-unit"] button'),
    ];
    expect(showAs.map((button) => button.disabled)).toEqual([false, true]);
  });
});

describe('PowerXSplitBy', () => {
  it('disables Prefill vs decode with the reason when there is no role telemetry', () => {
    const container = render(
      <PowerXSplitBy selection={where} onSelectionChange={noop} rolesHaveData={false} />,
    );
    const buttons = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-testid="powerx-split"] button'),
    ];
    expect(buttons.map((button) => button.textContent)).toEqual(['Boundary', 'Prefill vs decode']);
    expect(buttons[1].disabled).toBe(true);
    expect(
      container.querySelector('[data-testid="powerx-roles-unavailable"]')?.textContent,
    ).toContain('No validated prefill/decode telemetry');
  });
});

const metric = (y: number) => ({ y, roof: false });
function readoutPoint(x: number, overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    hwKey: 'b200_vllm',
    model: 'dsv4pro',
    precision: 'fp4',
    conc: 64,
    x,
    y: 10,
    date: '2026-10-23',
    measuredAvgPower: metric(700),
    itModeledWatts: metric(1000),
    utilityModeledWatts: metric(1300),
    modeledSystemPower: { status: 'supported', pue: 1.3 } as InferenceData['modeledSystemPower'],
    ...overrides,
  } as InferenceData;
}

describe('PowerXReadout', () => {
  it('reads IT W/GPU, GPUs per MW and the facility figure of the point nearest 80 tok/s/user', () => {
    const points = [readoutPoint(20), readoutPoint(75), readoutPoint(300)];
    expect(defaultReadoutPoint(points)).toBe(points[1]);
    const container = render(<PowerXReadout points={points} />);
    const readout = container.querySelector('[data-testid="powerx-readout"]');
    expect(readout?.querySelector('[data-testid="powerx-readout-it"]')?.textContent).toBe(
      'IT: 1,000 W/GPUIT',
    );
    expect(readout?.querySelector('[data-testid="powerx-readout-gpus-per-mw"]')?.textContent).toBe(
      '1,000 GPUs/MWIT',
    );
    expect(readout?.querySelector('[data-testid="powerx-readout-facility"]')?.textContent).toBe(
      'Facility: 1,300 W/GPU at PUE 1.3Facility',
    );
    expect(readout?.querySelector('[data-testid="powerx-readout-gpu"]')?.textContent).toBe(
      'GPU: 700 WGPU',
    );
    // The same outline badges the TCO $/chip/hr row uses.
    expect(readout?.querySelectorAll('[data-slot="badge"]')).toHaveLength(4);
    expect(readout?.querySelector('[data-testid="powerx-readout-source"]')?.textContent).toBe(
      'Near 80 tok/s/user · hover a point to change',
    );
    expect(
      [...readout!.querySelectorAll<HTMLElement>('[data-testid="power-basis-pill"]')].map(
        (pill) => pill.dataset.basis,
      ),
    ).toEqual(['it', 'it', 'facility', 'gpu']);
  });

  it('prefers a modeled point, says when none has an IT model, and is bilingual', () => {
    const unmodeled = readoutPoint(80, {
      itModeledWatts: undefined,
      utilityModeledWatts: undefined,
      modeledSystemPower: undefined,
    });
    const modeled = readoutPoint(10);
    expect(defaultReadoutPoint([unmodeled, modeled])).toBe(modeled);
    const container = render(<PowerXReadout points={[unmodeled]} />, 'zh');
    expect(container.querySelector('[data-testid="powerx-readout-no-model"]')?.textContent).toBe(
      '该配置暂无 IT 功耗模型',
    );
    expect(container.querySelector('[data-testid="powerx-readout-gpu"]')?.textContent).toBe(
      'GPU: 700 WGPU',
    );
    expect(render(<PowerXReadout points={[]} />).innerHTML).toBe('');
  });
});

/** Client render for the phone paths, whose More row and selects need real events. */
