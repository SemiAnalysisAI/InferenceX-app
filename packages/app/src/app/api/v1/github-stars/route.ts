import { NextResponse } from 'next/server';

import { cachedJson } from '@/lib/cache/api-cache';
import {
  getGitHubStars,
  GITHUB_STARS_REVALIDATE_SECONDS,
} from '@/lib/github/github-star-count.server';

export const dynamic = 'force-dynamic';

const CACHE_CONTROL = `public, max-age=0, s-maxage=${GITHUB_STARS_REVALIDATE_SECONDS}, stale-while-revalidate=86400`;

/**
 * GET /api/v1/github-stars
 *
 * Star count for the header and footer star buttons. Served from the server token and the CDN,
 * so browsers never call the GitHub API and cannot hit its unauthenticated per-IP rate limit.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    return cachedJson(request, await getGitHubStars(), {
      cacheControl: CACHE_CONTROL,
    });
  } catch (error) {
    console.error('Error fetching GitHub star count:', error);
    return NextResponse.json(
      { error: 'GitHub star count is unavailable right now' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
