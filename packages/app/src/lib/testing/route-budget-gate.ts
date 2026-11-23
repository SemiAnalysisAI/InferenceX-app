/**
 * First-load JavaScript budgets per route. Next.js writes each route's first-load bytes to
 * `.next/diagnostics/route-bundle-stats.json`. `scripts/check-route-budgets.ts` compares them with
 * `scripts/route-bundle-budgets.json` after a build. See docs/testing.md.
 */

export interface RouteBundleStat {
  route: string;
  firstLoadUncompressedJsBytes: number;
}

export interface RouteBudgets {
  /** Headroom `--update` adds above each route's measured size, in percent. */
  tolerancePercent: number;
  /** Budget for a route without its own entry. */
  defaultBytes: number;
  routes: Record<string, number>;
}

export interface RouteBudgetReport {
  /** Routes over budget. Each fails the check. */
  errors: string[];
  /** Budget entries for routes the build no longer has. Each fails the check. */
  stale: string[];
  /** Routes so far under budget that `--update` would lower it. Informational. */
  slack: string[];
}

const bytes = (value: number) => `${value.toLocaleString('en-US')} B`;

/** A route's budget: its size plus the tolerance, rounded up to whole KiB. */
export function budgetFor(size: number, tolerancePercent: number): number {
  return Math.ceil((size * (1 + tolerancePercent / 100)) / 1024) * 1024;
}

/**
 * Reads Next.js's route-bundle-stats.json. Throws unless it is a non-empty array whose entries
 * each name a route and a finite, non-negative byte count, so a changed format cannot pass
 * every route silently or write empty budgets.
 */
export function parseRouteBundleStats(value: unknown): RouteBundleStat[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('route-bundle-stats.json is not a non-empty array of routes.');
  }
  return value.map((entry: unknown, index) => {
    const { route, firstLoadUncompressedJsBytes: size } = (entry ?? {}) as Partial<
      Record<keyof RouteBundleStat, unknown>
    >;
    if (
      typeof route !== 'string' ||
      typeof size !== 'number' ||
      !Number.isFinite(size) ||
      size < 0
    ) {
      throw new Error(
        `route-bundle-stats.json entry ${index} needs a string route and a finite firstLoadUncompressedJsBytes, got ${JSON.stringify(entry)}.`,
      );
    }
    return { route, firstLoadUncompressedJsBytes: size };
  });
}

export function checkRouteBudgets(
  stats: readonly RouteBundleStat[],
  budgets: RouteBudgets,
): RouteBudgetReport {
  const report: RouteBudgetReport = { errors: [], stale: [], slack: [] };
  const built = new Set<string>();
  for (const { route, firstLoadUncompressedJsBytes: size } of stats) {
    built.add(route);
    const own = budgets.routes[route];
    const budget = own ?? budgets.defaultBytes;
    if (size > budget) {
      const over = size - budget;
      report.errors.push(
        own === undefined
          ? `${route}: ${bytes(size)} of first-load JS is over the ${bytes(budget)} default for routes without a budget entry, by ${bytes(over)}. Cut it, or give the route its own budget.`
          : `${route}: ${bytes(size)} of first-load JS is over its ${bytes(budget)} budget by ${bytes(over)} (+${((over / budget) * 100).toFixed(1)}%).`,
      );
    } else if (own !== undefined && budgetFor(size, budgets.tolerancePercent) < own) {
      report.slack.push(`${route}: ${bytes(size)}, budget ${bytes(own)}`);
    }
  }
  for (const route of Object.keys(budgets.routes)) {
    if (!built.has(route)) report.stale.push(route);
  }
  return report;
}

/** The bare page every route builds on. Its budget is the default for routes without an entry. */
export const FLOOR_ROUTE = '/_not-found';

/**
 * Budgets rewritten from a build: every route gets its size plus the tolerance, and routes
 * without an entry get the floor route's budget.
 */
export function updatedRouteBudgets(
  stats: readonly RouteBundleStat[],
  budgets: RouteBudgets,
): RouteBudgets {
  const floor = stats.find(({ route }) => route === FLOOR_ROUTE);
  if (!floor) {
    throw new Error(`route-bundle-stats.json has no ${FLOOR_ROUTE} entry to set defaultBytes.`);
  }
  const routes = Object.fromEntries(
    stats
      .map(({ route, firstLoadUncompressedJsBytes: size }): [string, number] => [
        route,
        budgetFor(size, budgets.tolerancePercent),
      ])
      .toSorted(([a], [b]) => a.localeCompare(b)),
  );
  return {
    ...budgets,
    defaultBytes: budgetFor(floor.firstLoadUncompressedJsBytes, budgets.tolerancePercent),
    routes,
  };
}
