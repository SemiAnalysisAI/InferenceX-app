'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseDashboardDataOptions<T> {
  fetcher: (signal?: AbortSignal) => Promise<T>;
  enabled?: boolean;
  /** Changing this value starts a new request and resets loading. */
  key?: string;
}

export function useDashboardData<T>({ fetcher, enabled = true, key }: UseDashboardDataOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [fetchError, setFetchError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  const enabledRef = useRef(enabled);
  const timerRef = useRef<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  fetcherRef.current = fetcher;
  enabledRef.current = enabled;

  const cancelRequest = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  const doFetch = useCallback(async (controller: AbortController) => {
    try {
      const result = await fetcherRef.current(controller.signal);
      if (controller.signal.aborted) return;
      setData(result);
      setFetchError(null);
    } catch (error) {
      if (controller.signal.aborted) return;
      setFetchError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (!controller.signal.aborted) {
        if (requestRef.current === controller) requestRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  const startRequest = useCallback(
    (defer: boolean) => {
      cancelRequest();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);

      if (defer) {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          void doFetch(controller);
        }, 0);
      } else {
        void doFetch(controller);
      }
    },
    [cancelRequest, doFetch],
  );

  const reload = useCallback(() => {
    if (!enabledRef.current) {
      cancelRequest();
      setLoading(false);
      return;
    }
    startRequest(false);
  }, [cancelRequest, startRequest]);

  useEffect(() => {
    if (!enabled) {
      cancelRequest();
      setLoading(false);
      return;
    }

    startRequest(true);
    return cancelRequest;
  }, [cancelRequest, enabled, key, startRequest]);

  return { data, loading: enabled && loading, error: fetchError, reload };
}
