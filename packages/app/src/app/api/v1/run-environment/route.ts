import { type NextRequest, NextResponse } from 'next/server';

import { FIXTURES_MODE, JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import { getEnvironmentForRunConfig } from '@semianalysisai/inferencex-db/queries/environments';

import { cachedJson, cachedQuery } from '@/lib/api-cache';
import { loadFixture } from '@/lib/test-fixtures';

export const dynamic = 'force-dynamic';

const getCachedEnvironment = cachedQuery(
  (workflowRunId: number, configId: number) => {
    if (JSON_MODE) {
      return Promise.resolve(jsonProvider.getEnvironmentForRunConfig(workflowRunId, configId));
    }
    return getEnvironmentForRunConfig(getDb(), workflowRunId, configId);
  },
  'run-environment',
  { blobOnly: true },
);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workflowRunId = Number(params.get('workflow_run_id'));
  const configId = Number(params.get('config_id'));

  if (!workflowRunId || !Number.isFinite(workflowRunId)) {
    return NextResponse.json(
      { error: 'workflow_run_id is required (positive integer)' },
      { status: 400 },
    );
  }
  if (!configId || !Number.isFinite(configId)) {
    return NextResponse.json(
      { error: 'config_id is required (positive integer)' },
      { status: 400 },
    );
  }

  if (FIXTURES_MODE) return cachedJson(loadFixture('run-environment'));

  try {
    const env = await getCachedEnvironment(workflowRunId, configId);
    if (env === null) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return cachedJson({ workflow_run_id: workflowRunId, config_id: configId, environment: env });
  } catch (error) {
    console.error('Error fetching benchmark environment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
