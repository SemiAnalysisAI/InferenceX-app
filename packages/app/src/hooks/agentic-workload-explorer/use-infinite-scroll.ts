'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseInfiniteScrollOptions {
  /** Whether more data is available to load. */
  hasMore: boolean;
  /** Whether data is currently being fetched (prevents duplicate triggers). */
  loading: boolean;
  /** Called when the sentinel element enters the viewport. */
  onLoadMore: () => void;
  /** IntersectionObserver rootMargin (default: '200px'). */
  rootMargin?: string;
}

/**
 * Observe a sentinel element and call `onLoadMore` when it enters the viewport.
 * Returns a ref to attach to the sentinel div.
 */
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

// ---------------------------------------------------------------------------
// useInfiniteList — manages items + loadMore + sentinel as a single unit
// ---------------------------------------------------------------------------

interface UseInfiniteListOptions<T> {
  /**
   * Fetch the next page given the number of items already loaded.
   * Return the new items and whether more pages exist.
   */
  fetchMore: (loaded: number) => Promise<{ items: T[]; hasMore: boolean }>;
  /** Extract a unique key per item for deduplication (optional). */
  getKey?: (item: T) => string;
  /** IntersectionObserver rootMargin (default: '200px'). */
  rootMargin?: string;
}

interface UseInfiniteListResult<T> {
  items: T[];
  /** Replace items entirely (e.g., on initial fetch or search/sort reset). */
  reset: (items: T[], hasMore: boolean) => void;
  loadingMore: boolean;
  hasMore: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Infinite-scroll list that manages items, loadMore state, and the sentinel observer.
 *
 * The caller does the initial fetch and calls `reset()` with the first page.
 * Subsequent pages are fetched automatically via `fetchMore` when the sentinel
 * enters the viewport.
 */
export function useInfiniteList<T>({
  fetchMore,
  getKey,
  rootMargin,
}: UseInfiniteListOptions<T>): UseInfiniteListResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Refs to avoid recreating the loadMore callback on every render
  const fetchMoreRef = useRef(fetchMore);
  fetchMoreRef.current = fetchMore;
  const getKeyRef = useRef(getKey);
  getKeyRef.current = getKey;
  // Track API offset separately from items.length so dedup doesn't stall pagination
  const apiOffsetRef = useRef(0);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const { items: newItems, hasMore: more } = await fetchMoreRef.current(apiOffsetRef.current);
      setHasMore(more);
      // Advance offset by the number of items the API returned, not by how many survived dedup
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

// ---------------------------------------------------------------------------
// useLazyVisible — fire a callback the FIRST time an element enters the
// viewport, then disconnect. Used to defer expensive per-row work until the
// row is actually on screen.
// ---------------------------------------------------------------------------

interface UseLazyVisibleOptions {
  /** Set to false to skip the observer entirely (e.g. data already loaded). */
  enabled: boolean;
  /** Invoked once when the observed element first intersects the viewport. */
  onVisible: () => void;
  /** IntersectionObserver rootMargin (default: '100px'). */
  rootMargin?: string;
  /** Starts a new one-shot visibility cycle when this identity changes. */
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
