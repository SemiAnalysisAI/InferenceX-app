'use client';

import { ExcalidrawDecorations, ExcalidrawThemeBanner } from './excalidraw-decorations';
import './excalidraw-theme.css';

export default function ExcalidrawTheme() {
  return (
    <>
      <ExcalidrawDecorations />
      <ExcalidrawThemeBanner />
    </>
  );
}
