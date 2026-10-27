import { NextResponse } from 'next/server';

import {
  CommittedResultsError,
  loadCommittedRun,
  resolveResultsCommit,
} from '@semianalysisai/inferencex-db/collectivex/committed-results';
import { getCollectiveXWriteDb } from '@semianalysisai/inferencex-db/connection';
import { upsertCollectiveXRun } from '@semianalysisai/inferencex-db/queries/collectivex';

import { bearerMatches } from '@/lib/api/bearer-auth';
import { purgeCollectiveX } from '@/lib/cache/api-cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// One commit is a few GitHub API calls plus one raw read per result file.
export const maxDuration = 300;

const SHA = /^[0-9a-f]{7,40}$/u;
const REF = /^(?!.*\.\.)[\w./-]{1,255}$/u;

const ERROR_STATUS = { invalid: 422, 'not-found': 404, unavailable: 502 } as const;

/** `{sha}` or `{ref}`, exactly one; null when the body is anything else. */
function targetOf(body: unknown): string | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const { sha, ref, ...rest } = body as { sha?: unknown; ref?: unknown };
  if (Object.keys(rest).length > 0 || (sha === undefined) === (ref === undefined)) return null;
  if (sha !== undefined) return typeof sha === 'string' && SHA.test(sha) ? sha : null;
  return typeof ref === 'string' && REF.test(ref) ? ref : null;
}

/**
 * Store one InferenceX commit's committed CollectiveX results in the CollectiveX
 * database and purge the CollectiveX cache scope. The InferenceX workflow that
 * runs on pushes to main calls this. The ref resolves to the newest commit at or
 * before it that changed collectivex/results/, which must be on main; storing the
 * same commit again replaces its run.
 */
export async function POST(request: Request) {
  const secret = process.env.COLLECTIVEX_ADMIN_SECRET;
  if (!secret) {
    return new NextResponse('COLLECTIVEX_ADMIN_SECRET is not set', { status: 500 });
  }
  if (!bearerMatches(request.headers.get('Authorization') ?? '', secret)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let target: string | null;
  try {
    target = targetOf(await request.json());
  } catch {
    target = null;
  }
  if (target === null) {
    return NextResponse.json(
      { error: 'Body must be {"sha": "<commit>"} or {"ref": "<branch or tag>"}' },
      { status: 400 },
    );
  }

  const token = process.env.GITHUB_TOKEN || undefined;
  try {
    const commit = await resolveResultsCommit(target, { token });
    const { run, docs } = await loadCommittedRun(commit, { token });
    const result = await upsertCollectiveXRun(getCollectiveXWriteDb(), run, docs);
    if (result === 'conflict') {
      return NextResponse.json(
        { error: `Run ${run.run_id} already holds a different commit than ${commit.sha}` },
        { status: 409 },
      );
    }
    purgeCollectiveX();
    return NextResponse.json({
      ingested: result,
      run_id: run.run_id,
      source_sha: run.source_sha,
      generated_at: run.generated_at,
      version: run.version,
      requested_cases: run.summary.requested_cases,
      measured_cases: run.summary.measured_cases,
      documents: docs.length,
    });
  } catch (error) {
    if (error instanceof CommittedResultsError) {
      return NextResponse.json({ error: error.message }, { status: ERROR_STATUS[error.kind] });
    }
    console.error('Error ingesting CollectiveX results:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
