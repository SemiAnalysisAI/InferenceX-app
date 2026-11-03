'use client';

import dynamic from 'next/dynamic';

import { hydrationIsland } from '@/components/ui/hydration-island';

export const LazyComparePerDollarPageClient = hydrationIsland(
  dynamic(() => import('./page-client')),
);
