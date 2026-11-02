'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { isFeatureGatedModelPath } from '@/lib/routing/model-feature-visibility';
import { useFeatureGate } from '@/lib/runtime/use-feature-gate';

/** Presentation guard, not authorization. API and artifact access remain unchanged. */
export function ModelFeatureBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const unlocked = useFeatureGate();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const blocked = isFeatureGatedModelPath(pathname ?? '') && !unlocked;
  useEffect(() => {
    if (ready && blocked) {
      router.replace(pathname?.startsWith('/zh/') ? '/zh/inference' : '/inference');
    }
  }, [ready, blocked, pathname, router]);
  // Never render a gated route while waiting for localStorage, including SSR.
  return blocked ? null : children;
}
