'use client';

import { useCallback } from 'react';

import { explorerHref } from '@/lib/agentic-workload-explorer/paths';
import { useLocale } from '@/lib/use-locale';

/** Locale-aware `explorerHref` bound to the current page's language. */
export function useExplorerHref(): (path: string) => string {
  const locale = useLocale();
  return useCallback((path: string) => explorerHref(path, locale), [locale]);
}
