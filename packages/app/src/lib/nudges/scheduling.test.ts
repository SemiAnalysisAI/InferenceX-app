import { describe, expect, it } from 'vitest';

import { isWithinSchedule } from './scheduling';

const T = (s: string) => Date.parse(s);

describe('isWithinSchedule', () => {
  it('returns true when no schedule is provided', () => {
    expect(isWithinSchedule(undefined)).toBe(true);
  });

  it('rejects times before showAfter', () => {
    expect(isWithinSchedule({ showAfter: '2026-01-01T00:00:00Z' }, T('2025-12-31T23:59:59Z'))).toBe(
      false,
    );
  });

  it('accepts times at or after showAfter', () => {
    expect(isWithinSchedule({ showAfter: '2026-01-01T00:00:00Z' }, T('2026-01-01T00:00:00Z'))).toBe(
      true,
    );
  });

  it('rejects times at or after hideAfter', () => {
    expect(isWithinSchedule({ hideAfter: '2026-01-01T00:00:00Z' }, T('2026-01-01T00:00:00Z'))).toBe(
      false,
    );
  });

  it('accepts times before hideAfter', () => {
    expect(isWithinSchedule({ hideAfter: '2026-01-01T00:00:00Z' }, T('2025-12-31T23:59:59Z'))).toBe(
      true,
    );
  });

  it('respects both bounds simultaneously', () => {
    const schedule = { showAfter: '2026-01-01T00:00:00Z', hideAfter: '2026-02-01T00:00:00Z' };
    expect(isWithinSchedule(schedule, T('2025-12-15T00:00:00Z'))).toBe(false);
    expect(isWithinSchedule(schedule, T('2026-01-15T00:00:00Z'))).toBe(true);
    expect(isWithinSchedule(schedule, T('2026-02-15T00:00:00Z'))).toBe(false);
  });

  it('treats unparseable ISO strings as no bound', () => {
    expect(isWithinSchedule({ showAfter: 'whenever' }, 0)).toBe(true);
    expect(isWithinSchedule({ hideAfter: 'whenever' }, Number.MAX_SAFE_INTEGER)).toBe(true);
  });
});
