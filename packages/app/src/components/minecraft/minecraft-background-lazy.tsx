'use client';

import dynamic from 'next/dynamic';

const MinecraftBackground = dynamic(
  () => import('./minecraft-background').then((mod) => mod.MinecraftBackground),
  { ssr: false },
);

export function MinecraftBackgroundLazy() {
  return <MinecraftBackground />;
}
