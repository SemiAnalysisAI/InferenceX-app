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
const kimiLine = { model: 'kimik3.1', disagg: true, sequence: 'agentic-traces', precision: 'fp4' };
mock.module('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));
mock.module('@/lib/analytics/analytics', () => ({ track: mocks.track }));
mock.module('@/hooks/api/use-availability', () => ({
  useAvailability: () => ({ data: { linesByModel: new Map([['kimik3.1', [kimiLine]]]) } }),
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
  measuredPrefillAvgPower: m(971),
  measuredJPerOutputToken: m(2),
  reconstructedPrefillJPerOutputToken: m(1.38),
} as InferenceData;
const aggregated = { hwKey: 'mi355x_sglang', x: 80, y: 1, conc: 64 } as InferenceData;

function mount(node: React.ReactNode) {
  const container = document.createElement('div');
  act(() => createRoot(container).render(node));
  return container;
}

describe('PowerXInsightCard', () => {
  it('leads to the role split from All GPUs and back to All from a role', () => {
    const onRoleChange = vi.fn();
    for (const [role, next] of [
      ['all', 'split'],
      ['prefill', 'all'],
    ] as const) {
      const card = mount(
        <PowerXInsightCard
          view="energy"
          role={role}
          points={[disagg]}
          onRoleChange={onRoleChange}
          hardwareLabel={() => 'GB300 NVL72'}
        />,
      );
      // Prefill's reconstructed share of measured J per output token: 1.38 / 2.
      expect(card.textContent).toContain('69%');
      act(() =>
        card.querySelector<HTMLButtonElement>('[data-testid="powerx-insight-action"]')!.click(),
      );
      expect(onRoleChange).toHaveBeenLastCalledWith(next);
    }
    expect(mocks.track).toHaveBeenCalledWith('powerx_insight_split_clicked', { view: 'energy' });
  });
});

describe('PowerXRoleNoData', () => {
  it('offers models with prefill/decode data under a role with none, keeping the role', () => {
    expect(mount(<PowerXRoleNoData role="all" points={[aggregated]} />).innerHTML).toBe('');
    expect(mount(<PowerXRoleNoData role="prefill" points={[disagg]} />).innerHTML).toBe('');
    const container = mount(<PowerXRoleNoData role="split" points={[aggregated]} />);
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="powerx-role-no-data-model"]',
    );
    expect([...buttons].map((b) => b.dataset.model)).toEqual(['Kimi-K3.1-Pro']);
    act(() => buttons[0]!.click());
    expect(mocks.setSelectedModel).toHaveBeenCalledWith('Kimi-K3.1-Pro');
    expect(mocks.setPowerRole).not.toHaveBeenCalled();
  });
});
