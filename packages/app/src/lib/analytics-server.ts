/**
 * Server-side PostHog event capture via the public /capture/ endpoint.
 *
 * Same wire format as posthog-node / posthog-js, but pulled into a tiny
 * fire-and-forget fetch so we don't add a dependency for one-off route-handler
 * observability. Falls back to console.error if NEXT_PUBLIC_POSTHOG_KEY isn't
 * configured — we don't want a missing env var to silently swallow the signal
 * (the local dev case where capture is intentionally disabled still hits the
 * console fallback, which is what Vercel's runtime log expects).
 */
export function trackServer(eventName: string, properties?: Record<string, unknown>): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    console.error(`[analytics-server] ${eventName}`, properties ?? {});
    return;
  }
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
  // Use a stable synthetic distinct_id for server events — no user context
  // available at this layer, and the event is about server-side health, not
  // a user action.
  const body = JSON.stringify({
    api_key: key,
    event: eventName,
    distinct_id: 'server',
    properties: { ...properties, $lib: 'inferencex-server' },
    timestamp: new Date().toISOString(),
  });
  fetch(`${host}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    // Keep the route handler responsive — don't await PostHog's response.
    keepalive: true,
  }).catch((error: unknown) => {
    console.error(`[analytics-server] capture failed for ${eventName}`, error);
  });
}
