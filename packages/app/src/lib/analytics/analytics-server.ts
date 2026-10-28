export function trackServer(eventName: string, properties?: Record<string, unknown>): void {
  void captureServer(eventName, properties);
}

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
    console.error(`[analytics-server] capture failed for ${eventName}`);
  }
}
