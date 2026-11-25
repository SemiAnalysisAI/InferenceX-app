// @test-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';

import type { HardwareConfig } from '@/components/inference/types';
import { stubMatchMedia } from '@/test/match-media-stub';
import { stubGlobal, unstubAllGlobals } from '@/test/helpers';

import type { ProfitEstimatorAssumptions, ProfitEstimatorRow } from './profit-estimator';
import ProfitEstimatorChart from './ProfitEstimatorChart';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ROWS: ProfitEstimatorRow[] = [
  {
    hwKey: 'b200_vllm',
    resultKey: 'b200_vllm',
    gpuHours: 1,
    revenuePerGpuHour: 9,
    revenue: 9,
    tco: 4,
    grossMargin: 5,
    labCut: 2.7,
    profit: 2.3,
  },
  {
    hwKey: 'mi355x_vllm',
    resultKey: 'mi355x_vllm',
    gpuHours: 1,
    revenuePerGpuHour: 6,
    revenue: 6,
    tco: 2.9,
    grossMargin: 3.1,
    labCut: 1.8,
    profit: 1.3,
  },
];

const ASSUMPTIONS: ProfitEstimatorAssumptions = {
  utilizationPct: 60,
  labCutPct: 30,
  basis: 'chip-hour',
};

/** The default palette and the High Contrast one, as `useThemeColors` hands them over. */
const DEFAULT_COLORS: Record<string, string> = { b200_vllm: '#2e7d32', mi355x_vllm: '#c62828' };
const HIGH_CONTRAST_COLORS: Record<string, string> = {
  b200_vllm: '#00c853',
  mi355x_vllm: '#ff1744',
};

let frames: FrameRequestCallback[] = [];
let container: HTMLDivElement;
let root: Root;

function flushFrames() {
  act(() => {
    while (frames.length > 0) {
      const pending = frames;
      frames = [];
      for (const frame of pending) frame(0);
    }
  });
}

beforeEach(() => {
  frames = [];
  stubMatchMedia();
  let observe: ResizeObserverCallback | undefined;
  stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        observe = callback;
      }
      observe(target: Element) {
        observe?.(
          [{ target, contentRect: DOMRect.fromRect({ width: 1000, height: 500 }) } as never],
          this as never,
        );
      }
      unobserve() {}
      disconnect() {}
    },
  );
  stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
  stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ width: 1000, height: 500 }),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  unstubAllGlobals();
});

function draw(colors: Record<string, string>, rows: ProfitEstimatorRow[] = ROWS) {
  act(() =>
    root.render(
      createElement(ProfitEstimatorChart, {
        rows,
        hardwareConfig: {} as HardwareConfig,
        // A new resolver per palette, as the display builds one per `useThemeColors` result.
        colorResolver: (row: ProfitEstimatorRow) => colors[row.hwKey]!,
        assumptions: ASSUMPTIONS,
      }),
    ),
  );
  flushFrames();
}

const tcoFills = () =>
  [...container.querySelectorAll<SVGRectElement>('rect.bar-tco')].map((bar) =>
    bar.getAttribute('fill'),
  );

describe('ProfitEstimatorChart palette changes', () => {
  it('repaints the bars when High Contrast swaps the palette without changing the data', () => {
    draw(DEFAULT_COLORS);
    expect(tcoFills()).toEqual(['#2e7d32', '#c62828']);

    draw(HIGH_CONTRAST_COLORS);
    expect(tcoFills()).toEqual(['#00c853', '#ff1744']);

    draw(DEFAULT_COLORS);
    expect(tcoFills()).toEqual(['#2e7d32', '#c62828']);
  });
});

describe('ProfitEstimatorChart vendor marks', () => {
  it('tops every vendor bar, Trainium3 included, with a mark and keeps the orange smile uninverted', () => {
    const trn3: ProfitEstimatorRow = { ...ROWS[0]!, hwKey: 'trn3_vllm', resultKey: 'trn3_vllm' };
    draw({ ...DEFAULT_COLORS, trn3_vllm: '#ff9900' }, [...ROWS, trn3]);
    const marks = [...container.querySelectorAll<SVGImageElement>('image.bar-vendor-mark')];
    expect(marks).toHaveLength(3);
    const trn3Mark = marks.find((mark) =>
      decodeURIComponent(mark.getAttribute('href') ?? '').includes('#FF9900'),
    );
    expect(trn3Mark).toBeDefined();
    expect(trn3Mark?.getAttribute('class')).not.toContain('dark:invert');
    expect(Number(trn3Mark?.getAttribute('width'))).toBeGreaterThan(0);
  });
});
