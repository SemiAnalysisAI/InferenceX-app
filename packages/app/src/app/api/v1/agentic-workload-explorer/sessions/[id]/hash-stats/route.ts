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

export const GET = withExplorerRoute(async ({ vis, params }) => {
  const { id } = params;

  if (vis !== null) {
    const session = await getSessionById(id, vis);
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }
  }

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
