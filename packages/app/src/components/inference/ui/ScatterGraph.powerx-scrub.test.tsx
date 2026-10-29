// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import type * as PowerXSurface from '@/components/inference/ui/powerx-surface';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';

import {
  HARDWARE_CONFIG,
  baseInferenceState,
  baseOverlayState,
  inferenceState,
  mountChart,
  overlayState,
  point,
} from './ScatterGraph.test-harness';

// The chart renders as the PowerX tab on a touch-primary device; the readout setter is
// captured so the test can read what the scrub reports.
const mocks = vi.hoisted(() => ({ coarse: true, setActivePoint: vi.fn() }));
vi.mock('@/components/inference/ui/powerx-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof PowerXSurface>()),
  usePowerXSurface: () => true,
  useSetPowerXActivePoint: () => mocks.setActivePoint,
}));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsMobileViewport: () => true,
  useIsCoarsePointer: () => mocks.coarse,
  useMediaQuery: () => false,
}));

const finger = (element: Element, type: string, init: PointerEventInit = {}) =>
  act(() => {
    element.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        pointerType: 'touch',
        isPrimary: true,
        ...init,
      }),
    );
  });

const datumOf = (node: Element) => (node as unknown as { __data__?: InferenceData }).__data__;
/** A dot's plot position from its transform; the svg has no layout in jsdom. */

const mark = (container: HTMLElement) =>
  container.querySelector<SVGGElement>('[data-testid="powerx-scrub"]');

describe('PowerX touch scrub on the main chart', () => {
  it('reads an unofficial-run overlay point in its run colour and respects the overlay toggles', () => {
    mocks.setActivePoint.mockClear();
    const runUrl = 'https://github.com/o/r/actions/runs/123';
    inferenceState.current = baseInferenceState();
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
    const overlay = [
      { ...point('h100', 'fp8', 70, 700, 8), run_url: runUrl },
      { ...point('h100', 'fp8', 90, 900, 8), run_url: runUrl },
    ];
    const { container, rerender, unmount } = mountChart({
      overlayData: {
        data: overlay,
        hardwareConfig: { h100: { ...HARDWARE_CONFIG.h100, suffix: '' } },
        label: 'power comparison',
      },
    });
    const svg = container.querySelector('svg')!;
    const marker = [...container.querySelectorAll<SVGGElement>('.unofficial-overlay-pt')].find(
      (node) => datumOf(node)?.x === 90,
    )!;
    const match = /translate\((?<x>[^,]+),(?<y>[^)]+)\)/u.exec(marker.getAttribute('transform')!);
    const at = { x: Number(match?.groups?.x), y: Number(match?.groups?.y) };
    finger(svg, 'pointerdown', { clientX: at.x + 2, clientY: at.y - 2 });
    expect(mark(container)?.dataset.overlay).toBe('true');
    expect(mark(container)?.dataset.hwKey).toBe('h100');
    expect(mark(container)?.querySelector('circle')?.getAttribute('stroke')).toBe(
      overlayRunColor(2),
    );
    expect(mocks.setActivePoint).toHaveBeenLastCalledWith({
      point: expect.objectContaining({ x: 90, run_url: runUrl }),
      source: 'scrub',
    });
    finger(svg, 'pointerup', { clientX: at.x, clientY: at.y });
    // The overlay hardware hidden in the legend: its points are no longer candidates.
    overlayState.current = { ...overlayState.current, activeOverlayHwTypes: new Set<string>() };
    rerender();
    finger(svg, 'pointerdown', { clientX: at.x + 2, clientY: at.y - 2 });
    expect(mark(container)?.dataset.overlay).toBeUndefined();
    expect(mocks.setActivePoint.mock.calls.at(-1)?.[0].point.run_url).toBeUndefined();
    unmount();
  });
});
