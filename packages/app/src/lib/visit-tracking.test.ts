import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getFirstSeen,
  getLastSeen,
  getMonthlyVisitCount,
  recordVisitIfNew,
} from './visit-tracking';

const MONTH_KEY = 'inferencex-visit-month';
const DAYS_KEY = 'inferencex-visit-days';
const SESSION_KEY = 'inferencex-visit-counted';

function makeMockStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    _store: store,
  };
}

let mockLocal: ReturnType<typeof makeMockStorage>;
let mockSession: ReturnType<typeof makeMockStorage>;

function setNow(iso: string) {
  vi.setSystemTime(new Date(iso));
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

beforeEach(() => {
  mockLocal = makeMockStorage();
  mockSession = makeMockStorage();
  vi.stubGlobal('localStorage', mockLocal);
  vi.stubGlobal('sessionStorage', mockSession);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getMonthlyVisitCount', () => {
  it('returns 0 when nothing has been recorded', () => {
    expect(getMonthlyVisitCount()).toBe(0);
  });

  it('returns 0 when the stored month is stale', () => {
    setNow('2026-05-15T10:00:00Z');
    mockLocal._store.set(MONTH_KEY, '1999-01');
    mockLocal._store.set(DAYS_KEY, '1999-01-12,1999-01-13');
    expect(getMonthlyVisitCount()).toBe(0);
  });

  it('returns the count of distinct day entries when the month matches', () => {
    setNow('2026-05-15T10:00:00Z');
    mockLocal._store.set(MONTH_KEY, currentMonth());
    mockLocal._store.set(DAYS_KEY, '2026-05-01,2026-05-03,2026-05-15');
    expect(getMonthlyVisitCount()).toBe(3);
  });

  it('returns 0 on an empty / malformed days list', () => {
    setNow('2026-05-15T10:00:00Z');
    mockLocal._store.set(MONTH_KEY, currentMonth());
    mockLocal._store.set(DAYS_KEY, '');
    expect(getMonthlyVisitCount()).toBe(0);
  });

  it('returns 0 when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(getMonthlyVisitCount()).toBe(0);
  });
});

describe('recordVisitIfNew', () => {
  it('starts at 1 on the first call of a month', () => {
    setNow('2026-05-15T10:00:00Z');
    expect(recordVisitIfNew()).toBe(1);
    expect(getMonthlyVisitCount()).toBe(1);
  });

  it('is idempotent within the same session', () => {
    setNow('2026-05-15T10:00:00Z');
    expect(recordVisitIfNew()).toBe(1);
    expect(recordVisitIfNew()).toBe(1);
    expect(recordVisitIfNew()).toBe(1);
  });

  it('does NOT increment when a new session happens on the same calendar day', () => {
    setNow('2026-05-15T10:00:00Z');
    expect(recordVisitIfNew()).toBe(1);
    mockSession._store.delete(SESSION_KEY);
    setNow('2026-05-15T22:00:00Z'); // same day, new session
    expect(recordVisitIfNew()).toBe(1);
  });

  it('increments when a new session happens on a different day within the same month', () => {
    setNow('2026-05-15T10:00:00Z');
    expect(recordVisitIfNew()).toBe(1);
    mockSession._store.delete(SESSION_KEY);
    setNow('2026-05-16T09:00:00Z');
    expect(recordVisitIfNew()).toBe(2);
    mockSession._store.delete(SESSION_KEY);
    setNow('2026-05-18T09:00:00Z');
    expect(recordVisitIfNew()).toBe(3);
  });

  it('resets to 1 across a month rollover', () => {
    setNow('2026-05-15T10:00:00Z');
    mockLocal._store.set(MONTH_KEY, '2026-04');
    mockLocal._store.set(DAYS_KEY, '2026-04-01,2026-04-15,2026-04-22');
    expect(recordVisitIfNew()).toBe(1);
    expect(mockLocal._store.get(MONTH_KEY)).toBe(currentMonth());
  });

  it('writes first-seen on the very first visit and never overwrites it', () => {
    setNow('2026-05-15T10:00:00Z');
    recordVisitIfNew();
    expect(getFirstSeen()).toBe('2026-05-15');

    mockSession._store.delete(SESSION_KEY);
    setNow('2026-07-01T10:00:00Z');
    recordVisitIfNew();
    expect(getFirstSeen()).toBe('2026-05-15'); // unchanged
  });

  it('updates last-seen on every new session', () => {
    setNow('2026-05-15T10:00:00Z');
    recordVisitIfNew();
    expect(getLastSeen()).toBe('2026-05-15');

    mockSession._store.delete(SESSION_KEY);
    setNow('2026-05-20T10:00:00Z');
    recordVisitIfNew();
    expect(getLastSeen()).toBe('2026-05-20');
  });

  it('returns 0 when storage is unavailable, without throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    });
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(() => recordVisitIfNew()).not.toThrow();
    expect(recordVisitIfNew()).toBe(0);
  });
});
