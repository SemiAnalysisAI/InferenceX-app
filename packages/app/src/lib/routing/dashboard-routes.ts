export type DashboardNavGroup = 'primary' | 'feature-gated' | 'footer-only';
export type DashboardShareParamScope = 'g_' | 'i_' | 'e_' | 'r_' | 'c_';

export interface DashboardProviderCapabilities {
  readonly globalFilters: boolean;
  readonly unofficialRuns: boolean;
}

export interface DashboardShellCapabilities {
  readonly providers: DashboardProviderCapabilities;
  readonly dashboardNudge: boolean;
  readonly tabNav: boolean;
}

interface DashboardRouteDefinition {
  readonly key: string;
  readonly path: `/${string}`;
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

interface DashboardShellCapabilityRoute extends DashboardShellCapabilities {
  readonly path: `/${string}`;
  readonly includeChildren: boolean;
}

export const DASHBOARD_SHELL_CAPABILITY_ROUTES = [
  {
    path: '/video',
    includeChildren: false,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    dashboardNudge: false,
    tabNav: true,
  },
  {
    path: '/inference/agentic',
    includeChildren: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    dashboardNudge: false,
    tabNav: true,
  },
  {
    path: '/collectivex',
    includeChildren: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    dashboardNudge: false,
    tabNav: true,
  },
  {
    path: '/agentic-workload-explorer',
    includeChildren: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    dashboardNudge: false,
    tabNav: false,
  },
] as const satisfies readonly DashboardShellCapabilityRoute[];

export const DASHBOARD_ROUTES = [
  {
    key: 'video',
    path: '/video',
    canonicalPath: '/video',
    navGroup: 'feature-gated',
    indexable: false,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: [],
  },
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
    key: 'powerx',
    path: '/powerx',
    canonicalPath: '/powerx',
    navGroup: 'primary',
    indexable: false,
    localeMirrored: true,
    providers: FILTERED_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'profit-estimator-per-gigawatt',
    path: '/profit-estimator-per-gigawatt',
    canonicalPath: '/profit-estimator-per-gigawatt',
    navGroup: 'primary',
    indexable: true,
    localeMirrored: true,
    providers: UNOFFICIAL_ONLY_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_', 'c_'],
  },
  {
    key: 'profit-estimator',
    path: '/profit-estimator',
    canonicalPath: '/profit-estimator',
    navGroup: 'primary',
    indexable: true,
    localeMirrored: true,
    providers: UNOFFICIAL_ONLY_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_', 'c_'],
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
    navGroup: 'footer-only',
    indexable: true,
    localeMirrored: true,
    providers: FILTERED_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'calculator',
    path: '/calculator',
    canonicalPath: '/calculator',
    navGroup: 'footer-only',
    indexable: true,
    localeMirrored: true,
    providers: UNOFFICIAL_ONLY_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_', 'c_'],
  },
  {
    key: 'fleet',
    path: '/fleet',
    canonicalPath: '/fleet',
    navGroup: 'footer-only',
    indexable: true,
    localeMirrored: true,
    providers: UNOFFICIAL_ONLY_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_', 'c_'],
  },
  {
    key: 'first-token',
    path: '/first-token',
    canonicalPath: '/first-token',
    navGroup: 'footer-only',
    indexable: true,
    localeMirrored: true,
    providers: UNOFFICIAL_ONLY_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_', 'c_'],
  },
  {
    key: 'cache-reuse',
    path: '/cache-reuse',
    canonicalPath: '/cache-reuse',
    navGroup: 'footer-only',
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
    navGroup: 'footer-only',
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
    key: 'operatorx',
    path: '/operatorx',
    canonicalPath: '/operatorx',
    navGroup: 'feature-gated',
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
    key: 'agentic-workload-explorer',
    path: '/agentic-workload-explorer',
    canonicalPath: '/agentic-workload-explorer',
    navGroup: 'feature-gated',
    indexable: true,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: [],
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

const DEFAULT_DASHBOARD_SHELL_CAPABILITIES: DashboardShellCapabilities = {
  providers: FILTERED_DASHBOARD_PROVIDERS,
  dashboardNudge: true,
  tabNav: true,
};

export function dashboardShellCapabilitiesForPathname(
  pathname: string,
): DashboardShellCapabilities {
  const barePath = pathname.split(/[?#]/u, 1)[0] || '/';
  const enPath = barePath === '/zh' ? '/' : barePath.replace(/^\/zh(?=\/)/u, '');
  const capabilityRoute = DASHBOARD_SHELL_CAPABILITY_ROUTES.find(
    (route) =>
      enPath === route.path || (route.includeChildren && enPath.startsWith(`${route.path}/`)),
  );
  if (capabilityRoute) {
    return {
      providers: capabilityRoute.providers,
      dashboardNudge: capabilityRoute.dashboardNudge,
      tabNav: capabilityRoute.tabNav,
    };
  }

  const dashboardRoute = dashboardRouteForPathname(enPath);
  if (!dashboardRoute) return DEFAULT_DASHBOARD_SHELL_CAPABILITIES;
  return {
    providers: dashboardRoute.providers,
    dashboardNudge: true,
    tabNav: true,
  };
}
