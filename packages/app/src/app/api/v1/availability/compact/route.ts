import type { AvailabilityRow } from '@/lib/api/api';
import { cachedReadRoute } from '@/lib/api/cached-read-route';
import { compactAvailability } from '@/lib/benchmarks/compact-availability';
import { getCachedAvailability } from '@/lib/compare/compare-availability';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';

export const GET = cachedReadRoute({
  cacheKey: 'availability-compact',
  fetch: async () => compactAvailability(await getCachedAvailability()),
  fixture: () => compactAvailability(loadFixture<AvailabilityRow[]>('availability')),
  logLabel: 'compact availability',
});
