// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import chartDefinitions from '@/components/inference/metric-registry';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import type * as PowerXSurface from '@/components/inference/ui/powerx-surface';

import {
  HARDWARE_CONFIG,
  baseInferenceState,
  baseOverlayState,
  inferenceState,
  mountChart,
  overlayState,
  point,
} from './ScatterGraph.test-harness';

// The chart renders inside the PowerX tab.
vi.mock('@/components/inference/ui/powerx-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof PowerXSurface>()),
  usePowerXSurface: () => true,
}));

const metric = (y: number) => ({ y, roof: false });
const tdpPoint = (x: number, avg: number, p90: number, runUrl?: string): InferenceData => ({
  ...point('h100', 'fp8', x, (avg / 700) * 100, 8),
  measuredAvgPower: metric(avg),
  measuredP90Power: metric(p90),
  measuredPowerPercentTdp: metric((avg / 700) * 100),
  run_url: runUrl,
});

describe('PowerX headroom on unofficial overlays', () => {
  it('shades a headroom band for each overlay line in its run color, beneath the lines', () => {
    const runUrl = 'https://github.com/o/r/actions/runs/123';
    inferenceState.current = {
      ...baseInferenceState(),
      selectedYAxisMetric: 'y_measuredPowerPercentTdp',
      hideNonOptimal: false,
      showPointLabels: false,
      showGradientLabels: false,
    };
    overlayState.current = {
      ...baseOverlayState(),
      isUnofficialRun: true,
      activeOverlayHwTypes: new Set(['h100']),
      allOverlayHwTypes: new Set(['h100']),
      runIndexByUrl: { [runUrl]: 2 },
      unofficialRunInfos: [
        { id: '1', branch: 'a', url: 'u1' },
        { id: '2', branch: 'b', url: 'u2' },
        { id: '123', branch: 'powerx', url: runUrl },
      ],
    };
    const official = [tdpPoint(10, 600, 650), tdpPoint(20, 500, 560), tdpPoint(40, 400, 450)];
    const overlay = [
      tdpPoint(10, 640, 690, runUrl),
      tdpPoint(20, 540, 600, runUrl),
      tdpPoint(40, 430, 480, runUrl),
    ];
    const { container, rerender, unmount } = mountChart({
      chartDefinition: chartDefinitions[0],
      data: official,
      overlayData: {
        data: overlay,
        hardwareConfig: { h100: { ...HARDWARE_CONFIG.h100, suffix: '' } },
        label: 'power comparison',
      },
    });
    const bands = () => [
      ...container.querySelectorAll<SVGGElement>('[data-testid="headroom-band"]'),
    ];
    expect(bands()).toHaveLength(2);
    const overlayBand = bands().find((band) => band.dataset.runIndex === '2');
    expect(overlayBand).toBeDefined();
    expect(overlayBand!.querySelector('path.headroom-area')!.getAttribute('fill')).toBe(
      overlayRunColor(2),
    );
    expect(overlayBand!.querySelector('path.headroom-p90')!.getAttribute('stroke')).toBe(
      overlayRunColor(2),
    );
    const officialBand = bands().find((band) => !band.dataset.runIndex);
    expect(officialBand!.querySelector('path.headroom-area')!.getAttribute('fill')).not.toBe(
      overlayRunColor(2),
    );
    // The band layer sits under the roofline and point layers.
    const zoomGroup = overlayBand!.parentElement!;
    const order = [...zoomGroup.children].map(
      (child) => child.getAttribute('class') ?? child.tagName,
    );
    const bandIndex = order.indexOf('headroom-band');
    const curveIndex = order.findIndex((name) =>
      /roofline|dot-group|unofficial-overlay/u.test(name),
    );
    expect(bandIndex).toBeGreaterThanOrEqual(0);
    expect(curveIndex).toBeGreaterThan(bandIndex);

    // Hiding the overlay hardware removes its band and keeps the official one.
    overlayState.current = { ...overlayState.current, activeOverlayHwTypes: new Set<string>() };
    rerender();
    expect(bands().map((band) => band.dataset.runIndex)).toEqual([undefined]);
    unmount();
  });
});
