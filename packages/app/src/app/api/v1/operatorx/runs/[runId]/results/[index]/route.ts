import { type NextRequest, NextResponse } from 'next/server';

import { cachedJson, operatorXCacheTag } from '@/lib/api-cache';
import { errorMessage, errorStatus, getResultDetail } from '@/lib/operatorx/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ runId: string; index: string }> },
) {
  try {
    const { runId, index } = await context.params;
    if (!/^[0-9]+$/u.test(index))
      return NextResponse.json({ error: 'Invalid result index' }, { status: 400 });
    return cachedJson(await getResultDetail(runId, Number(index)), { tag: operatorXCacheTag() });
  } catch (error) {
    console.error('OperatorX result read', error);
    return NextResponse.json(
      { error: errorMessage(error, 'OperatorX result unavailable') },
      { status: errorStatus(error) },
    );
  }
}
