import { type NextRequest, NextResponse } from 'next/server';

import { errorMessage, errorStatus, getTimelines } from '@/lib/operatorx/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const OPS = new Set(['gemm', 'moe']);
const REF = /^[\w.-]{1,128}:\d+$/;
const MAX_REFS = 32;

/**
 * Kernel timelines of results named `runId:index` (comma-separated `r`). A run's
 * results never change, so a response is cacheable for good.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const op = params.get('op') ?? '';
  if (!OPS.has(op)) return NextResponse.json({ error: 'op must be gemm or moe' }, { status: 400 });
  const refs = (params.get('r') ?? '').split(',').filter(Boolean);
  if (refs.length === 0 || refs.length > MAX_REFS || !refs.every((r) => REF.test(r)))
    return NextResponse.json(
      { error: `r must list 1-${MAX_REFS} runId:index refs` },
      { status: 400 },
    );
  try {
    const timelines = await getTimelines(op as 'gemm' | 'moe', refs);
    return NextResponse.json(timelines, {
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable' },
    });
  } catch (error) {
    console.error('OperatorX timelines', error);
    return NextResponse.json(
      { error: errorMessage(error, 'OperatorX timelines unavailable') },
      { status: errorStatus(error) },
    );
  }
}
