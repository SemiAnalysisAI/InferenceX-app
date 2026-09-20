import { GET as videoRuns } from '@/app/api/video-runs/route';
import { servingCells } from '@/components/video-benchmark/serving';
import { storedBundle, type StoredArtifact } from '@/components/video-benchmark/stored';
import {
  efficiencyValue,
  latencyValue,
  tradeoffCurves,
  tradeoffPoints,
  type DeploymentCost,
} from '@/components/video-benchmark/tradeoff';
import { selectVideoEvidence } from '@/components/video-benchmark/view-selection';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';
import {
  parseEnumParam,
  parseNumberParam,
  validateParams,
  validateParams as validateViewParams,
} from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import { readResponse, sourceRequest } from '@/lib/views-api/source';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const headers = { 'Cache-Control': 'private, no-store' };
function serializePoint({
  run: evidenceRun,
  ...point
}: ReturnType<typeof tradeoffPoints>[number] & { x: number | null; y: number | null }) {
  return {
    ...point,
    run: {
      exportRun: evidenceRun.exportRun,
      artifact: evidenceRun.artifact,
      manifestSha256: evidenceRun.bundle.manifestSha256,
    },
  };
}

/** Published CI evidence only. Never accepts URLs, local bundles, or credentials. */
export function GET(request: NextRequest) {
  return runViewsRoute('video', async () => {
    validateViewParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS['video']);
    const s = request.nextUrl.searchParams;
    validateParams(s, [
      'run',
      'artifact',
      'page',
      'compare',
      'source',
      'cell',
      'workload',
      'xAxis',
      'yAxis',
      'selected',
      'costs',
      'phase',
      'gpuBasis',
      'slot',
      'view',
    ]);
    const numeric = (key: string) =>
      s.has(key)
        ? String(parseNumberParam(s.get(key), key, 0, { min: 1, integer: true }))
        : undefined;
    const run = numeric('run'),
      artifact = numeric('artifact');
    const page = String(parseNumberParam(s.get('page'), 'page', 1, { min: 1, integer: true }));
    if (artifact && !run) throw new ViewsApiParamError('run', 'run is required with artifact');
    const response = await videoRuns(
      sourceRequest(request, '/api/video-runs', {
        run,
        artifact,
        page,
        format: artifact ? 'published' : undefined,
      }),
    );
    if (response.status === 204) return new NextResponse(null, { status: 204, headers });
    const payload = await readResponse<StoredArtifact>(response);
    if (!artifact)
      return NextResponse.json(
        { view: 'video', apiVersion: 'v1', params: { run, page }, discovery: payload },
        { headers },
      );
    const refs = s.get('compare')?.split(',').filter(Boolean) ?? [];
    if (
      refs.length > 8 ||
      refs.some(
        (ref) =>
          !/^[1-9]\d*:[1-9]\d*$/.test(ref) ||
          ref.split(':').some((n) => !Number.isSafeInteger(Number(n))),
      )
    )
      throw new ViewsApiParamError('compare', 'Expected up to eight run:artifact pairs');
    const saved = [payload];
    for (const ref of new Set(refs)) {
      const [r, a] = ref.split(':');
      if (r === run && a === artifact) continue;
      saved.push(
        await readResponse<StoredArtifact>(
          await videoRuns(
            sourceRequest(request, '/api/video-runs', { run: r, artifact: a, format: 'published' }),
          ),
        ),
      );
    }
    const runs = saved.flatMap((item) =>
      item.sources
        .filter((source) => !source.kind)
        .map((source) => ({
          bundle: storedBundle(source),
          exportRun: item.runId,
          artifact: String(item.artifact.id),
        })),
    );
    const all = runs.flatMap(tradeoffPoints);
    const source = s.get('source') ?? payload.sources[0]?.id ?? null;
    const selectedSource = payload.sources.find((item) => item.id === source);
    if (source && !selectedSource)
      throw new ViewsApiParamError(
        'source',
        'Unknown published source',
        payload.sources.map((item) => item.id),
      );
    const workloads = [...new Map(all.map((p) => [p.group, p.workloadLabel])).entries()];
    const workload =
      s.get('workload') ??
      all.find((p) => p.sourceId === source)?.group ??
      workloads[0]?.[0] ??
      null;
    if (workload && !workloads.some(([key]) => key === workload))
      throw new ViewsApiParamError('workload', 'Unknown workload');
    const points = all.filter((p) => p.group === workload);
    const xAxis = parseEnumParam(
      s.get('xAxis'),
      'xAxis',
      ['p90', 'median'],
      points.some((p) => p.role === 'serving') &&
        !points.some((p) => latencyValue(p, 'p90') !== null)
        ? 'median'
        : 'p90',
    );
    const yAxis = parseEnumParam(
      s.get('yAxis'),
      'yAxis',
      ['dollar', 'clipsGpu', 'secondsGpu', 'clipsAllocatedGpu', 'secondsAllocatedGpu', 'energy'],
      'clipsGpu',
    );
    let costs: Record<string, DeploymentCost> = {};
    if (s.has('costs')) {
      try {
        const input: unknown = JSON.parse(s.get('costs')!);
        if (
          !input ||
          Array.isArray(input) ||
          typeof input !== 'object' ||
          Object.keys(input).length > 100
        )
          throw new Error('Invalid deployment cost');
        for (const value of Object.values(input)) {
          if (
            !value ||
            typeof value !== 'object' ||
            typeof value.hourly !== 'string' ||
            !Number.isFinite(Number(value.hourly)) ||
            Number(value.hourly) < 0 ||
            typeof value.source !== 'string' ||
            typeof value.date !== 'string'
          )
            throw new Error('Invalid deployment cost');
        }
        costs = input as Record<string, DeploymentCost>;
      } catch {
        throw new ViewsApiParamError(
          'costs',
          'Expected a JSON object of point IDs to {hourly,source,date} strings',
        );
      }
    }
    const plotted = points.flatMap((p) => {
      const x = latencyValue(p, xAxis),
        y = efficiencyValue(p, yAxis, costs[p.id]);
      return p.completeWorkload && x !== null && y !== null ? [{ ...p, x, y }] : [];
    });
    const selected =
      s.get('selected') ?? points.find((p) => p.sourceId === source)?.id ?? points[0]?.id ?? null;
    const phase = parseEnumParam(
      s.get('phase'),
      'phase',
      ['measurement', 'startup', 'warmup'],
      'measurement',
    );
    const gpuBasis = parseEnumParam(
      s.get('gpuBasis'),
      'gpuBasis',
      ['participating', 'allocated'],
      'participating',
    );
    const view = parseEnumParam(s.get('view'), 'view', ['results', 'tradeoff'], 'results');
    const cell = s.get('cell'),
      slot = s.get('slot');
    const evidence = selectedSource
      ? selectVideoEvidence(selectedSource, { cell, slot, phase, gpuBasis })
      : null;
    const selectedPoint = points.find((point) => point.id === selected);
    return NextResponse.json(
      {
        view: 'video',
        apiVersion: 'v1',
        params: {
          run,
          artifact,
          page,
          compare: refs,
          source,
          cell,
          slot,
          view,
          workload,
          xAxis,
          yAxis,
          selected,
          costs,
          phase,
          gpuBasis,
        },
        sources: payload.sources,
        workloads,
        evidence,
        serving: runs.map((r) => ({
          run: r.exportRun,
          artifact: r.artifact,
          cells: servingCells(r.bundle),
        })),
        points: plotted.map(serializePoint),
        selectedPoint: selectedPoint
          ? serializePoint({
              ...selectedPoint,
              x: latencyValue(selectedPoint, xAxis),
              y: efficiencyValue(selectedPoint, yAxis, costs[selectedPoint.id]),
            })
          : null,
        curves: Object.fromEntries(
          Object.entries(tradeoffCurves(plotted)).map(([key, curve]) => [
            key,
            curve.map(serializePoint),
          ]),
        ),
      },
      { headers },
    );
  });
}
