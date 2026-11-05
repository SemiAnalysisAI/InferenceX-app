'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import type { Locale } from '@/lib/i18n/i18n';
import {
  FEATURE_GATE_KEY,
  FEATURE_GATE_LOCKED_EVENT,
  FEATURE_GATE_UNLOCKED_EVENT,
} from '@/lib/runtime/use-feature-gate';

/** Where a locked visitor who opens a PowerX page is sent. */
export function powerXLockedRedirectPath(locale: Locale): '/' | '/zh' {
  return locale === 'zh' ? '/zh' : '/';
}

/**
 * Soft feature flag for PowerX pages. The gate lives in localStorage, so it can only be
 * read on the client: nothing renders until it is read, a locked visitor is replaced onto
 * the landing page, and relocking while on the page sends the visitor there too.
 */
export function PowerXFeatureGate({ locale, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const target = powerXLockedRedirectPath(locale);
    const sync = () => {
      const open = localStorage.getItem(FEATURE_GATE_KEY) === '1';
      setUnlocked(open);
      if (!open) router.replace(target);
    };
    sync();
    window.addEventListener(FEATURE_GATE_LOCKED_EVENT, sync);
    window.addEventListener(FEATURE_GATE_UNLOCKED_EVENT, sync);
    return () => {
      window.removeEventListener(FEATURE_GATE_LOCKED_EVENT, sync);
      window.removeEventListener(FEATURE_GATE_UNLOCKED_EVENT, sync);
    };
  }, [locale, router]);

  return unlocked ? children : null;
}
