import { bulkIdsFetcher, useBulkIdsQuery } from './benchmark-id-query';

export interface DerivedAgenticMetric {
  id: number;
  /** Mean across sessions of e2e time (Σ per-turn request_latency) rescaled
   *  by mean_load / session_load. Null when the JSONL had no usable records. */
  normalized_session_time_s: number | null;
  /** P90 of per-turn ISL/TTFT across every turn in every session.
   *  Null when no prefill rates could be computed. */
  p90_prefill_tps_per_user: number | null;
  /** P75 normalized per-request E2E at a fixed 400-token output length. */
  p75_normalized_e2e_400_s: number | null;
  /** P90 normalized per-request E2E at a fixed 400-token output length. */
  p90_normalized_e2e_400_s: number | null;
}

export type DerivedAgenticMetricMap = Record<number, DerivedAgenticMetric>;

const MAX_IDS_PER_REQUEST = 200;

export function chunkDerivedAgenticMetricIds(ids: number[]): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
    chunks.push(ids.slice(i, i + MAX_IDS_PER_REQUEST));
  }
  return chunks;
}

const fetchChunk = bulkIdsFetcher<DerivedAgenticMetric>('derived-agentic-metrics');

// Unlike the other bulk endpoints, dashboards can put >200 agentic points on
// screen at once, so this fetcher splits the id set across parallel requests
// to stay under the route's MAX_IDS_PER_REQUEST.
async function fetchDerivedAgenticMetrics(
  ids: number[],
  signal?: AbortSignal,
): Promise<DerivedAgenticMetricMap> {
  if (ids.length === 0) return {};
  const maps = await Promise.all(
    chunkDerivedAgenticMetricIds(ids).map((chunk) => fetchChunk(chunk, signal)),
  );
  return Object.assign({}, ...maps) as DerivedAgenticMetricMap;
}

/**
 * Fetch per-id derived agentic metrics (session time + p90 prefill TPS/user)
 * computed live from the stored aiperf profile_export.jsonl. Used to drive
 * the "Session Time" and "Prefill TPS/user" chart variants.
 *
 * Ids without a trace_replay blob (older or non-aiperf agentic runs) are
 * silently omitted from the response.
 */
export function useDerivedAgenticMetrics(ids: number[], enabled = true) {
  return useBulkIdsQuery('derived-agentic-metrics', ids, enabled, fetchDerivedAgenticMetrics);
}
