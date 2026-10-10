'use client';

import { Component, Suspense, type ReactNode } from 'react';

/** Optional decorations must never replace the page with a loading or error screen. */
export class OptionalThemeBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    const fallback = this.props.fallback ?? null;
    return this.state.failed ? (
      fallback
    ) : (
      <Suspense fallback={fallback}>{this.props.children}</Suspense>
    );
  }
}
