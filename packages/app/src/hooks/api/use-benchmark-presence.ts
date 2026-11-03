import { useQuery } from '@tanstack/react-query';

import type { BenchmarkPresence } from '@semianalysisai/inferencex-db/queries/benchmark-presence';

import { ApiRequestError } from '@/lib/api/api-request-error';
import { IdBitset } from '@/lib/benchmarks/benchmark-presence';

export interface BenchmarkPresenceSets {
  trace: IdBitset;
  log: IdBitset;
}

const PRESENCE_URL = '/api/v1/benchmark-presence';

export function useBenchmarkPresence(enabled: boolean) {
  return useQuery({
    queryKey: ['benchmark-presence'],
    queryFn: async ({ signal }): Promise<BenchmarkPresenceSets> => {
      const res = await fetch(PRESENCE_URL, { signal });
      if (!res.ok) {
        throw new ApiRequestError(`benchmark-presence ${res.status}`, res.status, PRESENCE_URL);
      }
      const { trace, log } = (await res.json()) as BenchmarkPresence;
      return { trace: new IdBitset(trace), log: new IdBitset(log) };
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
