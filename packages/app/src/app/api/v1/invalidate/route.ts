import { NextResponse } from 'next/server';

import { bearerMatches } from '@/lib/api/bearer-auth';

import {
  COLLECTIVEX_CACHE_SCOPE,
  OPERATORX_CACHE_SCOPE,
  purgeAll,
  purgeCollectiveX,
  purgeOperatorX,
} from '@/lib/cache/api-cache';

export async function POST(request: Request) {
  const secret = process.env.INVALIDATE_SECRET;
  const authHeader = request.headers.get('Authorization') ?? '';
  const isProtectedStagingRequest =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'staging' &&
    Boolean(request.headers.get('x-vercel-protection-bypass'));

  if (!isProtectedStagingRequest && (!secret || !bearerMatches(authHeader, secret))) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const scope = new URL(request.url).searchParams.get('scope');
  if (scope && scope !== COLLECTIVEX_CACHE_SCOPE && scope !== OPERATORX_CACHE_SCOPE) {
    return NextResponse.json({ error: 'unknown scope' }, { status: 400 });
  }
  if (scope === COLLECTIVEX_CACHE_SCOPE) {
    purgeCollectiveX();
    return NextResponse.json({ invalidated: true, scope });
  }
  if (scope === OPERATORX_CACHE_SCOPE) {
    purgeOperatorX();
    return NextResponse.json({ invalidated: true, scope });
  }

  const blobsDeleted = await purgeAll();
  return NextResponse.json({ invalidated: true, blobsDeleted });
}
