import { rooflineBound } from '@/components/operatorx/compare/roofline-bound';
import type { NextRequest } from 'next/server';

import { cachedJson, operatorXCacheTag } from '@/lib/api-cache';
import { getComparison, isPartialComparison } from '@/lib/operatorx/service';
import { csvResponse } from '@/lib/views-api/csv';
import { runViewsRoute, ViewsApiParamError, ViewsUpstreamError } from '@/lib/views-api/errors';
import {
  parseEnumParam,
  parseFormatParam,
  parseFreeListParam,
  parseNumberParam,
  validateParams,
} from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import {
  type ComparisonOp,
  comparisonView,
  type ComparisonView,
} from '@semianalysisai/inferencex-db/operatorx/compare';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const OPS = ['gemm', 'moe', 'attention'] as const satisfies readonly ComparisonOp[];
const STATUSES = ['ok', 'unsupported', 'error', 'missing', 'all'] as const;
const PAGE_SIZE = 100;
/** The `parallel` value for one device, which has the empty split key. */
const ONE_DEVICE = '1';

/** One case on one GPU: the case as described once, plus that GPU's newest result. */
function flatten(view: ComparisonView, hardware: readonly string[]) {
  return view.cases.flatMap((c, i) =>
    hardware.flatMap((hw) => {
      const col = view.measurements[hw];
      const status = col?.status[i];
      // A GPU with no result for the case never ran it.
      if (!col || !status) return [];
      const latencyUs = col.latencyUs[i];
      const per = (v: number | null) =>
        v !== null && latencyUs !== null && latencyUs > 0 ? v / (latencyUs * 1e6) : null;
      const kernel = col.kernel[i];
      const bound = rooflineBound(c, hw);
      return [
        {
          case_key: c.key,
          op_type: c.opType,
          parallel: view.parallel,
          testlist: c.testlist,
          sources: c.sources.map((s) => ({ model: view.models[s.model], roles: s.roles })),
          shape: c.shape,
          precision: c.precision,
          compute_precision: c.computePrecision,
          x: c.x,
          dims: c.dims,
          flops: c.flops,
          bytes: c.bytes,
          hardware: hw,
          status,
          latency_us: latencyUs,
          tflops: per(c.flops),
          tb_s: per(c.bytes),
          roofline_us: bound?.us ?? null,
          roofline_share: bound && latencyUs ? bound.us / latencyUs : null,
          kernel: kernel === null ? null : view.kernels[kernel],
          cuda_graph: col.cudaGraph[i],
          run_id: col.runId[i],
          result_index: col.resultIndex[i],
          revision: col.revision[i],
        },
      ];
    }),
  );
}

type Row = ReturnType<typeof flatten>[number];

/** CSV cells are scalars: nested fields are flattened to readable text. */
function csvRow(row: Row): Record<string, unknown> {
  return {
    ...row,
    sources: row.sources.map((s) => `${s.model}: ${s.roles.join(' ')}`).join('; '),
    dims: Object.entries(row.dims)
      .map(([k, v]) => `${k}=${v}`)
      .join(' '),
  };
}

/** The dashboard page showing this selection. */
function pageUrl(op: ComparisonOp, view: ComparisonView): string {
  const q = new URLSearchParams(
    view.model ? { op: 'model', model: view.model } : { op, workload: view.workload ?? '' },
  );
  if (view.parallel) q.set('parallel', view.parallel);
  return `/operatorx?${q}`;
}

/**
 * GET /api/v1/views/operatorx
 *
 * OperatorX cross-hardware measurements as flat rows: one per case and GPU, each GPU's
 * newest stored result. Cases come from one workload source (default: the best-covered)
 * or every case one model contributes, at one device split.
 */
export function GET(request: NextRequest) {
  return runViewsRoute('operatorx', async () => {
    const s = request.nextUrl.searchParams;
    validateParams(s, VIEW_QUERY_PARAMS.operatorx);
    const format = parseFormatParam(s.get('format'));
    const op = parseEnumParam(s.get('op'), 'op', OPS, 'gemm');
    const status = parseEnumParam(s.get('status'), 'status', STATUSES, 'ok');
    if (s.has('workload') && s.has('model'))
      throw new ViewsApiParamError('model', 'Pass workload or model, not both');

    let comparison;
    try {
      comparison = await getComparison(op);
    } catch (error) {
      console.error('OperatorX view', error);
      throw new ViewsUpstreamError(503);
    }
    const workloadIds = comparison.workloads.map((w) => w.id);
    const workload = s.get('workload');
    if (workload && !workloadIds.includes(workload))
      throw new ViewsApiParamError('workload', `Unknown workload: ${workload}`, workloadIds);
    const modelParam = s.get('model');
    const model = modelParam
      ? comparison.models.find((m) => m.toLowerCase() === modelParam.toLowerCase())
      : null;
    if (modelParam && !model)
      throw new ViewsApiParamError('model', `Unknown model: ${modelParam}`, comparison.models);

    const scope = comparisonView(comparison, workload, model ?? null);
    const splits = scope.parallelOptions.map((o) => o.key || ONE_DEVICE);
    const parallelParam = s.get('parallel');
    if (parallelParam && !splits.includes(parallelParam))
      throw new ViewsApiParamError('parallel', `Unknown parallel: ${parallelParam}`, splits);
    const view = parallelParam
      ? comparisonView(
          comparison,
          workload,
          model ?? null,
          parallelParam === ONE_DEVICE ? '' : parallelParam,
        )
      : scope;

    const available = view.hardware.map((h) => h.id);
    const picked = parseFreeListParam(s.get('hardware'));
    const unknown = picked.find((h) => !available.includes(h));
    if (unknown)
      throw new ViewsApiParamError('hardware', `Unknown hardware: ${unknown}`, available);
    const hardware = picked.length > 0 ? picked : available;

    const rows = flatten(view, hardware).filter((r) => status === 'all' || r.status === status);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const page = parseNumberParam(s.get('page'), 'page', 0, { min: 0, integer: true });
    if (page >= pages)
      throw new ViewsApiParamError('page', `page must be below ${pages}`, [String(pages - 1)]);

    // A comparison missing an unreadable run is served but not cached.
    const cache = isPartialComparison(comparison)
      ? { cacheControl: 'no-store' }
      : { tag: operatorXCacheTag() };
    if (format === 'csv') return csvResponse(rows.map(csvRow), cache);
    return cachedJson(
      {
        view: 'operatorx',
        apiVersion: 'v1',
        params: {
          op,
          workload: view.workload,
          model: view.model,
          parallel: view.parallel || ONE_DEVICE,
          hardware,
          status,
          page,
          format,
        },
        options: {
          ops: OPS,
          workloads: comparison.workloads.map((w) => ({
            id: w.id,
            label: w.label,
            cases: w.cases,
            hardware: w.hardware,
          })),
          models: comparison.models,
          parallel: view.parallelOptions.map((o) => ({
            key: o.key || ONE_DEVICE,
            label: o.label,
            cases: o.cases,
          })),
          hardware: view.hardware.map((h) => ({ id: h.id, runner: h.runner, runs: h.runs })),
        },
        url: pageUrl(op, view),
        total: rows.length,
        pageSize: PAGE_SIZE,
        rows: rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
      },
      cache,
    );
  });
}
