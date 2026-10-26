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

import { PowerBasisPill } from './PowerBasisPill';
import {
  defaultReadoutPoint,
  PowerXChartConfig,
  PowerXCountControls,
  PowerXFacilitySwitch,
  PowerXMoreViews,
  PowerXProvenance,
  PowerXReadout,
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
const where: PowerXSelection = { metric: 'y_measuredAvgPower', compare: 'breakdown' };
const drawAll: PowerXSelection = { metric: 'y_measuredAvgPower', compare: 'boundaries' };

describe('PowerXViewTabs', () => {
  it('shows all four views as tabs in order with the current one selected', () => {
    const container = render(<PowerXViewTabs selection={where} onSelectionChange={noop} />);
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
    // The Chart/Table toggle lives in the chart toolbar, as on /inference, not in the strip.
    expect(container.querySelector('[data-testid="inference-view-toggle-0"]')).toBeNull();
  });

  it('is bilingual', () => {
    const container = render(<PowerXViewTabs selection={energy} onSelectionChange={noop} />, 'zh');
    expect(container.querySelector('[data-testid="powerx-tab-where"]')?.textContent).toBe(
      '功耗去向',
    );
  });
});

describe('PowerXCountControls', () => {
  it('offers Count and Per on the Energy view', () => {
    const container = render(<PowerXCountControls selection={energy} onSelectionChange={noop} />);
    expect(container.querySelector('[data-testid="powerx-boundary"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="powerx-energy-per"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="powerx-unit"]')).toBeNull();
    const labels = [...container.querySelectorAll('[data-testid="powerx-boundary"] button')].map(
      (button) => button.textContent,
    );
    expect(labels).toEqual(['GPU only', 'IT (no PUE)', 'Facility', 'All']);
  });

  it('offers Count (with All) and Show as on the Power draw view', () => {
    const container = render(<PowerXCountControls selection={draw} onSelectionChange={noop} />);
    expect(container.querySelector('[data-testid="powerx-energy-per"]')).toBeNull();
    const count = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-testid="powerx-boundary"] button'),
    ];
    expect(count.map((button) => button.textContent)).toEqual([
      'GPU only',
      'IT (no PUE)',
      'Facility',
      'All',
    ]);
    expect(count.map((button) => button.disabled)).toEqual([false, false, false, false]);
    expect(count[3].title).toBe(
      'GPU only (solid), IT (dashed) and Facility (dash-dot) per chip on one chart',
    );
    const showAs = [...container.querySelectorAll('[data-testid="powerx-unit"] button')];
    expect(showAs.map((button) => button.textContent)).toEqual(['W per chip', '% of TDP']);
    expect(showAs[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('reads Count: All from the three-boundary overlay and keeps % of TDP GPU-only', () => {
    const container = render(<PowerXCountControls selection={drawAll} onSelectionChange={noop} />);
    const count = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-testid="powerx-boundary"] button'),
    ];
    expect(count.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'false',
      'true',
    ]);
    const showAs = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-testid="powerx-unit"] button'),
    ];
    expect(showAs.map((button) => button.disabled)).toEqual([false, true]);
    expect(showAs[1].title).toBe('TDP bounds GPU power only');
  });

  it('renders nothing on the Where and Over time views', () => {
    expect(
      render(<PowerXCountControls selection={where} onSelectionChange={noop} />).innerHTML,
    ).toBe('');
    expect(
      render(
        <PowerXCountControls
          selection={{ metric: 'y_measuredPowerTimeline', compare: 'none' }}
          onSelectionChange={noop}
        />,
      ).innerHTML,
    ).toBe('');
  });

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

  it('names the Count boundaries in Chinese', () => {
    const container = render(
      <PowerXCountControls selection={energy} onSelectionChange={noop} />,
      'zh',
    );
    const labels = [...container.querySelectorAll('[data-testid="powerx-boundary"] button')].map(
      (button) => button.textContent,
    );
    expect(labels).toEqual(['仅 GPU', 'IT（不含 PUE）', '数据中心（含 PUE）', '全部']);
  });
});

describe('PowerXChartConfig', () => {
  it('puts Count, Per and the More views expander in the Chart Config fieldset', () => {
    const container = render(
      <PowerXChartConfig selection={energy} onSelectionChange={noop} rolesHaveData={false} />,
    );
    const config = container.querySelector('[data-testid="powerx-chart-config"]');
    expect(config?.querySelector('[data-testid="powerx-boundary"]')).not.toBeNull();
    expect(config?.querySelector('[data-testid="powerx-energy-per"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="powerx-more-views-toggle"]')).not.toBeNull();
    // Nothing PowerX-specific is left for the legend rail.
    expect(container.querySelector('[data-testid="powerx-legend-controls"]')).toBeNull();
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
      />,
    );
    const details = container.querySelector('details[data-testid="powerx-method"]');
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.querySelector('summary [data-testid="powerx-provenance"]')?.textContent).toBe(
      '42 measured points · validated serving windows only · power model rev 0123456 · PUE 1.3',
    );
    expect(details?.querySelector('summary')?.textContent).toContain('How we measure');
    expect(details?.querySelector('p')?.textContent).toBe(
      'Each point is one benchmark configuration. GPU power is measured every second and averaged over the validated serving window; other components are modeled.',
    );
  });

  it('adds only the AgentX calibration sentence on agentic scenarios, with nothing else', () => {
    const container = render(
      <PowerXProvenance
        provenance={{ measuredPoints: 1, powerModelRevision: '0123456789ab' }}
        agentic
      />,
    );
    const details = container.querySelector('details[data-testid="powerx-method"]');
    expect(details?.querySelector('p')?.textContent).toContain(
      'AgentX estimates are not calibrated against measured system power.',
    );
    // The tag key and the utilization paragraph are gone; the pill titles carry the tag meaning.
    expect(details?.querySelector('[data-testid="powerx-basis-key"]')).toBeNull();
    expect(details?.querySelector('[data-testid="powerx-utilization-note"]')).toBeNull();
    expect(details?.querySelectorAll('p')).toHaveLength(1);
    expect(details?.textContent).not.toContain('on-board telemetry');
    const zh = render(
      <PowerXProvenance
        provenance={{ measuredPoints: 1, powerModelRevision: '0123456789ab' }}
        agentic
      />,
      'zh',
    );
    expect(zh.querySelector('details p')?.textContent).toBe(
      '每个数据点代表一个基准测试配置。GPU 功耗每秒实测一次，并在通过验证的服务窗口内取平均；其他组件为模型估算。 AgentX 估算值尚未用实测的系统功耗校准。',
    );
  });
});

describe('PowerBasisPill', () => {
  it('explains each tag in its title, in one clause', () => {
    const titles = (locale: 'en' | 'zh') =>
      (['gpu', 'it', 'facility'] as const).map(
        (tag) => render(<PowerBasisPill tag={tag} />, locale).querySelector('span')?.title,
      );
    expect(titles('en')).toEqual([
      'GPU board power, measured by DCGM',
      'GPU + modeled server, no PUE',
      'IT × PUE',
    ]);
    expect(titles('zh')).toEqual([
      'GPU 板卡功耗，由 DCGM 实测',
      'GPU + 模型估算的服务器功耗，不含 PUE',
      'IT × PUE',
    ]);
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
