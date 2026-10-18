import { describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((source: (...args: unknown[]) => Promise<unknown>) => {
    const valuesByArguments = new Map<string, unknown>();
    return async (...args: unknown[]): Promise<unknown> => {
      const key = JSON.stringify(args);
      if (valuesByArguments.has(key)) return valuesByArguments.get(key);

      const value = await source(...args);
      valuesByArguments.set(key, value);
      return value;
    };
  }),
}));

vi.mock('./blob-cache', () => ({
  blobGet: vi.fn(),
  blobSet: vi.fn(),
  blobPurge: vi.fn(),
}));

import { cachedDerivedData } from './api-cache';

describe('cachedDerivedData performance contract', () => {
  it('reads its source once for repeated identical inputs', async () => {
    const sourceRead = vi.fn((ids: number[]) => Promise.resolve({ count: ids.length }));
    const readDerivedData = cachedDerivedData(sourceRead, 'source-read-count');

    await expect(readDerivedData([7, 11])).resolves.toEqual({ count: 2 });
    await expect(readDerivedData([7, 11])).resolves.toEqual({ count: 2 });

    expect(sourceRead).toHaveBeenCalledTimes(1);
    expect(sourceRead).toHaveBeenCalledWith([7, 11]);
  });
});
