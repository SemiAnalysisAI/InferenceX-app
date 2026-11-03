'use client';

import dynamic from 'next/dynamic';

import { hydrationIsland } from '@/components/ui/hydration-island';

export const LazyInferencePageIntro = hydrationIsland(
  dynamic(() => import('./inference-page-intro').then((module) => module.InferencePageIntro)),
);
