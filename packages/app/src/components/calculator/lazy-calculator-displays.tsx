'use client';

import dynamic from 'next/dynamic';

import { hydrationIsland } from '@/components/ui/hydration-island';

export const LazyThroughputCalculatorDisplay = hydrationIsland(
  dynamic(() => import('./ThroughputCalculatorDisplay')),
);

export const LazyProfitEstimatorDisplay = hydrationIsland(
  dynamic(() => import('./ProfitEstimatorDisplay')),
);

export const LazyFleetLifecycleDisplay = hydrationIsland(
  dynamic(() => import('./FleetLifecycleDisplay')),
);

export const LazyFirstTokenLimitsDisplay = hydrationIsland(
  dynamic(() => import('./FirstTokenLimitsDisplay')),
);

export const LazyCacheReuseDisplay = hydrationIsland(dynamic(() => import('./CacheReuseDisplay')));
