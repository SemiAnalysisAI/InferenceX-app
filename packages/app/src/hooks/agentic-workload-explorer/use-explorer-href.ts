'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

import { explorerHref, withVersion } from '@/lib/agentic-workload-explorer/paths';
import { useLocale } from '@/lib/i18n/use-locale';

export function useExplorerHref(): (path: string) => string {
  const locale = useLocale();
  const version = useSearchParams().get('version');
  return useCallback(
    (path: string) => withVersion(explorerHref(path, locale), version),
    [locale, version],
  );
}
