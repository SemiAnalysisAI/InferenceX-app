'use client';

import { useCallback } from 'react';

import { useClientSearchParams } from '@/hooks/useClientSearch';
import { track } from '@/lib/analytics';
import { replaceClientSearch } from '@/lib/client-navigation';

export type DetailView = 'point' | 'timeline' | 'aggregates' | 'logs';

const isDetailView = (value: string | null): value is DetailView =>
  value === 'point' || value === 'timeline' || value === 'aggregates' || value === 'logs';

/** URL-persisted detail view (`?view=`; per-point is the unadorned default). */
export function useDetailView(): [DetailView, (nextView: DetailView) => void] {
  const searchParams = useClientSearchParams();
  const requestedView = searchParams.get('view');
  const view: DetailView = isDetailView(requestedView) ? requestedView : 'point';
  const setView = useCallback((nextView: DetailView) => {
    // Read at write time so URL state owned by other mounted controls cannot be
    // lost if it changed since this component's last render.
    const nextParams = new URLSearchParams(window.location.search);
    if (nextView === 'point') nextParams.delete('view');
    else nextParams.set('view', nextView);
    replaceClientSearch(nextParams);
    track('inference_agentic_detail_view_changed', { view: nextView });
  }, []);

  return [view, setView];
}
