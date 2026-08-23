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

describe('ScatterGraph unofficial overlays', () => {
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
      quickFilters: { vendors: ['AMD'], frameworks: [], deployment: [], spec: [] },
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
