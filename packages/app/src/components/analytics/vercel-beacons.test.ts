import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vercel/analytics/next', () => ({ Analytics: () => null }));
vi.mock('@vercel/speed-insights/next', () => ({ SpeedInsights: () => null }));

import { dropBotBeacon } from './vercel-beacons';

const EVENT = { type: 'pageview' as const, url: 'https://inferencex.semianalysis.com/' };

describe('dropBotBeacon', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('drops beacons from crawlers', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (compatible; Pinterestbot/1.0; +http://www.pinterest.com/bot.html)',
    });
    expect(dropBotBeacon(EVENT)).toBeNull();
  });

  it('passes human beacons through unchanged', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    expect(dropBotBeacon(EVENT)).toBe(EVENT);
  });
});
