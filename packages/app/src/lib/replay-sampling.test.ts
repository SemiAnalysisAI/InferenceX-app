import { describe, expect, it } from 'vitest';

import { shouldRecordSessionReplay } from './replay-sampling';

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    dump: () => Object.fromEntries(store),
  };
}

describe('shouldRecordSessionReplay', () => {
  it('samples in when the draw lands under the rate', () => {
    const storage = memoryStorage();
    expect(shouldRecordSessionReplay(0.1, storage, () => 0.05)).toBe(true);
    expect(storage.dump()).toEqual({ ix_replay_sampled: '1' });
  });

  it('samples out when the draw lands over the rate', () => {
    const storage = memoryStorage();
    expect(shouldRecordSessionReplay(0.1, storage, () => 0.5)).toBe(false);
    expect(storage.dump()).toEqual({ ix_replay_sampled: '0' });
  });

  it('is sticky: a stored decision wins over a fresh draw', () => {
    expect(
      shouldRecordSessionReplay(0.1, memoryStorage({ ix_replay_sampled: '1' }), () => 0.99),
    ).toBe(true);
    expect(shouldRecordSessionReplay(0.1, memoryStorage({ ix_replay_sampled: '0' }), () => 0)).toBe(
      false,
    );
  });

  it('short-circuits rate 0 and 1 without touching storage', () => {
    const storage = memoryStorage();
    expect(shouldRecordSessionReplay(0, storage, () => 0)).toBe(false);
    expect(shouldRecordSessionReplay(1, storage, () => 0.999)).toBe(true);
    expect(storage.dump()).toEqual({});
  });

  it('falls back to a non-sticky draw when storage throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(shouldRecordSessionReplay(0.1, throwing, () => 0.05)).toBe(true);
    expect(shouldRecordSessionReplay(0.1, throwing, () => 0.5)).toBe(false);
  });

  it('handles a null storage (SSR) with a plain draw', () => {
    expect(shouldRecordSessionReplay(0.1, null, () => 0.05)).toBe(true);
    expect(shouldRecordSessionReplay(0.1, null, () => 0.95)).toBe(false);
  });
});
