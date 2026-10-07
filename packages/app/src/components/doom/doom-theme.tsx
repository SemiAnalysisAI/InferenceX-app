'use client';

import { DoomDecorations, DoomThemeBanner } from './doom-decorations';
import './doom-theme.css';

export default function DoomTheme() {
  return (
    <>
      <DoomDecorations />
      <DoomThemeBanner />
    </>
  );
}
