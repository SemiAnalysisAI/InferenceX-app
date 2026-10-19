import { type NextRequest, NextResponse } from 'next/server';

import { extractDemonstrations } from '@/lib/evaluation/eval-sample-utils';
import { parseEvalSampleWindow } from '@/lib/evaluation/eval-sample-params';
import {
  type EvalArtifactConfig,
  fetchAndParseSamples,
  findEvalSampleArtifact,
} from '@/lib/evaluation/eval-samples-live';
import { fetchGithubRunArtifacts, getGithubToken } from '@/lib/github/github-artifacts';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const runId = params.get('run_id') ?? '';
  const task = params.get('task') ?? '';

  if (!/^\d+$/u.test(runId)) {
    return NextResponse.json({ error: 'run_id must be a positive integer' }, { status: 400 });
  }
  if (!task) {
    return NextResponse.json({ error: 'task is required' }, { status: 400 });
  }
  const window = parseEvalSampleWindow(params);
  if ('error' in window) {
    return NextResponse.json(window, { status: 400 });
  }
  const { filter, offset, limit } = window;

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

function extractRawResponse(data: Record<string, unknown>): string | null {
  const resps = data.resps;
  if (!Array.isArray(resps) || resps.length === 0) return null;
  const inner = resps[0];
  if (!Array.isArray(inner) || inner.length === 0) return null;
  return typeof inner[0] === 'string' ? inner[0] : null;
}
