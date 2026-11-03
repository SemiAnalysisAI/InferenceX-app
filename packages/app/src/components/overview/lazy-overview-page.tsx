'use client';

import dynamic from 'next/dynamic';

import { hydrationIsland } from '@/components/ui/hydration-island';

export const LazyOverviewPageContent = hydrationIsland(
  dynamic(() => import('./overview-page').then((module) => module.OverviewPageContent)),
);
