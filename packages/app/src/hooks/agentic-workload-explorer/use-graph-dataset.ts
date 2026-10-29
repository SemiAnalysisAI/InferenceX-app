'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLazyVisible } from '@/hooks/agentic-workload-explorer/use-infinite-scroll';

export interface GraphDatasetContext {
  traceVersionParam: number | null;
  baseUrl: string;
}

interface CacheEntry {
  promise: Promise<unknown>;
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

export function invalidateGraphDatasetCache() {
  cache.clear();
}
