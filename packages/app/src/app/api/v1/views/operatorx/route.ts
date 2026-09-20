import { GET as run } from '@/app/api/v1/operatorx/runs/[runId]/route';
import { GET as runs } from '@/app/api/v1/operatorx/runs/route';
import { precision, selectOperatorPoints, shape, x } from '@/components/operatorx/view-data';
import { cachedJson } from '@/lib/api-cache';
import { runViewsRoute } from '@/lib/views-api/errors';
import {
  parseEnumParam,
  parseNumberParam,
  validateParams,
  validateParams as validateViewParams,
} from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import { readResponse } from '@/lib/views-api/source';
import type {
  OperatorXDataset,
  OperatorXRunSummary,
} from '@semianalysisai/inferencex-db/operatorx/reader';
import type { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const OPERATOR_PARAMS = [
  'runId',
  'operator',
  'precision',
  'shape',
  'backend',
  'cluster',
  'status',
  'metric',
  'page',
] as const;
export function GET(request: NextRequest) {
  return runViewsRoute('operatorx', async () => {
    validateViewParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS['operatorx']);
    const s = request.nextUrl.searchParams;
    validateParams(s, OPERATOR_PARAMS);
    let runId = s.has('runId')
      ? String(parseNumberParam(s.get('runId'), 'runId', 0, { min: 1, integer: true }))
      : undefined;
    if (!runId) {
      const list = await readResponse<{ runs: OperatorXRunSummary[] }>(await runs(request));
      runId = list.runs.find((r) => r.measured > 0)?.run_id ?? list.runs[0]?.run_id;
    }
    const dataset = runId
      ? await readResponse<OperatorXDataset>(
          await run(request, { params: Promise.resolve({ runId }) }),
        )
      : null;
    const points = dataset?.points ?? [];
    const kinds = [...new Set(points.map((p) => p.type))];
    const operator = parseEnumParam(
      s.get('operator'),
      'operator',
      ['gemm', 'attention_mha', 'attention_mla', 'moe_gemm'],
      kinds[0] ?? 'gemm',
    );
    const metric = parseEnumParam(s.get('metric'), 'metric', ['tflops', 'latency'], 'tflops');
    const status = parseEnumParam(
      s.get('status'),
      'status',
      ['ok', 'unsupported', 'error', 'missing', 'all'],
      'ok',
    );
    const filters = {
      precision: s.get('precision') ?? '',
      shape: s.get('shape') ?? '',
      backend: s.get('backend') ?? '',
      cluster: s.get('cluster') ?? '',
      status: status === 'all' ? '' : status,
    };
    const filtered = selectOperatorPoints(points, operator, filters, metric);
    const page = Math.min(
      parseNumberParam(s.get('page'), 'page', 0, { min: 0, integer: true }),
      Math.max(0, Math.ceil(filtered.length / 100) - 1),
    );
    const plotted = filtered.filter(
      (p) =>
        p.status === 'ok' &&
        x(p) > 0 &&
        (metric === 'latency' ? p.latency_us !== null : p.tflops !== null),
    );
    return cachedJson({
      apiVersion: 'v1',
      view: 'operatorx',
      params: { runId: runId ?? null, operator, metric, ...filters, status, page },
      run: dataset?.run ?? null,
      total: filtered.length,
      rows: filtered.slice(page * 100, (page + 1) * 100),
      points: plotted.map((p) => ({
        x: x(p),
        y: metric === 'latency' ? p.latency_us : p.tflops,
        source: p,
      })),
      options: {
        operators: kinds,
        ...Object.fromEntries(
          ['precision', 'shape', 'backend', 'cluster'].map((key) => [
            key,
            [
              ...new Set(
                points
                  .filter((p) => p.type === operator)
                  .map((p) =>
                    key === 'precision'
                      ? precision(p)
                      : key === 'shape'
                        ? shape(p)
                        : p[key as 'backend' | 'cluster'],
                  ),
              ),
            ].toSorted(),
          ]),
        ),
      },
    });
  });
}
