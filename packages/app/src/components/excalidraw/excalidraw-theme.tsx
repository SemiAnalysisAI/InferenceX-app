'use client';

import { lazy } from 'react';

// Keep the eager chunk-loader stub small. OptionalThemeBoundary supplies Suspense and fallback.
const ExcalidrawThemeRoot = lazy(() => import('./excalidraw-theme-root'));

export default function ExcalidrawTheme() {
  return <ExcalidrawThemeRoot />;
}
