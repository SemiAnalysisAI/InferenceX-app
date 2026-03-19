'use client';

import { useCallback, useRef } from 'react';

import { readUrlParams, UrlStateKey, UrlStateParams, writeUrlParams } from '@/lib/url-state';

/**
 * React hook for URL state synchronization.
 * Reads URL params once on mount (cached in ref), and provides
 * functions to write params back to the URL.
 */
export function useUrlState() {
  const initialParams = useRef<UrlStateParams | null>(null);

  // read URL params only once (synchronous, before first render)
  if (initialParams.current === null) {
    initialParams.current = readUrlParams();
  }

  const hasUrlParam = useCallback((key: UrlStateKey): boolean => {
    const value = initialParams.current?.[key];
    return value !== undefined && value !== '';
  }, []);

  const getUrlParam = useCallback((key: UrlStateKey): string | undefined => {
    return initialParams.current?.[key];
  }, []);

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
