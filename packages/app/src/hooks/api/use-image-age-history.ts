import { useQuery } from '@tanstack/react-query';
import type { ImageAgePoint, ImageFilters } from '@/components/latest-image/image-age';

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
      const response = await fetch(`/api/v1/views/current-inferencex-image?${params}`, { signal });
      if (!response.ok) throw new Error(`Image history request failed: ${response.status}`);
      return response.json();
    },
  });
}
