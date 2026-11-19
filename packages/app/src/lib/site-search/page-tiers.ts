import { AGENTX_ROUTE, DASHBOARD_ROUTES, getDashboardRoute } from '@/lib/routing/dashboard-routes';

export const PAGE_TIER = { main: 0, reference: 1, overview: 2, article: 3 } as const;
export type PageTier = (typeof PAGE_TIER)[keyof typeof PAGE_TIER];

const MAIN_PATHS = new Set<string>([
  '/',
  AGENTX_ROUTE.path,
  '/about',
  ...DASHBOARD_ROUTES.map((route) => route.path),
]);
const MAIN_PREFIXES = [`${getDashboardRoute('inference').path}/`, `${AGENTX_ROUTE.path}/`, '/ubx'];
const ARTICLE_PREFIXES = ['/blog', '/whitepaper', '/hardware'];

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

export function pageTier(url: string): PageTier {
  const hash = url.indexOf('#');
  let path = hash === -1 ? url : url.slice(0, hash);
  if (path === '/zh') path = '/';
  else if (path.startsWith('/zh/')) path = path.slice(3);

  if (path === '/overview') return PAGE_TIER.overview;
  if (ARTICLE_PREFIXES.some((prefix) => matchesPrefix(path, prefix))) return PAGE_TIER.article;
  if (MAIN_PATHS.has(path) || MAIN_PREFIXES.some((prefix) => matchesPrefix(path, prefix))) {
    return PAGE_TIER.main;
  }
  return PAGE_TIER.reference;
}
