export type DashboardNavGroup = 'primary' | 'merged' | 'feature-gated' | 'footer-only';
export type DashboardShareParamScope = 'g_' | 'i_' | 'e_' | 'r_' | 'c_' | 'v_';

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
  readonly legacyPath?: `/${string}`;
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
    path: '/vgx',
    includeChildren: false,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    dashboardNudge: false,
    tabNav: true,
  },
  {
    path: '/infx/inference/agentic',
    includeChildren: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    dashboardNudge: false,
    tabNav: true,
  },
  {
    path: '/colx',
    includeChildren: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    dashboardNudge: false,
    tabNav: true,
  },
  {
    path: '/infx/agentic-workload-explorer',
    includeChildren: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    dashboardNudge: false,
    tabNav: false,
  },
] as const satisfies readonly DashboardShellCapabilityRoute[];

export const DASHBOARD_ROUTES = [
  {
    key: 'video',
    path: '/vgx',
    canonicalPath: '/vgx',
    legacyPath: '/video',
    navGroup: 'feature-gated',
    indexable: false,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: ['v_', 'r_'],
  },
  {
    key: 'inference',
    path: '/infx/inference',
    canonicalPath: '/infx/inference',
    legacyPath: '/inference',
    navGroup: 'primary',
    indexable: true,
    localeMirrored: true,
    providers: FILTERED_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'powerx',
    path: '/pwx',
    canonicalPath: '/pwx',
    legacyPath: '/powerx',
    navGroup: 'feature-gated',
    indexable: false,
    localeMirrored: true,
    providers: FILTERED_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'profit-estimator-per-gigawatt',
    path: '/infx/profit-estimator-per-gigawatt',
    canonicalPath: '/infx/profit-estimator-per-gigawatt',
    legacyPath: '/profit-estimator-per-gigawatt',
    navGroup: 'merged',
    indexable: true,
    localeMirrored: true,
    providers: UNOFFICIAL_ONLY_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_', 'c_'],
  },
  {
    key: 'profit-estimator',
    path: '/infx/profit-estimator',
    canonicalPath: '/infx/profit-estimator',
    legacyPath: '/profit-estimator',
    navGroup: 'primary',
    indexable: true,
    localeMirrored: true,
    providers: UNOFFICIAL_ONLY_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_', 'c_'],
  },
  {
    key: 'evaluation',
    path: '/infx/evaluation',
    canonicalPath: '/infx/evaluation',
    legacyPath: '/evaluation',
    navGroup: 'primary',
    indexable: true,
    localeMirrored: true,
    providers: FILTERED_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'e_'],
  },
  {
    key: 'historical',
    path: '/infx/historical',
    canonicalPath: '/infx/historical',
    legacyPath: '/historical',
    navGroup: 'footer-only',
    indexable: true,
    localeMirrored: true,
    providers: FILTERED_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'calculator',
    path: '/infx/calculator',
    canonicalPath: '/infx/calculator',
    legacyPath: '/calculator',
    navGroup: 'footer-only',
    indexable: true,
    localeMirrored: true,
    providers: UNOFFICIAL_ONLY_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_', 'c_'],
  },
  {
    key: 'fleet',
    path: '/infx/fleet',
    canonicalPath: '/infx/fleet',
    legacyPath: '/fleet',
    navGroup: 'footer-only',
    indexable: true,
    localeMirrored: true,
    providers: UNOFFICIAL_ONLY_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_', 'c_'],
  },
  {
    key: 'first-token',
    path: '/infx/first-token',
    canonicalPath: '/infx/first-token',
    legacyPath: '/first-token',
    navGroup: 'footer-only',
    indexable: true,
    localeMirrored: true,
    providers: UNOFFICIAL_ONLY_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_', 'c_'],
  },
  {
    key: 'cache-reuse',
    path: '/infx/cache-reuse',
    canonicalPath: '/infx/cache-reuse',
    legacyPath: '/cache-reuse',
    navGroup: 'footer-only',
    indexable: true,
    localeMirrored: true,
    providers: UNOFFICIAL_ONLY_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_', 'c_'],
  },
  {
    key: 'reliability',
    path: '/infx/reliability',
    canonicalPath: '/infx/reliability',
    legacyPath: '/reliability',
    navGroup: 'footer-only',
    indexable: true,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: ['r_'],
  },
  {
    key: 'gpu-specs',
    path: '/infx/gpu-specs',
    canonicalPath: '/infx/gpu-specs',
    legacyPath: '/gpu-specs',
    navGroup: 'footer-only',
    indexable: true,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'submissions',
    path: '/infx/submissions',
    canonicalPath: '/infx/submissions',
    legacyPath: '/submissions',
    navGroup: 'primary',
    indexable: true,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'operatorx',
    path: '/opx',
    canonicalPath: '/opx',
    legacyPath: '/operatorx',
    navGroup: 'primary',
    indexable: true,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },

  {
    key: 'collectivex',
    path: '/colx',
    canonicalPath: '/colx',
    legacyPath: '/collectivex',
    navGroup: 'feature-gated',
    indexable: true,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'agentic-workload-explorer',
    path: '/infx/agentic-workload-explorer',
    canonicalPath: '/infx/agentic-workload-explorer',
    legacyPath: '/agentic-workload-explorer',
    navGroup: 'feature-gated',
    indexable: true,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: [],
  },
  {
    key: 'ai-chart',
    path: '/infx/ai-chart',
    canonicalPath: '/infx/ai-chart',
    legacyPath: '/ai-chart',
    navGroup: 'feature-gated',
    indexable: true,
    localeMirrored: true,
    providers: STANDALONE_DASHBOARD_PROVIDERS,
    shareParamScopes: ['g_', 'i_'],
  },
  {
    key: 'current-inferencex-image',
    path: '/infx/current-inferencex-image',
    canonicalPath: '/infx/current-inferencex-image',
    legacyPath: '/current-inferencex-image',
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

export const AGENTX_ROUTE = { path: '/infx/agentx', legacyPath: '/agentx' } as const;
export const UBENCHX_ROUTE = { path: '/ubx', legacyPath: '/ubenchx' } as const;

export type DashboardRoute = (typeof DASHBOARD_ROUTES)[number];
export type DashboardRouteKey = DashboardRoute['key'];

export const DASHBOARD_ROUTE_KEYS: readonly DashboardRouteKey[] = DASHBOARD_ROUTES.map(
  (route) => route.key,
);

export function isDashboardRouteKey(value: string): value is DashboardRouteKey {
  return DASHBOARD_ROUTE_KEYS.includes(value as DashboardRouteKey);
}

export function getDashboardRoute<K extends DashboardRouteKey>(
  key: K,
): Extract<DashboardRoute, { key: K }> {
  return DASHBOARD_ROUTES.find(
    (route): route is Extract<DashboardRoute, { key: K }> => route.key === key,
  )!;
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

const MERGED_DASHBOARD_TABS: Partial<Record<DashboardRouteKey, DashboardRouteKey>> = {
  'profit-estimator-per-gigawatt': 'profit-estimator',
};

export function dashboardNavTabForPathname(pathname: string): DashboardRouteKey | undefined {
  const key = dashboardRouteForPathname(pathname)?.key;
  return key && (MERGED_DASHBOARD_TABS[key] ?? key);
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
