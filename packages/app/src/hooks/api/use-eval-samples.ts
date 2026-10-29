import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  type EvalSamplesFilter,
  type EvalSamplesLiveContext,
  fetchEvalSamples,
  fetchEvalSamplesLive,
} from '@/lib/api/api';

interface UseEvalSamplesArgs {
  evalResultId: number | null;
  liveContext?: EvalSamplesLiveContext | null;
  filter: EvalSamplesFilter;
  offset: number;
  limit: number;
  docId?: number | null;
}

export function useEvalSamples({
  evalResultId,
  liveContext,
  filter,
  offset,
  limit,
  docId,
}: UseEvalSamplesArgs) {
  const useLive = evalResultId !== null && evalResultId <= 0 && Boolean(liveContext);
  const useDb = evalResultId !== null && evalResultId > 0;

  return useQuery({
    queryKey: useLive
      ? ['eval-samples-live', liveContext, filter, offset, limit]
      : ['eval-samples', evalResultId, filter, offset, limit, docId],
    queryFn: ({ signal }) =>
      useLive
        ? fetchEvalSamplesLive(liveContext!, filter, offset, limit, signal)
        : fetchEvalSamples(evalResultId!, filter, offset, limit, docId, signal),
    enabled: useDb || useLive,
    placeholderData: keepPreviousData,
  });
}
