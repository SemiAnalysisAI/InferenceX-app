'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CURRENT_TRACE_VERSION } from '@semianalysisai/inferencex-db/proxytrace/shared/trace';

type TraceVersionSelection = number | 'all';

// URL state keeps the page and layout selector in sync across navigation.
// Omitted URL versions select the latest pipeline; a null API parameter means all versions.
export function useTraceVersion() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selection = useMemo<TraceVersionSelection>(() => {
    const raw = searchParams.get('version');
    if (raw === null) return CURRENT_TRACE_VERSION;
    if (raw === 'all') return 'all';
    // Only the current version exists in the snapshot; any other ?version=
    // falls back to it.
    return CURRENT_TRACE_VERSION;
  }, [searchParams]);

  const apiParam: number | null = selection === 'all' ? null : selection;

  const setSelection = useCallback(
    (next: TraceVersionSelection) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === CURRENT_TRACE_VERSION) {
        params.delete('version');
      } else {
        params.set('version', String(next));
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { selection, apiParam, setSelection };
}

export function appendTraceVersion(url: string, apiParam: number | null): string {
  if (apiParam === null) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}version=${apiParam}`;
}
