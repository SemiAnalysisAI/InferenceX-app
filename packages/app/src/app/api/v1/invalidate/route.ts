import { NextResponse } from 'next/server';

import { bearerMatches } from '@/lib/bearer-auth';

import { COLLECTIVEX_CACHE_SCOPE, purgeAll, purgeCollectiveX } from '@/lib/api-cache';

export async function POST(request: Request) {
  const secret = process.env.INVALIDATE_SECRET;
  const authHeader = request.headers.get('Authorization') ?? '';
  // The shared staging deployment is already protected by Vercel. Its CI
  // caller must present the project-scoped automation bypass before Vercel
  // forwards this header to the route, so a second app secret is redundant.
  // Keep this exception branch-specific; production and every other preview
  // continue to require INVALIDATE_SECRET below.
  const isProtectedStagingRequest =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'staging' &&
    Boolean(request.headers.get('x-vercel-protection-bypass'));

  if (!isProtectedStagingRequest && (!secret || !bearerMatches(authHeader, secret))) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // ?scope=collectivex purges only the CollectiveX cache scope; the default
  // remains a full purge (which covers CollectiveX too).
  const scope = new URL(request.url).searchParams.get('scope');
  if (scope && scope !== COLLECTIVEX_CACHE_SCOPE) {
    return NextResponse.json({ error: 'unknown scope' }, { status: 400 });
  }
  if (scope === COLLECTIVEX_CACHE_SCOPE) {
    purgeCollectiveX();
    return NextResponse.json({ invalidated: true, scope });
  }

  const blobsDeleted = await purgeAll();
  return NextResponse.json({ invalidated: true, blobsDeleted });
}
