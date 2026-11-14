import { queryOptions, useQuery } from '@tanstack/react-query';

import { fetchSubmissions } from '@/lib/api/api';

export function submissionsQueryOptions() {
  return queryOptions({
    queryKey: ['submissions'],
    queryFn: ({ signal }) => fetchSubmissions(signal),
  });
}

export function useSubmissions() {
  return useQuery(submissionsQueryOptions());
}
