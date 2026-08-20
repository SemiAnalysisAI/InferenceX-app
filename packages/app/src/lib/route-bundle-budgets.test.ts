import { describe, expect, it } from 'vitest';

import {
  ROUTE_BUNDLE_BUDGETS,
  ROUTE_BUNDLE_BUDGET_HEADROOM_PERCENT,
  assertRouteBundleBudgets,
  type RouteBundleStat,
} from './route-bundle-budgets';

function baselineDiagnostics(): RouteBundleStat[] {
  return Object.entries(ROUTE_BUNDLE_BUDGETS).map(([route, budget]) => ({
    route,
    firstLoadUncompressedJsBytes: budget.baselineBytes,
  }));
}

describe('route first-load bundle budgets', () => {
  it('accepts every measured route at its current build baseline', () => {
    expect(ROUTE_BUNDLE_BUDGET_HEADROOM_PERCENT).toBe(2);
    expect(() => assertRouteBundleBudgets(baselineDiagnostics())).not.toThrow();
  });

  it('fails when a measured route exceeds its explicit headroom', () => {
    const stats = baselineDiagnostics();
    const inference = stats.find((stat) => stat.route === '/inference');
    if (!inference) throw new Error('Test baseline is missing /inference');
    inference.firstLoadUncompressedJsBytes = ROUTE_BUNDLE_BUDGETS['/inference']!.maxBytes + 1;

    expect(() => assertRouteBundleBudgets(stats)).toThrow(
      /\/inference is .*budget is .*baseline .* \+ 2% headroom/u,
    );
  });

  it('fails when a measured route disappears from build diagnostics', () => {
    const stats = baselineDiagnostics().filter((stat) => stat.route !== '/zh/blog/[slug]');

    expect(() => assertRouteBundleBudgets(stats)).toThrow(
      'missing diagnostics entry for /zh/blog/[slug]',
    );
  });

  it.each([
    null,
    { route: '/inference' },
    { route: '/inference', firstLoadUncompressedJsBytes: 0 },
    { route: '/inference', firstLoadUncompressedJsBytes: -1 },
    { route: '/inference', firstLoadUncompressedJsBytes: Number.NaN },
  ])('rejects malformed or non-positive diagnostics %#', (invalidEntry) => {
    const stats: unknown[] = baselineDiagnostics().filter((stat) => stat.route !== '/inference');
    stats.push(invalidEntry);

    expect(() => assertRouteBundleBudgets(stats)).toThrow('invalid diagnostics entry');
  });
});
