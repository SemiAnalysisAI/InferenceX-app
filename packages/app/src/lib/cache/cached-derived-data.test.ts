import { beforeEach, describe, expect, it, vi } from 'vitest';

const cacheBodies = vi.hoisted(() => new Map<string, string>());

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn(
    (source: (...args: unknown[]) => Promise<unknown>, keyParts: string[]) =>
      async (...args: unknown[]): Promise<unknown> => {
        const key = JSON.stringify([keyParts, args]);
        if (!cacheBodies.has(key)) cacheBodies.set(key, JSON.stringify(await source(...args)));
        return JSON.parse(cacheBodies.get(key)!);
      },
  ),
}));

vi.mock('./blob-cache', () => ({
  blobEnabled: () => false,
  blobGet: vi.fn(),
  blobSet: vi.fn(),
  blobPurge: vi.fn(),
}));

import { cachedDerivedData } from './api-cache';

const largeRows = (revision: number, owner = 'default') =>
  Array.from({ length: 5_000 }, (_, id) => ({ id, label: `row-${id}`, revision, owner }));

describe('cachedDerivedData performance contract', () => {
  beforeEach(() => {
    cacheBodies.clear();
  });

  it('reads its source once for repeated identical inputs', async () => {
    const sourceRead = vi.fn((ids: number[]) => Promise.resolve({ count: ids.length }));
    const readDerivedData = cachedDerivedData(sourceRead, 'source-read-count');

    await expect(readDerivedData([7, 11])).resolves.toEqual({ count: 2 });
    await expect(readDerivedData([7, 11])).resolves.toEqual({ count: 2 });

    expect(sourceRead).toHaveBeenCalledTimes(1);
    expect(sourceRead).toHaveBeenCalledWith([7, 11]);
  });

  it('decodes each caller a private copy by default', async () => {
    const readDerivedData = cachedDerivedData(
      (_id: string) => Promise.resolve(largeRows(0)),
      'private-copy',
    );

    const first = await readDerivedData('a');
    const second = await readDerivedData('a');

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it('shares one decoded value per unchanged entry and redecodes when an entry changes', async () => {
    let revision = 0;
    const readDerivedData = cachedDerivedData(
      (name: string) =>
        Promise.resolve(name === 'small' ? [{ revision }] : largeRows(revision, name)),
      'shared-decode',
      { shareDecodedResult: true },
    );

    const first = await readDerivedData('first');
    const second = await readDerivedData('second');
    await expect(readDerivedData('first')).resolves.toBe(first);
    await expect(readDerivedData('second')).resolves.toBe(second);
    await expect(readDerivedData('small')).resolves.toEqual([{ revision: 0 }]);

    revision = 1;
    cacheBodies.clear();

    const refreshed = await readDerivedData('first');
    expect(refreshed).not.toBe(first);
    expect(refreshed[0]).toMatchObject({ revision: 1, owner: 'first' });
    await expect(readDerivedData('first')).resolves.toBe(refreshed);
    await expect(readDerivedData('small')).resolves.toEqual([{ revision: 1 }]);
  });
});
