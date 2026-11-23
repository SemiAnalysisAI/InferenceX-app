import { describe, expect, it } from 'bun:test';

import {
  budgetFor,
  checkRouteBudgets,
  FLOOR_ROUTE,
  parseRouteBundleStats,
  updatedRouteBudgets,
  type RouteBudgets,
} from './route-budget-gate';

const budgets: RouteBudgets = {
  tolerancePercent: 1,
  defaultBytes: 700_000,
  routes: { '/infx/inference/[model]': 1_680_000, '/': 720_000 },
};

const stat = (route: string, firstLoadUncompressedJsBytes: number) => ({
  route,
  firstLoadUncompressedJsBytes,
});

describe('checkRouteBudgets', () => {
  it('passes routes at or under their budget', () => {
    expect(
      checkRouteBudgets([stat('/infx/inference/[model]', 1_680_000), stat('/', 715_000)], budgets),
    ).toEqual({ errors: [], stale: [], slack: [] });
  });

  it('fails a route over its budget and says by how much', () => {
    const { errors } = checkRouteBudgets(
      [stat('/infx/inference/[model]', 1_700_000), stat('/', 715_000)],
      budgets,
    );
    expect(errors).toEqual([
      '/infx/inference/[model]: 1,700,000 B of first-load JS is over its 1,680,000 B budget by 20,000 B (+1.2%).',
    ]);
  });

  it('holds a new route without an entry to the default budget', () => {
    const routes = [stat('/infx/inference/[model]', 1_600_000), stat('/', 715_000)];
    expect(checkRouteBudgets([...routes, stat('/new', 690_000)], budgets).errors).toEqual([]);
    expect(checkRouteBudgets([...routes, stat('/new', 800_000)], budgets).errors).toEqual([
      '/new: 800,000 B of first-load JS is over the 700,000 B default for routes without a budget entry, by 100,000 B. Cut it, or give the route its own budget.',
    ]);
  });

  it('reports budgets for routes the build no longer has', () => {
    expect(checkRouteBudgets([stat('/', 715_000)], budgets).stale).toEqual([
      '/infx/inference/[model]',
    ]);
  });

  it('notes routes that shrank enough to ratchet their budget down, without failing', () => {
    const report = checkRouteBudgets(
      [stat('/infx/inference/[model]', 1_500_000), stat('/', 715_000)],
      budgets,
    );
    expect(report.errors).toEqual([]);
    expect(report.slack).toEqual(['/infx/inference/[model]: 1,500,000 B, budget 1,680,000 B']);
  });
});

describe('updatedRouteBudgets', () => {
  it('sets every built route to its size plus the tolerance, rounded up to KiB, and drops the rest', () => {
    const updated = updatedRouteBudgets(
      [stat('/b', 1000), stat('/a', 102_400), stat(FLOOR_ROUTE, 600_000)],
      budgets,
    );
    expect(updated).toEqual({
      tolerancePercent: 1,
      defaultBytes: 606_208,
      routes: { '/_not-found': 606_208, '/a': 103_424, '/b': 1024 },
    });
    expect(Object.keys(updated.routes)).toEqual(['/_not-found', '/a', '/b']);
  });

  it('recomputes the default from the bare page, so it follows the shared shell down and up', () => {
    expect(updatedRouteBudgets([stat(FLOOR_ROUTE, 650_000)], budgets).defaultBytes).toBe(
      budgetFor(650_000, 1),
    );
    expect(() => updatedRouteBudgets([stat('/', 700_000)], budgets)).toThrow(
      'route-bundle-stats.json has no /_not-found entry to set defaultBytes.',
    );
  });

  it('leaves no slack in the budgets it writes', () => {
    const stats = [
      stat('/infx/inference/[model]', 1_662_755),
      stat('/', 706_776),
      stat(FLOOR_ROUTE, 661_653),
    ];
    expect(checkRouteBudgets(stats, updatedRouteBudgets(stats, budgets))).toEqual({
      errors: [],
      stale: [],
      slack: [],
    });
    expect(budgetFor(1_662_755, 1)).toBe(1_680_384);
  });
});

describe('parseRouteBundleStats', () => {
  it('keeps the route and size of each entry', () => {
    expect(
      parseRouteBundleStats([
        { route: '/', firstLoadUncompressedJsBytes: 706_776, firstLoadChunkPaths: ['a.js'] },
      ]),
    ).toEqual([stat('/', 706_776)]);
  });

  it('rejects a file that is not a non-empty array', () => {
    for (const value of [[], {}, null, { routes: [] }]) {
      expect(() => parseRouteBundleStats(value)).toThrow(
        'route-bundle-stats.json is not a non-empty array of routes.',
      );
    }
  });

  it('rejects an entry whose size field is missing, renamed or not a finite count', () => {
    for (const entry of [
      { route: '/' },
      { route: '/', firstLoadJsBytes: 1 },
      { route: '/', firstLoadUncompressedJsBytes: '706776' },
      { route: '/', firstLoadUncompressedJsBytes: Number.NaN },
      { route: '/', firstLoadUncompressedJsBytes: -1 },
      { firstLoadUncompressedJsBytes: 1 },
      null,
    ]) {
      expect(() => parseRouteBundleStats([stat('/a', 1), entry])).toThrow(
        'route-bundle-stats.json entry 1 needs a string route and a finite firstLoadUncompressedJsBytes',
      );
    }
  });
});
