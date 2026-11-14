import type { QueryClient } from '@tanstack/react-query';

import { datasetsQueryOptions } from '@/hooks/api/use-datasets';
import { operatorXComparisonQuery, operatorXModelQuery } from '@/hooks/api/use-operatorx';
import { submissionsQueryOptions } from '@/hooks/api/use-submissions';
import { prefetchInferenceRouteData } from '@/lib/prefetch/inference-route-data';
import {
  DEFAULT_OPERATORX_CATEGORY,
  DEFAULT_OPERATORX_MODEL,
  operatorXCategoryForPathname,
} from '@/lib/routing/operatorx-category';

/**
 * Warms the React Query cache with the queries `href`'s page issues on mount, so a client
 * navigation there renders from cache. Keys come from the same option builders the pages use.
 * Unknown or external hrefs do nothing.
 */
export function prefetchRouteData(queryClient: QueryClient, href: string): void {
  if (typeof window === 'undefined') return;
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin) return;
  const pathname = url.pathname.replace(/^\/zh(?=\/|$)/u, '') || '/';
  const search = url.searchParams;
  if (prefetchInferenceRouteData(queryClient, pathname, search)) return;

  if (pathname === '/infx/submissions') {
    void queryClient.prefetchQuery(submissionsQueryOptions());
  } else if (pathname === '/infx/agentx') {
    void queryClient.prefetchQuery(datasetsQueryOptions());
  } else if (pathname === '/opx' || pathname.startsWith('/opx/')) {
    const category = operatorXCategoryForPathname(pathname) ?? DEFAULT_OPERATORX_CATEGORY;
    const parallel = search.get('parallel');
    if (category === 'model') {
      const model = search.get('model') ?? DEFAULT_OPERATORX_MODEL;
      for (const op of ['gemm', 'moe', 'attention'] as const) {
        void queryClient.prefetchQuery(operatorXModelQuery(op, model, parallel));
      }
    } else {
      void queryClient.prefetchQuery(
        operatorXComparisonQuery(category, search.get('workload'), parallel),
      );
    }
  }
}
