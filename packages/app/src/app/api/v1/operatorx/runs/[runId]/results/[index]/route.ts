import { type NextRequest, NextResponse } from 'next/server';

import { errorStatus, getResultDetail } from '@/lib/operatorx/service';

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
    return NextResponse.json(await getResultDetail(runId, Number(index)), {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('OperatorX result read', error);
    return NextResponse.json(
      { error: 'OperatorX result unavailable' },
      { status: errorStatus(error) },
    );
  }
}
