import type { NextRequest } from 'next/server';

import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';

import {
  getChangelogByDate,
  getDateConfigs,
  getRunConfigsByDate,
  getWorkflowRunsByDate,
} from '@semianalysisai/inferencex-db/queries/workflow-info';

import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/public-api-errors';
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

// Scenario is an explicit cache dimension: fixed-sequence and Agentic Traces
// requests for the same date must never share a cached runConfigs payload.
const getCachedWorkflowInfo = cachedQuery(loadWorkflowInfo, 'workflow-info-v2');

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? '';
  const benchmarkType =
    request.nextUrl.searchParams.get('benchmarkType') === 'agentic_traces'
      ? 'agentic_traces'
      : undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    return publicApiError(PUBLIC_API_ERRORS.invalidDate, 400);
  }
  if (FIXTURES_MODE) return cachedJson(loadFixture('workflow-info'));

  try {
    const data = await getCachedWorkflowInfo(date, benchmarkType);
    return cachedJson(data);
  } catch (error) {
    console.error('Error fetching workflow info:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}
