import type { AvailabilityRow } from '@/lib/api/api';
import { cachedReadRoute } from '@/lib/api/cached-read-route';
import { compactAvailability } from '@/lib/benchmarks/compact-availability';
import { withSupplementalAvailability } from '@/lib/benchmarks/supplemental-benchmarks';
import { getCachedAvailability } from '@/lib/compare/compare-availability';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';

/**
 * The dashboards read availability here. It holds the `/api/v1/availability` rows plus
 * the supplemental datasets, one entry per line with its dates as runs
 * (`compact-availability.ts`). A cold fill reads the cache slot the published route
 * owns, so both share one query.
 */
export const GET = cachedReadRoute({
  cacheKey: 'availability-compact',
  fetch: async () =>
    compactAvailability(withSupplementalAvailability(await getCachedAvailability())),
  fixture: () =>
    compactAvailability(
      withSupplementalAvailability(loadFixture<AvailabilityRow[]>('availability')),
    ),
  logLabel: 'compact availability',
});
