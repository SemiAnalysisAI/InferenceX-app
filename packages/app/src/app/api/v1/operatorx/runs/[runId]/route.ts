import { type NextRequest, NextResponse } from 'next/server';
import { readOperatorXRun, OperatorXError } from '@/lib/operatorx-ingest';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    return NextResponse.json(await readOperatorXRun(runId, request.nextUrl.hostname), {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('OperatorX run read', error);
    return NextResponse.json(
      { error: 'OperatorX run unavailable' },
      { status: error instanceof OperatorXError ? error.status : 503 },
    );
  }
}
