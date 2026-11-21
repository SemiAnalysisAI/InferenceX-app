// @test-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi, mock } from 'bun:test';

import type { InferenceData } from '@/components/inference/types';

const mocks = {
  track: vi.fn(),
  setSelectedModel: vi.fn(),
  setPowerRole: vi.fn(),
};
mock.module('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));
mock.module('@/lib/analytics/analytics', () => ({ track: mocks.track }));
mock.module('@/hooks/api/use-availability', () => ({
  useAvailability: () => ({
    data: {
      dates: [],
      lines: [],
      linesByModel: new Map([
        [
          'kimik3.1',
          [{ model: 'kimik3.1', disagg: true, sequence: 'agentic-traces', precision: 'fp4' }],
        ],
      ]),
    },
  }),
}));
mock.module('@/components/inference/InferenceContext', () => ({
  useInferenceFilters: () => ({
    selectedModel: 'DeepSeek-V4-Pro',
    selectedSequence: 'agentic-traces',
    selectedPrecisions: ['fp4'],
  }),
  useInferenceData: () => ({ availableModels: ['DeepSeek-V4-Pro', 'Kimi-K3.1-Pro'] }),
  useInferenceActions: () => ({
    setSelectedModel: mocks.setSelectedModel,
    setPowerRole: mocks.setPowerRole,
  }),
  useInferenceAnalyticsContext: () => ({}),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { PowerXInsightCard } from './PowerXInsightCard';
import { PowerXRoleNoData } from './PowerXRoleNoData';

const m = (y: number) => ({ y, roof: false });
const disagg = {
  hwKey: 'gb300_dynamo-sglang',
  x: 46,
  y: 1,
  conc: 64,
  disagg: true,
  num_prefill_gpu: 8,
  num_decode_gpu: 16,
  measuredAvgPower: m(800),
  measuredPrefillAvgPower: m(971),
  measuredDecodeAvgPower: m(700),
  measuredJPerOutputToken: m(2),
  reconstructedPrefillJPerOutputToken: m(1.38),
  measuredDecodeJPerOutputToken: m(0.62),
} as InferenceData;
const aggregated = {
  hwKey: 'mi355x_sglang',
  x: 80,
  y: 1,
  conc: 64,
  disagg: false,
} as InferenceData;

function mount(node: React.ReactNode) {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(node));
  return container;
}

describe('PowerXInsightCard', () => {
  it('renders nothing under All GPUs when no visible row is disaggregated', () => {
    const container = mount(
      <PowerXInsightCard
        view="energy"
        role="all"
        points={[aggregated]}
        onRoleChange={vi.fn()}
        hardwareLabel={(hw) => hw}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('leads to the role split from All GPUs and back to All from a role', () => {
    const onRoleChange = vi.fn();
    const all = mount(
      <PowerXInsightCard
        view="energy"
        role="all"
        points={[disagg, aggregated]}
        onRoleChange={onRoleChange}
        hardwareLabel={() => 'GB300 NVL72'}
      />,
    );
    expect(all.querySelector('[data-testid="powerx-insight-headline"]')?.textContent).toContain(
      '69%',
    );
    act(() =>
      all.querySelector<HTMLButtonElement>('[data-testid="powerx-insight-action"]')!.click(),
    );
    expect(onRoleChange).toHaveBeenLastCalledWith('split');
    expect(mocks.track).toHaveBeenCalledWith('powerx_insight_split_clicked', { view: 'energy' });

    const role = mount(
      <PowerXInsightCard
        view="power"
        role="prefill"
        points={[disagg]}
        onRoleChange={onRoleChange}
        hardwareLabel={() => 'GB300 NVL72'}
      />,
    );
    expect(role.textContent).toContain('971 W');
    act(() =>
      role.querySelector<HTMLButtonElement>('[data-testid="powerx-insight-action"]')!.click(),
    );
    expect(onRoleChange).toHaveBeenLastCalledWith('all');
  });
});

describe('PowerXRoleNoData', () => {
  it('offers models with prefill/decode data and switches the model without reverting the role', () => {
    const container = mount(<PowerXRoleNoData role="split" points={[aggregated]} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="powerx-role-no-data-model"]',
    );
    expect([...buttons].map((b) => b.dataset.model)).toEqual(['Kimi-K3.1-Pro']);
    act(() => buttons[0]!.click());
    expect(mocks.setSelectedModel).toHaveBeenCalledWith('Kimi-K3.1-Pro');
    expect(mocks.setPowerRole).not.toHaveBeenCalled();
  });

  it('stays hidden under All GPUs or when a visible row has role data', () => {
    expect(mount(<PowerXRoleNoData role="all" points={[aggregated]} />).innerHTML).toBe('');
    expect(mount(<PowerXRoleNoData role="prefill" points={[disagg]} />).innerHTML).toBe('');
  });
});
