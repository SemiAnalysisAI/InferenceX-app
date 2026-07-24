import { describe, expect, it } from 'vitest';

import {
  AGE_MAX_RED_DAYS,
  ageColorStyle,
  ageRowStyle,
  baseFramework,
  daysSince,
  getActualLatestTag,
  isOutdated,
} from './latest-image-utils';

const lightnessOf = (s: string) =>
  Number(s.match(/oklch\((?<lightness>[\d.]+)/u)?.groups?.lightness ?? Number.NaN);
const alphaOf = (s: string) =>
  Number(s.match(/\/ (?<alpha>[\d.]+)\)/u)?.groups?.alpha ?? Number.NaN);

describe('daysSince', () => {
  it('returns 0 for today', () => {
    const today = new Date('2026-05-27T12:34:56Z');
    expect(daysSince('2026-05-27', today)).toBe(0);
  });

  it('returns whole days for dates strictly in the past', () => {
    const today = new Date('2026-05-27T00:00:00Z');
    expect(daysSince('2026-05-26', today)).toBe(1);
    expect(daysSince('2026-05-20', today)).toBe(7);
    expect(daysSince('2026-03-28', today)).toBe(60);
  });

  it('floors to whole days regardless of intraday hour offset', () => {
    // The submitted-day anchor is 00:00Z; an early-morning "today" still
    // belongs to the same UTC day, so 23:59 vs 00:01 must round identically.
    const today = new Date('2026-05-28T00:01:00Z');
    expect(daysSince('2026-05-27', today)).toBe(1);
    const lateToday = new Date('2026-05-28T23:59:00Z');
    expect(daysSince('2026-05-27', lateToday)).toBe(1);
  });

  it('clamps at 0 for future-dated submissions (never returns negative)', () => {
    const today = new Date('2026-05-27T00:00:00Z');
    expect(daysSince('2026-06-01', today)).toBe(0);
  });
});

describe('ageColorStyle', () => {
  it('returns undefined for 0-day rows so the muted-foreground class wins', () => {
    expect(ageColorStyle(0)).toBeUndefined();
  });

  it('returns an oklch color for 1d and ramps toward darker red at AGE_MAX_RED_DAYS', () => {
    const oneDay = ageColorStyle(1);
    const maxDay = ageColorStyle(AGE_MAX_RED_DAYS);
    expect(oneDay?.color).toMatch(/^oklch\(/u);
    expect(maxDay?.color).toMatch(/^oklch\(/u);
    // Lightness L drops as days grow; AGE_MAX_RED_DAYS sits at L≈0.50, 1d at L≈0.77.
    expect(lightnessOf(maxDay!.color as string)).toBeLessThan(lightnessOf(oneDay!.color as string));
  });

  it('clamps anything past AGE_MAX_RED_DAYS to the same color (no extrapolation past the ramp)', () => {
    const at60 = ageColorStyle(AGE_MAX_RED_DAYS);
    const at365 = ageColorStyle(365);
    expect(at60).toEqual(at365);
  });
});

describe('ageRowStyle', () => {
  it('returns undefined for 0-day rows', () => {
    expect(ageRowStyle(0)).toBeUndefined();
  });

  it('returns a low-alpha oklch background that ramps from ~0.04 to ~0.28', () => {
    const oneDay = ageRowStyle(1);
    const maxDay = ageRowStyle(AGE_MAX_RED_DAYS);
    const a1 = alphaOf(oneDay!.backgroundColor as string);
    const aMax = alphaOf(maxDay!.backgroundColor as string);
    expect(a1).toBeGreaterThan(0);
    expect(a1).toBeLessThan(0.1);
    expect(aMax).toBeGreaterThan(0.2);
    expect(aMax).toBeLessThanOrEqual(0.3);
  });

  it('clamps past AGE_MAX_RED_DAYS so a 1y-old row looks identical to a 60d row', () => {
    expect(ageRowStyle(AGE_MAX_RED_DAYS)).toEqual(ageRowStyle(365));
  });
});

describe('isOutdated', () => {
  it('is false when image contains the latest tag', () => {
    expect(isOutdated('sgl-project/sglang:v0.5.12-cu130', 'v0.5.12')).toBe(false);
  });

  it('is true when image does not contain the latest tag', () => {
    expect(isOutdated('sgl-project/sglang:v0.5.10-cu130', 'v0.5.12')).toBe(true);
  });

  it('is true for nightly tags regardless of latest', () => {
    expect(isOutdated('sgl-project/sglang:nightly', 'v0.5.12')).toBe(true);
    expect(isOutdated('sgl-project/sglang:nightly', null)).toBe(true);
  });

  it('is true for rocm/sgl-dev and sglang-rocm patterns (case-insensitive)', () => {
    expect(isOutdated('rocm/sgl-dev:latest', 'v0.5.12')).toBe(true);
    expect(isOutdated('ROCM/SGL-DEV:foo', 'v0.5.12')).toBe(true);
    expect(isOutdated('myreg/sglang-rocm:bar', 'v0.5.12')).toBe(true);
  });

  it('is false when actualLatest is null and tag is not in UNSTABLE_PATTERNS', () => {
    // No release data → can't classify as outdated. Avoid red-flagging a row
    // we have no ground truth for.
    expect(isOutdated('vllm/vllm-openai:v0.21.0', null)).toBe(false);
  });
});

describe('baseFramework', () => {
  it('collapses llmd-vllm into the vLLM engine family', () => {
    expect(baseFramework('llmd-vllm')).toBe('vllm');
  });

  it.each([
    ['dynamo-vllm', 'vllm'],
    ['mori-sglang', 'sglang'],
    ['atom', 'atom'],
    ['vllm', 'vllm'],
  ])('maps %s to the %s engine family', (framework, expected) => {
    expect(baseFramework(framework)).toBe(expected);
  });
});

describe('getActualLatestTag', () => {
  it('looks up the base framework from FRAMEWORK_TO_BASE and returns its release', () => {
    const releases = { vllm: 'v0.21.0', sglang: 'v0.5.12' };
    expect(getActualLatestTag('vllm', releases)).toBe('v0.21.0');
    expect(getActualLatestTag('sglang', releases)).toBe('v0.5.12');
    expect(getActualLatestTag('dynamo-sglang', releases)).toBe('v0.5.12');
    expect(getActualLatestTag('mori-sglang', releases)).toBe('v0.5.12');
  });

  it('uses the vLLM release stream for llmd-vllm', () => {
    const releases = { vllm: 'v0.21.0', sglang: 'v0.5.12' };
    expect(getActualLatestTag('llmd-vllm', releases)).toBe('v0.21.0');
  });

  it('returns null when releases is undefined (API still loading)', () => {
    expect(getActualLatestTag('vllm', undefined)).toBeNull();
  });

  it('returns null for an unknown framework (no base mapping)', () => {
    expect(getActualLatestTag('trt', { vllm: 'v0.21.0', sglang: 'v0.5.12' })).toBeNull();
  });

  it('returns null when the base release is missing from the releases map', () => {
    expect(getActualLatestTag('vllm', { sglang: 'v0.5.12' })).toBeNull();
  });
});
