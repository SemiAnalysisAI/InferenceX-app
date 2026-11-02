// Crawlers that execute JavaScript (Pinterestbot, Googlebot's renderer, link-preview fetchers)
// otherwise load every analytics script and send beacons through our origin on each page they
// render. Matching on the user agent lets the client skip analytics for them entirely.
// In-app browsers are humans: "Pinterest for iOS" and Facebook's FBAN must not match.
const BOT_USER_AGENT_PATTERN = new RegExp(
  [
    // Self-identifying crawlers: Googlebot/, bingbot/, Pinterestbot/, AhrefsBot;, …
    String.raw`bot\b`,
    'crawl',
    'spider',
    'slurp',
    // Link-preview fetchers that do not say "bot".
    'facebookexternalhit',
    'facebookcatalog',
    'embedly',
    'bingpreview',
    'skypeuripreview',
    // Headless and audit browsers.
    'headlesschrome',
    'lighthouse',
    'pagespeed',
    'gtmetrix',
    'prerender',
  ].join('|'),
  'iu',
);

// Phone brands whose user agents contain "bot" as part of a model name.
const HUMAN_DEVICE_PATTERN = /\bcubot\b/iu;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  if (HUMAN_DEVICE_PATTERN.test(userAgent)) return false;
  return BOT_USER_AGENT_PATTERN.test(userAgent);
}

export function isBotBrowser(): boolean {
  return typeof navigator !== 'undefined' && isBotUserAgent(navigator.userAgent);
}
