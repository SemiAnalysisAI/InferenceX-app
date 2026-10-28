'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { reportDataQueryFailure } from '@/lib/analytics/query-error-analytics';

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) =>
        reportDataQueryFailure(error, {
          key: query.queryKey,
          hash: query.queryHash,
          // `throwOnError` lives on observers (useQuery options); those errors reach error.tsx.
          throwsToErrorBoundary: query.observers.some(({ options }) =>
            typeof options.throwOnError === 'function'
              ? options.throwOnError(error, query)
              : Boolean(options.throwOnError),
          ),
        }),
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) =>
        reportDataQueryFailure(
          error,
          {
            key: mutation.options.mutationKey,
            hash: JSON.stringify(mutation.options.mutationKey ?? mutation.mutationId),
            // useMutation surfaces errors through its result unless a caller opts into throwing.
            throwsToErrorBoundary: false,
          },
          'mutation',
        ),
    }),
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: Infinity,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createAppQueryClient);

  useEffect(() => {
    try {
      indexedDB.deleteDatabase('tanstack-query-cache');
    } catch {}
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
