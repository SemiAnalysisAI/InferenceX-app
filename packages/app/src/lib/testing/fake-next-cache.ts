/**
 * In-memory stand-in for `next/cache` in unit tests: `unstable_cache` keys on
 * the cache key parts and arguments, keeps tags with each entry, never retains
 * a rejected callback, rereads an entry once its `revalidate` seconds pass
 * (Next serves it stale and refreshes in the background; either way the source
 * is read again), and `revalidateTag` drops every entry carrying the tag.
 * Use with `vi.mock('next/cache', () => fakeNextCache)` and call
 * `resetFakeNextCache()` between tests.
 */
interface Entry {
  value: unknown;
  tags: readonly string[];
  expiresAt: number;
}

const entries = new Map<string, Entry>();

export function resetFakeNextCache(): void {
  entries.clear();
}

export const fakeNextCache = {
  unstable_cache(
    source: (...args: unknown[]) => Promise<unknown>,
    keyParts: readonly string[] = [],
    options: { tags?: readonly string[]; revalidate?: number | false } = {},
  ) {
    return async (...args: unknown[]): Promise<unknown> => {
      const key = JSON.stringify([keyParts, args]);
      const saved = entries.get(key);
      if (saved && Date.now() < saved.expiresAt) return saved.value;
      const value = await source(...args);
      const ttl = options.revalidate ? options.revalidate * 1000 : Infinity;
      entries.set(key, { value, tags: options.tags ?? [], expiresAt: Date.now() + ttl });
      return value;
    };
  },
  revalidateTag(tag: string): void {
    for (const [key, entry] of entries) if (entry.tags.includes(tag)) entries.delete(key);
  },
};
