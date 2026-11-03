'use client';

import dynamic from 'next/dynamic';

import { hydrationIsland } from '@/components/ui/hydration-island';

export const LazyPowerXDashboard = hydrationIsland(dynamic(() => import('./powerx-dashboard')));
