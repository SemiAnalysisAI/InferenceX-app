import { getCachedBenchmarkPresence } from '@/lib/benchmarks/benchmark-presence.server';
import { cachedJson } from '@/lib/cache/api-cache';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    return cachedJson(request, await getCachedBenchmarkPresence());
  } catch (error) {
    console.error('Error fetching benchmark presence:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}
