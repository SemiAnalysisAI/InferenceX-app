'use client';

import dynamic from 'next/dynamic';

import { hydrationIsland } from '@/components/ui/hydration-island';

export const LazyHistoricalTrendsDashboard = hydrationIsland(
  dynamic(() => import('./historical-trends-dashboard')),
);
