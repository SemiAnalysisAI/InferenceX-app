import { timingSafeEqual } from 'crypto';

import { NextResponse } from 'next/server';

import { purgeAll } from '@/lib/api-cache';

export async function POST(request: Request) {
  const secret = process.env.INVALIDATE_SECRET;
  const authHeader = request.headers.get('Authorization') ?? '';
  const expected = `Bearer ${secret}`;

  if (
    !secret ||
    authHeader.length !== expected.length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const blobsDeleted = await purgeAll();

  return NextResponse.json({ invalidated: true, blobsDeleted });
}
