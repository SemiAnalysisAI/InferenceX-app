// @test-environment jsdom
import { describe, expect, it, mock } from 'bun:test';

import type { InferenceData } from '@/components/inference/types';
import chartDefinitions from '@/components/inference/metric-registry';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';

import {
  HARDWARE_CONFIG,
  baseInferenceState,
  baseOverlayState,
  inferenceState,
  legendState,
  mountChart,
  overlayState,
  point,
  scatterPoints,
} from './ScatterGraph.test-harness';

// The chart renders inside the PowerX tab.
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

// h100 runs aggregated: every GPU does both, so there is no pool line to draw.
const aggregated = (x: number): InferenceData => ({
  ...point('h100', 'fp8', x, 500, 8),
  measuredAvgPower: metric(500),
});

// One disaggregated row per x, expanded the way the roles compare draws it: the base
// all-GPU row plus a prefill and a flat decode clone.
const rolePoint = (x: number, run_url?: string): InferenceData[] => {
  const base = {
    ...point('b200', 'fp8', x, 600 + x, 8),
    disagg: true,
    ...(run_url ? { run_url } : {}),
    measuredAvgPower: metric(600 + x),
    measuredPrefillAvgPower: metric(500 + x),
    measuredDecodeAvgPower: metric(701.5),
  };
  return [
    base,
    { ...base, y: 500 + x, powerVariant: { kind: 'role', id: 'prefill' } },
    { ...base, y: 701.5, powerVariant: { kind: 'role', id: 'decode' } },
  ];
};
const variantOf = (d: InferenceData) => d.powerVariant?.id ?? '';

describe('PowerX GPU role on the main chart', () => {
  it('draws only the pool the role reads and lists aggregated chips dimmed, keyed by that pool', () => {
    const runUrl = 'https://github.com/o/r/actions/runs/123';
    inferenceState.current = {
      ...baseInferenceState(),
      selectedYAxisMetric: 'y_measuredAvgPower',
      powerCompare: 'roles',
      powerRole: 'prefill',
      hideNonOptimal: false,
    };
    overlayState.current = {
      ...baseOverlayState(),
      isUnofficialRun: true,
      activeOverlayHwTypes: new Set(['b200']),
      allOverlayHwTypes: new Set(['b200']),
      runIndexByUrl: { [runUrl]: 0 },
      unofficialRunInfos: [{ id: '123', branch: 'powerx', url: runUrl }],
    };
    const { container, unmount } = mountChart({
      chartDefinition: chartDefinitions[0],
      data: [...[10, 20, 40].flatMap((x) => rolePoint(x)), aggregated(10), aggregated(20)],
      overlayData: {
        data: [15, 30].flatMap((x) => rolePoint(x, runUrl)),
        hardwareConfig: { b200: { ...HARDWARE_CONFIG.b200, suffix: '' } },
        label: 'prefill role',
      },
    });
    const official = scatterPoints(container).map(({ datum }) => datum as InferenceData);
    expect(official.map(variantOf)).toEqual(['prefill', 'prefill', 'prefill']);
    expect(official.map((d) => d.y).toSorted((a, b) => a - b)).toEqual([510, 520, 540]);
    const overlay = [
      ...container.querySelectorAll<SVGGElement & { __data__: InferenceData }>(
        '.unofficial-overlay-pt',
      ),
    ].map((element) => element.__data__);
    expect(overlay.map(variantOf)).toEqual(['prefill', 'prefill']);

    // Aggregated chips stay listed, dimmed and explained; one key entry names the pool.
    const items: { hw: string; label: string; isActive: boolean; blockedReason?: string }[] =
      legendState.current!.legendItems;
    const h100 = items.find((item) => item.hw === 'h100');
    expect(h100).toMatchObject({ isActive: false, label: expect.stringContaining('aggregated') });
    expect(h100?.blockedReason).toContain('every GPU does both');
    expect(items.find((item) => item.hw === 'b200')?.isActive).toBe(true);
    const roleKey = items.filter((item) => /prefill|decode/u.test(item.hw));
    expect(roleKey.map((item) => item.label)).toEqual(['Prefill GPUs']);
    unmount();
  });
});
