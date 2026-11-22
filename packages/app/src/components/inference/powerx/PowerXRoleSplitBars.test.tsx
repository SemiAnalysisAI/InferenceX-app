// @test-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import type { InferenceData } from '@/components/inference/types';

mock.module('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));
mock.module('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ resolveColor: (key: string) => `var(--${key})` }),
}));
mock.module('@/providers/unofficial-run-provider', () => ({
  useUnofficialRun: () => ({ runIndexByUrl: { 'https://github.com/o/r/actions/runs/9': 3 } }),
}));

// Runs the chart's D3 layers on fixed scales.
mock.module('@/lib/d3-chart/D3Chart', () => import('../ui/d3-chart-test-stub'));

import PowerXRoleSplitBars from './PowerXRoleSplitBars';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function point(overrides: Partial<InferenceData>): InferenceData {
  return {
    x: 220,
    y: 1,
    hwKey: 'gb300_dynamo-trt',
    date: '2026-04-07',
    tp: 8,
    conc: 16,
    precision: 'fp4',
    tpPerGpu: { y: 1, roof: false },
    tpPerMw: { y: 1, roof: false },
    costh: { y: 1, roof: false },
    costr: { y: 1, roof: false },
    costhi: { y: 1, roof: false },
    costri: { y: 1, roof: false },
    ...overrides,
  } as InferenceData;
}

const split = (extra: Partial<InferenceData> = {}) =>
  point({
    disagg: true,
    num_prefill_gpu: 8,
    num_decode_gpu: 32,
    reconstructedPrefillJPerOutputToken: { y: 4.53, roof: false },
    measuredDecodeJPerOutputToken: { y: 20.68, roof: false },
    measuredJPerOutputToken: { y: 25.21, roof: false },
    ...extra,
  });

const segment = (group: Element, role: string) =>
  group.querySelector<SVGRectElement>(
    `[data-testid="powerx-role-split-segment"][data-role="${role}"]`,
  )!;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PowerXRoleSplitBars', () => {
  it('draws prefill + decode per point and lists aggregated chips, dimmed, without a bar', () => {
    act(() =>
      root.render(
        <PowerXRoleSplitBars
          points={[split(), point({ hwKey: 'mi355x_sglang', disagg: false, num_decode_gpu: 0 })]}
          overlayPoints={[split({ run_url: 'https://github.com/o/r/actions/runs/9' })]}
          hardwareLabel={(p) =>
            p.hwKey === 'mi355x_sglang' ? 'MI355X (SGLang)' : 'GB300 (Dynamo TRT)'
          }
        />,
      ),
    );
    const rows = container.querySelectorAll('[data-testid="powerx-role-split-row"]');
    expect(rows).toHaveLength(2);
    const text = rows[0].textContent ?? '';
    expect(text).toContain('220 tok/s/user / c16 · 8 prefill + 32 decode GPUs');
    expect(text).toContain('25.21 J / 4.53 + 20.68 J');
    expect(text).toContain('18% prefill');
    expect(text).toContain('82% decode');

    const groups = container.querySelectorAll('[data-testid="powerx-role-split-group"]');
    // The overlay run draws in its own colour; prefill dashed, decode dotted.
    expect(segment(groups[1], 'prefill').getAttribute('stroke')).toBe('var(--overlay-run-3)');
    expect(segment(groups[1], 'prefill').getAttribute('stroke-dasharray')).toBe('4 2');
    expect(segment(groups[1], 'decode').getAttribute('stroke-dasharray')).toBe('1.5 1.5');

    const unsplit = container.querySelector('[data-testid="powerx-role-split-unsplit"]')!;
    expect(unsplit.className).toContain('opacity-60');
    expect(unsplit.textContent).toContain(
      'MI355X (SGLang) is listed but not split: it runs aggregated, so every GPU does both prefill and decode.',
    );
    expect(container.textContent).not.toMatch(/\b0 (?:prefill|decode)\b/u);
  });

  it('fills each bar to its own split, so one 31 J outlier does not shrink the rest', () => {
    act(() =>
      root.render(
        <PowerXRoleSplitBars
          points={[
            split(),
            split({
              hwKey: 'gb300_dynamo-tilert',
              reconstructedPrefillJPerOutputToken: { y: 1.68, roof: false },
              measuredDecodeJPerOutputToken: { y: 30, roof: false },
              measuredJPerOutputToken: { y: 31.68, roof: false },
            }),
          ]}
        />,
      ),
    );
    const prefill = [
      ...container.querySelectorAll<SVGRectElement>(
        '[data-testid="powerx-role-split-segment"][data-role="prefill"]',
      ),
    ];
    expect(prefill).toHaveLength(2);
    expect(prefill.map((bar) => Math.round(Number(bar.dataset.share)))).toEqual(
      expect.arrayContaining([18, 5]),
    );
  });
});
