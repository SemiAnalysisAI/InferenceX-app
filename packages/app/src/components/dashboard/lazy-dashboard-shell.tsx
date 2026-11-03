'use client';

import dynamic from 'next/dynamic';

import { hydrationIsland } from '@/components/ui/hydration-island';

export const LazyDashboardShell = hydrationIsland(
  dynamic(() => import('./dashboard-shell').then((module) => module.DashboardShell)),
);
