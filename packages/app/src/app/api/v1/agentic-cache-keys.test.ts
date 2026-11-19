import { describe, expect, it, vi } from 'vitest';

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: vi.fn(() => 'mock-sql'),
  FIXTURES_MODE: false,
}));

vi.mock('@/lib/cache/api-cache', () => ({
  cachedQuery: (fn: (...args: unknown[]) => unknown) => fn,
  cachedJson: (_request: Request, data: unknown) => Response.json(data),
}));

import { STATS_VERSION } from '@semianalysisai/inferencex-db/queries/agentic-aggregates';
import { REQUEST_TIMELINE_VERSION } from '@semianalysisai/inferencex-db/etl/compute-request-timeline';
import { CHART_SERIES_VERSION } from '@semianalysisai/inferencex-db/etl/compute-chart-series';
import { REQUEST_CHART_DATA_VERSION } from '@semianalysisai/inferencex-db/queries/request-chart-data';
import { TRACE_SERVER_METRICS_VERSION } from '@semianalysisai/inferencex-db/queries/trace-server-metrics';

import { CACHE_KEY_PREFIX as agenticAggregatesKey } from './agentic-aggregates/route';
import { CACHE_KEY_PREFIX as requestTimelineKey } from './request-timeline/route';
import { CACHE_KEY_PREFIX as requestChartDataKey } from './request-chart-data/route';
import { CACHE_KEY_PREFIX as traceServerMetricSourceKey } from './trace-server-metric-source/route';
import { CACHE_KEY_PREFIX as traceServerMetricsKey } from './trace-server-metrics/route';
import { CACHE_KEY_PREFIX as traceHistogramsKey } from './trace-histograms/route';
import { CACHE_KEY_PREFIX as residentSequenceLengthsKey } from './resident-sequence-lengths/route';

describe('agentic blob-cache keys are version-derived', () => {
  it('agentic-aggregates key embeds STATS_VERSION', () => {
    expect(agenticAggregatesKey).toBe(`agentic-aggregates-v${STATS_VERSION}`);
  });

  it('request-timeline key embeds REQUEST_TIMELINE_VERSION', () => {
    expect(requestTimelineKey).toBe(`request-timeline-v${REQUEST_TIMELINE_VERSION}`);
  });

  it('request-chart-data key embeds REQUEST_CHART_DATA_VERSION', () => {
    expect(requestChartDataKey).toBe(`request-chart-data-v${REQUEST_CHART_DATA_VERSION}`);
  });

  it('trace-server-metrics key embeds its composite response version', () => {
    expect(traceServerMetricsKey).toBe(`trace-server-metrics-v${TRACE_SERVER_METRICS_VERSION}`);
  });

  it('trace-server-metric-source key embeds CHART_SERIES_VERSION', () => {
    expect(traceServerMetricSourceKey).toBe(`trace-server-metric-source-v${CHART_SERIES_VERSION}`);
  });

  it('trace-histograms key embeds REQUEST_TIMELINE_VERSION (its payload is read from request_timeline)', () => {
    expect(traceHistogramsKey).toBe(`trace-histograms-v${REQUEST_TIMELINE_VERSION}`);
  });

  it('resident-sequence-lengths key embeds STATS_VERSION', () => {
    expect(residentSequenceLengthsKey).toBe(`resident-sequence-lengths-v${STATS_VERSION}`);
  });

  it('every key actually contains a version segment (no unversioned literals)', () => {
    for (const key of [
      agenticAggregatesKey,
      requestTimelineKey,
      requestChartDataKey,
      traceServerMetricsKey,
      traceServerMetricSourceKey,
      traceHistogramsKey,
      residentSequenceLengthsKey,
    ]) {
      expect(key).toMatch(/-v\d+$/u);
    }
  });
});
