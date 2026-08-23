import { afterEach, describe, expect, it } from 'vitest';

import { formatSubmissionTooltipDate } from './SubmissionsChart';

const originalTimeZone = process.env.TZ;

afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

describe('formatSubmissionTooltipDate', () => {
  it.each([
    ['en' as const, 'Jan 1, 2025'],
    ['zh' as const, '2025年1月1日'],
  ])('keeps a date-only UTC value on the same day for %s', (locale, expected) => {
    process.env.TZ = 'America/Los_Angeles';
    const midnightUtc = Date.parse('2025-01-01T00:00:00Z');

    expect(new Date(midnightUtc).getDate()).toBe(31);
    expect(formatSubmissionTooltipDate(midnightUtc, locale)).toBe(expected);
  });
});
