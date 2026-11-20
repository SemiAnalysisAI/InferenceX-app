// @test-environment jsdom
import { act } from 'react';
import { describe, expect, it, mock, vi } from 'bun:test';

import type { InferenceData } from '@/components/inference/types';
import chartDefinitions from '@/components/inference/metric-registry';

import {
  baseInferenceState,
  baseOverlayState,
  inferenceState,
  legendState,
  mountChart,
  overlayState,
  point,
} from './ScatterGraph.test-harness';

const actual = { ...(await import('@/lib/d3-chart/dynamic-margins')) };
mock.module('@/lib/d3-chart/dynamic-margins', () => ({
  ...actual,
  measureTextWidth: (text: string, font: string) =>
    text.length * Number.parseFloat(font.split(' ')[1]) * 0.58,
}));
const actual2 = { ...(await import('@/components/inference/ui/powerx-surface')) };
mock.module('@/components/inference/ui/powerx-surface', () => ({
  ...actual2,
  usePowerXSurface: () => true,
}));
mock.module('@/hooks/useMediaQuery', () => ({
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

interface LegendItem {
  hw: string;
  label: string;
  isActive: boolean;
  blockedReason?: string;
  onClick: () => void;
}

function mountPowerX(state: Record<string, unknown>, data: InferenceData[]) {
  inferenceState.current = {
    ...baseInferenceState(),
    selectedYAxisMetric: 'y_measuredAvgPower',
    hideNonOptimal: false,
    ...state,
  };
  overlayState.current = baseOverlayState();
  legendState.current = null;
  return mountChart({ chartDefinition: chartDefinitions[0], data, powerXDirectLabels: true });
}

describe('PowerX Energy and Power legend beside the main chart', () => {
  it('is the AgentX sidebar legend with its switches, Reset filter and Quick Filters', () => {
    const toggleHwType = vi.fn();
    const removeHwType = vi.fn();
    const { container, unmount } = mountPowerX({ toggleHwType, removeHwType }, [
      measured('h100', 40, 500),
      measured('h100', 60, 520),
      measured('b200', 40, 400),
      measured('b200', 60, 420),
    ]);
    const legend = legendState.current!;
    expect(legend.variant).toBe('sidebar');
    const switches = (legend.switches as { id: string }[]).map((item) => item.id);
    expect(switches).toEqual(
      expect.arrayContaining([
        'scatter-log-scale',
        'scatter-hide-non-optimal',
        'scatter-parallelism-labels',
        'scatter-gradient-labels',
        'scatter-line-labels',
      ]),
    );
    // The direct line labels add the framework themselves, so its pill switch would do nothing.
    expect(switches).not.toContain('scatter-framework-label');
    expect(legend.reset.id).toBe('scatter-reset-filter');
    expect((legend.actions as { id: string }[]).map((item) => item.id)).toContain(
      'scatter-quick-filters',
    );
    // Rows toggle the shared legend state, so hidden GPUs keep round-tripping the URL.
    const items: LegendItem[] = legend.legendItems;
    act(() => items.find((item) => item.hw === 'b200')!.onClick());
    expect(toggleHwType).toHaveBeenCalledWith('b200');
    act(() => legend.onItemRemove('h100'));
    expect(removeHwType).toHaveBeenCalledWith('h100');
    // No Compare-at reading line or drag grip on the plot.
    expect(container.querySelector('.powerx-at-line')).toBeNull();
    expect(container.querySelector('[data-testid^="powerx-at"]')).toBeNull();
    expect(container.querySelector('[data-testid="powerx-ranking"]')).toBeNull();
    unmount();
  });

  it('lists an aggregated GPU under Decode, dimmed and explained', () => {
    const { unmount } = mountPowerX({ powerCompare: 'roles', powerRole: 'decode' }, [
      ...disagg(40, 650),
      ...disagg(60, 660),
      measured('h100', 40, 500),
      measured('h100', 60, 0),
    ]);
    const items: LegendItem[] = legendState.current!.legendItems;
    const h100 = items.find((item) => item.hw === 'h100')!;
    expect(h100.label).toContain('aggregated');
    expect(h100.isActive).toBe(false);
    expect(h100.blockedReason).toContain('every GPU does both');
    expect(h100.label).not.toMatch(/\b0\b/);
    expect(items.find((item) => item.hw === 'b200')?.isActive).toBe(true);
    unmount();
  });
});
