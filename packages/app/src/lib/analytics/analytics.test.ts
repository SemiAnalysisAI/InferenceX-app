import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

const names = (capture: Mock) => capture.mock.calls.map(([name]) => name);

describe('track', () => {
  const captureMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('window', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends event to the registered client with properties', async () => {
    const analytics = await import('./analytics');
    analytics.registerAnalyticsClient({ capture: captureMock });
    analytics.track('test_event', { key: 'value' });
    expect(captureMock).toHaveBeenCalledWith('test_event', { key: 'value' });
  });

  it('sends event without properties', async () => {
    const analytics = await import('./analytics');
    analytics.registerAnalyticsClient({ capture: captureMock });
    analytics.track('test_event');
    expect(captureMock).toHaveBeenCalledWith('test_event', undefined);
  });

  it('does not call capture when window is undefined', async () => {
    const analytics = await import('./analytics');
    analytics.registerAnalyticsClient({ capture: captureMock });
    vi.unstubAllGlobals();
    analytics.track('test_event');
    expect(captureMock).not.toHaveBeenCalled();
  });
});

describe('registerAnalyticsClient', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('flushes queued events in order with the time they were tracked', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.stubGlobal('window', {});
    const capture = vi.fn();
    const analytics = await import('./analytics');

    analytics.track('first_event', { order: 1 });
    vi.setSystemTime(new Date('2026-01-01T00:00:05Z'));
    analytics.track('second_event');
    expect(capture).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
    analytics.registerAnalyticsClient({ capture });

    expect(capture.mock.calls).toEqual([
      ['first_event', { order: 1 }, { timestamp: new Date('2026-01-01T00:00:00Z') }],
      ['second_event', {}, { timestamp: new Date('2026-01-01T00:00:05Z') }],
    ]);
    vi.useRealTimers();
  });

  it('caps the queue and keeps the earliest events', async () => {
    vi.stubGlobal('window', {});
    const capture = vi.fn();
    const analytics = await import('./analytics');

    for (let i = 0; i < analytics.MAX_PENDING_EVENTS + 25; i++) analytics.track('e', { i });
    analytics.registerAnalyticsClient({ capture });

    expect(capture).toHaveBeenCalledTimes(analytics.MAX_PENDING_EVENTS);
    expect(capture.mock.calls[0][1]).toEqual({ i: 0 });
    expect(capture.mock.calls.at(-1)?.[1]).toEqual({ i: analytics.MAX_PENDING_EVENTS - 1 });
  });
});

describe('pageviews', () => {
  const location = new URL('https://inferencex.semianalysis.com/');

  function setUrl(href: string) {
    location.href = new URL(href, location.origin).href;
  }

  beforeEach(() => {
    vi.resetModules();
    setUrl('/');
    vi.stubGlobal('window', { location });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the initial pageview before events queued by page effects, with the URL at track time', async () => {
    const capture = vi.fn();
    const analytics = await import('./analytics');

    analytics.track('landing_page_viewed');
    setUrl('/inference');
    analytics.trackPageview();
    analytics.track('header_dashboard_clicked');
    analytics.registerAnalyticsClient({ capture });

    expect(capture.mock.calls.map(([name, props]) => [name, props.$current_url])).toEqual([
      ['$pageview', 'https://inferencex.semianalysis.com/'],
      ['landing_page_viewed', 'https://inferencex.semianalysis.com/'],
      ['$pageview', 'https://inferencex.semianalysis.com/inference'],
      ['header_dashboard_clicked', 'https://inferencex.semianalysis.com/inference'],
    ]);
  });

  it('does not repeat the pageview when the tracker reports the same URL', async () => {
    const capture = vi.fn();
    const analytics = await import('./analytics');
    analytics.registerAnalyticsClient({ capture });

    analytics.track('landing_page_viewed');
    analytics.trackPageview('https://inferencex.semianalysis.com/');

    expect(capture.mock.calls.map(([name]) => name)).toEqual(['$pageview', 'landing_page_viewed']);
  });

  it('sends the pageview of a client navigation before events fired ahead of the tracker', async () => {
    const capture = vi.fn();
    const analytics = await import('./analytics');
    analytics.registerAnalyticsClient({ capture });
    analytics.trackPageview();

    setUrl('/submissions');
    analytics.track('submissions_page_viewed');
    analytics.trackPageview();

    expect(capture.mock.calls.map(([name, props]) => [name, props?.$current_url])).toEqual([
      ['$pageview', 'https://inferencex.semianalysis.com/'],
      ['$pageview', 'https://inferencex.semianalysis.com/submissions'],
      ['submissions_page_viewed', undefined],
    ]);
  });

  it('queues the pageview of a client navigation before events fired ahead of the tracker', async () => {
    const capture = vi.fn();
    const analytics = await import('./analytics');
    analytics.trackPageview();

    setUrl('/submissions');
    analytics.track('submissions_page_viewed');
    analytics.trackPageview();
    analytics.registerAnalyticsClient({ capture });

    expect(capture.mock.calls.map(([name, props]) => [name, props.$current_url])).toEqual([
      ['$pageview', 'https://inferencex.semianalysis.com/'],
      ['$pageview', 'https://inferencex.semianalysis.com/submissions'],
      ['submissions_page_viewed', 'https://inferencex.semianalysis.com/submissions'],
    ]);
  });

  it('sends a virtual pageview when a client rewrite changes the pathname', async () => {
    const capture = vi.fn();
    const register = vi.fn();
    const analytics = await import('./analytics');
    analytics.registerAnalyticsClient({ capture, register });
    setUrl('/zh/inference');
    analytics.trackPageview();

    analytics.trackVirtualPageview('/zh/inference/kimi-k3?i_seq=8k1k', 'client_pathname_change');
    // Next later reports the same URL, which must not double count.
    setUrl('/zh/inference/kimi-k3?i_seq=8k1k');
    analytics.trackPageview();

    const pageviews = capture.mock.calls.filter(([name]) => name === '$pageview');
    expect(pageviews).toHaveLength(2);
    expect(pageviews[1][1]).toMatchObject({
      $current_url: 'https://inferencex.semianalysis.com/zh/inference/kimi-k3?i_seq=8k1k',
      $pathname: '/zh/inference/kimi-k3',
      route_template: '/inference/[model]',
      locale: 'zh',
      navigation_type: 'client_pathname_change',
    });
    expect(register).toHaveBeenLastCalledWith({
      route_template: '/inference/[model]',
      locale: 'zh',
    });
  });

  it('does not send a virtual pageview for a query-only change', async () => {
    const capture = vi.fn();
    const analytics = await import('./analytics');
    analytics.registerAnalyticsClient({ capture });
    setUrl('/overview');
    analytics.trackPageview();

    analytics.trackVirtualPageview('/overview?tier=frontier', 'overview_control');
    analytics.trackVirtualPageview('/overview?tier=frontier#chart', 'overview_control');

    expect(capture.mock.calls.filter(([name]) => name === '$pageview')).toHaveLength(1);
  });
});

describe('trackOncePerPageview', () => {
  const location = new URL('https://inferencex.semianalysis.com/');

  function setUrl(href: string) {
    location.href = new URL(href, location.origin).href;
  }

  beforeEach(() => {
    vi.resetModules();
    setUrl('/');
    vi.stubGlobal('window', { location });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drops remounts on the same page view and re-arms on the next page view', async () => {
    const capture = vi.fn();
    const analytics = await import('./analytics');
    analytics.registerAnalyticsClient({ capture });

    expect(analytics.trackOncePerPageview('landing_page_viewed')).toBe(true);
    expect(analytics.trackOncePerPageview('landing_page_viewed')).toBe(false);
    setUrl('/inference');
    analytics.trackPageview();
    setUrl('/');
    analytics.trackPageview();
    expect(analytics.trackOncePerPageview('landing_page_viewed')).toBe(true);

    expect(names(capture)).toEqual([
      '$pageview',
      'landing_page_viewed',
      '$pageview',
      '$pageview',
      'landing_page_viewed',
    ]);
  });

  it('keeps a key sent before the pageview of its own page is recorded', async () => {
    const capture = vi.fn();
    const analytics = await import('./analytics');
    analytics.registerAnalyticsClient({ capture });
    analytics.trackPageview();

    // Client navigation: the page effect runs before PageViewTracker records the new pageview.
    setUrl('/compare/b200-vs-mi355x');
    expect(analytics.trackOncePerPageview('compare_page_view', {}, 'b200-vs-mi355x')).toBe(true);
    analytics.trackPageview();
    expect(analytics.trackOncePerPageview('compare_page_view', {}, 'b200-vs-mi355x')).toBe(false);

    setUrl('/compare/h200-vs-mi355x');
    expect(analytics.trackOncePerPageview('compare_page_view', {}, 'h200-vs-mi355x')).toBe(true);
  });

  it('separates dedupe keys within one page view', async () => {
    const capture = vi.fn();
    const analytics = await import('./analytics');
    analytics.registerAnalyticsClient({ capture });

    analytics.trackOncePerPageview('data_query_failed', { status: 500 }, '["a"]');
    analytics.trackOncePerPageview('data_query_failed', { status: 500 }, '["b"]');
    analytics.trackOncePerPageview('data_query_failed', { status: 500 }, '["a"]');

    expect(names(capture).filter((name) => name === 'data_query_failed')).toHaveLength(2);
  });
});

describe('trackOncePerSession', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends once per key across module reloads that share sessionStorage', async () => {
    const storage = new Map<string, string>();
    const sessionStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    };
    vi.stubGlobal('window', {
      location: new URL('https://inferencex.semianalysis.com/blog/a'),
      sessionStorage,
    });
    const capture = vi.fn();
    let analytics = await import('./analytics');
    analytics.registerAnalyticsClient({ capture });

    expect(analytics.trackOncePerSession('blog_read_milestone', { percent: 25 }, 'a:25')).toBe(
      true,
    );
    expect(analytics.trackOncePerSession('blog_read_milestone', { percent: 25 }, 'a:25')).toBe(
      false,
    );
    expect(analytics.trackOncePerSession('blog_read_milestone', { percent: 50 }, 'a:50')).toBe(
      true,
    );

    vi.resetModules();
    analytics = await import('./analytics');
    analytics.registerAnalyticsClient({ capture });
    expect(analytics.trackOncePerSession('blog_read_milestone', { percent: 25 }, 'a:25')).toBe(
      false,
    );
  });

  it('falls back to memory when sessionStorage throws', async () => {
    const sessionStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    vi.stubGlobal('window', {
      location: new URL('https://inferencex.semianalysis.com/'),
      sessionStorage,
    });
    const capture = vi.fn();
    const analytics = await import('./analytics');
    analytics.registerAnalyticsClient({ capture });

    expect(analytics.trackOncePerSession('inference_replay_export_unavailable')).toBe(true);
    expect(analytics.trackOncePerSession('inference_replay_export_unavailable')).toBe(false);
  });
});
