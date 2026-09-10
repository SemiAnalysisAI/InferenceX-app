import { describe, expect, it } from 'vitest';

import {
  getJumpscareEligibility,
  isJumpscareEmbedPath,
  isJumpscareOnCooldown,
  JUMPSCARE_COOLDOWN_MS,
  JUMPSCARE_MAX_DELAY_MS,
  JUMPSCARE_MIN_DELAY_MS,
  pickJumpscareDelayMs,
  readJumpscareOverride,
  type JumpscareEligibilityInput,
} from './jumpscare';

const NOW = 1_800_000_000_000;

function input(overrides: Partial<JumpscareEligibilityInput> = {}): JumpscareEligibilityInput {
  return {
    search: '',
    pathname: '/',
    reducedMotion: false,
    automated: false,
    lastFired: null,
    now: NOW,
    ...overrides,
  };
}

describe('readJumpscareOverride', () => {
  it('returns null when the param is absent', () => {
    expect(readJumpscareOverride('')).toBeNull();
    expect(readJumpscareOverride('?model=dsv4')).toBeNull();
  });

  it('treats 0 / false / off as disable and anything else as force', () => {
    expect(readJumpscareOverride('?jumpscare=0')).toBe('disable');
    expect(readJumpscareOverride('?jumpscare=false')).toBe('disable');
    expect(readJumpscareOverride('?jumpscare=off')).toBe('disable');
    expect(readJumpscareOverride('?jumpscare=1')).toBe('force');
    expect(readJumpscareOverride('?jumpscare')).toBe('force');
    expect(readJumpscareOverride('?model=dsv4&jumpscare=now')).toBe('force');
  });
});

describe('isJumpscareEmbedPath', () => {
  it('matches English and Chinese embed routes only', () => {
    expect(isJumpscareEmbedPath('/embed')).toBe(true);
    expect(isJumpscareEmbedPath('/embed/inference')).toBe(true);
    expect(isJumpscareEmbedPath('/zh/embed/inference')).toBe(true);
    expect(isJumpscareEmbedPath('/')).toBe(false);
    expect(isJumpscareEmbedPath('/inference')).toBe(false);
    expect(isJumpscareEmbedPath('/embedded-systems')).toBe(false);
  });
});

describe('isJumpscareOnCooldown', () => {
  it('is false with no record or a corrupt record', () => {
    expect(isJumpscareOnCooldown(null, NOW, JUMPSCARE_COOLDOWN_MS)).toBe(false);
    expect(isJumpscareOnCooldown('garbage', NOW, JUMPSCARE_COOLDOWN_MS)).toBe(false);
  });

  it('is true inside the window and false once it lapses', () => {
    const recent = String(NOW - JUMPSCARE_COOLDOWN_MS + 1);
    const stale = String(NOW - JUMPSCARE_COOLDOWN_MS);
    expect(isJumpscareOnCooldown(recent, NOW, JUMPSCARE_COOLDOWN_MS)).toBe(true);
    expect(isJumpscareOnCooldown(stale, NOW, JUMPSCARE_COOLDOWN_MS)).toBe(false);
  });
});

describe('getJumpscareEligibility', () => {
  it('is eligible by default on a fresh browser', () => {
    expect(getJumpscareEligibility(input())).toEqual({ eligible: true, forced: false });
  });

  it('never fires inside partner embeds, even when forced', () => {
    expect(getJumpscareEligibility(input({ pathname: '/embed/inference' }))).toEqual({
      eligible: false,
      reason: 'embed',
    });
    expect(
      getJumpscareEligibility(input({ pathname: '/zh/embed/inference', search: '?jumpscare=1' })),
    ).toEqual({ eligible: false, reason: 'embed' });
  });

  it('skips automated browsers unless a spec forces it explicitly', () => {
    expect(getJumpscareEligibility(input({ automated: true }))).toEqual({
      eligible: false,
      reason: 'automated',
    });
    expect(getJumpscareEligibility(input({ automated: true, search: '?jumpscare=1' }))).toEqual({
      eligible: true,
      forced: true,
    });
  });

  it('respects reduced motion and the cooldown', () => {
    expect(getJumpscareEligibility(input({ reducedMotion: true }))).toEqual({
      eligible: false,
      reason: 'reduced-motion',
    });
    expect(getJumpscareEligibility(input({ lastFired: String(NOW - 1000) }))).toEqual({
      eligible: false,
      reason: 'cooldown',
    });
  });

  it('?jumpscare=1 overrides reduced motion and cooldown; ?jumpscare=0 wins over everything', () => {
    expect(
      getJumpscareEligibility(
        input({ search: '?jumpscare=1', reducedMotion: true, lastFired: String(NOW - 1000) }),
      ),
    ).toEqual({ eligible: true, forced: true });
    expect(getJumpscareEligibility(input({ search: '?jumpscare=0' }))).toEqual({
      eligible: false,
      reason: 'disabled-by-query',
    });
  });
});

describe('pickJumpscareDelayMs', () => {
  it('stays inside the first ten seconds of interaction', () => {
    expect(JUMPSCARE_MAX_DELAY_MS).toBeLessThan(10_000);
    expect(pickJumpscareDelayMs(() => 0)).toBe(JUMPSCARE_MIN_DELAY_MS);
    expect(pickJumpscareDelayMs(() => 1)).toBe(JUMPSCARE_MAX_DELAY_MS);
    expect(pickJumpscareDelayMs(() => 0.5)).toBe(
      Math.round((JUMPSCARE_MIN_DELAY_MS + JUMPSCARE_MAX_DELAY_MS) / 2),
    );
  });

  it('clamps out-of-range random sources', () => {
    expect(pickJumpscareDelayMs(() => -3)).toBe(JUMPSCARE_MIN_DELAY_MS);
    expect(pickJumpscareDelayMs(() => 7)).toBe(JUMPSCARE_MAX_DELAY_MS);
  });
});
