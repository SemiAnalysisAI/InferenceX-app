'use client';

import dynamic from 'next/dynamic';

import { hydrationIsland } from '@/components/ui/hydration-island';

export const LazyCompareSpecDecodePageClient = hydrationIsland(
  dynamic(() => import('./page-client')),
);
