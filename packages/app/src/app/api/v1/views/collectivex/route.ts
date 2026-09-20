import { GET as run } from '@/app/api/v1/collectivex/runs/[runId]/route';
import { GET as runs } from '@/app/api/v1/collectivex/runs/route';
import {
  chartPoints,
  collectiveXKvChartPoints,
  collectiveXKvFrontierPoints,
  collectiveXKvIslValues,
  collectiveXKvOverlapPoints,
  collectiveXKvPageValues,
  collectiveXKvWireCeilings,
  collectiveXSeriesForRun,
  fitAlphaBeta,
  normalizeCollectiveXSku,
  seriesMatchesSelection,
} from '@/components/collectivex/data';
import { swapChartPoints, swapRooflines } from '@/components/collectivex/swap-data';
import { cachedJson } from '@/lib/api-cache';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';
import {
  assertRunIdList,
  parseEnumParam,
  parseListParam,
  parseNumberParam,
  parseRunIdListParam,
  validateParams as validateViewParams,
} from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import { readResponse, sourceRequest } from '@/lib/views-api/source';
import {
  COLLECTIVEX_DEFAULT_VERSION,
  COLLECTIVEX_VERSIONS,
  type CollectiveXDataset,
  type CollectiveXRunSummary,
} from '@semianalysisai/inferencex-db/collectivex/types';
import type { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export function GET(request: NextRequest) {
  return runViewsRoute('collectivex', async () => {
    validateViewParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS['collectivex']);
    const s = request.nextUrl.searchParams;
    const version = parseNumberParam(s.get('version'), 'version', COLLECTIVEX_DEFAULT_VERSION, {
      integer: true,
    });
    if (!(COLLECTIVEX_VERSIONS as readonly number[]).includes(version))
      throw new ViewsApiParamError('version', 'Unknown version', COLLECTIVEX_VERSIONS.map(String));
    const source = sourceRequest(request, '/api/v1/collectivex/runs', { version: String(version) });
    const list = await readResponse<{ runs: CollectiveXRunSummary[]; discovery_complete: boolean }>(
      await runs(source),
    );
    const suite = parseEnumParam(s.get('suite'), 'suite', ['all', 'ep', 'kv', 'swap'], 'all');
    const runIds = s.has('runs')
      ? parseRunIdListParam(s.get('runs'), 'runs')
      : [list.runs.find((r) => r.measured_cases > 0)?.run_id ?? list.runs[0]?.run_id].filter(
          (id): id is string => Boolean(id),
        );
    // The discovered default is validated too: a malformed run id in the run
    // list must fail loudly rather than fan out to an odd upstream path.
    assertRunIdList(runIds, 'runs');
    const datasets = await Promise.all(
      runIds.map(async (runId) =>
        readResponse<CollectiveXDataset>(await run(source, { params: Promise.resolve({ runId }) })),
      ),
    );
    const combined = datasets.flatMap((d, i) => collectiveXSeriesForRun(d.series, d.run.run_id, i));
    const epSizes = [...new Set(combined.map((item) => item.system.ep_size))].toSorted(
      (a, b) => a - b,
    );
    const epSize = parseNumberParam(
      s.get('epSize'),
      'epSize',
      epSizes.includes(8) ? 8 : (epSizes[0] ?? 8),
      { integer: true, min: 1 },
    );
    const phases = [
      ...new Set(
        combined.filter((item) => item.system.ep_size === epSize).map((item) => item.phase),
      ),
    ];
    const phase = parseEnumParam(
      s.get('phase'),
      'phase',
      ['decode', 'prefill'],
      phases.includes('decode') ? 'decode' : (phases[0] ?? 'decode'),
    );
    const availableModes = [
      ...new Set(
        combined
          .filter((item) => item.system.ep_size === epSize && item.phase === phase)
          .map((item) => item.mode),
      ),
    ];
    const modes = s.has('modes')
      ? parseListParam(s.get('modes'), 'modes', ['normal', 'low-latency'])
      : availableModes;
    const availablePrecisions = [
      ...new Set(
        combined
          .filter(
            (item) =>
              item.system.ep_size === epSize && item.phase === phase && modes.includes(item.mode),
          )
          .map((item) => item.precision),
      ),
    ].toSorted();
    const precision = parseEnumParam(
      s.get('precision'),
      'precision',
      ['fp8', 'bf16'],
      availablePrecisions.includes('fp8') ? 'fp8' : (availablePrecisions[0] ?? 'fp8'),
    );
    const operation = parseEnumParam(
      s.get('operation'),
      'operation',
      ['roundtrip', 'dispatch', 'combine'],
      'roundtrip',
    );
    const percentile = parseEnumParam(
      s.get('percentile'),
      'percentile',
      ['p50', 'p95', 'p99'],
      'p99',
    );
    const yAxis = parseEnumParam(
      s.get('yAxis'),
      'yAxis',
      ['latency', 'tokens-per-second', 'activation-rate', 'payload-rate'],
      'latency',
    );
    const sku = s.get('sku') ?? 'all',
      backend = s.get('backend') ?? 'all';
    const active = (key: string, id: string) => !s.has(key) || s.get(key)!.split(',').includes(id);
    const series = combined.filter(
      (item) =>
        seriesMatchesSelection(item, { epSize, phase, modes, precision }) &&
        (sku === 'all' || normalizeCollectiveXSku(item.system.sku) === sku) &&
        (backend === 'all' || item.backend === backend) &&
        active('activeSeries', item.series_id),
    );
    const cases = datasets
      .flatMap((d, i) => (d.kv ?? []).map((k) => ({ ...k, run_id: d.run.run_id, run_index: i })))
      .filter((k) => active('kvSeries', `${k.run_id}:${k.case_id}`));
    const pages = collectiveXKvPageValues(cases);
    const pageTokens = parseNumberParam(s.get('pageTokens'), 'pageTokens', pages[0] ?? 64, {
      integer: true,
      min: 1,
    });
    const kvOp = parseEnumParam(s.get('kvOp'), 'kvOp', ['pull', 'push'], 'pull');
    const kvX = parseEnumParam(s.get('kvX'), 'kvX', ['isl', 'batch', 'frontier', 'overlap'], 'isl');
    const kvY = parseEnumParam(s.get('kvY'), 'kvY', ['bandwidth', 'latency'], 'bandwidth');
    const overlapIsl =
      s.has('overlapIsl') && s.get('overlapIsl') !== 'max'
        ? parseNumberParam(s.get('overlapIsl'), 'overlapIsl', 1, { min: 1, integer: true })
        : undefined;
    const kvSelection = { op: kvOp, pageTokens, isl: overlapIsl };
    const kvPoints =
      kvX === 'frontier'
        ? collectiveXKvFrontierPoints(cases, kvSelection)
        : kvX === 'overlap'
          ? collectiveXKvOverlapPoints(cases, kvSelection)
          : collectiveXKvChartPoints(cases, { op: kvOp, pageTokens, x: kvX, y: kvY });
    const swapDirection = parseEnumParam(
      s.get('swapDirection'),
      'swapDirection',
      ['h2d', 'd2h', 'd2d'],
      'h2d',
    );
    const swapLayout = parseEnumParam(
      s.get('swapLayout'),
      'swapLayout',
      ['contiguous', 'random'],
      'contiguous',
    );
    const swapMetric = parseEnumParam(
      s.get('swapMetric'),
      'swapMetric',
      ['bandwidth', 'latency'],
      'bandwidth',
    );
    const swapPercentile = parseEnumParam(
      s.get('swapPercentile'),
      'swapPercentile',
      ['p50', 'p95', 'p99'],
      'p50',
    );
    const swapPoints = swapChartPoints(datasets, {
      direction: swapDirection,
      layout: swapLayout,
      metric: swapMetric,
      percentile: swapPercentile,
    }).filter((p) => active('swapSeries', p.seriesId));
    return cachedJson({
      apiVersion: 'v1',
      view: 'collectivex',
      params: {
        version,
        runs: runIds,
        suite,
        epSize,
        phase,
        modes,
        precision,
        operation,
        percentile,
        yAxis,
        sku,
        backend,
        activeSeries: series.map((item) => item.series_id),
        kvX,
        kvY,
        kvOp,
        pageTokens,
        overlapIsl: overlapIsl ?? 'max',
        kvSeries: cases.map((k) => `${k.run_id}:${k.case_id}`),
        swapDirection,
        swapLayout,
        swapMetric,
        swapPercentile,
        swapSeries: [...new Set(swapPoints.map((p) => p.seriesId))],
      },
      runs: list.runs.filter(
        (r) =>
          suite === 'all' ||
          (suite === 'kv'
            ? (r.kv_cases?.requested ?? 0) > 0
            : suite === 'swap'
              ? (r.swap_cases?.requested ?? 0) > 0
              : r.requested_cases - (r.kv_cases?.requested ?? 0) - (r.swap_cases?.requested ?? 0) >
                0),
      ),
      discoveryComplete: list.discovery_complete,
      coverage: datasets.map((d) => ({ runId: d.run.run_id, coverage: d.coverage })),
      ep: {
        series,
        points: chartPoints(series, operation, percentile, yAxis),
        fits: series.map((item) => ({
          seriesId: item.series_id,
          fit: fitAlphaBeta(item, operation, percentile),
        })),
      },
      kv: {
        cases,
        points: kvPoints,
        wireCeilings: Object.fromEntries(collectiveXKvWireCeilings(cases, kvOp)),
      },
      swap: { points: swapPoints, rooflines: swapRooflines(swapPoints, swapDirection) },
      options: {
        epSizes,
        phases,
        modes: availableModes,
        precisions: availablePrecisions,
        pageTokens: pages,
        overlapIsls: collectiveXKvIslValues(cases, kvSelection),
      },
    });
  });
}
