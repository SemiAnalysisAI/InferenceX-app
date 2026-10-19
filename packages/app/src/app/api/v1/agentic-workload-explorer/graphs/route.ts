import { createDirectDb, getDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import {
  computeAndCacheStatsKind,
  computeGraphsDataset,
  computeGraphsSubset,
  GRAPH_DATASET_KEYS,
  patchStatsCache,
  readStatsCache,
  statsCacheKey,
  type GraphDatasetKey,
} from '@semianalysisai/inferencex-db/proxytrace/stats';
import { CDN_CACHE_CONTROL, withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { jsonCamel } from '@/lib/agentic-workload-explorer/case';
import { parseModelFilter, parseTraceVersion } from '@/lib/agentic-workload-explorer/request';
import { coalesceCompute } from '@/lib/agentic-workload-explorer/stats-cache';

export const maxDuration = 300;

const KEY_SET = new Set<string>(GRAPH_DATASET_KEYS);

function parseInclude(raw: string | null): GraphDatasetKey[] {
  if (!raw) return [...GRAPH_DATASET_KEYS];
  const requested = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => KEY_SET.has(s)) as GraphDatasetKey[];
  return requested.length > 0 ? requested : [...GRAPH_DATASET_KEYS];
}

function subsetOf(full: Record<string, unknown>, include: GraphDatasetKey[]) {
  const out: Record<string, unknown> = {};
  for (const k of include) out[k] = full[k];
  return out;
}

export const GET = withExplorerRoute(async ({ vis, req }) => {
  const filter = parseModelFilter(req.nextUrl.searchParams);
  if (filter instanceof Response) return filter;
  const { model } = filter;
  const traceVersion = parseTraceVersion(req.nextUrl.searchParams);
  const include = parseInclude(req.nextUrl.searchParams.get('include'));

  if (model !== null) {
    const subset = await computeGraphsSubset(getDb(), include, vis, model, traceVersion);
    return jsonCamel(subset, { headers: { 'Cache-Control': CDN_CACHE_CONTROL } });
  }

  const key = statsCacheKey('graphs', vis, traceVersion);
  const cached = await readStatsCache(key);

  if (cached === 'missing-table') {
    const subset = await computeGraphsSubset(getDb(), include, vis, null, traceVersion);
    return jsonCamel(subset, { headers: { 'Cache-Control': CDN_CACHE_CONTROL } });
  }

  if (cached) {
    const cachedData = cached.data as Record<string, unknown>;
    const subset = subsetOf(cachedData, include);

    const missing = include.filter((k) => !(k in cachedData));
    if (missing.length > 0) {
      const filled = await Promise.all(
        missing.map((k) =>
          coalesceCompute(`${key}:${k}`, () =>
            computeGraphsDataset(getDb(), k, vis, null, traceVersion),
          ),
        ),
      );
      const patch: Record<string, unknown> = {};
      missing.forEach((k, i) => {
        patch[k] = filled[i];
        subset[k] = filled[i];
      });

      const directDb = createDirectDb();
      try {
        await patchStatsCache(directDb, key, patch);
      } finally {
        await directDb.destroy();
      }
    }

    return jsonCamel(subset, { headers: { 'Cache-Control': CDN_CACHE_CONTROL } });
  }

  const full = (await coalesceCompute(key, async () => {
    const db = createDirectDb();
    try {
      return await computeAndCacheStatsKind(db, 'graphs', vis, traceVersion);
    } finally {
      await db.destroy();
    }
  })) as Record<string, unknown>;
  const subset = subsetOf(full, include);
  return jsonCamel(subset, { headers: { 'Cache-Control': CDN_CACHE_CONTROL } });
});
