// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  HARDWARE_CONFIG,
  baseInferenceState,
  baseOverlayState,
  inferenceState,
  mountChart,
  overlayState,
  point,
} from './ScatterGraph.test-harness';

const topYTick = (container: HTMLElement) =>
  Math.max(
    ...[...container.querySelectorAll('.y-axis .tick text')].map((tick) =>
      Number(tick.textContent?.replaceAll(/[^\d.]/gu, '')),
    ),
  );

const percentTdp = [point('b200', 'fp8', 30, 96.6, 8), point('b200', 'fp8', 200, 41.7, 8)];

describe('ScatterGraph % TDP y-axis', () => {
  it('stops at 100% when every point is at or below TDP', () => {
    inferenceState.current = {
      ...baseInferenceState(),
      selectedYAxisMetric: 'y_measuredPowerPercentTdp',
    };
    const { container, unmount } = mountChart({ data: percentTdp });

    expect(topYTick(container)).toBe(100);
    unmount();
  });

  it('extends past 100% when an unofficial overlay point exceeds TDP', () => {
    inferenceState.current = {
      ...baseInferenceState(),
      selectedYAxisMetric: 'y_measuredPowerPercentTdp',
    };
    overlayState.current = {
      ...baseOverlayState(),
      isUnofficialRun: true,
      activeOverlayHwTypes: new Set(['b200']),
      allOverlayHwTypes: new Set(['b200']),
    };
    const { container, unmount } = mountChart({
      data: percentTdp,
      overlayData: {
        data: [point('b200', 'fp8', 40, 104, 8)],
        hardwareConfig: { b200: { ...HARDWARE_CONFIG.b200, suffix: '' } },
        label: 'power comparison',
      },
    });

    expect(topYTick(container)).toBeGreaterThan(104);
    unmount();
  });
});
