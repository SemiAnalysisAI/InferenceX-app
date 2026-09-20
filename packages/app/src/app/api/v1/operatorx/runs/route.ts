import { type NextRequest, NextResponse } from 'next/server';
import { discoverOperatorXRuns, OperatorXError } from '@/lib/operatorx-ingest';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  try {
    const result = await discoverOperatorXRuns(request.nextUrl.hostname);
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': result.discovery_complete
          ? 'public, s-maxage=60, stale-while-revalidate=60'
          : 'private, no-store',
      },
    });
  } catch (error) {
    console.error('OperatorX run discovery', error);
    return NextResponse.json(
      { error: 'OperatorX unavailable' },
      { status: error instanceof OperatorXError ? error.status : 503 },
    );
  }
}
