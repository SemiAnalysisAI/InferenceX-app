// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import chartDefinitions from '@/components/inference/metric-registry';
import type * as PowerXSurface from '@/components/inference/ui/powerx-surface';

import {
  baseInferenceState,
  baseOverlayState,
  inferenceState,
  legendState,
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

const metric = (y: number) => ({ y, roof: false });
// b200 is disaggregated: its base row plus the decode clone the roles compare draws.
const disagg = (x: number): InferenceData[] => {
  const base = {
    ...point('b200', 'fp8', x, 600, 8),
    disagg: true,
    measuredAvgPower: metric(600),
    measuredDecodeAvgPower: metric(650),
  };
  return [base, { ...base, y: 650, powerVariant: { kind: 'role', id: 'decode' } }];
};
// h100 runs aggregated: every GPU does both, so there is no pool line to draw.
const aggregated = (x: number): InferenceData => ({
  ...point('h100', 'fp8', x, 500, 8),
  measuredAvgPower: metric(500),
});

interface LegendItem {
  hw: string;
  label: string;
  isActive: boolean;
  blockedReason?: string;
}

describe('PowerX GPU role on the main chart', () => {
  it('keeps aggregated chips listed but dimmed under Decode and keys only the decode line', () => {
    inferenceState.current = {
      ...baseInferenceState(),
      selectedYAxisMetric: 'y_measuredAvgPower',
      powerCompare: 'roles',
      powerRole: 'decode',
      hideNonOptimal: false,
    };
    overlayState.current = baseOverlayState();
    const { unmount } = mountChart({
      chartDefinition: chartDefinitions[0],
      data: [...disagg(10), ...disagg(20), aggregated(10), aggregated(20)],
    });
    const items: LegendItem[] = legendState.current!.legendItems;
    const h100 = items.find((item) => item.hw === 'h100');
    const b200 = items.find((item) => item.hw === 'b200');
    // Listed, dimmed and explained; never dropped and never a reason to leave the role.
    expect(h100?.label).toContain('aggregated');
    expect(h100?.isActive).toBe(false);
    expect(h100?.blockedReason).toContain('every GPU does both');
    expect(b200?.label).not.toContain('aggregated');
    expect(b200?.isActive).toBe(true);
    expect(inferenceState.current.powerRole).toBe('decode');
    // The role key replaces the role toggles: one decode entry, not clickable.
    const roleKey = items.filter(
      (item) => item.hw.includes('decode') || item.hw.includes('prefill'),
    );
    expect(roleKey.map((item) => item.label)).toEqual(['Decode GPUs']);
    unmount();
  });
});
