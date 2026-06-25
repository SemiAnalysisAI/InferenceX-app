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

  it('flushes events queued before the client is ready', async () => {
    vi.stubGlobal('window', {});
    const capture = vi.fn();
    const analytics = await import('./analytics');

    analytics.track('first_event', { order: 1 });
    analytics.track('second_event');
    expect(capture).not.toHaveBeenCalled();

    analytics.registerAnalyticsClient({ capture });

    expect(capture.mock.calls).toEqual([
      ['first_event', { order: 1 }],
      ['second_event', undefined],
    ]);
  });
});
