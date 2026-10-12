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
  void captureServer(eventName, properties);
}

/** Return delivery to the request lifetime so serverless shutdown cannot cut it short. */
export async function captureServer(
  eventName: string,
  properties?: Record<string, unknown>,
  distinctId = 'server',
): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    console.error(`[analytics-server] ${eventName}`, properties ?? {});
    return;
  }
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
  // Use a stable synthetic distinct_id for server events — no user context
  // available at this layer, and the event is about server-side health, not
  // a user action.
  try {
    const body = JSON.stringify({
      api_key: key,
      event: eventName,
      distinct_id: distinctId,
      properties: { ...properties, $lib: 'inferencex-server' },
      timestamp: new Date().toISOString(),
    });
    const response = await fetch(`${host.replace(/\/$/u, '')}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(3_000),
      redirect: 'error',
      keepalive: true,
    });
    if (!response.ok) console.error(`[analytics-server] capture rejected for ${eventName}`);
    await response.body?.cancel();
  } catch {
    // Do not log request URLs, credentials, or provider response bodies.
    console.error(`[analytics-server] capture failed for ${eventName}`);
  }
}
