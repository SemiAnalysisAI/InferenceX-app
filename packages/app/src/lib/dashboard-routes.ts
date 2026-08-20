export type DashboardNavGroup = 'primary' | 'feature-gated' | 'footer-only';
export type DashboardShareParamScope = 'g_' | 'i_' | 'e_' | 'r_' | 'c_';

export interface DashboardProviderCapabilities {
  readonly globalFilters: boolean;
  readonly unofficialRuns: boolean;
}

interface DashboardRouteDefinition {
  readonly key: string;
  /** Route used for dashboard navigation. */
  readonly path: `/${string}`;
  /** SEO canonical and sitemap route. The inference dashboard canonicalizes to `/`. */
  readonly canonicalPath: '/' | `/${string}`;
  readonly navGroup: DashboardNavGroup;
  readonly indexable: boolean;
  readonly localeMirrored: boolean;
  readonly providers: DashboardProviderCapabilities;
  readonly shareParamScopes: readonly DashboardShareParamScope[];
}

const FILTERED_DASHBOARD_PROVIDERS = {
  globalFilters: true,
  unofficialRuns: true,
} as const;

const UNOFFICIAL_ONLY_DASHBOARD_PROVIDERS = {
  globalFilters: false,
  unofficialRuns: true,
} as const;

const STANDALONE_DASHBOARD_PROVIDERS = {
  globalFilters: false,
  unofficialRuns: false,
} as const;

/**
 * Canonical, data-only registry for every dashboard route.
 *
 * Localized labels and metadata prose deliberately live in `tab-meta*.ts` and
 * `tab-nav.tsx`; this module can be consumed by server and client code without
 * importing React or locale content.
 */
export const DASHBOARD_ROUTES = [
  {
    key: 'inference',
    path: '/inference',
    canonicalPath: '/',
    navGroup: 'primary',
    indexable: true,
    localeMirrored: true,
    providers: FILTERED_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'evaluation',
    path: '/evaluation',
    canonicalPath: '/evaluation',
    navGroup: 'primary',
    indexable: true,
    localeMirrored: true,
    providers: FILTERED_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'e_'],
  },
  {
    key: 'historical',
    path: '/historical',
    canonicalPath: '/historical',
    navGroup: 'primary',
    indexable: true,
    localeMirrored: true,
    providers: FILTERED_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'calculator',
    path: '/calculator',
    canonicalPath: '/calculator',
    navGroup: 'primary',
    indexable: true,
    localeMirrored: true,
    providers: UNOFFICIAL_ONLY_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_', 'c_'],
  },
  {
    key: 'reliability',
    path: '/reliability',
    canonicalPath: '/reliability',
    navGroup: 'footer-only',
    indexable: true,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: ['r_'],
  },
  {
    key: 'gpu-specs',
    path: '/gpu-specs',
    canonicalPath: '/gpu-specs',
    navGroup: 'primary',
    indexable: true,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'submissions',
    path: '/submissions',
    canonicalPath: '/submissions',
    navGroup: 'primary',
    indexable: true,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'collectivex',
    path: '/collectivex',
    canonicalPath: '/collectivex',
    navGroup: 'feature-gated',
    indexable: true,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'ai-chart',
    path: '/ai-chart',
    canonicalPath: '/ai-chart',
    navGroup: 'feature-gated',
    indexable: true,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'gpu-metrics',
    path: '/gpu-metrics',
    canonicalPath: '/gpu-metrics',
    navGroup: 'feature-gated',
    indexable: true,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'current-inferencex-image',
    path: '/current-inferencex-image',
    canonicalPath: '/current-inferencex-image',
    navGroup: 'feature-gated',
    indexable: true,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'feedback',
    path: '/feedback',
    canonicalPath: '/feedback',
    navGroup: 'feature-gated',
    indexable: false,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
] as const satisfies readonly DashboardRouteDefinition[];

export type DashboardRoute = (typeof DASHBOARD_ROUTES)[number];
export type DashboardRouteKey = DashboardRoute['key'];

export const DASHBOARD_ROUTE_KEYS: readonly DashboardRouteKey[] = DASHBOARD_ROUTES.map(
  (route) => route.key,
);

export function isDashboardRouteKey(value: string): value is DashboardRouteKey {
  return DASHBOARD_ROUTE_KEYS.includes(value as DashboardRouteKey);
}

export function getDashboardRoute(key: DashboardRouteKey): DashboardRoute {
  return DASHBOARD_ROUTES.find((route) => route.key === key)!;
}

/** Resolve a dashboard route from an English or `/zh` pathname, including child routes. */
export function dashboardRouteForPathname(pathname: string): DashboardRoute | undefined {
  const barePath = pathname.split(/[?#]/u, 1)[0] || '/';
  const enPath = barePath === '/zh' ? '/' : barePath.replace(/^\/zh(?=\/)/u, '');
  return DASHBOARD_ROUTES.find(
    (route) =>
      enPath === route.path ||
      enPath.startsWith(`${route.path}/`) ||
      enPath === route.canonicalPath,
  );
}
