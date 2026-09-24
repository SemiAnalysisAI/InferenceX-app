import { apiOperations, buildOpenApiDocument } from '@/lib/api-documentation';
import { DASHBOARD_ROUTE_KEYS } from '@/lib/dashboard-routes';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDateParam, parseNumberMap, parseNumberParam, validateParams } from './params';
import { DASHBOARD_API_COVERAGE, VIEW_QUERY_PARAMS } from './registry';
import { comparisonSelections } from './source';

describe('public view contract coverage', () => {
  it('documents the bodyless video response without a content schema', () => {
    const document = buildOpenApiDocument();
    const pathItem = document.paths['/api/v1/views/video'] as {
      get: { responses: Record<string, unknown> };
    };
    const operation = pathItem.get;
    expect(operation.responses['204']).not.toHaveProperty('content');
    expect(operation.responses).toHaveProperty('503');
  });
  it('accounts for every visible, hidden and feature-gated dashboard route', () => {
    expect(Object.keys(DASHBOARD_API_COVERAGE).sort()).toEqual([...DASHBOARD_ROUTE_KEYS].sort());
    for (const coverage of Object.values(DASHBOARD_API_COVERAGE)) {
      if ('view' in coverage) expect(VIEW_QUERY_PARAMS).toHaveProperty(coverage.view);
      else expect(coverage.exclusion.length).toBeGreaterThan(20);
    }
  });
  for (const [view, keys] of Object.entries(VIEW_QUERY_PARAMS)) {
    it(`${view}: GET only, documented selectors, rejects unknown and duplicate keys`, () => {
      const operation = apiOperations.find((op) => op.path === `/api/v1/views/${view}`)!;
      expect(operation.method).toBe('GET');
      expect(operation.parameters.map((p) => p.name).sort()).toEqual([...keys].sort());
      expect(new Set(keys).size).toBe(keys.length);
      const file = fs.readFileSync(
        path.resolve(import.meta.dirname, `../../app/api/v1/views/${view}/route.ts`),
        'utf8',
      );
      expect(file).not.toMatch(
        /export\s+(?:async\s+)?(?:function|const)\s+(?:POST|PUT|PATCH|DELETE)\b/,
      );
      expect(() => validateParams(new URLSearchParams('surprise=1'), keys)).toThrow();
      if (keys.length > 0)
        expect(() =>
          validateParams(new URLSearchParams(`${keys[0]}=a&${keys[0]}=b`), keys),
        ).toThrow();
    });
  }
  it('rejects impossible dates, unsafe identifiers and unsafe numeric dictionaries', () => {
    expect(() => parseDateParam('2026-02-30', 'date')).toThrow();
    expect(() =>
      parseNumberParam('9007199254740992', 'runId', 0, { integer: true, min: 1 }),
    ).toThrow();
    expect(() => parseNumberMap('{"__proto__":1}', 'costs')).toThrow();
    expect(() => parseNumberMap('{"h200":-1}', 'costs')).toThrow();
  });
  it('compares exact run entries and rejects partial or reversed ranges', () => {
    expect(comparisonSelections(new URLSearchParams('dates=2026-01-02~r123'))).toEqual([
      { entry: '2026-01-02~r123', date: '2026-01-02', runId: '123' },
    ]);
    expect(() =>
      comparisonSelections(new URLSearchParams('start=2026-03-01&end=2026-01-01')),
    ).toThrow();
    expect(() => comparisonSelections(new URLSearchParams('start=2026-03-01'))).toThrow();
  });
});
