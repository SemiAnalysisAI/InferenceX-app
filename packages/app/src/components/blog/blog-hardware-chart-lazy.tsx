'use client';

import dynamic from 'next/dynamic';

export const HardwareChart = dynamic(
  () => import('./blog-hardware-chart').then((module) => module.HardwareChart),
  { loading: () => <div className="not-prose my-8 h-[600px]" /> },
);
