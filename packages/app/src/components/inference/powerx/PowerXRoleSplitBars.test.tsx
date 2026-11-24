// @test-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, mock } from 'bun:test';

import type { InferenceData } from '@/components/inference/types';

mock.module('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));
mock.module('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ resolveColor: (key: string) => `var(--${key})` }),
}));
mock.module('@/providers/unofficial-run-provider', () => ({
  useUnofficialRun: () => ({ runIndexByUrl: { 'https://github.com/o/r/actions/runs/9': 3 } }),
}));

import PowerXRoleSplitBars from './PowerXRoleSplitBars';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const point = (overrides: Partial<InferenceData>) =>
  ({
    x: 220,
    y: 1,
    hwKey: 'gb300_dynamo-trt',
    conc: 16,
    precision: 'fp4',
    ...overrides,
  }) as InferenceData;

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

describe('PowerXRoleSplitBars', () => {
  it('draws prefill + decode per point and lists aggregated chips, dimmed, without a bar', () => {
    const container = document.createElement('div');
    act(() =>
      createRoot(container).render(
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
    const overlayPrefill = groups[1].querySelector<HTMLElement>('[data-role="prefill"]')!;
    expect(overlayPrefill.style.borderColor).toBe('var(--overlay-run-3)');
    expect(overlayPrefill.style.borderStyle).toBe('dashed');
    expect(groups[1].querySelector<HTMLElement>('[data-role="decode"]')!.style.borderStyle).toBe(
      'dotted',
    );

    const unsplit = container.querySelector('[data-testid="powerx-role-split-unsplit"]')!;
    expect(unsplit.className).toContain('opacity-60');
    expect(unsplit.textContent).toContain(
      'MI355X (SGLang) is listed but not split: it runs aggregated, so every GPU does both prefill and decode.',
    );
    expect(container.textContent).not.toMatch(/\b0 (?:prefill|decode)\b/u);
  });
});
