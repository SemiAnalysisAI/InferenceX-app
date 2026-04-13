'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type UrlStateKey,
  type UrlStateParams,
  readUrlParams,
  refreshUrlParams,
  writeUrlParams,
} from '@/lib/url-state';

/**
 * React hook for URL state synchronization.
 * Reads URL params on mount and on client-side navigations (pushState / popstate),
 * clears them from the URL bar, and exposes fresh values via `latestParams`.
 */
export function useUrlState() {
  const initialParams = useRef<UrlStateParams | null>(null);

  // read URL params only once (synchronous, before first render)
  if (initialParams.current === null) {
    initialParams.current = readUrlParams();
  }

  const [latestParams, setLatestParams] = useState<UrlStateParams>(initialParams.current);

  useEffect(() => {
    // pushState handler: params already read & cleared centrally, just apply the result
    const pushHandler = (e: Event) => {
      const fresh = (e as CustomEvent<UrlStateParams>).detail;
      if (fresh && Object.keys(fresh).length > 0) {
        initialParams.current = { ...initialParams.current, ...fresh };
        setLatestParams((prev) => ({ ...prev, ...fresh }));
      }
    };
    // popstate handler: browser back/forward — need to read & clear ourselves
    const popHandler = () => {
      const fresh = refreshUrlParams();
      if (Object.keys(fresh).length > 0) {
        initialParams.current = { ...initialParams.current, ...fresh };
        setLatestParams((prev) => ({ ...prev, ...fresh }));
      }
    };
    window.addEventListener('urlparamschange', pushHandler);
    window.addEventListener('popstate', popHandler);
    return () => {
      window.removeEventListener('urlparamschange', pushHandler);
      window.removeEventListener('popstate', popHandler);
    };
  }, []);

  const hasUrlParam = useCallback((key: UrlStateKey): boolean => {
    const value = initialParams.current?.[key];
    return value !== undefined && value !== '';
  }, []);

  const getUrlParam = useCallback(
    (key: UrlStateKey): string | undefined => initialParams.current?.[key],
    [],
  );

  const setUrlParam = useCallback((key: UrlStateKey, value: string) => {
    writeUrlParams({ [key]: value });
  }, []);

  const setUrlParams = useCallback((params: UrlStateParams) => {
    writeUrlParams(params);
  }, []);

  return {
    initialParams: initialParams.current,
    latestParams,
    hasUrlParam,
    getUrlParam,
    setUrlParam,
    setUrlParams,
  };
}
