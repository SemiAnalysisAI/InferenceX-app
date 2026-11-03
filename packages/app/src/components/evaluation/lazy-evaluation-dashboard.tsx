'use client';

import dynamic from 'next/dynamic';

import { hydrationIsland } from '@/components/ui/hydration-island';

export const LazyEvaluationDashboard = hydrationIsland(
  dynamic(() => import('./evaluation-dashboard')),
);
