import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { NUDGE_SESSION_KEY, saveNudgeShown, shouldShowNudge } from '@/components/star-nudge';

describe('StarNudge constants', () => {
  it('uses the expected sessionStorage key', () => {
    expect(NUDGE_SESSION_KEY).toBe('inferencex-star-nudge-shown');
  });
});

describe('shouldShowNudge', () => {
  const mockStorage = new Map<string, string>();

  beforeEach(() => {
    mockStorage.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, value: string) => mockStorage.set(key, value),
      removeItem: (key: string) => mockStorage.delete(key),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns true when no session value is stored', () => {
    expect(shouldShowNudge()).toBe(true);
  });

  it('returns false when nudge was already shown this session', () => {
    mockStorage.set(NUDGE_SESSION_KEY, '1');
    expect(shouldShowNudge()).toBe(false);
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
    expect(shouldShowNudge()).toBe(false);
  });
});

describe('saveNudgeShown', () => {
  const mockStorage = new Map<string, string>();

  beforeEach(() => {
    mockStorage.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => mockStorage.get(key) ?? null,
      setItem: (key: string, value: string) => mockStorage.set(key, value),
      removeItem: (key: string) => mockStorage.delete(key),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stores a value in sessionStorage', () => {
    saveNudgeShown();
    const stored = mockStorage.get(NUDGE_SESSION_KEY);
    expect(stored).toBe('1');
  });

  it('does not throw when sessionStorage is unavailable', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(() => saveNudgeShown()).not.toThrow();
  });

  it('makes shouldShowNudge return false after saving', () => {
    saveNudgeShown();
    expect(shouldShowNudge()).toBe(false);
  });
});
