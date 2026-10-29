'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseInfiniteScrollOptions {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  rootMargin?: string;
}

export function useInfiniteScroll({
  hasMore,
  loading,
  onLoadMore,
  rootMargin = '200px',
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onLoadMoreRef.current();
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, rootMargin]);

  return sentinelRef;
}

interface UseInfiniteListOptions<T> {
  fetchMore: (loaded: number) => Promise<{ items: T[]; hasMore: boolean }>;
  getKey?: (item: T) => string;
  rootMargin?: string;
}

interface UseInfiniteListResult<T> {
  items: T[];
  reset: (items: T[], hasMore: boolean) => void;
  loadingMore: boolean;
  hasMore: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

export function useInfiniteList<T>({
  fetchMore,
  getKey,
  rootMargin,
}: UseInfiniteListOptions<T>): UseInfiniteListResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchMoreRef = useRef(fetchMore);
  fetchMoreRef.current = fetchMore;
  const getKeyRef = useRef(getKey);
  getKeyRef.current = getKey;
  const apiOffsetRef = useRef(0);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const { items: newItems, hasMore: more } = await fetchMoreRef.current(apiOffsetRef.current);
      setHasMore(more);
      apiOffsetRef.current += newItems.length;
      if (newItems.length > 0) {
        setItems((prev) => {
          if (getKeyRef.current) {
            const existing = new Set(prev.map(getKeyRef.current));
            const deduped = newItems.filter((item) => !existing.has(getKeyRef.current!(item)));
            return [...prev, ...deduped];
          }
          return [...prev, ...newItems];
        });
      }
    } catch (error) {
      console.error('Failed to load more:', error);
    } finally {
      setLoadingMore(false);
    }
  }, []);

  const sentinelRef = useInfiniteScroll({
    hasMore,
    loading: loadingMore,
    onLoadMore: loadMore,
    rootMargin,
  });

  const reset = useCallback((newItems: T[], newHasMore: boolean) => {
    setItems(newItems);
    setHasMore(newHasMore);
    apiOffsetRef.current = newItems.length;
  }, []);

  return { items, reset, loadingMore, hasMore, sentinelRef };
}

interface UseLazyVisibleOptions {
  enabled: boolean;
  onVisible: () => void;
  rootMargin?: string;
  resetKey?: string;
}

export function useLazyVisible<T extends Element = HTMLDivElement>({
  enabled,
  onVisible,
  rootMargin = '100px',
  resetKey,
}: UseLazyVisibleOptions): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  const firedRef = useRef(false);
  const firedForKeyRef = useRef(resetKey);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    if (!Object.is(firedForKeyRef.current, resetKey)) {
      firedForKeyRef.current = resetKey;
      firedRef.current = false;
    }
    if (!enabled || firedRef.current) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !firedRef.current) {
          firedRef.current = true;
          onVisibleRef.current();
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, rootMargin, resetKey]);

  return ref;
}
