'use client';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

import { isBotBrowser } from '@/lib/analytics/bot-user-agent';

// Returning null drops the beacon, so crawlers neither count as visitors nor hit our origin.
export function dropBotBeacon<T>(event: T): T | null {
  return isBotBrowser() ? null : event;
}

export function VercelAnalytics() {
  return (
    <>
      <Analytics beforeSend={dropBotBeacon} />
      <SpeedInsights beforeSend={dropBotBeacon} />
    </>
  );
}
