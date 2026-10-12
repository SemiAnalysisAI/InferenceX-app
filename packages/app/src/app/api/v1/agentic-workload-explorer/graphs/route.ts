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

// /graphs data is served pre-binned: the heavy binning + percentile math runs
// server-side (see packages/db/src/stats.ts, StatsCacheKind 'graphs') so the
// response is a small per-chart payload instead of raw per-request arrays.
// The `include=` subset selection is unchanged — charts still fetch only the
// dataset keys they render, deduped client-side by useGraphDataset.
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

  // ── Per-param caching decision ──────────────────────────────────────────
  //   • model=null (the default, and the ONLY combo the cron warms): served
  //     from stats_cache under the 'graphs' key. We compute+cache the WHOLE
  //     payload (all dataset keys) once per (scope, traceVersion) and slice out
  //     just the requested `include=` keys per response — so a hit never
  //     re-runs a query. Stale rows trigger a post-response warm; a cold miss
  //     computes+caches inline over the pooled pg driver.
  //   • ?model=<name> set: NOT cached. There are ~44 distinct, effectively
  //     free-form model values; caching each would explode the key space for a
  //     rarely-used filter. We instead live-compute ONLY the requested include
  //     keys over the Neon HTTP driver (getDb()) and return the SAME pre-binned
  //     shapes. DB cost is identical to the old raw path (same rows scanned),
  //     but the response is ~1000x smaller.
  if (model !== null) {
    const subset = await computeGraphsSubset(getDb(), include, vis, model, traceVersion);
    return jsonCamel(subset, { headers: { 'Cache-Control': CDN_CACHE_CONTROL } });
  }

  const key = statsCacheKey('graphs', vis, traceVersion);
  const cached = await readStatsCache(key);

  // migration 029 not yet applied — fall back to a live subset compute over HTTP.
  if (cached === 'missing-table') {
    const subset = await computeGraphsSubset(getDb(), include, vis, null, traceVersion);
    return jsonCamel(subset, { headers: { 'Cache-Control': CDN_CACHE_CONTROL } });
  }

  if (cached) {
    const cachedData = cached.data as Record<string, unknown>;
    const subset = subsetOf(cachedData, include);

    // Legacy/partial cache rows can lack a requested dataset. Repair it live,
    // coalesced per (cache key, dataset key), then persist all successful fills
    // as one atomic JSONB patch before returning.
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

  // Cold miss: compute + cache the full payload over pooled pg, serve the
  // subset. Coalesced per cache key so parallel cold-miss requests (the
  // graphs page fans out one fetch per dataset key) share ONE full compute
  // instead of each running the whole payload inline.
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
