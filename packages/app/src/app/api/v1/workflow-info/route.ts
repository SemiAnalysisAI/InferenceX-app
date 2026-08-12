import { type NextRequest, NextResponse } from 'next/server';

import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getChangelogByDate,
  getDateConfigs,
  getRunConfigsByDate,
  getWorkflowRunsByDate,
} from '@semianalysisai/inferencex-db/queries/workflow-info';

import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';

async function loadWorkflowInfo(date: string, benchmarkType?: 'agentic_traces') {
  const sql = getDb();
  const [runs, changelogs, configs, runConfigs] = await Promise.all([
    getWorkflowRunsByDate(sql, date),
    getChangelogByDate(sql, date),
    getDateConfigs(sql, date),
    benchmarkType ? getRunConfigsByDate(sql, date, benchmarkType) : getRunConfigsByDate(sql, date),
  ]);
  return { runs, changelogs, configs, runConfigs };
}

// Preserve the established public cache and response for calls without a
// scenario. Scenario-scoped calls use a separate cache namespace.
const getCachedWorkflowInfo = cachedQuery(
  (date: string) => loadWorkflowInfo(date),
  'workflow-info',
);
const getCachedScenarioWorkflowInfo = cachedQuery(
  (date: string) => loadWorkflowInfo(date, 'agentic_traces'),
  'workflow-info-scenario',
);

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? '';
  const benchmarkType =
    request.nextUrl.searchParams.get('benchmarkType') === 'agentic_traces'
      ? 'agentic_traces'
      : undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    return NextResponse.json(
      { error: 'Invalid date format (YYYY-MM-DD required)' },
      { status: 400 },
    );
  }
  if (FIXTURES_MODE) return cachedJson(loadFixture('workflow-info'));

  try {
    const data = benchmarkType
      ? await getCachedScenarioWorkflowInfo(date)
      : await getCachedWorkflowInfo(date);
    return cachedJson(data);
  } catch (error) {
    console.error('Error fetching workflow info:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
