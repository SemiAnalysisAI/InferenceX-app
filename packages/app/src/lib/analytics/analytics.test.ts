import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
