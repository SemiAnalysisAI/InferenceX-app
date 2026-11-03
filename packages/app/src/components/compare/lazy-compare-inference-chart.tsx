'use client';

import dynamic from 'next/dynamic';

import { Skeleton } from '@/components/ui/skeleton';

// The chart sits below the server-rendered table, so its provider, data fetch and D3 stack
// load after hydration instead of with the compare page's first-load JS.
export const LazyCompareInferenceChart = dynamic(() => import('./compare-inference-chart'), {
  ssr: false,
  loading: () => <Skeleton className="h-[600px] w-full" />,
});
