import { GET as metrics } from '@/app/api/gpu-metrics/route';
import { buildCorrelationData, buildGroupedData } from '@/components/gpu-power/chart-data';
import {
  ALL_METRIC_OPTIONS,
  computeGpuStats,
  getAvailableMetrics,
  type GpuPowerApiResponse,
} from '@/components/gpu-power/types';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';
import {
  parseBoolParam,
  parseEnumParam,
  parseFreeListParam,
  parseNumberParam,
  validateParams as validateViewParams,
} from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import { readResponse, sourceRequest } from '@/lib/views-api/source';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Live metrics intentionally bypass both CDN and Blob caching. */
export function GET(request: NextRequest) {
  return runViewsRoute('gpu-metrics', async () => {
    validateViewParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS['gpu-metrics']);
    const s = request.nextUrl.searchParams;
    if (!s.get('runId')) throw new ViewsApiParamError('runId', 'runId is required');
    const runId = parseNumberParam(s.get('runId'), 'runId', 0, { min: 1, integer: true });
    const data = await readResponse<GpuPowerApiResponse>(
      await metrics(sourceRequest(request, '/api/gpu-metrics', { runId: String(runId) })),
    );
    const artifact = s.get('artifact') ?? data.artifacts[0]?.name;
    const selected = data.artifacts.find((a) => a.name === artifact);
    if (artifact && !selected)
      throw new ViewsApiParamError(
        'artifact',
        'Unknown artifact',
        data.artifacts.map((a) => a.name),
      );
    const rows = selected?.data ?? [];
    const availableMetrics = getAvailableMetrics(rows);
    const keys = ALL_METRIC_OPTIONS.map((m) => m.key);
    const metric = parseEnumParam(
      s.get('metric'),
      'metric',
      keys,
      availableMetrics[0]?.key ?? 'power',
    );
    const corrXMetric = parseEnumParam(s.get('corrXMetric'), 'corrXMetric', keys, 'power');
    const corrYMetric = parseEnumParam(s.get('corrYMetric'), 'corrYMetric', keys, 'temperature');
    const chartView = parseEnumParam(
      s.get('chartView'),
      'chartView',
      ['chart', 'correlation'],
      'chart',
    );
    const downsample = parseBoolParam(s.get('downsample'), 'downsample', true);
    const indices = [...new Set(rows.map((r) => r.index))].sort((a, b) => a - b);
    const requested = parseFreeListParam(s.get('gpus'));
    if (requested.some((g) => !/^\d+$/.test(g) || !indices.includes(Number(g))))
      throw new ViewsApiParamError('gpus', 'Expected available GPU indices', indices.map(String));
    const gpus = requested.length > 0 ? requested.map(Number) : indices;
    const sort = parseEnumParam(
      s.get('sort'),
      'sort',
      ['gpuIndex', 'count', 'min', 'max', 'mean', 'median', 'p95', 'p99', 'stddev'],
      'gpuIndex',
    );
    const direction = parseEnumParam(s.get('direction'), 'direction', ['asc', 'desc'], 'asc');
    // The UI statistics table uses all chips; chart visibility does not filter it.
    const stats = computeGpuStats(rows, metric).sort(
      (a, b) => (a[sort] - b[sort]) * (direction === 'asc' ? 1 : -1),
    );
    return NextResponse.json(
      {
        view: 'gpu-metrics',
        apiVersion: 'v1',
        params: {
          runId,
          artifact: artifact ?? null,
          metric,
          gpus,
          chartView,
          corrXMetric,
          corrYMetric,
          downsample,
          sort,
          direction,
        },
        runInfo: data.runInfo,
        artifacts: data.artifacts.map((a) => a.name),
        availableMetrics,
        gpuIndices: indices,
        rows: rows.filter((r) => gpus.includes(r.index)),
        stats,
        chart:
          chartView === 'chart'
            ? Object.fromEntries(buildGroupedData(rows, new Set(gpus), metric))
            : buildCorrelationData(rows, new Set(gpus), corrXMetric, corrYMetric),
        rendering: { maxInteractivePoints: downsample ? 2000 : null, rawRowsUnsampled: true },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  });
}
