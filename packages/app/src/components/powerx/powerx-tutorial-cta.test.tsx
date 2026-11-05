// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/analytics/analytics', () => ({ track: mocks.track }));
vi.mock('next/link', () => ({
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
  act(() => root.render(<PowerXTutorialCta locale={locale} />));
  return { host, root };
}

describe('PowerXTutorialCta', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    mocks.track.mockClear();
  });

  it('links to the locale tutorial and labels it as new', () => {
    for (const [locale, href] of [
      ['en', '/powerx/tutorial'],
      ['zh', '/zh/powerx/tutorial'],
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
