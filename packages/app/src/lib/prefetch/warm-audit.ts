import type { QueryClient } from '@tanstack/react-query';

export const WARM_AUDIT_DELAY_MS = 30_000;

export function auditWarmedQueries(queryClient: QueryClient): () => void {
  if (process.env.NODE_ENV === 'production') return () => {};

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const cancel = (hash: string) => {
    clearTimeout(timers.get(hash));
    timers.delete(hash);
  };

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    const { query } = event;
    if (event.type === 'added' && query.getObserversCount() === 0) {
      timers.set(
        query.queryHash,
        setTimeout(() => {
          timers.delete(query.queryHash);
          console.warn(
            '[warm-audit] Query warmed but never read. Check that the prefetcher builds the same key as the page.',
            query.queryKey,
          );
        }, WARM_AUDIT_DELAY_MS),
      );
    } else if (event.type === 'observerAdded' || event.type === 'removed') {
      cancel(query.queryHash);
    }
  });

  return () => {
    unsubscribe();
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}
