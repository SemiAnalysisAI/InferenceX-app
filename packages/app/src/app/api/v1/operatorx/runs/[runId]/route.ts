import { type NextRequest, NextResponse } from 'next/server';

import { cachedJson, operatorXCacheTag } from '@/lib/api-cache';
import { errorStatus, getDataset } from '@/lib/operatorx/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(_request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    return cachedJson(await getDataset(runId), { tag: operatorXCacheTag() });
  } catch (error) {
    console.error('OperatorX run read', error);
    const message = error instanceof Error ? error.message : 'OperatorX run unavailable';
    return NextResponse.json({ error: message }, { status: errorStatus(error) });
  }
}
