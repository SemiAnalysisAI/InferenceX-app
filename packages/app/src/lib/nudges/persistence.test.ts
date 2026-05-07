import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearDismissal,
  isDismissed,
  isPermanentlySuppressed,
  isWithinSchedule,
  markDismissed,
  markPermanentlySuppressed,
} from './persistence';
import type { NudgeDismissal } from './types';

// ---------------------------------------------------------------------------
// Storage mocks
// ---------------------------------------------------------------------------

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

beforeEach(() => {
  mockLocal = makeMockStorage();
  mockSession = makeMockStorage();
  vi.stubGlobal('localStorage', mockLocal);
  vi.stubGlobal('sessionStorage', mockSession);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// isDismissed / markDismissed / clearDismissal
// ---------------------------------------------------------------------------

describe('session dismissal', () => {
  const strategy: NudgeDismissal = { type: 'session' };
  const key = 'test-session-nudge';

  it('returns false when not dismissed', () => {
    expect(isDismissed(key, strategy)).toBe(false);
  });

  it('returns true after markDismissed', () => {
    markDismissed(key, strategy);
    expect(isDismissed(key, strategy)).toBe(true);
  });

  it('returns false after clearDismissal', () => {
    markDismissed(key, strategy);
    clearDismissal(key, strategy);
    expect(isDismissed(key, strategy)).toBe(false);
  });

  it('uses sessionStorage, not localStorage', () => {
    markDismissed(key, strategy);
    expect(mockSession._store.has(key)).toBe(true);
    expect(mockLocal._store.has(key)).toBe(false);
  });

  it('returns false when sessionStorage throws', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(isDismissed(key, strategy)).toBe(false);
  });
});

describe('permanent dismissal', () => {
  const strategy: NudgeDismissal = { type: 'permanent' };
  const key = 'test-permanent-nudge';

  it('returns false when not dismissed', () => {
    expect(isDismissed(key, strategy)).toBe(false);
  });

  it('returns true after markDismissed', () => {
    markDismissed(key, strategy);
    expect(isDismissed(key, strategy)).toBe(true);
  });

  it('returns false after clearDismissal', () => {
    markDismissed(key, strategy);
    clearDismissal(key, strategy);
    expect(isDismissed(key, strategy)).toBe(false);
  });

  it('uses localStorage', () => {
    markDismissed(key, strategy);
    expect(mockLocal._store.has(key)).toBe(true);
    expect(mockSession._store.has(key)).toBe(false);
  });
});

describe('timed dismissal', () => {
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const strategy: NudgeDismissal = { type: 'timed', durationMs: oneWeek };
  const key = 'test-timed-nudge';

  it('returns false when not dismissed', () => {
    expect(isDismissed(key, strategy)).toBe(false);
  });

  it('returns true immediately after markDismissed', () => {
    markDismissed(key, strategy);
    expect(isDismissed(key, strategy)).toBe(true);
  });

  it('returns false after duration has elapsed', () => {
    const pastTimestamp = Date.now() - oneWeek - 1;
    mockLocal._store.set(key, String(pastTimestamp));
    expect(isDismissed(key, strategy)).toBe(false);
  });

  it('returns true when within duration', () => {
    const recentTimestamp = Date.now() - oneWeek + 60_000;
    mockLocal._store.set(key, String(recentTimestamp));
    expect(isDismissed(key, strategy)).toBe(true);
  });

  it('returns false for corrupted value', () => {
    mockLocal._store.set(key, 'not-a-number');
    expect(isDismissed(key, strategy)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isPermanentlySuppressed / markPermanentlySuppressed
// ---------------------------------------------------------------------------

describe('permanent suppress', () => {
  const key = 'inferencex-starred';

  it('returns false when not set', () => {
    expect(isPermanentlySuppressed(key)).toBe(false);
  });

  it('returns true after markPermanentlySuppressed', () => {
    markPermanentlySuppressed(key);
    expect(isPermanentlySuppressed(key)).toBe(true);
  });

  it('dispatches window event when event name provided', () => {
    const dispatchSpy = vi.fn();
    vi.stubGlobal('window', {
      ...globalThis.window,
      dispatchEvent: dispatchSpy,
    });
    markPermanentlySuppressed(key, 'inferencex:starred');
    expect(dispatchSpy).toHaveBeenCalledOnce();
    const event = dispatchSpy.mock.calls[0][0] as Event;
    expect(event.type).toBe('inferencex:starred');
  });

  it('does not dispatch event when event name is omitted', () => {
    const dispatchSpy = vi.fn();
    vi.stubGlobal('window', {
      ...globalThis.window,
      dispatchEvent: dispatchSpy,
    });
    markPermanentlySuppressed(key);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// isWithinSchedule
// ---------------------------------------------------------------------------

describe('isWithinSchedule', () => {
  it('returns true when no schedule provided', () => {
    expect(isWithinSchedule(undefined)).toBe(true);
  });

  it('returns true when within range', () => {
    expect(
      isWithinSchedule({
        showAfter: '2020-01-01',
        hideAfter: '2099-12-31',
      }),
    ).toBe(true);
  });

  it('returns false before showAfter', () => {
    expect(isWithinSchedule({ showAfter: '2099-01-01' })).toBe(false);
  });

  it('returns false after hideAfter', () => {
    expect(isWithinSchedule({ hideAfter: '2020-01-01' })).toBe(false);
  });

  it('returns true when only showAfter is in the past', () => {
    expect(isWithinSchedule({ showAfter: '2020-01-01' })).toBe(true);
  });

  it('returns true when only hideAfter is in the future', () => {
    expect(isWithinSchedule({ hideAfter: '2099-12-31' })).toBe(true);
  });
});
