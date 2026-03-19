import { NextResponse } from 'next/server';

import { getCacheVersion } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  const v = await getCacheVersion();
  return NextResponse.json(
    { v },
    {
      headers: {
        'CDN-Cache-Control': 's-maxage=60',
      },
    },
  );
}
