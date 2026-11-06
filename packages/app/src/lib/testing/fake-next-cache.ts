/**
 * In-memory stand-in for `next/cache` in unit tests: `unstable_cache` keys on
 * the cache key parts and arguments, keeps tags with each entry, never retains
 * a rejected callback, and `revalidateTag` drops every entry carrying the tag.
 * Use with `vi.mock('next/cache', () => fakeNextCache)` and call
 * `resetFakeNextCache()` between tests.
 */
interface Entry {
  value: unknown;
  tags: readonly string[];
}

const entries = new Map<string, Entry>();

export function resetFakeNextCache(): void {
  entries.clear();
}

export const fakeNextCache = {
  unstable_cache(
    source: (...args: unknown[]) => Promise<unknown>,
    keyParts: readonly string[] = [],
    options: { tags?: readonly string[] } = {},
  ) {
    return async (...args: unknown[]): Promise<unknown> => {
      const key = JSON.stringify([keyParts, args]);
      const saved = entries.get(key);
      if (saved) return saved.value;
      const value = await source(...args);
      entries.set(key, { value, tags: options.tags ?? [] });
      return value;
    };
  },
  revalidateTag(tag: string): void {
    for (const [key, entry] of entries) if (entry.tags.includes(tag)) entries.delete(key);
  },
};
