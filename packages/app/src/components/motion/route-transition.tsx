import * as React from 'react';

/**
 * Route-level view transition wrapper (progressive enhancement).
 *
 * React's `<ViewTransition>` tags the app-router page content with the
 * `vt-page` view-transition-class, which `motion.css` animates as a
 * restrained 220ms cross-fade + 8px rise (90ms exit) on client-side
 * navigations.
 *
 * DISABLED BY DEFAULT — set `NEXT_PUBLIC_ROUTE_VIEW_TRANSITIONS=1` to opt in.
 *
 * Why the flag defaults off: React's ViewTransition integration snapshots
 * the page when the router transition *starts*, which leaves the
 * `::view-transition` overlay intercepting pointer events for the first
 * few hundred milliseconds of slow navigations (measured ~300ms+ on cold
 * routes, even under `prefers-reduced-motion: reduce`). That briefly
 * blocks clicks — Cypress actionability checks fail with "covered by
 * <html>" — and conflicts with this app's rule that motion must never
 * delay access to content. Cross-document view transitions (the
 * `@view-transition` rule in motion.css, used by the compare-card
 * journey) are unaffected: the browser keeps the old document fully
 * interactive until the new one is ready to activate.
 *
 * Fallback matrix (navigation stays correct in every row):
 * - Flag unset (default) → plain fragment; client navigations swap
 *   instantly, exactly as before this change.
 * - React build without the API (e.g. npm react 19.2 stable, used by the
 *   unit-test runner) → plain fragment (this file). The React build Next
 *   16.3 vendors for the app router exports it as stable `ViewTransition`;
 *   older canaries used `unstable_ViewTransition` — both are detected.
 * - Browser without the View Transitions API (Firefox default) → instant
 *   swap.
 * - `prefers-reduced-motion: reduce` → near-instant cut (motion.css).
 *
 * The API is accessed via property lookup rather than a named import so
 * builds against React versions that don't ship it keep compiling.
 */
type ViewTransitionComponent = React.ComponentType<{
  children: React.ReactNode;
  default?: string;
}>;

const reactExports = React as unknown as {
  ViewTransition?: ViewTransitionComponent;
  unstable_ViewTransition?: ViewTransitionComponent;
};

const ViewTransition = reactExports.ViewTransition ?? reactExports.unstable_ViewTransition;

const enabled = process.env.NEXT_PUBLIC_ROUTE_VIEW_TRANSITIONS === '1';

export function RouteTransition({ children }: { children: React.ReactNode }) {
  if (!enabled || !ViewTransition) return <>{children}</>;
  return <ViewTransition default="vt-page">{children}</ViewTransition>;
}
