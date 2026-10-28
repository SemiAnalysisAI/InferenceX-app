let currentPathname: string | null = null;
let startedAt = 0;
let soft = false;

export interface NavigationTiming {
  pathname: string;
  /** `performance.now()` at navigation start; 0 for the hard document load. */
  startedAt: number;
  soft: boolean;
}

/**
 * Records that the page moved to `pathname`. The first pathname seen is the hard load (starts at 0);
 * every later change is a soft navigation starting now. Repeated calls for the same pathname are no-ops.
 */
export function markNavigationStart(pathname: string): void {
  if (currentPathname === null) {
    currentPathname = pathname;
    return;
  }
  if (pathname === currentPathname) return;
  currentPathname = pathname;
  startedAt = performance.now();
  soft = true;
}

export function getNavigationTiming(pathname: string): NavigationTiming {
  markNavigationStart(pathname);
  return { pathname, startedAt, soft };
}
