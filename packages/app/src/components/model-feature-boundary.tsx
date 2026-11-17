'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useClientRouteSearch } from '@/hooks/useClientSearch';
import { isFeatureGatedModelPath } from '@/lib/routing/model-feature-visibility';
import { useFeatureGate } from '@/lib/runtime/use-feature-gate';
import { getDashboardRoute } from '@/lib/routing/dashboard-routes';

const UNOFFICIAL_RUN_PARAM_RE = /^unofficialruns?$/iu;

export function hasUnofficialRunParam(search: string): boolean {
  return [...new URLSearchParams(search)].some(
    ([key, value]) => UNOFFICIAL_RUN_PARAM_RE.test(key) && value.trim() !== '',
  );
}

/** Presentation guard, not authorization. API and artifact access remain unchanged. */
export function ModelFeatureBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const unlocked = useFeatureGate();
  // Unofficial-run links always show their models, gated or not.
  const overlayLink = hasUnofficialRunParam(useClientRouteSearch());
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const blocked = isFeatureGatedModelPath(pathname ?? '') && !unlocked && !overlayLink;
  useEffect(() => {
    if (ready && blocked) {
      router.replace(
        pathname?.startsWith('/zh/')
          ? `/zh${getDashboardRoute('inference').path}/kimi-k31-pro`
          : `${getDashboardRoute('inference').path}/kimi-k31-pro`,
      );
    }
  }, [ready, blocked, pathname, router]);
  // Never render a gated route while waiting for localStorage, including SSR.
  return blocked ? null : children;
}
