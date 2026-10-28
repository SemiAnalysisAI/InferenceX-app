'use client';

import {
  createContext,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { trackVirtualPageview } from '@/lib/analytics/analytics';
import { notifyClientSearchChange } from '@/lib/routing/client-navigation';
import {
  OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  type OverviewComparisonMode,
  type OverviewPageData,
  type OverviewReferenceHardware,
  resolveOverviewComparisonMode,
  resolveOverviewEngineScope,
  resolveOverviewHardwareRowScope,
  resolveOverviewModelScope,
  resolveOverviewReferenceHardware,
  resolveOverviewRowScope,
  resolveOverviewTier,
} from '@/lib/overview/overview-data';
import {
  mergeOverviewControlHref,
  OVERVIEW_CLIENT_ONLY_KEYS,
  OVERVIEW_SEARCH_ORDER,
  type OverviewClientOnlySearchKey,
  overviewHref,
  type OverviewSearchKey,
} from '@/lib/overview/overview-links';

const OVERVIEW_SERVER_SEARCH_KEYS = OVERVIEW_SEARCH_ORDER.filter(
  (key): key is Exclude<OverviewSearchKey, OverviewClientOnlySearchKey> =>
    !OVERVIEW_CLIENT_ONLY_KEYS.includes(key as OverviewClientOnlySearchKey),
);

function overviewDataKey(href: string): string {
  const url = new URL(href, 'https://inferencex.local');
  const params = url.searchParams;
  return overviewHref(
    url.pathname.startsWith('/zh/') ? 'zh' : 'en',
    resolveOverviewTier(params.get('tier') ?? undefined),
    resolveOverviewEngineScope(params.get('engine') ?? undefined),
    resolveOverviewComparisonMode(params.get('compare') ?? undefined),
    OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
    resolveOverviewModelScope(params.get('models') ?? undefined),
    resolveOverviewRowScope(params.get('rows') ?? undefined),
    resolveOverviewHardwareRowScope(params.get('hwrows') ?? undefined),
  );
}

export type OverviewNavControl = 'comparison' | 'engine' | 'hwrows' | 'models' | 'rows' | 'tier';

interface OverviewNavigationValue {
  isPending: boolean;
  focusIntent: MutableRefObject<OverviewNavControl | null>;
  prefetch: (targetHref: string, keys: readonly OverviewSearchKey[]) => void;
  replaceClientState: (targetHref: string, keys: readonly OverviewClientOnlySearchKey[]) => void;
  resolve: (targetHref: string, keys: readonly OverviewSearchKey[]) => string;
  push: (targetHref: string, keys: readonly OverviewSearchKey[]) => void;
}

const OverviewDataContext = createContext<OverviewPageData | null>(null);
const OverviewReferenceContext = createContext<OverviewReferenceHardware | null>(null);
const OverviewComparisonContext = createContext<OverviewComparisonMode | null>(null);
const OverviewNavigationErrorContext = createContext(false);
const OverviewNavigationContext = createContext<OverviewNavigationValue | null>(null);

export function OverviewNavigationProvider({
  initialData,
  initialHref,
  children,
}: {
  initialData: OverviewPageData;
  initialHref: string;
  children: ReactNode;
}) {
  const [data, setData] = useState(initialData);
  const [navigationError, setNavigationError] = useState(false);
  const [pendingHref, setPendingHref] = useState(initialHref);
  const [committedHref, setCommittedHref] = useState(initialHref);
  const pendingHrefRef = useRef(initialHref);
  const committedHrefRef = useRef(initialHref);
  const navigationIdRef = useRef(0);
  const focusIntentRef = useRef<OverviewNavControl | null>(null);
  const dataCacheRef = useRef(
    new Map<string, OverviewPageData>([[overviewDataKey(initialHref), initialData]]),
  );
  const requestCacheRef = useRef(new Map<string, Promise<OverviewPageData>>());

  const load = useCallback((href: string): Promise<OverviewPageData> => {
    const key = overviewDataKey(href);
    const cached = dataCacheRef.current.get(key);
    if (cached !== undefined) return Promise.resolve(cached);

    const pending = requestCacheRef.current.get(key);
    if (pending !== undefined) return pending;

    const url = new URL(key, window.location.origin);
    const request = fetch(`/api/v1/overview${url.search}`, {
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Overview request failed (${response.status})`);
        const nextData = (await response.json()) as OverviewPageData;
        dataCacheRef.current.set(key, nextData);
        return nextData;
      })
      .finally(() => requestCacheRef.current.delete(key));

    requestCacheRef.current.set(key, request);
    return request;
  }, []);

  const commit = useCallback(
    (href: string, updateHistory: boolean) => {
      const navigationId = ++navigationIdRef.current;
      pendingHrefRef.current = href;
      setPendingHref(href);
      setNavigationError(false);
      if (updateHistory) {
        const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (href !== currentHref) {
          History.prototype.pushState.call(window.history, window.history.state, '', href);
        }
        notifyClientSearchChange(href);
      }

      void load(href)
        .then((nextData) => {
          if (navigationId !== navigationIdRef.current) return;
          const settledHref = mergeOverviewControlHref(
            href,
            pendingHrefRef.current,
            OVERVIEW_CLIENT_ONLY_KEYS,
          );
          committedHrefRef.current = settledHref;
          pendingHrefRef.current = settledHref;
          setCommittedHref(settledHref);
          setPendingHref(settledHref);
          if (updateHistory) {
            History.prototype.replaceState.call(
              window.history,
              window.history.state,
              '',
              settledHref,
            );
          }
          setData(nextData);
          setNavigationError(false);
          trackVirtualPageview(settledHref, 'overview_control');
        })
        .catch(() => {
          if (navigationId !== navigationIdRef.current) return;
          focusIntentRef.current = null;
          const clientState = pendingHrefRef.current;
          const rolledBack = mergeOverviewControlHref(
            committedHrefRef.current,
            clientState,
            OVERVIEW_CLIENT_ONLY_KEYS,
          );
          pendingHrefRef.current = rolledBack;
          setPendingHref(rolledBack);
          setNavigationError(true);
        });
    },
    [load],
  );

  useEffect(() => {
    ++navigationIdRef.current;
    const actual = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const href = mergeOverviewControlHref(actual, initialHref, OVERVIEW_SERVER_SEARCH_KEYS);
    dataCacheRef.current.set(overviewDataKey(href), initialData);
    committedHrefRef.current = href;
    setCommittedHref(href);
    pendingHrefRef.current = href;
    setPendingHref(href);
    setData(initialData);
    setNavigationError(false);
    // The page is prerendered with the default controls, so a shared URL's controls load here.
    if (overviewDataKey(actual) !== overviewDataKey(href)) commit(actual, false);
  }, [commit, initialData, initialHref]);

  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname !== '/overview' && window.location.pathname !== '/zh/overview') {
        ++navigationIdRef.current;
        return;
      }
      const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      commit(href, false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [commit]);

  useEffect(
    () => () => {
      ++navigationIdRef.current;
    },
    [],
  );

  const resolve = useCallback(
    (targetHref: string, keys: readonly OverviewSearchKey[]) =>
      mergeOverviewControlHref(pendingHref, targetHref, keys),
    [pendingHref],
  );

  const replaceClientState = useCallback(
    (targetHref: string, keys: readonly OverviewClientOnlySearchKey[]) => {
      const actualHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const pendingBase = mergeOverviewControlHref(
        actualHref,
        pendingHrefRef.current,
        OVERVIEW_SERVER_SEARCH_KEYS,
      );
      const committedBase = mergeOverviewControlHref(
        actualHref,
        committedHrefRef.current,
        OVERVIEW_SERVER_SEARCH_KEYS,
      );
      const pending = mergeOverviewControlHref(pendingBase, targetHref, keys);
      const committed = mergeOverviewControlHref(committedBase, targetHref, keys);
      pendingHrefRef.current = pending;
      committedHrefRef.current = committed;
      setPendingHref(pending);
      setCommittedHref(committed);

      const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (pending !== currentHref) {
        History.prototype.replaceState.call(window.history, window.history.state, '', pending);
        notifyClientSearchChange(pending);
      }
    },
    [],
  );

  const isPending = useMemo(
    () => overviewDataKey(pendingHref) !== overviewDataKey(committedHref),
    [committedHref, pendingHref],
  );

  const referenceHardware = useMemo(
    () =>
      resolveOverviewReferenceHardware(
        new URL(pendingHref, 'https://inferencex.local').searchParams.get('ref') ?? undefined,
      ),
    [pendingHref],
  );

  const comparisonMode = useMemo(
    () =>
      resolveOverviewComparisonMode(
        new URL(pendingHref, 'https://inferencex.local').searchParams.get('compare') ?? undefined,
      ),
    [pendingHref],
  );

  const value = useMemo<OverviewNavigationValue>(
    () => ({
      isPending,
      focusIntent: focusIntentRef,
      resolve,
      replaceClientState,
      prefetch: (targetHref, keys) => {
        const href = mergeOverviewControlHref(pendingHrefRef.current, targetHref, keys);
        void load(href).catch(() => undefined);
      },
      push: (targetHref, keys) => {
        const href = mergeOverviewControlHref(pendingHrefRef.current, targetHref, keys);
        commit(href, true);
      },
    }),
    [commit, isPending, load, replaceClientState, resolve],
  );

  return (
    <OverviewDataContext.Provider value={data}>
      <OverviewReferenceContext.Provider value={referenceHardware}>
        <OverviewComparisonContext.Provider value={comparisonMode}>
          <OverviewNavigationErrorContext.Provider value={navigationError}>
            <OverviewNavigationContext.Provider value={value}>
              {children}
            </OverviewNavigationContext.Provider>
          </OverviewNavigationErrorContext.Provider>
        </OverviewComparisonContext.Provider>
      </OverviewReferenceContext.Provider>
    </OverviewDataContext.Provider>
  );
}

export function useOverviewNavigation(): OverviewNavigationValue {
  const value = useContext(OverviewNavigationContext);
  if (value === null) throw new Error('Overview controls require OverviewNavigationProvider');
  return value;
}

export function useOverviewNavigationError(): boolean {
  return useContext(OverviewNavigationErrorContext);
}

export function useOverviewData(): OverviewPageData {
  const value = useContext(OverviewDataContext);
  if (value === null) throw new Error('Overview controls require OverviewNavigationProvider');
  return value;
}

export function useOverviewReference(): OverviewReferenceHardware {
  const value = useContext(OverviewReferenceContext);
  if (value === null) throw new Error('Overview controls require OverviewNavigationProvider');
  return value;
}

export function useOverviewComparisonMode(): OverviewComparisonMode {
  const value = useContext(OverviewComparisonContext);
  if (value === null) throw new Error('Overview controls require OverviewNavigationProvider');
  return value;
}
