'use client';

import dynamic from 'next/dynamic';

import { hydrationIsland } from '@/components/ui/hydration-island';

export const LazyUnofficialRunProvider = hydrationIsland(
  dynamic(() => import('./unofficial-run-provider').then((module) => module.UnofficialRunProvider)),
);
