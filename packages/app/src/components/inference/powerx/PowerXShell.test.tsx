// @test-environment jsdom

import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi, mock } from 'bun:test';

import type { PowerXStripParts } from '@/components/inference/ui/ChartControls';
import { track } from '@/lib/analytics/analytics';
import { mocked } from '@/test/helpers';

import type { PowerXRole } from './powerx-role';

const mocks = { phone: false };
mock.module('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));
mock.module('@/lib/analytics/analytics', () => ({ track: vi.fn() }));
mock.module('@/hooks/useMediaQuery', () => ({
  useIsMobileViewport: () => mocks.phone,
  useIsCoarsePointer: () => mocks.phone,
  useMediaQuery: () => mocks.phone,
}));
mock.module('@/components/inference/InferenceContext', () => ({
  useInferenceAnalyticsContext: () => ({}),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { PowerXContextStrip, PowerXTabs } from './PowerXShell';

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  mocks.phone = false;
  mocked(track).mockClear();
});

function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(node));
  return container;
}

const byTestId = (testId: string) =>
  document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

const parts: PowerXStripParts = {
  model: null,
  scenario: null,
  precision: 'FP4',
  history: null,
  historyActive: false,
  models: ['Kimi-K3'],
  selectedModel: 'Kimi-K3',
  onModelChange: () => {},
  scenarios: ['agentic'],
  selectedScenario: 'agentic',
  onScenarioChange: () => {},
};

function Strip() {
  const [role, setRole] = useState<PowerXRole>('all');
  return (
    <PowerXContextStrip
      parts={parts}
      role={role}
      onRoleChange={setRole}
      modelLabel="Kimi K3 2.8T"
      scenarioLabel="Agentic"
    />
  );
}

describe('PowerXContextStrip on phones', () => {
  it('keeps the settings sheet open while the GPU role changes', () => {
    mocks.phone = true;
    render(<Strip />);
    act(() => byTestId('powerx-context-summary')!.click());
    expect(byTestId('powerx-settings-sheet')).not.toBeNull();

    act(() => byTestId('powerx-role-decode')!.click());
    expect(byTestId('powerx-settings-sheet')).not.toBeNull();
    expect(byTestId('powerx-role-decode')!.getAttribute('aria-checked')).toBe('true');
    expect(byTestId('powerx-context-summary')!.textContent).toContain('Decode');
  });
});

describe('PowerXTabs', () => {
  it('keeps the old draw and where ids in tab analytics', () => {
    const onSelectionChange = vi.fn();
    render(
      <PowerXTabs
        selection={{ metric: 'y_measuredJPerTotalToken', compare: 'none' }}
        onSelectionChange={onSelectionChange}
      />,
    );
    act(() => byTestId('powerx-tab-power')!.click());
    act(() => byTestId('powerx-tab-breakdown')!.click());
    expect(mocked(track).mock.calls.map(([, payload]) => payload?.tab)).toEqual(['draw', 'where']);
  });
});
