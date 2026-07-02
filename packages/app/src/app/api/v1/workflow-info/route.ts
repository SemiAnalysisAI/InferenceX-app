import { type NextRequest } from 'next/server';

import { FIXTURES_MODE, JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import {
  getChangelogByDate,
  getDateConfigs,
  getRunConfigsByDate,
  getWorkflowRunsByDate,
} from '@semianalysisai/inferencex-db/queries/workflow-info';

import { cachedJson } from '@/lib/api-cache';
import { createCachedRoute } from '@/lib/create-cached-route';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';

const _handle = createCachedRoute(
  async (date: string) => {
    if (JSON_MODE) {
      return {
        runs: jsonProvider.getWorkflowRunsByDate(date),
        changelogs: jsonProvider.getChangelogByDate(date),
        configs: jsonProvider.getDateConfigs(date),
        runConfigs: jsonProvider.getRunConfigsByDate(date),
      };
    }
    const sql = getDb();
    const [runs, changelogs, configs, runConfigs] = await Promise.all([
      getWorkflowRunsByDate(sql, date),
      getChangelogByDate(sql, date),
      getDateConfigs(sql, date),
      getRunConfigsByDate(sql, date),
    ]);
    return { runs, changelogs, configs, runConfigs };
  },
  'workflow-info',
  {
    resource: 'workflow info',
    parseParams: (request: NextRequest) => {
      const date = request.nextUrl.searchParams.get('date') ?? '';
      if (date && !/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
        return {
          error: 'Invalid date format (YYYY-MM-DD required)',
          status: 400,
        };
      }
      return { args: [date] as [string] };
    },
  },
);

export function GET(request: NextRequest): Promise<Response> {
  if (FIXTURES_MODE) return Promise.resolve(cachedJson(loadFixture('workflow-info')));
  return _handle(request);
}
