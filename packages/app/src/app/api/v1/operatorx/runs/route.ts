import { NextResponse } from 'next/server';

import { cachedJson, operatorXCacheTag } from '@/lib/api-cache';
import { errorMessage, errorStatus, listRuns, sourceName } from '@/lib/operatorx/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(_request?: Request) {
  try {
    return cachedJson(
      { source: sourceName(), runs: await listRuns() },
      { tag: operatorXCacheTag() },
    );
  } catch (error) {
    console.error('OperatorX run list', error);
    return NextResponse.json(
      { error: errorMessage(error, 'OperatorX runs unavailable') },
      { status: errorStatus(error) },
    );
  }
}
