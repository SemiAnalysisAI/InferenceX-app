// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import chartDefinitions from '@/components/inference/metric-registry';
import type * as PowerXSurface from '@/components/inference/ui/powerx-surface';

import {
  baseInferenceState,
  baseOverlayState,
  inferenceState,
  mountChart,
  overlayState,
  point,
} from './ScatterGraph.test-harness';

vi.mock('@/lib/d3-chart/dynamic-margins', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  measureTextWidth: (text: string, font: string) =>
    text.length * Number.parseFloat(font.split(' ')[1]) * 0.58,
}));
vi.mock('@/components/inference/ui/powerx-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof PowerXSurface>()),
  usePowerXSurface: () => true,
}));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsMobileViewport: () => false,
  useIsCoarsePointer: () => false,
  useMediaQuery: () => false,
}));

const metric = (y: number) => ({ y, roof: false });
const measured = (hwKey: string, x: number, y: number): InferenceData => ({
  ...point(hwKey, 'fp8', x, y, 8),
  measuredAvgPower: metric(y),
});
// b200 is disaggregated: its base row plus the decode clone the roles compare draws.
const disagg = (x: number, y: number): InferenceData[] => {
  const base = { ...measured('b200', x, y), disagg: true, measuredDecodeAvgPower: metric(y) };
  return [base, { ...base, powerVariant: { kind: 'role', id: 'decode' } }];
};

const row = (container: HTMLElement, hw: string) =>
  container.querySelector<HTMLButtonElement>(`[data-testid="powerx-ranking-row-${hw}"]`);

function mountRanking(state: Record<string, unknown>, data: InferenceData[]) {
  inferenceState.current = {
    ...baseInferenceState(),
    selectedYAxisMetric: 'y_measuredAvgPower',
    hideNonOptimal: false,
    ...state,
  };
  overlayState.current = baseOverlayState();
  return mountChart({ chartDefinition: chartDefinitions[0], data, ranking: 'W per GPU' });
}

describe('PowerX ranking beside the main chart', () => {
  it('hides and shows a GPU through the legend state when its row is clicked', () => {
    const removeHwType = vi.fn();
    const toggleHwType = vi.fn();
    const { container, unmount } = mountRanking({ removeHwType, toggleHwType }, [
      measured('h100', 40, 500),
      measured('h100', 60, 520),
      measured('b200', 40, 400),
      measured('b200', 60, 420),
    ]);
    expect(row(container, 'b200')?.getAttribute('aria-pressed')).toBe('true');
    act(() => row(container, 'b200')!.click());
    expect(removeHwType).toHaveBeenCalledWith('b200');
    unmount();

    const hidden = mountRanking({ removeHwType, toggleHwType, activeHwTypes: new Set(['h100']) }, [
      measured('h100', 40, 500),
      measured('b200', 40, 400),
    ]);
    // A hidden GPU folds into "+1 hidden · Show"; Show lists it again to bring it back.
    expect(row(hidden.container, 'b200')).toBeNull();
    const fold = hidden.container.querySelector<HTMLButtonElement>(
      '[data-testid="powerx-ranking-hidden"]',
    )!;
    expect(fold.textContent).toContain('+1 hidden');
    act(() => fold.click());
    const b200 = row(hidden.container, 'b200')!;
    expect(b200.dataset.hidden).toBeDefined();
    act(() => b200.click());
    expect(toggleHwType).toHaveBeenCalledWith('b200');
    hidden.unmount();
  });

  it('lists an aggregated GPU under Decode as aggregated, never as 0', () => {
    const { container, unmount } = mountRanking({ powerCompare: 'roles', powerRole: 'decode' }, [
      ...disagg(40, 650),
      ...disagg(60, 660),
      measured('h100', 40, 500),
      measured('h100', 60, 0),
    ]);
    const h100 = row(container, 'h100')!;
    expect(h100.dataset.aggregated).toBeDefined();
    expect(h100.textContent).toContain('aggregated');
    expect(h100.querySelector('[data-testid="powerx-ranking-value"]')?.textContent ?? '').not.toBe(
      '0',
    );
    expect(
      row(container, 'b200')?.querySelector('[data-testid="powerx-ranking-delta"]')?.textContent,
    ).toBe('best');
    unmount();
  });
});
