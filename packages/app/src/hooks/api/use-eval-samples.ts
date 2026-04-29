import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { fetchEvalSamples, type EvalSamplesFilter } from '@/lib/api';

interface UseEvalSamplesArgs {
  evalResultId: number | null;
  filter: EvalSamplesFilter;
  offset: number;
  limit: number;
}

/**
 * Fetch a paginated slice of eval samples for one `eval_results` row.
 *
 * Disabled when `evalResultId` is null or non-positive — the unofficial-run
 * synthetic id (-1) won't trigger a fetch since there's no DB row to read.
 *
 * `keepPreviousData` keeps the prior page rendered while the next page loads,
 * so paging through samples doesn't flash the empty state.
 */
export function useEvalSamples({ evalResultId, filter, offset, limit }: UseEvalSamplesArgs) {
  return useQuery({
    queryKey: ['eval-samples', evalResultId, filter, offset, limit],
    queryFn: ({ signal }) => fetchEvalSamples(evalResultId!, filter, offset, limit, signal),
    enabled: evalResultId !== null && evalResultId > 0,
    placeholderData: keepPreviousData,
  });
}
