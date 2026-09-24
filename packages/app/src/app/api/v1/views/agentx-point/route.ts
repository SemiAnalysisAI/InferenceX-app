import type { NextRequest } from 'next/server';
import { GET as availability } from '@/app/api/v1/trace-availability/route';
import { GET as requests } from '@/app/api/v1/request-chart-data/route';
import { GET as metrics } from '@/app/api/v1/trace-server-metrics/route';
import { GET as source } from '@/app/api/v1/trace-server-metric-source/route';
import {
  phaseBoundarySec,
  sliceRequestChartDataByPhase,
  sliceServerSeriesByPhase,
  timelineHasWarmup,
  type ServerSeriesLike,
} from '@/components/inference/agentic-point/phase-slice';
import type { MetricSourceSeries, TraceServerMetrics } from '@/hooks/api/use-trace-server-metrics';
import { cachedJson } from '@/lib/api-cache';
import { decodeRequestChartData, type RequestChartDataWire } from '@/lib/request-chart-data';
import { integerParam, requiredText } from '@/lib/views-api/detail-params';
import { runViewsRoute, ViewsApiParamError, ViewsUpstreamError } from '@/lib/views-api/errors';
import { parseEnumParam, parseListParam, validateParams } from '@/lib/views-api/params';
import { agentxCharts } from '@/lib/views-api/agentx-charts';
import type { ThroughputSeriesKey } from '@/components/inference/agentic-point/time-series-math';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import { readResponse, sourceRequest } from '@/lib/views-api/source';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Do not leak unsliced wire aliases (promptTps/generationTps) beside scoped series. */
function chartSeries(series: ServerSeriesLike): ServerSeriesLike {
  return {
    kvCacheUsage: series.kvCacheUsage,
    prefixCacheHitRate: series.prefixCacheHitRate,
    queueDepth: series.queueDepth,
    promptTokensBySource: series.promptTokensBySource,
    prefillTps: series.prefillTps,
    decodeTps: series.decodeTps,
    prefixCacheHitsTps: series.prefixCacheHitsTps,
    hostKvCacheUsage: series.hostKvCacheUsage,
    kvCacheUsageByEngine: series.kvCacheUsageByEngine,
  };
}

export function GET(request: NextRequest) {
  return runViewsRoute('agentx-point', async () => {
    const s = request.nextUrl.searchParams;
    validateParams(s, VIEW_QUERY_PARAMS['agentx-point']);
    const id = integerParam(s, 'id', undefined, 1);
    const phase = parseEnumParam(
      s.get('phase'),
      'phase',
      ['warmup', 'profiling', 'all'],
      'profiling',
    );
    const sourceId = s.has('source') ? requiredText(s, 'source') : 'all';
    const percentile = parseEnumParam(s.get('percentile'), 'percentile', ['p75', 'p90'], 'p90');
    const latencyMetric = parseEnumParam(
      s.get('latencyMetric'),
      'latencyMetric',
      ['ttft', 'e2e'],
      'ttft',
    );
    const throughput = (
      s.has('throughput')
        ? parseListParam(s.get('throughput'), 'throughput', ['input', 'decode'])
        : ['input', 'decode']
    ) as ThroughputSeriesKey[];
    if (throughput.length === 0)
      throw new ViewsApiParamError('throughput', 'Select input, decode, or both');
    const params = { id, phase, source: sourceId, percentile, latencyMetric, throughput };
    const identity = { id: String(id) };
    const available = await readResponse<Record<string, boolean>>(
      await availability(sourceRequest(request, '/api/v1/trace-availability', { ids: String(id) })),
    );
    if (available[id] !== true) throw new ViewsUpstreamError(404);
    const wire = await readResponse<RequestChartDataWire>(
      await requests(sourceRequest(request, '/api/v1/request-chart-data', identity)),
    );
    const decoded = decodeRequestChartData(wire);
    // A run can have request telemetry without server metrics. Preserve that absence.
    const metricsResponse = await metrics(
      sourceRequest(request, '/api/v1/trace-server-metrics', identity),
    );
    const server =
      metricsResponse.status === 404
        ? null
        : await readResponse<TraceServerMetrics>(metricsResponse);
    let base: ServerSeriesLike | null = server ? chartSeries(server) : null;
    if (sourceId !== 'all') {
      if (!server?.metricSources.some((entry) => entry.source.id === sourceId)) {
        throw new ViewsApiParamError('source', 'Select a source ID from metricSources');
      }
      const selected = await readResponse<MetricSourceSeries>(
        await source(
          sourceRequest(request, '/api/v1/trace-server-metric-source', {
            ...identity,
            source: sourceId,
          }),
        ),
      );
      base = chartSeries({
        ...selected,
        prefillTps: selected.promptTps,
        decodeTps: selected.generationTps,
      });
    }
    const effectivePhase =
      phase === 'all' ? 'all' : timelineHasWarmup(decoded) ? phase : 'profiling';
    const boundarySec = phaseBoundarySec(server, decoded);
    const requestData =
      effectivePhase === 'all' ? decoded : sliceRequestChartDataByPhase(decoded, effectivePhase);
    const serverData =
      base && server
        ? effectivePhase === 'all'
          ? { series: base, durationS: server.durationS }
          : sliceServerSeriesByPhase(base, effectivePhase, boundarySec, server.durationS)
        : null;
    return cachedJson({
      view: 'agentx-point',
      apiVersion: 'v1',
      params: { ...params, effectivePhase },
      requestData,
      serverData,
      charts: agentxCharts(
        requestData,
        serverData?.series ?? null,
        percentile,
        latencyMetric,
        throughput,
      ),
      boundarySec,
      meta: server?.meta ?? null,
      metricSources: server?.metricSources ?? [],
      kvCachePoolTokens: server?.kvCachePoolTokens ?? null,
      origins: { requestStartNs: decoded.startNs, serverStartNs: server?.startNs ?? null },
    });
  });
}
