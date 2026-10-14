import { DASHBOARD_ROUTES } from '@/lib/routing/dashboard-routes';

/**
 * Result ordering by page type. Lower tiers are listed first among relevant
 * results:
 *
 * 0. Main pages: the landing page, AgentX, every dashboard tab and the other
 *    primary destinations.
 * 1. Reference pages: chips, comparisons, rankings, models, glossary and
 *    everything else not listed here.
 * 2. Overview.
 * 3. Articles: blog posts, the blog index, whitepapers and the per-framework
 *    AgentX optimization write-ups.
 */
export const PAGE_TIER = { main: 0, reference: 1, overview: 2, article: 3 } as const;
export type PageTier = (typeof PAGE_TIER)[keyof typeof PAGE_TIER];

const MAIN_PATHS = new Set<string>([
  '/',
  '/agentx',
  '/about',
  ...DASHBOARD_ROUTES.map((route) => route.path),
]);
const MAIN_PREFIXES = ['/inference/', '/agentx/', '/ubenchx'];
const ARTICLE_PREFIXES = ['/blog', '/whitepaper', '/agentx/optimizations/'];

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

/** Tier for a page path (anchor and `/zh` prefix ignored). */
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
