import {
  AGENTX_ROUTE,
  DASHBOARD_ROUTES,
  UBENCHX_ROUTE,
  getDashboardRoute,
} from './dashboard-routes';

export const LEGACY_DASHBOARD_PATHS: ReadonlyMap<string, string> = new Map(
  [...DASHBOARD_ROUTES, AGENTX_ROUTE, UBENCHX_ROUTE].flatMap((route) =>
    'legacyPath' in route ? [[route.legacyPath.slice(1), route.path] as const] : [],
  ),
);

const INFERENCEX_DEFAULT_PATH = getDashboardRoute('inference').path;
const INFERENCEX_ROOT = INFERENCEX_DEFAULT_PATH.split('/')[1];

export function legacyDashboardPathname(pathname: string): string | null {
  const zh = pathname === '/zh' || pathname.startsWith('/zh/');
  const enPath = zh ? pathname.slice(3) : pathname;
  const end = enPath.indexOf('/', 1);
  const first = end === -1 ? enPath.slice(1) : enPath.slice(1, end);
  const rest = end === -1 ? '' : enPath.slice(end).replace(/\/+$/u, '');
  const target =
    LEGACY_DASHBOARD_PATHS.get(first) ??
    (first === INFERENCEX_ROOT && !rest ? INFERENCEX_DEFAULT_PATH : undefined);
  if (!target) return null;
  return `${zh ? '/zh' : ''}${target}${rest}`;
}

export function legacyDashboardRedirectUrl(url: URL): URL | null {
  const pathname = legacyDashboardPathname(url.pathname);
  if (!pathname) return null;
  const target = new URL(url);
  target.pathname = pathname;
  return target;
}
