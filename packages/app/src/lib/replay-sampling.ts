/**
 * Client-side sampling for PostHog session replay.
 *
 * The replay recorder (rrweb) attaches a MutationObserver to the whole
 * document, so every D3 chart update pays a recording tax on the main thread —
 * profiles show it stacked inside chart-interaction long tasks, and the
 * recorder bundle itself is a ~50 KiB / ~200 ms script on mobile. Recording a
 * sample of sessions keeps replays available for debugging while sparing the
 * interaction latency of everyone else.
 *
 * The decision is sticky per browser session (sessionStorage): a replay that
 * starts mid-session or drops across a reload is useless, and PostHog's own
 * server-side sampling makes the choice once per session for the same reason.
 * If PostHog's project-level Replay sample rate is ever configured, that
 * setting composes with this one multiplicatively — keep one of them at 100%.
 */

export const REPLAY_SAMPLE_RATE = 0.1;

const STORAGE_KEY = 'ix_replay_sampled';

export function shouldRecordSessionReplay(
  sampleRate: number = REPLAY_SAMPLE_RATE,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof window === 'undefined'
    ? null
    : window.sessionStorage,
  random: () => number = Math.random,
): boolean {
  if (sampleRate <= 0) return false;
  if (sampleRate >= 1) return true;

  let stored: string | null = null;
  try {
    stored = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    // Storage unavailable (Safari private mode, disabled cookies) — fall
    // through to a fresh, non-sticky draw.
  }
  if (stored === '1') return true;
  if (stored === '0') return false;

  const sampled = random() < sampleRate;
  try {
    storage?.setItem(STORAGE_KEY, sampled ? '1' : '0');
  } catch {
    // Non-sticky draw is still a valid sampling decision.
  }
  return sampled;
}
