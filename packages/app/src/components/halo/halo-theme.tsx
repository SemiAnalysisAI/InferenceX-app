'use client';

import { HaloDecorations, HaloThemeBanner } from './halo-decorations';
import { HaloMusic } from './halo-music';
import './halo-theme.css';

export default function HaloTheme() {
  return (
    <>
      <HaloDecorations />
      <HaloThemeBanner />
      <HaloMusic />
    </>
  );
}
