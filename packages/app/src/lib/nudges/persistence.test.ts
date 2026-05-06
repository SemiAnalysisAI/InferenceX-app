import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearDismissal, dismissalKey, isDismissed, markDismissed } from './persistence';
import type { NudgePersistence } from './types';

describe('dismissalKey', () => {
  it('namespaces with the framework prefix', () => {
    expect(dismissalKey('star-nudge')).toBe('inferencex-nudge:star-nudge');
  });
});

interface FakeStorage {
  store: Map<string, string>;
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
}

function makeStorage(): FakeStorage {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
}

function stubStorages() {
  const local = makeStorage();
  const session = makeStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
  return { local, session };
}

describe('isDismissed', () => {
  let local: FakeStorage;
  let session: FakeStorage;

  beforeEach(() => {
    ({ local, session } = stubStorages());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns false when storage has no value', () => {
    const policy: NudgePersistence = { kind: 'forever' };
    expect(isDismissed('foo', policy)).toBe(false);
  });

  it('treats `forever` as dismissed once any value is stored', () => {
    const policy: NudgePersistence = { kind: 'forever' };
    markDismissed('foo', policy);
    expect(isDismissed('foo', policy)).toBe(true);
  });

  it('uses sessionStorage for `session` policy', () => {
    const policy: NudgePersistence = { kind: 'session' };
    markDismissed('foo', policy);
    expect(session.store.has(dismissalKey('foo'))).toBe(true);
    expect(local.store.has(dismissalKey('foo'))).toBe(false);
  });

  it('expires the cooldown after duration elapses', () => {
    const policy: NudgePersistence = { kind: 'cooldown', durationMs: 1000 };
    markDismissed('foo', policy, 0);
    expect(isDismissed('foo', policy, 500)).toBe(true);
    expect(isDismissed('foo', policy, 1500)).toBe(false);
  });

  it('treats malformed cooldown timestamps as not dismissed', () => {
    const policy: NudgePersistence = { kind: 'cooldown', durationMs: 1000 };
    local.store.set(dismissalKey('foo'), 'not-a-number');
    expect(isDismissed('foo', policy)).toBe(false);
  });

  it('fails closed (treats as dismissed) when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {},
    });
    const policy: NudgePersistence = { kind: 'forever' };
    expect(isDismissed('foo', policy)).toBe(true);
  });
});

describe('markDismissed / clearDismissal', () => {
  beforeEach(() => {
    stubStorages();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('round-trips a forever dismissal', () => {
    const policy: NudgePersistence = { kind: 'forever' };
    markDismissed('foo', policy);
    expect(isDismissed('foo', policy)).toBe(true);
    clearDismissal('foo', policy);
    expect(isDismissed('foo', policy)).toBe(false);
  });

  it('round-trips a cooldown dismissal', () => {
    const policy: NudgePersistence = { kind: 'cooldown', durationMs: 1000 };
    markDismissed('foo', policy, 100);
    expect(isDismissed('foo', policy, 200)).toBe(true);
    clearDismissal('foo', policy);
    expect(isDismissed('foo', policy, 200)).toBe(false);
  });

  it('does not throw when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    });
    const policy: NudgePersistence = { kind: 'forever' };
    expect(() => markDismissed('foo', policy)).not.toThrow();
    expect(() => clearDismissal('foo', policy)).not.toThrow();
  });
});
