// @vitest-environment jsdom

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { PowerXSelection } from './powerx-views';

const mocks = vi.hoisted(() => ({ locale: 'en' as 'en' | 'zh' }));
vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => mocks.locale }));
vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));
vi.mock('@/components/inference/ui/WorkflowInfoDisplay', () => ({
  default: ({ compact }: { compact?: boolean }) => (
    <div data-testid="powerx-run-chip" data-compact={String(Boolean(compact))} />
  ),
}));
vi.mock('@/components/ui/share-button', () => ({ ShareButton: () => <button type="button" /> }));
vi.mock('@/components/inference/InferenceContext', () => ({
  useInferenceData: () => ({
    availableModels: ['DeepSeek-V4-Pro', 'GLM-5'],
    availableSequences: ['agentic_traces', '8k/1k'],
    availablePrecisions: ['fp4', 'fp8'],
  }),
  useInferenceFilters: () => ({
    selectedModel: 'DeepSeek-V4-Pro',
    selectedSequence: 'agentic_traces',
    selectedPrecisions: ['fp4'],
  }),
  useInferenceActions: () => ({
    setSelectedModel: vi.fn(),
    setSelectedSequence: vi.fn(),
    setSelectedPrecisions: vi.fn(),
  }),
}));

import {
  PowerXCaptionRow,
  PowerXFrame,
  PowerXLegendControls,
  PowerXMoreViews,
  PowerXProvenance,
  PowerXSplitBy,
  PowerXViewTabs,
} from './PowerXLayout';

const render = (node: React.ReactNode, locale: 'en' | 'zh' = 'en') => {
  mocks.locale = locale;
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);
  return container;
};
const noop = () => {};
const energy: PowerXSelection = { metric: 'y_measuredJPerOutputToken', compare: 'none' };
const draw: PowerXSelection = { metric: 'y_measuredAvgPower', compare: 'none' };
const where: PowerXSelection = { metric: 'y_measuredAvgPower', compare: 'boundaries' };

describe('PowerXViewTabs', () => {
  it('shows all four views as tabs in order with the current one selected', () => {
    const container = render(
      <PowerXViewTabs
        selection={where}
        onSelectionChange={noop}
        viewMode="chart"
        onViewModeChange={noop}
      />,
    );
    const tabs = [
      ...container.querySelectorAll<HTMLElement>('[role="tab"][data-testid^="powerx-tab-"]'),
    ];
    expect(tabs.map((tab) => tab.dataset.testid)).toEqual([
      'powerx-tab-energy',
      'powerx-tab-draw',
      'powerx-tab-where',
      'powerx-tab-time',
    ]);
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Energy per token',
      'Power draw',
      'Where the power goes',
      'Over time',
    ]);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ]);
    // One short hint per tab, as a tooltip, not a question line.
    for (const tab of tabs) expect(tab.getAttribute('title')).toBeTruthy();
    expect(container.querySelector('[data-testid="powerx-question"]')).toBeNull();
    // The Chart/Table toggle sits in the strip.
    expect(container.querySelector('[data-testid="inference-view-toggle-0"]')).not.toBeNull();
  });

  it('is bilingual', () => {
    const container = render(
      <PowerXViewTabs
        selection={energy}
        onSelectionChange={noop}
        viewMode="table"
        onViewModeChange={noop}
      />,
      'zh',
    );
    expect(container.querySelector('[data-testid="powerx-tab-where"]')?.textContent).toBe(
      '功耗去向',
    );
    expect(container.querySelector('[data-testid="inference-table-view-btn"]')?.textContent).toBe(
      '表格',
    );
  });
});

describe('PowerXLegendControls', () => {
  it('offers Count and Per on the Energy view', () => {
    const container = render(<PowerXLegendControls selection={energy} onSelectionChange={noop} />);
    expect(container.querySelector('[data-testid="powerx-boundary"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="powerx-energy-per"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="powerx-unit"]')).toBeNull();
    const labels = [...container.querySelectorAll('[data-testid="powerx-boundary"] button')].map(
      (button) => button.textContent,
    );
    expect(labels).toEqual(['GPU only', 'Whole system', 'Both']);
  });

  it('offers Count and Show as on the Power draw view', () => {
    const container = render(<PowerXLegendControls selection={draw} onSelectionChange={noop} />);
    expect(container.querySelector('[data-testid="powerx-energy-per"]')).toBeNull();
    const showAs = [...container.querySelectorAll('[data-testid="powerx-unit"] button')];
    expect(showAs.map((button) => button.textContent)).toEqual(['W per chip', '% of TDP']);
    expect(showAs[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('renders nothing on the Where and Over time views', () => {
    expect(
      render(<PowerXLegendControls selection={where} onSelectionChange={noop} />).innerHTML,
    ).toBe('');
    expect(
      render(
        <PowerXLegendControls
          selection={{ metric: 'y_measuredPowerTimeline', compare: 'none' }}
          onSelectionChange={noop}
        />,
      ).innerHTML,
    ).toBe('');
  });

  it('disables the whole-system Count unless energy is per output token', () => {
    const container = render(
      <PowerXLegendControls
        selection={{ metric: 'y_measuredJPerInputToken', compare: 'none' }}
        onSelectionChange={noop}
      />,
    );
    const buttons = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-testid="powerx-boundary"] button'),
    ];
    expect(buttons.map((button) => button.disabled)).toEqual([false, true, true]);
  });
});

describe('PowerXMoreViews', () => {
  it('names the features it holds while collapsed', () => {
    const container = render(
      <PowerXMoreViews selection={energy} onSelectionChange={noop} rolesHaveData={false} />,
    );
    const toggle = container.querySelector('[data-testid="powerx-more-views-toggle"]');
    expect(toggle?.textContent).toContain('More views');
    expect(toggle?.textContent).toContain('prefill vs decode · P75/P90 · rated boundaries');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-testid="powerx-split"]')).toBeNull();
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

describe('PowerXProvenance', () => {
  it('is the summary of the collapsed How we measure details', () => {
    const container = render(
      <PowerXProvenance
        provenance={{ measuredPoints: 42, powerModelRevision: '0123456789ab', pue: 1.3 }}
        summary="GPU power from on-board telemetry."
      >
        Each point is one benchmark configuration.
      </PowerXProvenance>,
    );
    const details = container.querySelector('details[data-testid="powerx-method"]');
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.querySelector('summary [data-testid="powerx-provenance"]')?.textContent).toBe(
      '42 measured points · validated serving windows only · power model rev 0123456 · PUE 1.3',
    );
    expect(details?.querySelector('summary')?.textContent).toContain('How we measure');
    expect(details?.querySelector('p')?.textContent).toContain('Each point is one benchmark');
  });
});

describe('PowerXCaptionRow and PowerXFrame', () => {
  it('shows the model dropdown, scenario and precision toggles and the compact run chip', () => {
    const container = render(<PowerXCaptionRow />);
    expect(container.querySelector('[data-testid="powerx-model-trigger"]')?.textContent).toContain(
      'DeepSeek',
    );
    expect(
      [...container.querySelectorAll('[data-testid="powerx-scenario"] button')].map(
        (button) => button.textContent,
      ),
    ).toHaveLength(2);
    const precisions = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-testid="powerx-precision"] button'),
    ];
    expect(precisions.map((button) => button.textContent)).toEqual(['FP4', 'FP8']);
    // The only selected precision cannot be deselected.
    expect(precisions[0].getAttribute('aria-pressed')).toBe('true');
    expect(precisions[0].disabled).toBe(true);
    expect(
      container.querySelector<HTMLElement>('[data-testid="powerx-run-chip"]')?.dataset.compact,
    ).toBe('true');
  });

  it('orders header, tabs, caption row, then the chart', () => {
    const container = render(
      <PowerXFrame
        selection={energy}
        onSelectionChange={noop}
        viewMode="chart"
        onViewModeChange={noop}
      >
        <div data-testid="chart-body" />
      </PowerXFrame>,
      'zh',
    );
    const frame = container.querySelector('[data-testid="powerx-frame"]');
    const order = [
      ...(frame?.querySelectorAll<HTMLElement>(
        'h2, [data-testid="powerx-tabs"], [data-testid="powerx-caption"], [data-testid="chart-body"]',
      ) ?? []),
    ].map((el) => el.dataset.testid ?? el.tagName.toLowerCase());
    expect(order).toEqual(['h2', 'powerx-tabs', 'powerx-caption', 'chart-body']);
    expect(frame?.querySelector('h2')?.textContent).toBe('PowerX 功耗');
  });
});
