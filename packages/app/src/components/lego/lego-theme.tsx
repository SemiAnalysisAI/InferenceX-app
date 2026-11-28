'use client';

import { lazy } from 'react';

// Entry for the lazy theme map. It only points at the real theme, so the eager chunk-loader stub
// lists one small chunk for LEGO rather than every chunk the theme is split into (the stub is part
// of each route's first-load JS and is counted by check:route-budgets). The surrounding
// OptionalThemeBoundary supplies the Suspense boundary and the failure fallback.
const LegoThemeRoot = lazy(() => import('./lego-theme-root'));

export default function LegoTheme() {
  return <LegoThemeRoot />;
}
