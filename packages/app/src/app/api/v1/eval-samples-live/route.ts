/**
 * DO NOT ADD CACHING (blob, CDN, or unstable_cache) to this route.
 * It fetches live GitHub Actions artifacts which change while a run is in progress —
 * same policy as `/api/unofficial-run`.
 */
import { type NextRequest, NextResponse } from 'next/server';

import { extractDemonstrations } from '@/lib/eval-sample-utils';
import {
  type EvalArtifactConfig,
  fetchAndParseSamples,
  findEvalSampleArtifact,
} from '@/lib/eval-samples-live';
import { fetchGithubRunArtifacts, getGithubToken } from '@/lib/github-artifacts';

export const dynamic = 'force-dynamic';

const ALLOWED_FILTERS = new Set(['all', 'passed', 'failed']);
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

/**
 * GET /api/v1/eval-samples-live
 *   ?run_id=<numeric>
 *   &task=<eval task, e.g. gsm8k>
 *   &model=<model key>
 *   &framework=<framework>
 *   &hardware=<hw key>
 *   &precision=<precision>
 *   &spec_method=<spec>
 *   &disagg=true|false
 *   &conc=<int>
 *   &filter=all|passed|failed
 *   &offset=0&limit=200
 *
 * Live-fetch path for unofficial runs. Locates the per-config eval artifact for
 * the requested workflow run, downloads it, parses `samples_<task>_*.jsonl`,
 * and returns the same response shape as `/api/v1/eval-samples` so the drawer
 * doesn't need to know which backend served it.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const runId = params.get('run_id') ?? '';
  const task = params.get('task') ?? '';
  const filterParam = params.get('filter') ?? 'all';
  const offset = Math.max(0, Math.trunc(Number(params.get('offset') ?? '0')));
  const requestedLimit = Math.trunc(Number(params.get('limit') ?? String(DEFAULT_LIMIT)));
  const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit || DEFAULT_LIMIT));

  if (!/^\d+$/u.test(runId)) {
    return NextResponse.json({ error: 'run_id must be a positive integer' }, { status: 400 });
  }
  if (!task) {
    return NextResponse.json({ error: 'task is required' }, { status: 400 });
  }
  if (!ALLOWED_FILTERS.has(filterParam)) {
    return NextResponse.json(
      { error: `filter must be one of: ${[...ALLOWED_FILTERS].join(', ')}` },
      { status: 400 },
    );
  }
  const filter = filterParam as 'all' | 'passed' | 'failed';

  const config: EvalArtifactConfig = {
    model: params.get('model') ?? '',
    framework: params.get('framework') ?? '',
    hardware: params.get('hardware') ?? '',
    precision: params.get('precision') ?? '',
    specMethod: params.get('spec_method') ?? '',
    disagg: params.get('disagg') === 'true',
    conc: params.get('conc') ? Number(params.get('conc')) : null,
  };
  for (const [k, v] of Object.entries(config)) {
    if (k === 'conc' || k === 'disagg') continue;
    if (!v) {
      return NextResponse.json({ error: `${k} is required` }, { status: 400 });
    }
  }

  const githubToken = getGithubToken();
  if (!githubToken) {
    return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 });
  }

  try {
    const artifacts = await fetchGithubRunArtifacts(runId, githubToken);
    const artifact = findEvalSampleArtifact(artifacts, config);
    if (!artifact) {
      return NextResponse.json(
        {
          samples: [],
          total: 0,
          passedTotal: 0,
          failedTotal: 0,
          source: 'github_artifact' as const,
        },
        { status: 200 },
      );
    }

    const allSamples = await fetchAndParseSamples(artifact, task, githubToken);
    if (!allSamples) {
      return NextResponse.json(
        {
          samples: [],
          total: 0,
          passedTotal: 0,
          failedTotal: 0,
          source: 'github_artifact' as const,
        },
        { status: 200 },
      );
    }

    // Compute pass/fail totals across the full set, then slice the requested filter.
    let passedTotal = 0;
    let failedTotal = 0;
    for (const s of allSamples) {
      if (s.passed === true) passedTotal++;
      else if (s.passed === false) failedTotal++;
    }
    const filtered =
      filter === 'passed'
        ? allSamples.filter((s) => s.passed === true)
        : filter === 'failed'
          ? allSamples.filter((s) => s.passed === false)
          : allSamples;
    const slice = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      samples: slice.map((s) => ({
        docId: s.docId,
        prompt: s.prompt,
        target: s.target,
        response: s.response,
        // For the live path we don't separately surface the unfiltered response
        // — pre-mapper data carries `resps[0][0]` inside `data`, but the shape
        // mirrors the DB route's "response equals raw" fallback so the drawer
        // renders cleanly.
        rawResponse: (s.data as Record<string, unknown>)?.resps ? extractRawResponse(s.data) : null,
        demonstrations: extractDemonstrations((s.data as Record<string, unknown>)?.arguments),
        passed: s.passed,
        score: s.score,
        metrics: s.metrics ?? {},
      })),
      total: filtered.length,
      passedTotal,
      failedTotal,
      source: 'github_artifact' as const,
    });
  } catch (error) {
    console.error('Error fetching live eval samples:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Pull `resps[0][0]` out of the mapper's preserved `data` blob — same as the DB query does in SQL. */
function extractRawResponse(data: Record<string, unknown>): string | null {
  const resps = data.resps;
  if (!Array.isArray(resps) || resps.length === 0) return null;
  const inner = resps[0];
  if (!Array.isArray(inner) || inner.length === 0) return null;
  return typeof inner[0] === 'string' ? inner[0] : null;
}
