import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  GRADIENT_NUDGE_EVENT,
  SESSION_KEY,
  saveGradientNudgeShown,
  shouldShowGradientNudge,
} from '@/components/gradient-label-nudge';

describe('GradientLabelNudge constants', () => {
  it('uses the expected sessionStorage key', () => {
    expect(SESSION_KEY).toBe('inferencex-gradient-nudge-shown');
  });

  it('uses the expected custom event name', () => {
    expect(GRADIENT_NUDGE_EVENT).toBe('inferencex:parallelism-label-enabled');
  });
});

describe('shouldShowGradientNudge', () => {
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
    expect(shouldShowGradientNudge()).toBe(true);
  });

  it('returns false when nudge was already shown this session', () => {
    mockStorage.set(SESSION_KEY, '1');
    expect(shouldShowGradientNudge()).toBe(false);
  });

  it('returns false when sessionStorage throws (fails closed)', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(shouldShowGradientNudge()).toBe(false);
  });
});

describe('saveGradientNudgeShown', () => {
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
    saveGradientNudgeShown();
    expect(mockStorage.get(SESSION_KEY)).toBe('1');
  });

  it('makes shouldShowGradientNudge return false after saving', () => {
    saveGradientNudgeShown();
    expect(shouldShowGradientNudge()).toBe(false);
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
    expect(() => saveGradientNudgeShown()).not.toThrow();
  });
});
