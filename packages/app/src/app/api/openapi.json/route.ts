import { NextResponse } from 'next/server';

import { buildOpenApiDocument } from '@/lib/api-documentation';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json(buildOpenApiDocument(), {
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
