import { useQuery } from '@tanstack/react-query';

import { fetchFeedbackList } from '@/lib/api';

export function useFeedbackList() {
  return useQuery({
    queryKey: ['feedback-list'],
    queryFn: ({ signal }) => fetchFeedbackList(signal),
    staleTime: 20_000,
  });
}
