import { type NextRequest, NextResponse } from 'next/server';

import { errorStatus, getDataset } from '@/lib/operatorx/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(_request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    return NextResponse.json(await getDataset(runId), {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('OperatorX run read', error);
    const message = error instanceof Error ? error.message : 'OperatorX run unavailable';
    return NextResponse.json({ error: message }, { status: errorStatus(error) });
  }
}
