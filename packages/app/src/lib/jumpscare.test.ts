import { describe, expect, it } from 'vitest';

import {
  getJumpscareEligibility,
  isJumpscareEmbedPath,
  JUMPSCARE_MAX_DELAY_MS,
  JUMPSCARE_MIN_DELAY_MS,
  pickJumpscareDelayMs,
  readJumpscareOverride,
  type JumpscareEligibilityInput,
} from './jumpscare';

function input(overrides: Partial<JumpscareEligibilityInput> = {}): JumpscareEligibilityInput {
  return {
    search: '',
    pathname: '/',
    reducedMotion: false,
    automated: false,
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

  it('respects reduced motion', () => {
    expect(getJumpscareEligibility(input({ reducedMotion: true }))).toEqual({
      eligible: false,
      reason: 'reduced-motion',
    });
  });

  it('?jumpscare=1 overrides reduced motion; ?jumpscare=0 wins over everything', () => {
    expect(getJumpscareEligibility(input({ search: '?jumpscare=1', reducedMotion: true }))).toEqual(
      { eligible: true, forced: true },
    );
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
