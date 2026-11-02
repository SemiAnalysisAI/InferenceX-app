// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  register: vi.fn(),
  registerAnalyticsClient: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: { init: mocks.init, register: mocks.register, capture: vi.fn() },
}));
vi.mock('@/lib/analytics/analytics', () => ({
  hasPendingAnalyticsEvents: () => false,
  registerAnalyticsClient: mocks.registerAnalyticsClient,
  trackPageview: vi.fn(),
  trackVirtualPageview: vi.fn(),
}));
vi.mock('@/lib/runtime/chunk-load-recovery', () => ({ installChunkLoadRecovery: vi.fn() }));
vi.mock('@/lib/analytics/outbound-links', () => ({ installOutboundLinkTracking: () => () => {} }));
vi.mock('@/lib/nudges/landing-banner', () => ({
  assignedLandingBannerVariant: () => undefined,
  LANDING_BANNER_VARIANT_PROPERTY: 'landing_banner_variant',
}));

const PINTEREST_BOT =
  'Mozilla/5.0 (compatible; Pinterestbot/1.0; +http://www.pinterest.com/bot.html)';
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

async function mountProvider(userAgent: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  // POSTHOG_KEY and NODE_ENV are read when the module loads.
  const { PostHogProvider } = await import('./posthog-provider');
  container = document.createElement('div');
  root = createRoot(container);
  act(() => {
    root!.render(<PostHogProvider>{null}</PostHogProvider>);
  });
  // Initialization waits for an idle callback or a 1s fallback timer, then imports posthog-js.
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
  // jsdom has no idle callbacks; run them on a fake timer.
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => setTimeout(callback, 0));
  vi.stubGlobal('cancelIdleCallback', (id: number) => clearTimeout(id));
  mocks.init.mockClear();
  mocks.registerAnalyticsClient.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container = undefined;
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PostHogProvider bot filtering', () => {
  it('never loads PostHog for a crawler and registers a no-op client', async () => {
    await mountProvider(PINTEREST_BOT);

    expect(mocks.init).not.toHaveBeenCalled();
    expect(mocks.registerAnalyticsClient).toHaveBeenCalledTimes(1);
    const client = mocks.registerAnalyticsClient.mock.calls[0]![0] as { capture: () => unknown };
    expect(client.capture()).toBeUndefined();
  });

  it('still initializes PostHog for a human browser', async () => {
    await mountProvider(CHROME);

    expect(mocks.init).toHaveBeenCalledTimes(1);
    expect(mocks.init.mock.calls[0]![0]).toBe('phc_test');
    expect(mocks.registerAnalyticsClient).toHaveBeenCalledTimes(1);
    expect(mocks.registerAnalyticsClient.mock.calls[0]![0]).toMatchObject({ init: mocks.init });
  });
});
