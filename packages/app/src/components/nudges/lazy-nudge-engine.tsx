'use client';

import dynamic from 'next/dynamic';

import { hydrationIsland } from '@/components/ui/hydration-island';

export const LazyNudgeEngine = hydrationIsland(
  dynamic(() => import('./nudge-engine').then((module) => module.NudgeEngine)),
);
