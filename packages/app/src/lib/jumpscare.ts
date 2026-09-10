/**
 * Jumpscare scheduling — the pure, testable half of the Halloween easter egg.
 *
 * The overlay itself lives in `@/components/jumpscare/jumpscare.tsx`. This
 * module decides *whether* a visit is eligible and *when* the scare fires so
 * both decisions can be unit-tested without a DOM.
 *
 * Rules:
 *   - No cooldown. Every page load is fair game once the visitor interacts.
 *   - Fires between `MIN_DELAY_MS` and `MAX_DELAY_MS` after the visitor's first
 *     activation gesture (pointerdown / keydown / touchstart), which keeps it
 *     inside the first ten seconds of interaction and also unlocks audio.
 *   - `?jumpscare=1` forces it (ignores reduced motion and the automation
 *     guard so a deliberate E2E spec can exercise it);
 *     `?jumpscare=0` disables it.
 *   - Otherwise skipped for reduced-motion users and automated browsers, so the
 *     Cypress suites never meet it by accident. Partner embeds never fire.
 */

/** Earliest the scare can fire after the first interaction. */
export const JUMPSCARE_MIN_DELAY_MS = 2_500;

/** Latest the scare can fire after the first interaction — well inside 10 s. */
export const JUMPSCARE_MAX_DELAY_MS = 8_500;

/** How long the overlay stays mounted, including the fade-out tail. */
export const JUMPSCARE_DURATION_MS = 1_900;

export const JUMPSCARE_QUERY_PARAM = 'jumpscare';

/** Activation events that both count as "interacting" and unlock Web Audio. */
export const JUMPSCARE_ACTIVATION_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

export interface JumpscareEligibilityInput {
  /** `location.search`, including the leading `?`. */
  search: string;
  /** Current pathname — partner embeds must never scare anyone. */
  pathname: string;
  /** `matchMedia('(prefers-reduced-motion: reduce)').matches` */
  reducedMotion: boolean;
  /** `navigator.webdriver === true` or `'Cypress' in window` */
  automated: boolean;
}

export type JumpscareEligibility =
  | { eligible: true; forced: boolean }
  | {
      eligible: false;
      reason: 'disabled-by-query' | 'embed' | 'reduced-motion' | 'automated';
    };

export function readJumpscareOverride(search: string): 'force' | 'disable' | null {
  const value = new URLSearchParams(search).get(JUMPSCARE_QUERY_PARAM);
  if (value === null) return null;
  if (value === '0' || value === 'false' || value === 'off') return 'disable';
  return 'force';
}

export function isJumpscareEmbedPath(pathname: string): boolean {
  return (
    pathname === '/embed' || pathname.startsWith('/embed/') || pathname.startsWith('/zh/embed')
  );
}

export function getJumpscareEligibility(input: JumpscareEligibilityInput): JumpscareEligibility {
  const override = readJumpscareOverride(input.search);
  if (override === 'disable') return { eligible: false, reason: 'disabled-by-query' };
  if (isJumpscareEmbedPath(input.pathname)) return { eligible: false, reason: 'embed' };
  if (override === 'force') return { eligible: true, forced: true };
  if (input.automated) return { eligible: false, reason: 'automated' };
  if (input.reducedMotion) return { eligible: false, reason: 'reduced-motion' };
  return { eligible: true, forced: false };
}

/**
 * Delay between the first interaction and the scare. `random` is injected so
 * tests can pin the bounds; production passes `Math.random`.
 */
export function pickJumpscareDelayMs(random: () => number = Math.random): number {
  const span = JUMPSCARE_MAX_DELAY_MS - JUMPSCARE_MIN_DELAY_MS;
  const r = Math.min(Math.max(random(), 0), 1);
  return Math.round(JUMPSCARE_MIN_DELAY_MS + r * span);
}
