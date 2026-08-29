'use client';

import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useRef } from 'react';

import {
  type UrlStateKey,
  type UrlStateParams,
  readUrlParams,
  refreshUrlParamsOnNavigation,
  writeUrlParams,
} from '@/lib/url-state';

/**
 * Marks a subtree whose chart providers must treat the shared URL-state store
 * as READ-ONLY.
 *
 * The store in `url-state.ts` is module-scoped and deliberately outlives
 * client-side navigations, so the dashboard's filters survive a round-trip
 * through other pages. Embedded chart instances reuse the same providers
 * (`GlobalFilterProvider` → `InferenceProvider`), so without this scope their
 * seeded state — e.g. the `/model/[slug]` embed's auto-selected "every chip
 * config with data" — is written into the store and becomes the state a bare
 * `/inference` rebuilds from on Back-navigation, silently replacing whatever
 * the user actually had selected.
 *
 * Reads stay live inside the scope: explicit share-link params on the embed's
 * own URL keep working, and writes made by the primary dashboards are still
 * visible. Only writes (including `rememberChartStateInUrl` stamping — see the
 * chart components) are suppressed.
 */
export const EphemeralUrlStateContext = createContext(false);

/** Whether the calling component is inside an ephemeral URL-state scope. */
export function useEphemeralUrlState(): boolean {
  return useContext(EphemeralUrlStateContext);
}

/**
 * React hook for URL state synchronization.
 * Reads URL params once on mount (cached in ref), and provides
 * functions to write params back to the URL.
 *
 * Inside an `EphemeralUrlStateContext` scope the write functions are no-ops
 * (see the context doc above); reads are unaffected.
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
