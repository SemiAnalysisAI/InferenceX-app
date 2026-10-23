import {
  getPrecomputedSessionHashStats,
  getSessionById,
  getSessionHashBlockMetadata,
  iterateSessionHashChainPages,
} from '@semianalysisai/inferencex-db/proxytrace/operations';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import {
  createHashMetricsAccumulator,
  inferHashBlockSizeFromCounts,
} from '@/lib/agentic-workload-explorer/hash-metrics';

export const maxDuration = 300;

/**
 * Theoretical upper bound cache hit rate for one session: walks the BPE
 * chain-hash trie over every request in the session and sums cached vs total
 * prefix tokens. The trie has no eviction / no TTL, so the result is the
 * highest hit rate achievable in a perfect cache.
 *
 * Loaded only when a user explicitly requests the value from the sessions
 * list, keeping the heavy per-session trie walk out of the main query and
 * preventing ordinary pagination from shipping hundreds of MB of hash IDs.
 */
export const GET = withExplorerRoute(async ({ vis, params }) => {
  const { id } = params;

  // Mirror the visibility check the rest of `/api/sessions/[id]/*` uses — keeps
  // anon-only viewers from probing for session existence via this endpoint.
  if (vis !== null) {
    const session = await getSessionById(id, vis);
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }
  }

  // The snapshot is static, so every session's value was computed once into
  // session_hash_stats; only fall back to walking the chains for a missing row.
  const precomputed = await getPrecomputedSessionHashStats(id);
  if (precomputed) {
    const { hashCached, hashTotal } = precomputed;
    return { hashCached, hashTotal, hitRate: hashTotal > 0 ? (hashCached / hashTotal) * 100 : 0 };
  }

  const metadata = await getSessionHashBlockMetadata(id, vis);
  const blockSize = metadata
    ? (inferHashBlockSizeFromCounts(metadata.hashCount, metadata.hashTokenCount) ?? 64)
    : 64;
  const accumulator = createHashMetricsAccumulator(blockSize);

  for await (const page of iterateSessionHashChainPages(id, vis)) {
    for (const row of page) {
      accumulator.add({
        requestId: row.id,
        hashIds: row.hashIds,
        hashTokenCount: row.hashTokenCount,
      });
    }
  }

  const { hashCached, hashTotal } = accumulator.totals();

  return {
    hashCached,
    hashTotal,
    hitRate: hashTotal > 0 ? (hashCached / hashTotal) * 100 : 0,
  };
});
