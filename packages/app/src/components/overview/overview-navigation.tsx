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
  useTransition,
} from 'react';

import { notifyClientSearchChange } from '@/lib/client-navigation';
import { mergeOverviewControlHref, type OverviewSearchKey } from '@/lib/overview-links';

interface OverviewNavigationValue {
  prefetch: (targetHref: string, keys: readonly OverviewSearchKey[]) => void;
  resolve: (targetHref: string, keys: readonly OverviewSearchKey[]) => string;
  push: (targetHref: string, keys: readonly OverviewSearchKey[]) => void;
}

const OverviewNavigationContext = createContext<OverviewNavigationValue | null>(null);

export function OverviewNavigationProvider({
  initialHref,
  children,
}: {
  initialHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState(initialHref);
  const pendingHrefRef = useRef(initialHref);
  const [isPending, startTransition] = useTransition();

  const resetToLocation = useCallback(() => {
    const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    pendingHrefRef.current = href;
    setPendingHref(href);
  }, []);

  useEffect(() => {
    window.addEventListener('popstate', resetToLocation);
    return () => window.removeEventListener('popstate', resetToLocation);
  }, [resetToLocation]);

  useEffect(() => {
    if (isPending) return;
    pendingHrefRef.current = initialHref;
    setPendingHref(initialHref);
  }, [initialHref, isPending]);

  const resolve = useCallback(
    (targetHref: string, keys: readonly OverviewSearchKey[]) =>
      mergeOverviewControlHref(pendingHref, targetHref, keys),
    [pendingHref],
  );

  const value = useMemo<OverviewNavigationValue>(
    () => ({
      resolve,
      prefetch: (targetHref, keys) => {
        router.prefetch(mergeOverviewControlHref(pendingHrefRef.current, targetHref, keys));
      },
      push: (targetHref, keys) => {
        const href = mergeOverviewControlHref(pendingHrefRef.current, targetHref, keys);
        pendingHrefRef.current = href;
        setPendingHref(href);
        notifyClientSearchChange(href);
        startTransition(() => router.push(href, { scroll: false }));
      },
    }),
    [resolve, router],
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
