import type { NextRequest } from 'next/server';

import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';

import { getChangelogDatesInRange } from '@semianalysisai/inferencex-db/queries/workflow-info';

import type { WorkflowChangelogDate, WorkflowInfoResponse } from '@/lib/api/api';
import { cachedJson, cachedQuery } from '@/lib/cache/api-cache';
import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

async function loadWorkflowChangelogs(from: string, to: string, benchmarkType?: 'agentic_traces') {
  const dates = benchmarkType
    ? await getChangelogDatesInRange(getDb(), from, to, benchmarkType)
    : await getChangelogDatesInRange(getDb(), from, to);
  return { dates };
}

const getCachedWorkflowChangelogs = cachedQuery(loadWorkflowChangelogs, 'workflow-changelogs-v1');

function fixtureDates(from: string, to: string): WorkflowChangelogDate[] {
  const info = loadFixture<WorkflowInfoResponse>('workflow-info');
  const dates = [...new Set(info.changelogs.map((c) => c.date))]
    .filter((d) => d >= from && d <= to)
    .toSorted();
  return dates.map((date) => ({
    date,
    runs: info.runs.filter((r) => r.date === date),
    changelogs: info.changelogs.filter((c) => c.date === date),
    runConfigs: info.runConfigs ?? [],
  }));
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const benchmarkType =
    params.get('benchmarkType') === 'agentic_traces' ? 'agentic_traces' : undefined;
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return publicApiError(PUBLIC_API_ERRORS.invalidDate, 400);
  }
  if (FIXTURES_MODE) return cachedJson(request, { dates: fixtureDates(from, to) });

  try {
    return cachedJson(request, await getCachedWorkflowChangelogs(from, to, benchmarkType));
  } catch (error) {
    console.error('Error fetching workflow changelogs:', error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}
