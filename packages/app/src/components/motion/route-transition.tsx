import * as React from 'react';

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
