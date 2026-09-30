import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ locale: 'en' as 'en' | 'zh' }));
vi.mock('@/lib/use-locale', () => ({ useLocale: () => mocks.locale }));
vi.mock('../InferenceContext', () => ({
  useInferenceDisplay: () => ({ selectedXAxisMode: 'interactivity', selectedPercentile: 'p90' }),
  useInferenceActions: () => ({ setSelectedXAxisMode: vi.fn() }),
  useInferenceFilters: () => ({ selectedSequence: 'agentic-traces' }),
}));

import { XAxisModeSelector } from './XAxisModeSelector';

describe('XAxisModeSelector server render', () => {
  it.each([
    ['en', 'Interactivity'],
    ['zh', '交互性'],
  ] as const)('shows the default axis name before hydration in %s', (locale, label) => {
    mocks.locale = locale;
    const html = renderToStaticMarkup(<XAxisModeSelector />);
    expect(html).toContain(`title="${label}">${label}</span>`);
  });
});
