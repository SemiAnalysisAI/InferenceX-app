'use client';

import { lazy, Suspense } from 'react';

const VercelBeacons = lazy(() =>
  import('./vercel-beacons').then((module_) => ({ default: module_.VercelBeacons })),
);

export function VercelAnalytics() {
  return (
    <Suspense fallback={null}>
      <VercelBeacons />
    </Suspense>
  );
}
