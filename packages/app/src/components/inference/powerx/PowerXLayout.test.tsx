// @vitest-environment jsdom

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { InferenceData } from '@/components/inference/types';
import { PowerXSurfaceProvider } from '@/components/inference/ui/powerx-surface';
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
  defaultReadoutPoint,
  PowerXCaptionRow,
  PowerXFacilitySwitch,
  PowerXFrame,
  PowerXLegendControls,
  PowerXMoreViews,
  PowerXProvenance,
  PowerXReadout,
  PowerXSplitBy,
  PowerXViewTabs,
  PowerXWhatIs,
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
    expect(labels).toEqual(['GPU only', 'IT (no PUE)', 'Facility', 'All']);
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

  it('disables the IT and facility Counts unless energy is per output token', () => {
    const container = render(
      <PowerXLegendControls
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
      <PowerXLegendControls
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
    ]);
    const showAs = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-testid="powerx-unit"] button'),
    ];
    expect(showAs.map((button) => button.disabled)).toEqual([false, true]);
  });

  it('names the Count boundaries in Chinese', () => {
    const container = render(
      <PowerXLegendControls selection={energy} onSelectionChange={noop} />,
      'zh',
    );
    const labels = [...container.querySelectorAll('[data-testid="powerx-boundary"] button')].map(
      (button) => button.textContent,
    );
    expect(labels).toEqual(['仅 GPU', 'IT（不含 PUE）', '数据中心（含 PUE）', '全部']);
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

  it('explains the three basis tags once and the three meanings of utilization', () => {
    const container = render(
      <PowerXProvenance
        provenance={{ measuredPoints: 1, powerModelRevision: '0123456789ab' }}
        summary="GPU power from on-board telemetry."
      >
        detail
      </PowerXProvenance>,
    );
    const pills = [
      ...container.querySelectorAll<HTMLElement>(
        '[data-testid="powerx-basis-key"] [data-testid="power-basis-pill"]',
      ),
    ];
    expect(pills.map((pill) => pill.dataset.basis)).toEqual(['gpu', 'it', 'facility']);
    expect(pills.map((pill) => pill.textContent)).toEqual(['GPU', 'IT', 'Facility']);
    expect(container.querySelector('[data-testid="powerx-basis-key"]')?.textContent).toContain(
      'No PUE. Storage and out-of-rack network are not modeled.',
    );
    expect(
      container.querySelector('[data-testid="powerx-utilization-note"]')?.textContent,
    ).toContain('three different things');
    const zh = render(
      <PowerXProvenance
        provenance={{ measuredPoints: 1, powerModelRevision: '0123456789ab' }}
        summary="s"
      >
        d
      </PowerXProvenance>,
      'zh',
    );
    expect(zh.querySelector('[data-testid="powerx-utilization-note"]')?.textContent).toContain(
      '三种不同含义',
    );
  });
});

describe('PowerXWhatIs', () => {
  it('is a collapsed one-liner that separates PowerX from the grid power model', () => {
    const container = render(<PowerXWhatIs />);
    const details = container.querySelector('details[data-testid="powerx-what-is"]');
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toContain('What is PowerX?');
    expect(details?.querySelector('p')?.textContent).toBe(
      'Measured GPU power from InferenceX benchmark runs, plus a modeled IT and facility breakdown. Not the energy team’s grid power model.',
    );
    expect(render(<PowerXWhatIs />, 'zh').textContent).toContain('什么是 PowerX？');
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
      'IT 1,000 W/GPUIT',
    );
    expect(readout?.querySelector('[data-testid="powerx-readout-gpus-per-mw"]')?.textContent).toBe(
      '1,000 GPUs per MW (IT)IT',
    );
    expect(readout?.querySelector('[data-testid="powerx-readout-facility"]')?.textContent).toBe(
      'Facility 1,300 W/GPU at PUE 1.3Facility',
    );
    expect(readout?.querySelector('[data-testid="powerx-readout-gpu"]')?.textContent).toBe(
      'GPU 700 W measuredGPU',
    );
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
    expect(container.querySelector('[data-testid="powerx-readout-gpu"]')?.textContent).toContain(
      'W 实测',
    );
    expect(render(<PowerXReadout points={[]} />).innerHTML).toBe('');
  });
});

describe('PowerXFacilitySwitch', () => {
  it('is off by default on PowerX, names the PUE and notes what is not modeled', () => {
    const container = render(
      <PowerXSurfaceProvider>
        <PowerXFacilitySwitch pue={1.3} />
      </PowerXSurfaceProvider>,
    );
    const root = container.querySelector('[data-testid="powerx-facility-switch"]');
    expect(root?.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false');
    expect(root?.textContent).toContain('Include facility (PUE 1.3)');
    expect(root?.querySelector('[data-testid="powerx-not-modeled-note"]')?.textContent).toBe(
      'Storage and out-of-rack network are not modeled.',
    );
    // Outside PowerX there is no switch: the breakdown always shows the facility meter.
    expect(render(<PowerXFacilitySwitch pue={1.3} />).innerHTML).toBe('');
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
