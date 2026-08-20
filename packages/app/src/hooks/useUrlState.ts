'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useRef } from 'react';

import {
  type UrlStateKey,
  type UrlStateParams,
  readUrlParams,
  refreshUrlParamsOnNavigation,
  writeUrlParams,
} from '@/lib/url-state';

/**
 * React hook for URL state synchronization.
 * Reads URL params once on mount (cached in ref), and provides
 * functions to write params back to the URL.
 */
export function useUrlState() {
  const initialParams = useRef<UrlStateParams | null>(null);

  // The load-time snapshot in `url-state.ts` is captured once per document, so
  // on a client-side navigation every provider below would initialise from the
  // params of the page the user came FROM. Refresh during render — before the
  // `useState` initialisers and mount effects of the providers underneath —
  // and only once per navigation, so a component mounting later on the same
  // path cannot re-import the URL over filter changes made since.
  //
  // `usePathname`, not `useSearchParams`: the latter forces every statically
  // prerendered page that mounts a filter provider behind a Suspense boundary,
  // which fails the build on /ai-chart.
  const pathname = usePathname();
  refreshUrlParamsOnNavigation(pathname ?? '');

  // read URL params only once (synchronous, before first render)
  if (initialParams.current === null) {
    initialParams.current = readUrlParams();
  }

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
    hasUrlParam,
    getUrlParam,
    setUrlParam,
    setUrlParams,
  };
}
