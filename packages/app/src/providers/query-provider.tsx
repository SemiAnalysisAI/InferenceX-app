'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { clearIdbStore } from '@/lib/indexdb-cache';

const CACHE_VERSION_KEY = 'inferencex-cache-version';
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes

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

  useEffect(() => {
    function checkCacheVersion() {
      fetch('/api/v1/cache-version')
        .then((r) => r.json())
        .then((data: { v: string }) => {
          const stored = localStorage.getItem(CACHE_VERSION_KEY);
          if (stored !== data.v) {
            localStorage.setItem(CACHE_VERSION_KEY, data.v);
            if (stored !== null) {
              clearIdbStore();
            }
          }
        })
        .catch(() => {
          // Offline or local dev without blob — ignore
        });
    }

    checkCacheVersion();
    const id = setInterval(checkCacheVersion, HEARTBEAT_INTERVAL);
    return () => clearInterval(id);
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
