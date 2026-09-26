import { NextResponse } from 'next/server';

import { errorMessage, errorStatus, listRuns, sourceName } from '@/lib/operatorx/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(_request?: Request) {
  try {
    return NextResponse.json(
      { source: sourceName(), runs: await listRuns() },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' } },
    );
  } catch (error) {
    console.error('OperatorX run list', error);
    return NextResponse.json(
      { error: errorMessage(error, 'OperatorX runs unavailable') },
      { status: errorStatus(error) },
    );
  }
}
