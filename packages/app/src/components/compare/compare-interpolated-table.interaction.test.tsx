// @test-environment jsdom
import { createElement } from 'react';
import { describe, expect, it, mock, vi } from 'bun:test';

mock.module('@/lib/analytics/analytics', () => ({ track: vi.fn() }));
mock.module('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));

import { focus, get, press, render, settle } from '@/test/dom';
import { CompareInterpolatedTable } from './compare-interpolated-table';

describe('CompareInterpolatedTable target input', () => {
  it('blurs the input after Enter commits a target', async () => {
    render(
      createElement(CompareInterpolatedTable, {
        aLabel: 'H100',
        bLabel: 'B200',
        ssrRows: [],
        defaultTargets: [20],
        interactivityRange: { min: 1, max: 100 },
        gpuDataPointsA: [],
        gpuDataPointsB: [],
      }),
    );
    const input = get<HTMLInputElement>('input');
    focus(input);
    press('Enter', input);
    await settle();

    expect(document.activeElement).not.toBe(input);
  });
});
