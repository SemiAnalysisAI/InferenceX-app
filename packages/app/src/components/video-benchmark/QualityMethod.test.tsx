// @test-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi, mock } from 'bun:test';

const mocks = { track: vi.fn(), locale: 'en' as 'en' | 'zh' };
mock.module('@/lib/analytics/analytics', () => ({ track: mocks.track }));
mock.module('@/lib/i18n/use-locale', () => ({ useLocale: () => mocks.locale }));
mock.module('next/link', () => ({
  default: ({ href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props} />
  ),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import QualityMethod from './QualityMethod';

describe('QualityMethod', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    mocks.track.mockClear();
  });

  it('opens the quality guide in the reader’s locale from "Full methodology"', () => {
    for (const [locale, href, label] of [
      ['en', '/vgx/quality', 'Full methodology'],
      ['zh', '/zh/vgx/quality', '完整方法说明'],
    ] as const) {
      mocks.locale = locale;
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      act(() =>
        root.render(
          <QueryClientProvider client={new QueryClient()}>
            <QualityMethod leads={[]} onShowMe={() => {}} />
          </QueryClientProvider>,
        ),
      );
      const link = [...host.querySelectorAll('a')].find((a) => a.textContent?.includes(label));
      expect([link?.getAttribute('href'), link?.getAttribute('target')]).toEqual([href, null]);
      // jsdom cannot navigate; cancel after React's root listener has run.
      document.addEventListener('click', (event) => event.preventDefault(), { once: true });
      act(() => link!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
      expect(mocks.track).toHaveBeenCalledWith('video_results_quality_methodology_clicked');
      act(() => root.unmount());
    }
  });
});
