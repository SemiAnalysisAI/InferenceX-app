'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: Infinity,
            gcTime: Infinity,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // One-time cleanup: delete the old IDB cache for users who had it
  useEffect(() => {
    try {
      indexedDB.deleteDatabase('tanstack-query-cache');
    } catch {
      // ignore — private browsing or unsupported
    }
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
