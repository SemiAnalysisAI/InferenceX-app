'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { notifyClientSearchChange } from '@/lib/client-navigation';
import type { OverviewPageData } from '@/lib/overview-data';
import { mergeOverviewControlHref, type OverviewSearchKey } from '@/lib/overview-links';

interface OverviewNavigationValue {
  data: OverviewPageData;
  /** True while `data` still shows the previous selection during a fetch. */
  pending: boolean;
  prefetch: (targetHref: string, keys: readonly OverviewSearchKey[]) => void;
  resolve: (targetHref: string, keys: readonly OverviewSearchKey[]) => string;
  push: (targetHref: string, keys: readonly OverviewSearchKey[]) => void;
}

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
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [pending, setPending] = useState(false);
  const [pendingHref, setPendingHref] = useState(initialHref);
  const pendingHrefRef = useRef(initialHref);
  const committedHrefRef = useRef(initialHref);
  const navigationIdRef = useRef(0);
  const dataCacheRef = useRef(new Map<string, OverviewPageData>([[initialHref, initialData]]));
  const requestCacheRef = useRef(new Map<string, Promise<OverviewPageData>>());

  const load = useCallback((href: string): Promise<OverviewPageData> => {
    const cached = dataCacheRef.current.get(href);
    if (cached !== undefined) return Promise.resolve(cached);

    const inFlight = requestCacheRef.current.get(href);
    if (inFlight !== undefined) return inFlight;

    const url = new URL(href, window.location.origin);
    const request = fetch(`/api/v1/overview${url.search}`, {
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Overview request failed (${response.status})`);
        const nextData = (await response.json()) as OverviewPageData;
        dataCacheRef.current.set(href, nextData);
        return nextData;
      })
      .finally(() => requestCacheRef.current.delete(href));

    requestCacheRef.current.set(href, request);
    return request;
  }, []);

  const commit = useCallback(
    (href: string, updateHistory: boolean) => {
      const navigationId = ++navigationIdRef.current;
      pendingHrefRef.current = href;
      setPendingHref(href);
      setPending(true);
      if (updateHistory) {
        History.prototype.pushState.call(window.history, window.history.state, '', href);
        notifyClientSearchChange(href);
      }

      void load(href)
        .then((nextData) => {
          if (navigationId !== navigationIdRef.current) return;
          committedHrefRef.current = href;
          if (updateHistory) {
            History.prototype.replaceState.call(window.history, window.history.state, '', href);
          }
          setData(nextData);
          setPending(false);
        })
        .catch(() => {
          if (navigationId !== navigationIdRef.current) return;
          setPending(false);
          if (updateHistory) {
            History.prototype.replaceState.call(
              window.history,
              window.history.state,
              '',
              committedHrefRef.current,
            );
            notifyClientSearchChange(committedHrefRef.current);
            router.push(href, { scroll: false });
          } else {
            window.location.reload();
          }
        });
    },
    [load, router],
  );

  useEffect(() => {
    ++navigationIdRef.current;
    dataCacheRef.current.set(initialHref, initialData);
    committedHrefRef.current = initialHref;
    pendingHrefRef.current = initialHref;
    setPendingHref(initialHref);
    setData(initialData);
    setPending(false);
  }, [initialData, initialHref]);

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

  const resolve = useCallback(
    (targetHref: string, keys: readonly OverviewSearchKey[]) =>
      mergeOverviewControlHref(pendingHref, targetHref, keys),
    [pendingHref],
  );

  const value = useMemo<OverviewNavigationValue>(
    () => ({
      data,
      pending,
      resolve,
      prefetch: (targetHref, keys) => {
        const href = mergeOverviewControlHref(pendingHrefRef.current, targetHref, keys);
        void load(href).catch(() => undefined);
      },
      push: (targetHref, keys) => {
        const href = mergeOverviewControlHref(pendingHrefRef.current, targetHref, keys);
        commit(href, true);
      },
    }),
    [commit, data, load, pending, resolve],
  );

  return (
    <OverviewNavigationContext.Provider value={value}>
      {children}
    </OverviewNavigationContext.Provider>
  );
}

export function useOverviewNavigation(): OverviewNavigationValue {
  const value = useContext(OverviewNavigationContext);
  if (value === null) throw new Error('Overview controls require OverviewNavigationProvider');
  return value;
}
