// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { track } from './analytics';
import { installOutboundLinkTracking } from './outbound-links';
import { analyticsPlacement, placementFor } from './placement';

vi.mock('./analytics', () => ({ track: vi.fn() }));

const stopNavigation = (event: Event) => event.preventDefault();
const click = (selector: string) =>
  document
    .querySelector(selector)
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

afterEach(() => {
  document.body.innerHTML = '';
  vi.mocked(track).mockClear();
});

describe('placementFor', () => {
  it('reads the nearest marked ancestor, including the element itself', () => {
    document.body.innerHTML = `
      <footer data-analytics-placement="footer">
        <nav data-analytics-placement="header_mobile"><a id="inner" href="/x">x</a></nav>
        <a id="outer" href="/y">y</a>
      </footer>`;
    expect(placementFor(document.querySelector('#inner'))).toBe('header_mobile');
    expect(placementFor(document.querySelector('#outer'))).toBe('footer');
    expect(placementFor(document.querySelector('footer'))).toBe('footer');
  });

  it('returns undefined for unmarked, empty, and non-element targets', () => {
    document.body.innerHTML = `<div data-analytics-placement=""><a id="a" href="/">a</a></div><p id="p"></p>`;
    expect(placementFor(document.querySelector('#a'))).toBeUndefined();
    expect(placementFor(document.querySelector('#p'))).toBeUndefined();
    expect(placementFor(null)).toBeUndefined();
    expect(placementFor(window)).toBeUndefined();
  });

  it('builds the attribute object used on JSX regions', () => {
    expect(analyticsPlacement('blog_article')).toEqual({
      'data-analytics-placement': 'blog_article',
    });
  });
});

describe('installOutboundLinkTracking', () => {
  it('adds the placement of the clicked link to outbound_link_clicked', () => {
    document.body.innerHTML = `
      <header data-analytics-placement="header_desktop">
        <a id="gh" href="https://github.com/SemiAnalysisAI/InferenceX"><span id="label">GitHub</span></a>
      </header>
      <a id="bare" href="https://newsletter.semianalysis.com/">News</a>
      <a id="local" href="/inference">Local</a>`;
    const uninstall = installOutboundLinkTracking();
    document.addEventListener('click', stopNavigation);
    try {
      click('#label');
      click('#bare');
      click('#local');
    } finally {
      uninstall();
      document.removeEventListener('click', stopNavigation);
    }

    expect(vi.mocked(track).mock.calls).toEqual([
      [
        'outbound_link_clicked',
        {
          host: 'github.com',
          path: '/SemiAnalysisAI/InferenceX',
          is_newsletter: false,
          is_semianalysis: false,
          placement: 'header_desktop',
        },
        { transport: 'sendBeacon' },
      ],
      [
        'outbound_link_clicked',
        {
          host: 'newsletter.semianalysis.com',
          path: '/',
          is_newsletter: true,
          is_semianalysis: true,
        },
        { transport: 'sendBeacon' },
      ],
    ]);
  });
});
