import { useQuery } from '@tanstack/react-query';
import type { ImageAgePoint, ImageFilters } from '@/components/latest-image/image-age';
import { ApiRequestError } from '@/lib/api/api-request-error';

export function useImageAgeHistory(filters: ImageFilters, asOf: string, enabled: boolean) {
  return useQuery({
    queryKey: ['image-age-history', filters, asOf],
    enabled,
    queryFn: async ({ signal }): Promise<{ ageHistory: ImageAgePoint[] }> => {
      const params = new URLSearchParams({
        ...filters,
        frameworks: filters.frameworks.join(','),
        asOf,
        includeHistory: 'true',
      });
      const url = `/api/v1/views/current-inferencex-image?${params}`;
      const response = await fetch(url, { signal });
      if (!response.ok) {
        throw new ApiRequestError(
          `Image history request failed: ${response.status}`,
          response.status,
          url,
        );
      }
      return response.json();
    },
  });
}
