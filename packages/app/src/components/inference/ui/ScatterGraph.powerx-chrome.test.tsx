// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import type * as PowerXSurface from '@/components/inference/ui/powerx-surface';

import { baseInferenceState, inferenceState, mountChart } from './ScatterGraph.test-harness';

// The same chart renders on /inference and as the PowerX tab; the test flips the surface.
const mocks = vi.hoisted(() => ({ powerXSurface: false }));
vi.mock('@/components/inference/ui/powerx-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof PowerXSurface>()),
  usePowerXSurface: () => mocks.powerXSurface,
}));

// The wrapper swaps the mouse hint for the touch one on touch-primary devices; both end the same.
const hintLine = (container: HTMLElement) =>
  [...container.querySelectorAll('p.no-export')].find((p) =>
    p.textContent?.endsWith('to pin tooltip'),
  );

describe('ScatterGraph interaction hint', () => {
  it('keeps the hint line under the /inference chart', () => {
    mocks.powerXSurface = false;
    inferenceState.current = baseInferenceState();
    const { container, unmount } = mountChart();
    expect(hintLine(container)).toBeDefined();
    unmount();
  });

  it('renders no hint line on the PowerX surface', () => {
    mocks.powerXSurface = true;
    inferenceState.current = baseInferenceState();
    const { container, unmount } = mountChart();
    expect(hintLine(container)).toBeUndefined();
    expect(container.textContent).not.toContain('pin tooltip');
    unmount();
  });

  it('still drops the hint for minimal chrome embeds outside PowerX', () => {
    mocks.powerXSurface = false;
    inferenceState.current = { ...baseInferenceState(), minimalChrome: true };
    const { container, unmount } = mountChart();
    expect(hintLine(container)).toBeUndefined();
    unmount();
  });
});
