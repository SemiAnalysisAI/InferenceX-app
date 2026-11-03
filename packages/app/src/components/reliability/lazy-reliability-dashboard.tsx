'use client';

import dynamic from 'next/dynamic';

import { hydrationIsland } from '@/components/ui/hydration-island';

export const LazyReliabilityDashboard = hydrationIsland(
  dynamic(() => import('./reliability-dashboard')),
);
