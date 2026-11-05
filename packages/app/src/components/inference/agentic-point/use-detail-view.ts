'use client';

import { useCallback } from 'react';

import { useClientSearchParams } from '@/hooks/useClientSearch';
import { track } from '@/lib/analytics/analytics';
import { replaceClientSearch } from '@/lib/routing/client-navigation';

const DETAIL_VIEWS = ['point', 'timeline', 'power', 'aggregates', 'logs'] as const;
export type DetailView = (typeof DETAIL_VIEWS)[number];

const isDetailView = (value: string | null): value is DetailView =>
  (DETAIL_VIEWS as readonly string[]).includes(value ?? '');

export function useDetailView(): [DetailView, (nextView: DetailView) => void] {
  const searchParams = useClientSearchParams();
  const requestedView = searchParams.get('view');
  const view: DetailView = isDetailView(requestedView) ? requestedView : 'point';
  const setView = useCallback((nextView: DetailView) => {
    const nextParams = new URLSearchParams(window.location.search);
    if (nextView === 'point') nextParams.delete('view');
    else nextParams.set('view', nextView);
    replaceClientSearch(nextParams);
    track('inference_agentic_detail_view_changed', { view: nextView });
  }, []);

  return [view, setView];
}
