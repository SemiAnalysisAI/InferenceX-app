'use client';

import dynamic from 'next/dynamic';

const RickMortyAudio = dynamic(
  () => import('./rick-morty-audio').then((mod) => mod.RickMortyAudio),
  { ssr: false },
);

export function RickMortyAudioLazy() {
  return <RickMortyAudio />;
}
