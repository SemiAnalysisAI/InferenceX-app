import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  type EvalSamplesFilter,
  type EvalSamplesLiveContext,
  fetchEvalSamples,
  fetchEvalSamplesLive,
} from '@/lib/api';

interface UseEvalSamplesArgs {
  /** `eval_results.id` for an ingested run; `<= 0` (typically -1) signals "use live fetch". */
  evalResultId: number | null;
  /** Required when `evalResultId <= 0`; identifies the GHA artifact to download. */
  liveContext?: EvalSamplesLiveContext | null;
  filter: EvalSamplesFilter;
  offset: number;
  limit: number;
}

/**
 * Fetch a paginated slice of eval samples for one eval row.
 *
 * Two backends, picked automatically:
 * - `evalResultId > 0` → `/api/v1/eval-samples` (reads `eval_samples` table)
 * - `evalResultId <= 0` AND `liveContext` provided → `/api/v1/eval-samples-live`
 *   (downloads the matching workflow artifact from GitHub Actions on demand)
 *
 * Both return the same `EvalSamplesResponse` shape so the drawer doesn't need
 * to know which path served it.
 *
 * `keepPreviousData` keeps the prior page rendered while the next page loads,
 * so paging through samples doesn't flash the empty state.
 */
export function useEvalSamples({
  evalResultId,
  liveContext,
  filter,
  offset,
  limit,
}: UseEvalSamplesArgs) {
  const useLive = evalResultId !== null && evalResultId <= 0 && Boolean(liveContext);
  const useDb = evalResultId !== null && evalResultId > 0;

  return useQuery({
    queryKey: useLive
      ? ['eval-samples-live', liveContext, filter, offset, limit]
      : ['eval-samples', evalResultId, filter, offset, limit],
    queryFn: ({ signal }) =>
      useLive
        ? fetchEvalSamplesLive(liveContext!, filter, offset, limit, signal)
        : fetchEvalSamples(evalResultId!, filter, offset, limit, signal),
    enabled: useDb || useLive,
    placeholderData: keepPreviousData,
  });
}
