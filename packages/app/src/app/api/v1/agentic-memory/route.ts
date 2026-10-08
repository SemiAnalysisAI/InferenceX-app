import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@semianalysisai/inferencex-db/connection';
import { getAgenticMemory } from '@semianalysisai/inferencex-db/queries/agentic-memory';
import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';
const read = cachedQuery((id: number) => getAgenticMemory(getDb(), id), 'agentic-memory-v1');

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const raw = params.get('id') ?? '';
  const id = Number(raw);
  if (
    [...params.keys()].some((key) => key !== 'id') ||
    params.getAll('id').length !== 1 ||
    !/^\d+$/u.test(raw) ||
    !Number.isSafeInteger(id) ||
    id <= 0
  ) {
    return NextResponse.json(
      { error: 'A single positive integer id is required' },
      { status: 400 },
    );
  }
  try {
    const data = await read(id);
    return data ? cachedJson(data) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    console.error('Error fetching AgentX memory:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
