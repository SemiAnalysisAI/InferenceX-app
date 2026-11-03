'use client';

import dynamic from 'next/dynamic';

import { hydrationIsland } from '@/components/ui/hydration-island';

export const LazyInferenceDashboard = hydrationIsland(
  dynamic(() => import('./inference-dashboard')),
);
