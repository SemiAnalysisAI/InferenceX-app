'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLazyVisible } from '@/hooks/agentic-workload-explorer/use-infinite-scroll';

/**
 * Lazy, deduped, cached fetcher for /api/graphs dataset slices.
 *
 * Each chart on /graphs calls `useGraphDataset(key, ctx)`. The hook:
 *   1. Defers the fetch until the returned ref intersects the viewport
 *      (so charts below the fold don't block initial render).
 *   2. Hits a module-level cache keyed by `(traceVersion|model|key)` so two
 *      charts asking for the same dataset share a single in-flight request
 *      and don't refetch on remount within the same context.
 *   3. Returns `{ ref, data, loading, error }`. Cards render skeletons while
 *      `loading`, and the chart proper once `data` resolves.
 *
 * Cache lifetime is the JS module lifetime — refresh clears it. The server
 * also serves Cache-Control: max-age=60, stale-while-revalidate=300 so a
 * cold cache hits the CDN before hitting Postgres.
 */

export interface GraphDatasetContext {
  /** Trace-version selector. `null` means "all versions" — omit the param. */
  traceVersionParam: number | null;
  /** Built URL prefix from `useModelFilter`, e.g. `/api/v1/agentic-workload-explorer/graphs?model=foo` or
   *  `/api/v1/agentic-workload-explorer/graphs` when no model is selected. The hook appends `&include=`. */
  baseUrl: string;
}

interface CacheEntry {
  promise: Promise<unknown>;
  // Resolved value, populated once the promise settles. Lets subsequent
  // mounts read synchronously without going through `.then`.
  value?: unknown;
  error?: unknown;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(key: string, ctx: GraphDatasetContext) {
  return `${ctx.traceVersionParam ?? ''}|${ctx.baseUrl}|${key}`;
}

function buildUrl(key: string, ctx: GraphDatasetContext) {
  const sep = ctx.baseUrl.includes('?') ? '&' : '?';
  let url = `${ctx.baseUrl}${sep}include=${encodeURIComponent(key)}`;
  if (ctx.traceVersionParam !== null) {
    // Param name must match the server-side reader in `parseTraceVersion`
    // (`?version=N`). Sending `traceVersion=N` here silently fell through to
    // "all versions" because the server never read it.
    url += `&version=${ctx.traceVersionParam}`;
  }
  return url;
}

function getEntry(key: string, ctx: GraphDatasetContext): CacheEntry {
  const ck = cacheKey(key, ctx);
  const existing = cache.get(ck);
  if (existing) return existing;
  const promise = fetch(buildUrl(key, ctx)).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = (await r.json()) as Record<string, unknown>;
    return body[key];
  });
  const entry: CacheEntry = { promise };
  promise.then(
    (v) => {
      entry.value = v;
    },
    (error) => {
      entry.error = error;
    },
  );
  cache.set(ck, entry);
  return entry;
}

export function useGraphDataset<T>(key: string, ctx: GraphDatasetContext) {
  const identity = cacheKey(key, ctx);
  const currentIdentityRef = useRef(identity);
  currentIdentityRef.current = identity;
  const entry = cache.get(identity);

  const [data, setData] = useState<T | null>(() => (entry?.value as T | undefined) ?? null);
  const [error, setError] = useState<unknown>(() => entry?.error ?? null);
  const [loading, setLoading] = useState(!data && !error);

  // Reset when cache key changes (e.g. user flips the trace-version chip).
  // We don't fire a new fetch here; the visibility observer will do that
  // once it re-attaches.
  useEffect(() => {
    const cached = cache.get(identity);
    setData(cached?.value === undefined ? null : (cached.value as T));
    setError(cached?.error ?? null);
    setLoading(cached?.value === undefined && cached?.error === undefined);
  }, [identity]);

  const trigger = useCallback(() => {
    const requestIdentity = identity;
    const isCurrent = () => currentIdentityRef.current === requestIdentity;
    const e = getEntry(key, ctx);
    if (e.value !== undefined) {
      if (!isCurrent()) return;
      setData(e.value as T);
      setLoading(false);
      return;
    }
    e.promise.then(
      (v) => {
        if (!isCurrent()) return;
        setData(v as T);
        setLoading(false);
      },
      // eslint-disable-next-line no-shadow -- catch-error-name requires `error`; outer useState also names it `error`
      (fetchError) => {
        if (!isCurrent()) return;
        setError(fetchError);
        setLoading(false);
      },
    );
  }, [identity, key, ctx.baseUrl, ctx.traceVersionParam]);

  const ref = useLazyVisible<HTMLDivElement>({
    enabled: loading && !error,
    onVisible: trigger,
    rootMargin: '300px',
    resetKey: identity,
  });

  return { ref, data, loading, error };
}

/** Clear the in-process cache. Call from a polling-tick handler if we want
 *  charts to re-fetch periodically. */
export function invalidateGraphDatasetCache() {
  cache.clear();
}
