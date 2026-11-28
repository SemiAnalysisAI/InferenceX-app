'use client';

import { HaloDecorations, HaloThemeBanner } from './halo-decorations';
import { HaloMusic } from './halo-music';
import { HaloInterfaceSound } from './halo-sound';
import { HaloCharts } from './halo-charts';
import './halo-theme.css';

export default function HaloTheme() {
  return (
    <>
      <HaloDecorations />
      <HaloThemeBanner />
      <HaloMusic />
      <HaloInterfaceSound />
      <HaloCharts />
    </>
  );
}
