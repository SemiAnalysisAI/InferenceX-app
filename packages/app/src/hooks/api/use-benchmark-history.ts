import { useQuery } from '@tanstack/react-query';

import { fetchBenchmarkHistory } from '@/lib/api';
import { withSupplementalBenchmarkHistory } from '@/lib/supplemental-benchmarks';

/**
 * Full benchmark history for one model + sequence — every run date, not just
 * the latest. This is a large response (single-digit MB for a well-swept
 * model), so `enabled` matters: pass `false` until a consumer actually needs it.
 */
export function useBenchmarkHistory(
  model: string,
  isl: number,
  osl: number,
  options?: {
    /** Agentic traces have no fixed sequence, so they ignore isl/osl entirely. */
    benchmarkType?: 'agentic_traces';
    /** Trim to the calculator's metric allowlist. Not safe for measured-power charts. */
    view?: 'calculator';
    /** Gate the fetch. Defaults to true; combined with the model/isl/osl check. */
    enabled?: boolean;
  },
) {
  const { benchmarkType, view } = options ?? {};
  return useQuery({
    // Both discriminators are part of the key: these responses have different
    // shapes and must never share a cache entry.
    queryKey: ['benchmark-history', model, isl, osl, benchmarkType ?? 'fixed', view ?? 'full'],
    queryFn: async ({ signal }) =>
      withSupplementalBenchmarkHistory(
        await fetchBenchmarkHistory(model, isl, osl, signal, benchmarkType, view),
        { model, isl, osl, benchmarkType },
      ),
    enabled:
      Boolean(model && (benchmarkType === 'agentic_traces' || (isl && osl))) &&
      (options?.enabled ?? true),
  });
}
