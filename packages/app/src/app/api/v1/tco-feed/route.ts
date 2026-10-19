import { type NextRequest, NextResponse } from 'next/server';

import { DB_MODEL_TO_DISPLAY, DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';

import { getLatestBenchmarks } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { cachedJson, cachedQuery, cachedText } from '@/lib/cache/api-cache';
import { loadFixture } from '@/lib/testing/test-fixtures';

import {
  computeTcoFeed,
  computeTcoScores,
  parseAlpha,
  parseTiers,
  parseTierWeights,
  parseWorkloads,
  parseWorkloadWeights,
  tcoFeedToCsv,
  tcoScoresToCsv,
  type TcoFeedRow,
  type TcoFeedSourceRow,
  type TcoFeedWorkload,
} from '@/lib/calculator/tco-feed';

export const dynamic = 'force-dynamic';

const getCachedTcoFeed = cachedQuery(
  async (
    dbModelKeys: string[],
    date: string | undefined,
    workloads: TcoFeedWorkload[],
    tiers: number[],
  ): Promise<TcoFeedRow[]> => {
    const rows = await getLatestBenchmarks(getDb(), dbModelKeys, date);
    return computeTcoFeed(rows, workloads, tiers);
  },
  'tco-feed-v2',
);

function resolveModelKeys(model: string): string[] | undefined {
  const fromDisplay = DISPLAY_MODEL_TO_DB[model];
  if (fromDisplay && fromDisplay.length > 0) return fromDisplay;
  if (DB_MODEL_TO_DISPLAY[model]) return [model];
  return undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const model = params.get('model') ?? 'dsv4';
  const dbModelKeys = resolveModelKeys(model);
  if (!dbModelKeys) {
    return NextResponse.json({ error: 'Unknown model' }, { status: 400 });
  }

  const workloads = parseWorkloads(params.get('workloads'));
  if (!workloads) {
    return NextResponse.json(
      { error: 'Invalid workloads — expected comma-separated <isl>x<osl> pairs' },
      { status: 400 },
    );
  }

  const tiers = parseTiers(params.get('tiers'));
  if (!tiers) {
    return NextResponse.json(
      { error: 'Invalid tiers — expected comma-separated positive numbers' },
      { status: 400 },
    );
  }

  const dateParam = params.get('date');
  if (dateParam !== null && !/^\d{4}-\d{2}-\d{2}$/u.test(dateParam)) {
    return NextResponse.json({ error: 'Invalid date — expected YYYY-MM-DD' }, { status: 400 });
  }
  const date = dateParam ?? undefined;

  const format = params.get('format') ?? 'json';
  if (format !== 'json' && format !== 'csv') {
    return NextResponse.json({ error: 'Invalid format — expected json or csv' }, { status: 400 });
  }

  const view = params.get('view') ?? 'points';
  if (view !== 'points' && view !== 'scores') {
    return NextResponse.json(
      { error: 'Invalid view — expected points or scores' },
      { status: 400 },
    );
  }

  const rawWeights = params.get('weights');
  const rawWorkloadWeights = params.get('workload_weights');
  const rawAlpha = params.get('alpha');
  if (view === 'points' && (rawWeights ?? rawWorkloadWeights ?? rawAlpha) !== null) {
    return NextResponse.json(
      { error: 'weights, workload_weights, and alpha require view=scores' },
      { status: 400 },
    );
  }

  const tierWeights = parseTierWeights(rawWeights, tiers);
  if (!tierWeights) {
    return NextResponse.json(
      { error: 'Invalid weights — expected one non-negative number per tier, sum > 0' },
      { status: 400 },
    );
  }

  const workloadWeights = parseWorkloadWeights(rawWorkloadWeights, workloads);
  if (!workloadWeights) {
    return NextResponse.json(
      {
        error: 'Invalid workload_weights — expected one non-negative number per workload, sum > 0',
      },
      { status: 400 },
    );
  }

  const alpha = parseAlpha(rawAlpha);
  if (alpha === null) {
    return NextResponse.json(
      { error: 'Invalid alpha — expected a number in [0, 10]' },
      { status: 400 },
    );
  }

  try {
    const rows = FIXTURES_MODE
      ? computeTcoFeed(loadFixture<TcoFeedSourceRow[]>('benchmarks'), workloads, tiers)
      : await getCachedTcoFeed(dbModelKeys, date, workloads, tiers);

    if (view === 'scores') {
      const scores = computeTcoScores(rows, workloads, tiers, tierWeights, workloadWeights, alpha);
      if (format === 'csv') {
        return cachedText(tcoScoresToCsv(scores, workloads), 'text/csv; charset=utf-8');
      }
      return cachedJson({
        model,
        db_model_keys: dbModelKeys,
        date: date ?? null,
        workloads: workloads.map((w) => `${w.isl}x${w.osl}`),
        tiers,
        weights: tierWeights,
        workload_weights: workloadWeights,
        alpha,
        rows: scores,
      });
    }

    if (format === 'csv') {
      return cachedText(tcoFeedToCsv(rows), 'text/csv; charset=utf-8');
    }
    return cachedJson({
      model,
      db_model_keys: dbModelKeys,
      date: date ?? null,
      workloads: workloads.map((w) => `${w.isl}x${w.osl}`),
      tiers,
      rows,
    });
  } catch (error) {
    console.error('Error computing tco-feed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
