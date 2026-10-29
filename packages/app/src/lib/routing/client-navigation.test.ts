import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  CLIENT_PATHNAME_CHANGE_EVENT,
  isPageviewPathnameChange,
  navigateInApp,
  replaceClientPathname,
  replaceRouterPathname,
} from '@/lib/routing/client-navigation';

import type { MouseEvent } from 'react';

function makeEvent(overrides: Partial<MouseEvent<HTMLAnchorElement>> = {}) {
  const preventDefault = vi.fn();
  return {
    event: {
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      currentTarget: { target: '' } as HTMLAnchorElement,
      preventDefault,
      ...overrides,
    } as unknown as MouseEvent<HTMLAnchorElement>,
    preventDefault,
  };
}

describe('navigateInApp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      location: { pathname: '/', origin: 'https://example.com' },
      setTimeout: setTimeout.bind(globalThis),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('pushes the route exactly once — no timer-based re-push', () => {
    const router = { push: vi.fn() };
    const { event, preventDefault } = makeEvent();

    navigateInApp(event, router, '/inference/kimi-k3');
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/inference/kimi-k3');

    vi.advanceTimersByTime(5000);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['defaultPrevented', { defaultPrevented: true }],
    ['non-primary button', { button: 1 }],
    ['metaKey', { metaKey: true }],
    ['ctrlKey', { ctrlKey: true }],
    ['shiftKey', { shiftKey: true }],
    ['altKey', { altKey: true }],
    ['anchor target', { currentTarget: { target: '_blank' } as HTMLAnchorElement }],
  ])('leaves %s clicks to the browser', (_label, overrides) => {
    const router = { push: vi.fn() };
    const { event, preventDefault } = makeEvent(
      overrides as Partial<MouseEvent<HTMLAnchorElement>>,
    );

    navigateInApp(event, router, '/inference/kimi-k3');
    vi.advanceTimersByTime(5000);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('pathname change pageview signalling', () => {
  let pathnameEvents: Event[];

  beforeEach(() => {
    pathnameEvents = [];
    const location = {
      pathname: '/profit/dsr1',
      search: '',
      hash: '',
      origin: 'https://example.com',
    };
    const replaceState = (_state: unknown, _title: string, href: string) => {
      const url = new URL(href, location.origin);
      location.pathname = url.pathname;
      location.search = url.search;
    };
    vi.stubGlobal('History', { prototype: { replaceState } });
    vi.stubGlobal('window', {
      location,
      history: { state: null, replaceState },
      dispatchEvent: (event: Event) => {
        if (event.type === CLIENT_PATHNAME_CHANGE_EVENT) pathnameEvents.push(event);
        return true;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not mark filter-driven path rewrites as pageviews', () => {
    replaceClientPathname('/profit/dsr1/h100');
    expect(pathnameEvents).toHaveLength(1);
    expect(pathnameEvents.filter(isPageviewPathnameChange)).toHaveLength(0);
  });

  it('marks a model switch as exactly one pageview', () => {
    replaceClientPathname('/inference/kimi-k3', [], { pageview: true });
    expect(pathnameEvents.filter(isPageviewPathnameChange)).toHaveLength(1);
  });

  it('marks router model switches as a pageview only when requested', () => {
    replaceRouterPathname('/inference/kimi-k3', [], { pageview: true });
    replaceRouterPathname('/inference/kimi-k3/b200');
    expect(pathnameEvents).toHaveLength(2);
    expect(pathnameEvents.filter(isPageviewPathnameChange)).toHaveLength(1);
  });
});
