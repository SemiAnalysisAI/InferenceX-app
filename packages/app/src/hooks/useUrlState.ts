'use client';

import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useRef } from 'react';

import {
  type UrlStateKey,
  type UrlStateParams,
  readUrlParams,
  refreshUrlParamsOnNavigation,
  writeUrlParams,
} from '@/lib/routing/url-state';

export const EphemeralUrlStateContext = createContext(false);

export function useEphemeralUrlState(): boolean {
  return useContext(EphemeralUrlStateContext);
}

export function useUrlState() {
  const initialParams = useRef<UrlStateParams | null>(null);

  const pathname = usePathname();
  refreshUrlParamsOnNavigation(pathname ?? '');

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

  const ephemeral = useContext(EphemeralUrlStateContext);

  const setUrlParam = useCallback(
    (key: UrlStateKey, value: string) => {
      if (ephemeral) return;
      writeUrlParams({ [key]: value });
    },
    [ephemeral],
  );

  const setUrlParams = useCallback(
    (params: UrlStateParams) => {
      if (ephemeral) return;
      writeUrlParams(params);
    },
    [ephemeral],
  );

  return {
    initialParams: initialParams.current,
    hasUrlParam,
    getUrlParam,
    setUrlParam,
    setUrlParams,
  };
}
