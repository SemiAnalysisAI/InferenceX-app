import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, mock } from 'bun:test';

const mocks = { locale: 'en' as 'en' | 'zh' };
mock.module('@/lib/i18n/use-locale', () => ({ useLocale: () => mocks.locale }));
mock.module('../InferenceContext', () => ({
  useInferenceDisplay: () => ({ selectedXAxisMode: 'interactivity', selectedPercentile: 'p90' }),
  useInferenceActions: () => ({ setSelectedXAxisMode: vi.fn() }),
  useInferenceFilters: () => ({ selectedScenario: 'agentic-traces' }),
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
