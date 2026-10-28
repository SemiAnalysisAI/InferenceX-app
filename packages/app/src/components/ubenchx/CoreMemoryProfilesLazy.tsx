'use client';

import dynamic from 'next/dynamic';

// The profiles bundle about 340 KB of measurement data. Loading it as its own chunk keeps it
// out of the route bundle that landing and nav links prefetch; server rendering still emits it.
export const CoreMemoryProfilesLazy = dynamic(
  () => import('./CoreMemoryProfilesContent').then((module) => module.CoreMemoryProfilesContent),
  { loading: () => <div className="min-h-screen" /> },
);
