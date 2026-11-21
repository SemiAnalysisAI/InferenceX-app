// @test-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi, mock } from 'bun:test';

const mocks = { track: vi.fn() };
mock.module('@/lib/analytics/analytics', () => ({ track: mocks.track }));
mock.module('next/link', () => ({
  default: ({ href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props} />
  ),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { PowerXTutorialCta } from './powerx-tutorial-cta';

function mount(locale: 'en' | 'zh') {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <PowerXTutorialCta locale={locale} />
      </QueryClientProvider>,
    ),
  );
  return { host, root };
}

describe('PowerXTutorialCta', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    mocks.track.mockClear();
  });

  it('links to the locale tutorial and labels it as new', () => {
    for (const [locale, href] of [
      ['en', '/pwx/tutorial'],
      ['zh', '/zh/pwx/tutorial'],
    ] as const) {
      const { host, root } = mount(locale);
      const link = host.querySelector<HTMLAnchorElement>('[data-testid="powerx-tutorial-link"]');
      expect(link?.getAttribute('href')).toBe(href);
      expect(link?.getAttribute('aria-label')).toBeTruthy();
      expect(link?.querySelector('[data-new-badge-label]')).not.toBeNull();
      act(() => root.unmount());
    }
    const { host } = mount('en');
    expect(host.textContent).toContain('How we measure power');
  });

  it('tracks the header entry point on click', () => {
    const { host } = mount('en');
    const link = host.querySelector<HTMLAnchorElement>('[data-testid="powerx-tutorial-link"]')!;
    // jsdom cannot navigate; cancel after React's root listener has run.
    document.addEventListener('click', (event) => event.preventDefault(), { once: true });
    act(() => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(mocks.track).toHaveBeenCalledWith('powerx_tutorial_section_opened', {
      target: 'powerx-header',
    });
  });
});
