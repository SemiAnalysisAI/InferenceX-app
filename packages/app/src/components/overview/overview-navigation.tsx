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

import { track } from '@/lib/analytics';
import { notifyClientSearchChange } from '@/lib/client-navigation';
import type { OverviewPageData, OverviewReferenceHardware } from '@/lib/overview-data';
import { mergeOverviewControlHref, type OverviewSearchKey } from '@/lib/overview-links';

interface OverviewNavigationValue {
  isPending: boolean;
  prefetch: (targetHref: string, keys: readonly OverviewSearchKey[]) => void;
  resolve: (targetHref: string, keys: readonly OverviewSearchKey[]) => string;
  push: (targetHref: string, keys: readonly OverviewSearchKey[]) => void;
}

/**
 * Three contexts, not one. A selector click moves the pending href immediately
 * and the payload only when the request settles, so a single value would push
 * two full matrix renders per uncached selection. Splitting them means the
 * controls can re-render on their own while the matrix waits for real data.
 */
const OverviewDataContext = createContext<OverviewPageData | null>(null);
const OverviewReferenceContext = createContext<OverviewReferenceHardware | null>(null);
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
  const [pendingHref, setPendingHref] = useState(initialHref);
  const [committedHref, setCommittedHref] = useState(initialHref);
  const pendingHrefRef = useRef(initialHref);
  const committedHrefRef = useRef(initialHref);
  const navigationIdRef = useRef(0);
  const dataCacheRef = useRef(new Map<string, OverviewPageData>([[initialHref, initialData]]));
  const requestCacheRef = useRef(new Map<string, Promise<OverviewPageData>>());

  const load = useCallback((href: string): Promise<OverviewPageData> => {
    const cached = dataCacheRef.current.get(href);
    if (cached !== undefined) return Promise.resolve(cached);

    const pending = requestCacheRef.current.get(href);
    if (pending !== undefined) return pending;

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
      if (updateHistory) {
        // Deliberately the pristine prototype method: `window.history.pushState`
        // is patched by Next to dispatch a router action, and that per-click
        // reducer run is exactly the work this route exists to avoid. The cost
        // is that `useSearchParams()`/`usePathname()` stay at the load-time URL
        // here — `notifyClientSearchChange` and the explicit `$pageview` in the
        // success branch are the substitutes. Do not add a `useSearchParams()`
        // consumer to the overview tree.
        //
        // Re-activating a still-pending option resolves to a byte-identical
        // href; pushing it again would stack a Back press that goes nowhere.
        const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (href !== currentHref) {
          History.prototype.pushState.call(window.history, window.history.state, '', href);
        }
        notifyClientSearchChange(href);
      }

      void load(href)
        .then((nextData) => {
          if (navigationId !== navigationIdRef.current) return;
          committedHrefRef.current = href;
          setCommittedHref(href);
          if (updateHistory) {
            History.prototype.replaceState.call(window.history, window.history.state, '', href);
          }
          setData(nextData);
          // The pushState above is invisible to Next's router, so the app-wide
          // pageview tracker never fires here. Emit once per committed state —
          // in the success branch so Back/Forward is covered too, and so the
          // failure path's `router.replace` is not double-counted.
          track('$pageview', { $current_url: new URL(href, window.location.origin).href });
        })
        .catch(() => {
          if (navigationId !== navigationIdRef.current) return;
          if (updateHistory) {
            // The entry pushed above already carries `href`, so `replace`
            // rewrites it in place instead of stacking a duplicate the user
            // has to press Back through twice. Rewinding to the committed
            // href first would also strand the header language toggle, which
            // only ever hears about search changes through the event above.
            router.replace(href, { scroll: false });
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
    setCommittedHref(initialHref);
    pendingHrefRef.current = initialHref;
    setPendingHref(initialHref);
    setData(initialData);
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

  // A commit still in flight when the provider leaves the tree must not write
  // history or route from a component that is gone: invalidate its generation
  // so both settled handlers bail. Kept as its own effect — folding it into the
  // popstate effect above would tie it to that effect's `commit` dependency and
  // silently start cancelling live navigations.
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

  /** The URL already shows the new selection while the matrix still shows the
   *  old numbers. Consumers use this to say so. */
  const isPending = pendingHref !== committedHref;

  const value = useMemo<OverviewNavigationValue>(
    () => ({
      isPending,
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
    [commit, isPending, load, resolve],
  );

  return (
    <OverviewDataContext.Provider value={data}>
      <OverviewReferenceContext.Provider value={data.referenceHardware}>
        <OverviewNavigationContext.Provider value={value}>
          {children}
        </OverviewNavigationContext.Provider>
      </OverviewReferenceContext.Provider>
    </OverviewDataContext.Provider>
  );
}

export function useOverviewNavigation(): OverviewNavigationValue {
  const value = useContext(OverviewNavigationContext);
  if (value === null) throw new Error('Overview controls require OverviewNavigationProvider');
  return value;
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
