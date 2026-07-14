import { timingSafeEqual } from 'crypto';

import { NextResponse } from 'next/server';

import { purgeAll } from '@/lib/api-cache';

export async function POST(request: Request) {
  const secret = process.env.INVALIDATE_SECRET;
  const authHeader = request.headers.get('Authorization') ?? '';
  const expected = `Bearer ${secret}`;
  // The shared staging deployment is already protected by Vercel. Its CI
  // caller must present the project-scoped automation bypass before Vercel
  // forwards this header to the route, so a second app secret is redundant.
  // Keep this exception branch-specific; production and every other preview
  // continue to require INVALIDATE_SECRET below.
  const isProtectedStagingRequest =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'staging' &&
    Boolean(request.headers.get('x-vercel-protection-bypass'));

  if (
    !isProtectedStagingRequest &&
    (!secret ||
      authHeader.length !== expected.length ||
      !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected)))
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const blobsDeleted = await purgeAll();

  return NextResponse.json({ invalidated: true, blobsDeleted });
}
