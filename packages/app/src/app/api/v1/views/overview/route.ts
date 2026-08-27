import type { NextRequest } from 'next/server';

import { cachedJson } from '@/lib/api-cache';
import {
  OVERVIEW_HARDWARE,
  OVERVIEW_HISTORY_WINDOWS,
  OVERVIEW_PRIMARY_TIER,
  OVERVIEW_TIERS,
  type OverviewComparisonMode,
  type OverviewTier,
} from '@/lib/overview-data';
import { getOverviewPageData } from '@/lib/overview-data.server';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';
import {
  overviewViewCsvRows,
  overviewViewGeneratedAt,
  projectOverviewView,
} from '@/lib/views-api/overview-view';
import { csvResponse } from '@/lib/views-api/csv';
import { parseEnumParam, parseFormatParam } from '@/lib/views-api/params';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/views/overview — documented public projection of the /overview
 * cost matrix. Unlike the page BFF at /api/v1/overview (which silently
 * normalizes unknown values), invalid options here are a 400 with the allowed
 * list, per the views-API convention. `getOverviewPageData` already caches the
 * derived matrix (cachedDerivedData, blob-backed row reads underneath), so
 * this handler adds no cache layer of its own.
 */

const TIER_VALUES = OVERVIEW_TIERS.map(String);
const COMPARE_VALUES = ['hardware', ...OVERVIEW_HISTORY_WINDOWS] as const;

function parseTierParam(value: string | null): OverviewTier {
  if (!value) return OVERVIEW_PRIMARY_TIER;
  const tier = OVERVIEW_TIERS.find((candidate) => String(candidate) === value);
  if (tier === undefined) {
    throw new ViewsApiParamError('tier', `Unknown tier: ${value}`, TIER_VALUES);
  }
  return tier;
}

export function GET(request: NextRequest) {
  return runViewsRoute('overview', async () => {
    const searchParams = request.nextUrl.searchParams;
    const tier = parseTierParam(searchParams.get('tier'));
    const engine = parseEnumParam(
      searchParams.get('engine'),
      'engine',
      ['all', 'community'] as const,
      'community',
    );
    const compare: OverviewComparisonMode = parseEnumParam(
      searchParams.get('compare'),
      'compare',
      COMPARE_VALUES,
      'hardware',
    );
    const ref = parseEnumParam(searchParams.get('ref'), 'ref', OVERVIEW_HARDWARE, 'b200');
    const models = parseEnumParam(
      searchParams.get('models'),
      'models',
      ['default', 'all'] as const,
      'default',
    );
    const rows = parseEnumParam(
      searchParams.get('rows'),
      'rows',
      ['changed', 'all'] as const,
      'all',
    );
    const hwrows = parseEnumParam(
      searchParams.get('hwrows'),
      'hwrows',
      ['priced', 'all'] as const,
      'all',
    );
    const format = parseFormatParam(searchParams.get('format'));

    const data = await getOverviewPageData(tier, engine, compare, ref, models, rows, hwrows);
    const payload = projectOverviewView(data);

    if (format === 'csv') return csvResponse(overviewViewCsvRows(payload, tier));

    return cachedJson({
      view: 'overview',
      apiVersion: 'v1',
      generatedAt: overviewViewGeneratedAt(data),
      params: { tier, engine, compare, ref, models, rows, hwrows, format },
      ...payload,
    });
  });
}
