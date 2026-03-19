import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@semianalysisai/inferencex-db/connection';
import {
  getChangelogByDate,
  getDateConfigs,
  getWorkflowRunsByDate,
} from '@semianalysisai/inferencex-db/queries/workflow-info';

import { cachedJson, cachedQuery } from '@/lib/api-cache';

export const dynamic = 'force-dynamic';

const getCachedWorkflowInfo = cachedQuery(async (date: string) => {
  const sql = getDb();
  const [runs, changelogs, configs] = await Promise.all([
    getWorkflowRunsByDate(sql, date),
    getChangelogByDate(sql, date),
    getDateConfigs(sql, date),
  ]);
  return { runs, changelogs, configs };
}, 'workflow-info');

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? '';
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'Invalid date format (YYYY-MM-DD required)' },
      { status: 400 },
    );
  }

  try {
    const data = await getCachedWorkflowInfo(date);
    return cachedJson(data);
  } catch (error) {
    console.error('Error fetching workflow info:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
