import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dismissalKey } from './persistence';
import { shouldShowNudge } from './should-show';
import type { NudgeEntry } from './types';

function fakeStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
}

const baseEntry: NudgeEntry = {
  id: 'test-nudge',
  kind: 'toast',
  trigger: { kind: 'mount' },
  persistence: { kind: 'session' },
  render: () => ({
    icon: null,
    title: 'Test',
    description: 'Test description',
  }),
};

describe('shouldShowNudge', () => {
  let local: ReturnType<typeof fakeStorage>;
  let session: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    local = fakeStorage();
    session = fakeStorage();
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns true with no constraints', () => {
    expect(shouldShowNudge(baseEntry)).toBe(true);
  });

  it('returns false when persistence flag is set', () => {
    session.store.set(dismissalKey(baseEntry.id), '1');
    expect(shouldShowNudge(baseEntry)).toBe(false);
  });

  it('respects schedule bounds', () => {
    const entry = { ...baseEntry, schedule: { hideAfter: '2026-01-01T00:00:00Z' } };
    expect(shouldShowNudge(entry, { now: Date.parse('2025-12-31T23:59:59Z') })).toBe(true);
    expect(shouldShowNudge(entry, { now: Date.parse('2026-01-02T00:00:00Z') })).toBe(false);
  });

  it('requires the pathname to match if routes are set', () => {
    const entry = { ...baseEntry, routes: [/^\/inference/] };
    expect(shouldShowNudge(entry, { pathname: '/inference' })).toBe(true);
    expect(shouldShowNudge(entry, { pathname: '/about' })).toBe(false);
    // No pathname provided + routes specified means no route info → reject.
    expect(shouldShowNudge(entry)).toBe(false);
  });

  it('runs the condition predicate last', () => {
    const condition = vi.fn(() => false);
    expect(shouldShowNudge({ ...baseEntry, condition })).toBe(false);
    expect(condition).toHaveBeenCalledOnce();
  });

  it('skips condition when persistence already vetoed', () => {
    const condition = vi.fn(() => true);
    session.store.set(dismissalKey(baseEntry.id), '1');
    expect(shouldShowNudge({ ...baseEntry, condition })).toBe(false);
    expect(condition).not.toHaveBeenCalled();
  });
});
