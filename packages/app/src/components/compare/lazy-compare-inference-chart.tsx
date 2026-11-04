'use client';

import dynamic from 'next/dynamic';

import { Skeleton } from '@/components/ui/skeleton';

export const LazyCompareInferenceChart = dynamic(() => import('./compare-inference-chart'), {
  ssr: false,
  loading: () => <Skeleton className="h-[600px] w-full" />,
});
