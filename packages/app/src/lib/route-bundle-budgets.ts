export interface RouteBundleStat {
  route: string;
  firstLoadUncompressedJsBytes: number;
}

export interface RouteBundleBudget {
  baselineBytes: number;
  maxBytes: number;
}

/**
 * Small tolerance for compiler and lockfile churn. Baselines come from the
 * committed refactor build's `.next/diagnostics/route-bundle-stats.json`.
 */
export const ROUTE_BUNDLE_BUDGET_HEADROOM_PERCENT = 2;

const MEASURED_ROUTE_BASELINES = {
  '/': 643_462,
  '/zh': 643_817,
  '/inference': 1_308_580,
  '/zh/inference': 1_308_935,
  '/evaluation': 1_179_905,
  '/zh/evaluation': 1_180_260,
  '/overview': 783_940,
  '/zh/overview': 784_295,
  '/inference/agentic': 841_009,
  '/zh/inference/agentic': 841_364,
  '/inference/agentic/[id]': 941_216,
  '/zh/inference/agentic/[id]': 941_571,
  '/blog/[slug]': 609_481,
  '/zh/blog/[slug]': 609_836,
  '/compare/[slug]': 1_281_398,
  '/zh/compare/[slug]': 1_281_753,
  '/compare/[slug]/[scenario]': 1_281_398,
  '/zh/compare/[slug]/[scenario]': 1_281_753,
  '/compare-per-dollar/[slug]': 1_283_553,
  '/zh/compare-per-dollar/[slug]': 1_283_908,
  '/compare-per-dollar/[slug]/[scenario]': 1_283_553,
  '/zh/compare-per-dollar/[slug]/[scenario]': 1_283_908,
  '/compare-precision/[slug]': 1_282_798,
  '/zh/compare-precision/[slug]': 1_283_153,
  '/compare-precision/[slug]/[scenario]': 1_282_798,
  '/zh/compare-precision/[slug]/[scenario]': 1_283_153,
  '/compare-spec-decode/[slug]': 1_284_177,
  '/zh/compare-spec-decode/[slug]': 1_284_532,
  '/compare-spec-decode/[slug]/[scenario]': 1_284_177,
  '/zh/compare-spec-decode/[slug]/[scenario]': 1_284_532,
} as const;

function maxBytesForBaseline(baselineBytes: number): number {
  return Math.ceil(baselineBytes * (1 + ROUTE_BUNDLE_BUDGET_HEADROOM_PERCENT / 100));
}

export const ROUTE_BUNDLE_BUDGETS: Readonly<Record<string, RouteBundleBudget>> = Object.fromEntries(
  Object.entries(MEASURED_ROUTE_BASELINES).map(([route, baselineBytes]) => [
    route,
    { baselineBytes, maxBytes: maxBytesForBaseline(baselineBytes) },
  ]),
);

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

/**
 * Validates every explicitly measured route. This deliberately rejects missing
 * diagnostics rather than allowing a renamed or removed route to evade its
 * budget.
 */
export function assertRouteBundleBudgets(
  stats: readonly unknown[],
  budgets: Readonly<Record<string, RouteBundleBudget>> = ROUTE_BUNDLE_BUDGETS,
): void {
  const statsByRoute = new Map<string, RouteBundleStat>();
  const failures: string[] = [];

  for (const [index, value] of stats.entries()) {
    if (typeof value !== 'object' || value === null) {
      failures.push(`invalid diagnostics entry at index ${index}`);
      continue;
    }
    const candidate = value as Partial<RouteBundleStat>;
    if (
      typeof candidate.route !== 'string' ||
      candidate.route.length === 0 ||
      typeof candidate.firstLoadUncompressedJsBytes !== 'number' ||
      !Number.isFinite(candidate.firstLoadUncompressedJsBytes) ||
      candidate.firstLoadUncompressedJsBytes <= 0
    ) {
      failures.push(`invalid diagnostics entry at index ${index}`);
      continue;
    }
    const stat = candidate as RouteBundleStat;
    if (statsByRoute.has(stat.route)) {
      failures.push(`duplicate diagnostics entry for ${stat.route}`);
      continue;
    }
    statsByRoute.set(stat.route, stat);
  }

  for (const [route, budget] of Object.entries(budgets)) {
    const stat = statsByRoute.get(route);
    if (!stat) {
      failures.push(`missing diagnostics entry for ${route}`);
      continue;
    }
    if (stat.firstLoadUncompressedJsBytes > budget.maxBytes) {
      failures.push(
        `${route} is ${formatBytes(stat.firstLoadUncompressedJsBytes)}; budget is ${formatBytes(
          budget.maxBytes,
        )} (baseline ${formatBytes(budget.baselineBytes)} + ${ROUTE_BUNDLE_BUDGET_HEADROOM_PERCENT}% headroom)`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(`Route first-load bundle budget check failed:\n- ${failures.join('\n- ')}`);
  }
}
