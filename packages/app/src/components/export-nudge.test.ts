import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  COPY_THRESHOLD,
  SESSION_KEY,
  saveExportNudgeShown,
  shouldShowExportNudge,
} from '@/components/export-nudge';

describe('ExportNudge constants', () => {
  it('uses the expected sessionStorage key', () => {
    expect(SESSION_KEY).toBe('inferencex-export-nudge-shown');
  });

  it('requires 2 copies before showing', () => {
    expect(COPY_THRESHOLD).toBe(2);
  });
});

describe('shouldShowExportNudge', () => {
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
    expect(shouldShowExportNudge()).toBe(true);
  });

  it('returns false when nudge was already shown this session', () => {
    mockStorage.set(SESSION_KEY, '1');
    expect(shouldShowExportNudge()).toBe(false);
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
    expect(shouldShowExportNudge()).toBe(false);
  });
});

describe('saveExportNudgeShown', () => {
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
    saveExportNudgeShown();
    expect(mockStorage.get(SESSION_KEY)).toBe('1');
  });

  it('makes shouldShowExportNudge return false after saving', () => {
    saveExportNudgeShown();
    expect(shouldShowExportNudge()).toBe(false);
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
    expect(() => saveExportNudgeShown()).not.toThrow();
  });
});
