/**
 * Guards that every agentic blob-cache key is DERIVED from the version constant
 * that governs its payload — not a hand-written string. `blobSet` is write-once
 * and nothing purges the blob cache after a backfill, so an unversioned (or
 * hand-bumped) key would serve stale data forever after a payload-version bump.
 * Deriving the key from the constant means a future bump rolls the cache
 * namespace automatically; these tests fail loudly if a route drifts back to a
 * literal string.
 */

import { describe, expect, it, vi } from 'vitest';

// Route modules call getDb() at import time via cachedQuery's closure and pull
// in the blob cache — stub both so importing the route is side-effect-free.
vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: vi.fn(() => 'mock-sql'),
  FIXTURES_MODE: false,
}));

vi.mock('@/lib/api-cache', () => ({
  // Passthrough so importing the route doesn't touch blob storage; the key is
  // still exported as CACHE_KEY_PREFIX for us to assert on.
  cachedQuery: (fn: (...args: unknown[]) => unknown) => fn,
  cachedJson: (data: unknown) => Response.json(data),
}));

import { STATS_VERSION } from '@semianalysisai/inferencex-db/queries/agentic-aggregates';
import { REQUEST_TIMELINE_VERSION } from '@semianalysisai/inferencex-db/etl/compute-request-timeline';
import { TRACE_SERVER_METRICS_VERSION } from '@semianalysisai/inferencex-db/queries/trace-server-metrics';

import { CACHE_KEY_PREFIX as derivedAgenticMetricsKey } from './derived-agentic-metrics/route';
import { CACHE_KEY_PREFIX as agenticAggregatesKey } from './agentic-aggregates/route';
import { CACHE_KEY_PREFIX as requestTimelineKey } from './request-timeline/route';
import { CACHE_KEY_PREFIX as traceServerMetricsKey } from './trace-server-metrics/route';
import { CACHE_KEY_PREFIX as traceHistogramsKey } from './trace-histograms/route';

describe('agentic blob-cache keys are version-derived', () => {
  it('derived-agentic-metrics key embeds STATS_VERSION', () => {
    expect(derivedAgenticMetricsKey).toBe(`derived-agentic-metrics-v${STATS_VERSION}`);
  });

  it('agentic-aggregates key embeds STATS_VERSION', () => {
    expect(agenticAggregatesKey).toBe(`agentic-aggregates-v${STATS_VERSION}`);
  });

  it('request-timeline key embeds REQUEST_TIMELINE_VERSION', () => {
    expect(requestTimelineKey).toBe(`request-timeline-v${REQUEST_TIMELINE_VERSION}`);
  });

  it('trace-server-metrics key embeds its composite response version', () => {
    expect(traceServerMetricsKey).toBe(`trace-server-metrics-v${TRACE_SERVER_METRICS_VERSION}`);
  });

  it('trace-histograms key embeds REQUEST_TIMELINE_VERSION (its payload is read from request_timeline)', () => {
    expect(traceHistogramsKey).toBe(`trace-histograms-v${REQUEST_TIMELINE_VERSION}`);
  });

  it('every key actually contains a version segment (no unversioned literals)', () => {
    for (const key of [
      derivedAgenticMetricsKey,
      agenticAggregatesKey,
      requestTimelineKey,
      traceServerMetricsKey,
      traceHistogramsKey,
    ]) {
      expect(key).toMatch(/-v\d+$/u);
    }
  });
});
