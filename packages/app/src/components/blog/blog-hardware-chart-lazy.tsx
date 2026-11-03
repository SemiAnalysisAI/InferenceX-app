'use client';

import dynamic from 'next/dynamic';

// Every MDX page shares one component map, but only hardware pages render this chart. A client
// boundary is needed for next/dynamic to split it, so posts without it skip the dashboard bundle.
export const HardwareChart = dynamic(
  () => import('./blog-hardware-chart').then((module) => module.HardwareChart),
  { loading: () => <div className="not-prose my-8 h-[600px]" /> },
);
