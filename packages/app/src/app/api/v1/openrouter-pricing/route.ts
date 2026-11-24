import { NextResponse } from 'next/server';

import { cachedJson } from '@/lib/cache/api-cache';
import {
  getOpenRouterPricing,
  OPENROUTER_PRICING_REVALIDATE_SECONDS,
} from '@/lib/calculator/openrouter-pricing.server';

export const dynamic = 'force-dynamic';

const CACHE_CONTROL = `public, max-age=0, s-maxage=${OPENROUTER_PRICING_REVALIDATE_SECONDS}, stale-while-revalidate=3600`;

/**
 * GET /api/v1/openrouter-pricing
 *
 * OpenRouter list prices for the catalog's models, for the dashboard's OpenRouter price source.
 * Browsers no longer download OpenRouter's whole model list (about 1 MB) or depend on reaching
 * openrouter.ai. The read-only views API applies the same prices with `priceSource=openrouter`.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    return cachedJson(request, await getOpenRouterPricing(), {
      cacheControl: CACHE_CONTROL,
      compression: 'cdn',
    });
  } catch (error) {
    console.error('Error fetching OpenRouter pricing:', error);
    return NextResponse.json(
      { error: 'OpenRouter pricing is unavailable right now' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
