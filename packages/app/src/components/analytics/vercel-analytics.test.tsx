// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const beacons = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@vercel/analytics/next', () => ({
  Analytics: ({ beforeSend }: { beforeSend: unknown }) => {
    beacons.set('analytics', beforeSend);
    return null;
  },
}));
vi.mock('@vercel/speed-insights/next', () => ({
  SpeedInsights: ({ beforeSend }: { beforeSend: unknown }) => {
    beacons.set('speed-insights', beforeSend);
    return null;
  },
}));

import { VercelAnalytics } from './vercel-analytics';
import { dropBotBeacon } from './vercel-beacons';

it('mounts both Vercel beacons with the bot filter once their chunk loads', async () => {
  const root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(VercelAnalytics)));
  await vi.waitFor(() =>
    expect(Object.fromEntries(beacons)).toEqual({
      analytics: dropBotBeacon,
      'speed-insights': dropBotBeacon,
    }),
  );
  act(() => root.unmount());
});
