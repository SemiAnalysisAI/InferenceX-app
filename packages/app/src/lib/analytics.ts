/**
 * Track an analytics event via PostHog.
 * Drop-in replacement for the old `import { track } from '@vercel/analytics'`.
 *
 * PostHog is lazy-loaded — the first call triggers the dynamic import,
 * subsequent calls resolve instantly from the module cache.
 *
 * @param eventName - Event name following [section]_[action] convention
 * @param properties - Optional event properties
 */
export function track(eventName: string, properties?: Record<string, unknown>): void {
  if (typeof window !== 'undefined') {
    import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.capture(eventName, properties);
      })
      .catch(() => {});
  }
}
