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

/** Budgets rewritten from a build: every route gets its size plus the tolerance. */
export function updatedRouteBudgets(
  stats: readonly RouteBundleStat[],
  budgets: RouteBudgets,
): RouteBudgets {
  const routes = Object.fromEntries(
    stats
      .map(({ route, firstLoadUncompressedJsBytes: size }): [string, number] => [
        route,
        budgetFor(size, budgets.tolerancePercent),
      ])
      .toSorted(([a], [b]) => a.localeCompare(b)),
  );
  return { ...budgets, routes };
}
