// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import {
  type ScatterGraph,
  HARDWARE_CONFIG,
  baseInferenceState,
  baseOverlayState,
  inferenceState,
  legendState,
  mountChart,
  overlayState,
  point,
  rebuildCount,
} from './ScatterGraph.test-harness';

const measurements = (offset: number, runUrl?: string): InferenceData[] => [
  { ...point('h100', 'fp8', 10, 900 + offset, 1), power_tier: 'legacy', run_url: runUrl },
  { ...point('h100', 'fp8', 20, 200 + offset, 2), power_tier: 'legacy', run_url: runUrl },
  { ...point('h100', 'fp8', 30, 700 + offset, 4), power_tier: 'certified', run_url: runUrl },
];

describe('ScatterGraph unofficial overlays', () => {
  it('toggles off-boundary power markers for official data and each overlay without moving curves', () => {
    const runUrls = [
      'https://github.com/o/r/actions/runs/123',
      'https://github.com/o/r/actions/runs/456',
    ];
    inferenceState.current = {
      ...baseInferenceState(),
      selectedYAxisMetric: 'y_measuredAvgPower',
    };
    overlayState.current = {
      ...baseOverlayState(),
      isUnofficialRun: true,
      activeOverlayHwTypes: new Set(['h100']),
      allOverlayHwTypes: new Set(['h100']),
      runIndexByUrl: { [runUrls[0]]: 0, [runUrls[1]]: 1 },
      unofficialRunInfos: runUrls.map((url, index) => ({
        id: index === 0 ? '123' : '456',
        branch: `power-${index}`,
        url,
      })),
    };

    const { container, rerender, unmount } = mountChart({
      data: measurements(0),
      overlayData: {
        data: [...measurements(-100, runUrls[0]), ...measurements(100, runUrls[1])],
        hardwareConfig: { h100: { ...HARDWARE_CONFIG.h100, suffix: '' } },
        label: 'power comparison',
      },
    });
    const buildsAfterMount = rebuildCount();
    const groups = [
      ...container.querySelectorAll<SVGGElement>('.dot-group, .unofficial-overlay-pt'),
    ];
    const curves = [...container.querySelectorAll('.roofline-path, .overlay-roofline-path')];
    const paths = curves.map((curve) => curve.getAttribute('d'));
    const axes = [...container.querySelectorAll('.x-axis, .y-axis')];
    const axisGeometry = axes.map((axis) => axis.innerHTML);
    const positions = groups.map((group) => group.getAttribute('transform'));
    expect(groups).toHaveLength(9);
    expect(curves).toHaveLength(3);
    expect(paths.every(Boolean)).toBe(true);

    for (const showAllMeasurements of [false, true, false]) {
      inferenceState.current = { ...inferenceState.current, showAllMeasurements };
      rerender();
      for (const group of groups) {
        const datum = (group as SVGGElement & { __data__: InferenceData }).__data__;
        const visible = showAllMeasurements || datum.x !== 20;
        expect(group.style.opacity).toBe(visible ? '1' : '0');
        expect(group.style.pointerEvents).toBe(visible ? 'auto' : 'none');
        expect(Boolean(group.querySelector('.legacy-power-ring'))).toBe(
          datum.power_tier === 'legacy',
        );
      }
      expect(
        container.querySelector('[data-testid="measured-power-summary"]')?.textContent,
      ).toContain(
        showAllMeasurements
          ? 'Showing 9 of 9 measured points: 3/3 validated · 6/6 historical.'
          : 'Showing 6 of 9 measured points: 3/3 validated · 3/6 historical.',
      );
      expect(curves.map((curve) => curve.getAttribute('d'))).toEqual(paths);
      expect(axes.map((axis) => axis.innerHTML)).toEqual(axisGeometry);
      expect(groups.map((group) => group.getAttribute('transform'))).toEqual(positions);
      expect(rebuildCount()).toBe(buildsAfterMount);
    }
    unmount();
  });

  it('includes unofficial measured points in the validated/historical coverage summary', () => {
    const runUrl = 'https://github.com/o/r/actions/runs/123';
    const overlayPoints = [
      { ...point('h100', 'fp8', 30, 300, 2), power_tier: 'certified', run_url: runUrl },
      { ...point('h100', 'fp8', 35, 350, 4), power_tier: 'legacy', run_url: runUrl },
    ] as InferenceData[];
    inferenceState.current = {
      ...baseInferenceState(),
      selectedYAxisMetric: 'y_measuredJPerOutputToken',
    };
    overlayState.current = {
      ...baseOverlayState(),
      isUnofficialRun: true,
      activeOverlayHwTypes: new Set(['h100']),
      allOverlayHwTypes: new Set(['h100']),
      runIndexByUrl: { [runUrl]: 0 },
      unofficialRunInfos: [{ id: '123', branch: 'test-branch', url: runUrl }],
    };

    const { container, unmount } = mountChart({
      overlayData: {
        data: overlayPoints,
        hardwareConfig: HARDWARE_CONFIG,
      } as unknown as Parameters<typeof ScatterGraph>[0]['overlayData'],
    });

    expect(
      container.querySelector('[data-testid="measured-power-summary"]')?.textContent,
    ).toContain('Showing 2 of 2 measured points: 1/1 validated · 1/1 historical.');
    unmount();
  });

  it('keeps unofficial-run overlay markers rendered through official toggles', () => {
    const overlayPoints = [point('h100', 'fp8', 30, 300, 2), point('h100', 'fp8', 35, 350, 4)].map(
      (p) => ({ ...p, run_url: 'https://github.com/o/r/actions/runs/123' }),
    );
    overlayState.current = {
      ...baseOverlayState(),
      isUnofficialRun: true,
      activeOverlayHwTypes: new Set(['h100']),
      allOverlayHwTypes: new Set(['h100']),
      runIndexByUrl: { 'https://github.com/o/r/actions/runs/123': 0 },
      unofficialRunInfos: [
        { id: '123', branch: 'test-branch', url: 'https://github.com/o/r/actions/runs/123' },
      ],
    };
    const { container, rerender, unmount } = mountChart({
      overlayData: {
        data: overlayPoints,
        hardwareConfig: HARDWARE_CONFIG,
      } as unknown as Parameters<typeof ScatterGraph>[0]['overlayData'],
    });
    const buildsAfterMount = rebuildCount();

    expect(container.querySelectorAll('.unofficial-overlay-pt')).toHaveLength(2);
    expect(container.querySelectorAll('.overlay-roofline-path').length).toBeGreaterThan(0);

    // Toggling an official hw must not rebuild or disturb overlay markers.
    inferenceState.current = {
      ...inferenceState.current,
      activeHwTypes: new Set(['h100']),
    };
    rerender();

    expect(container.querySelectorAll('.unofficial-overlay-pt')).toHaveLength(2);
    expect(rebuildCount()).toBe(buildsAfterMount);
    unmount();
  });

  it('toggles official and overlay point labels through the selective display phase', () => {
    const runUrl = 'https://github.com/o/r/actions/runs/123';
    const overlayPoints = [
      { ...point('h100', 'fp8', 30, 300, 2), run_url: runUrl },
      { ...point('h100', 'fp8', 35, 350, 4), run_url: runUrl },
    ];
    inferenceState.current = {
      ...baseInferenceState(),
      showPointLabels: false,
    };
    overlayState.current = {
      ...baseOverlayState(),
      isUnofficialRun: true,
      activeOverlayHwTypes: new Set(['h100']),
      allOverlayHwTypes: new Set(['h100']),
      runIndexByUrl: { [runUrl]: 0 },
      unofficialRunInfos: [{ id: '123', branch: 'test-branch', url: runUrl }],
    };
    const { container, rerender, unmount } = mountChart({
      overlayData: {
        data: overlayPoints,
        hardwareConfig: HARDWARE_CONFIG,
      } as unknown as Parameters<typeof ScatterGraph>[0]['overlayData'],
    });
    const buildsAfterMount = rebuildCount();
    const officialLabel = container.querySelector<SVGTextElement>('.dot-group .point-label');
    const overlayLabel = container.querySelector<SVGTextElement>(
      '.unofficial-overlay-pt .overlay-label',
    );

    expect(officialLabel).not.toBeNull();
    expect(overlayLabel).not.toBeNull();
    expect(officialLabel!.style.display).toBe('none');
    expect(overlayLabel!.style.display).toBe('none');
    const mutationRecords: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutationRecords.push(...records));
    observer.observe(container.querySelector('svg')!, { attributes: true, subtree: true });

    inferenceState.current = {
      ...inferenceState.current,
      showPointLabels: true,
    };
    rerender();

    expect(officialLabel!.style.display).toBe('');
    expect(overlayLabel!.style.display).toBe('');
    mutationRecords.push(...observer.takeRecords());
    observer.disconnect();
    expect(mutationRecords.length).toBeGreaterThan(0);
    expect(
      mutationRecords.every(
        ({ target }) =>
          target instanceof Element && target.closest('.point-label, .overlay-label') !== null,
      ),
    ).toBe(true);
    expect(rebuildCount()).toBe(buildsAfterMount);
    unmount();
  });

  it('disables Best per SKU for overlay edits without applying a context selection', () => {
    const setBestPerSku = vi.fn();
    const runUrl = 'https://github.com/o/r/actions/runs/123';
    const overlayPoints = [
      { ...point('h100', 'fp8', 30, 300, 2), run_url: runUrl },
      { ...point('h100', 'fp8', 35, 350, 4), run_url: runUrl },
    ];
    inferenceState.current = {
      ...baseInferenceState(),
      bestPerSku: true,
      setBestPerSku,
    };
    overlayState.current = {
      ...baseOverlayState(),
      isUnofficialRun: true,
      activeOverlayHwTypes: new Set(['h100']),
      allOverlayHwTypes: new Set(['h100']),
      runIndexByUrl: { [runUrl]: 0 },
      unofficialRunInfos: [{ id: '123', branch: 'test-branch', url: runUrl }],
    };

    const { unmount } = mountChart({
      overlayData: {
        data: overlayPoints,
        hardwareConfig: HARDWARE_CONFIG,
      } as unknown as Parameters<typeof ScatterGraph>[0]['overlayData'],
    });
    const officialItem = legendState.current!.legendItems.find(
      (item: { hw: string }) => item.hw === 'h100',
    );

    act(() => officialItem.onClick());
    expect(setBestPerSku).toHaveBeenLastCalledWith(false, { applySelection: false });

    act(() => legendState.current!.onItemRemove('h100'));
    expect(setBestPerSku).toHaveBeenLastCalledWith(false, { applySelection: false });
    unmount();
  });

  it('keeps speculative decoding out of unofficial-run point decorations', () => {
    const runUrl = 'https://github.com/o/r/actions/runs/123';
    const overlayPoints = [
      {
        ...point('h100', 'fp8', 30, 300, 2),
        benchmark_type: 'agentic_traces',
        spec_decoding: 'mtp',
        offload_mode: 'on',
        run_url: runUrl,
      } as InferenceData,
      {
        ...point('h100', 'fp8', 35, 350, 4),
        benchmark_type: 'agentic_traces',
        spec_decoding: 'none',
        offload_mode: 'off',
        run_url: runUrl,
      } as InferenceData,
    ];
    overlayState.current = {
      ...baseOverlayState(),
      isUnofficialRun: true,
      activeOverlayHwTypes: new Set(['h100']),
      allOverlayHwTypes: new Set(['h100']),
      runIndexByUrl: { [runUrl]: 0 },
      unofficialRunInfos: [{ id: '123', branch: 'test-branch', url: runUrl }],
    };

    const { container, unmount } = mountChart({
      overlayData: {
        data: overlayPoints,
        hardwareConfig: HARDWARE_CONFIG,
      } as unknown as Parameters<typeof ScatterGraph>[0]['overlayData'],
    });
    const groups = [...container.querySelectorAll<SVGGElement>('.unofficial-overlay-pt')];

    expect(groups[0].querySelector('.spec-decode-marker')).toBeNull();
    expect(groups[0].querySelector('.offload-halo')).not.toBeNull();
    expect(groups[1].querySelector('.spec-decode-marker')).toBeNull();
    expect(groups[1].querySelector('.offload-halo')).toBeNull();
    unmount();
  });

  it('applies quick filters to unofficial-run overlay markers', () => {
    const overlayPoints = [point('h100', 'fp8', 30, 300, 2), point('h100', 'fp8', 35, 350, 4)].map(
      (p) => ({ ...p, run_url: 'https://github.com/o/r/actions/runs/123' }),
    );
    overlayState.current = {
      ...baseOverlayState(),
      isUnofficialRun: true,
      activeOverlayHwTypes: new Set(['h100']),
      allOverlayHwTypes: new Set(['h100']),
      runIndexByUrl: { 'https://github.com/o/r/actions/runs/123': 0 },
      unofficialRunInfos: [
        { id: '123', branch: 'test-branch', url: 'https://github.com/o/r/actions/runs/123' },
      ],
    };
    // Overlay points are all NVIDIA (h100); an AMD-only quick filter must hide them,
    // exactly as it would the official points.
    inferenceState.current = {
      ...baseInferenceState(),
      quickFilters: { vendors: ['AMD'], frameworks: [], deployment: [], spec: [], power: [] },
    };
    const { container, unmount } = mountChart({
      overlayData: {
        data: overlayPoints,
        hardwareConfig: HARDWARE_CONFIG,
      } as unknown as Parameters<typeof ScatterGraph>[0]['overlayData'],
    });

    expect(container.querySelectorAll('.unofficial-overlay-pt')).toHaveLength(0);
    unmount();
  });
});
