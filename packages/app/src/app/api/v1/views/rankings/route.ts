import type { NextRequest } from 'next/server';

import { cachedDerivedData, cachedJson } from '@/lib/api-cache';
import { getCachedBenchmarks } from '@/lib/benchmark-data.server';
import { OVERVIEW_PRIMARY_TIER, type OverviewScenario } from '@/lib/overview-data';
import { getAllRankingPageEntries, RANKING_KINDS, type RankingKind } from '@/lib/rankings';
import { csvResponse } from '@/lib/views-api/csv';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';
import { parseEnumParam, parseFormatParam, resolveModelParam } from '@/lib/views-api/params';
import {
  buildRankingsViewEntries,
  newestRowDate,
  rankingsViewCsvRows,
  type RankingsViewEntry,
} from '@/lib/views-api/rankings-view';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/views/rankings — JSON form of the /rankings/<slug> pages.
 *
 * Same derivation the pages use (overview model summary → ranking rows via
 * `lib/rankings.ts`), parameterized by kind, model, and scenario. Default
 * scenario is "all curated scenarios per model", mirroring the /overview
 * matrix rows the ranking pages are read from.
 */

const SCENARIO_VALUES = ['single_turn_8k1k', 'agentx'] as const;
const SCENARIO_ALLOWED = [...SCENARIO_VALUES, '8k-1k', 'agentic'] as const;
const SCENARIO_ALIASES: Readonly<Record<string, OverviewScenario>> = {
  single_turn_8k1k: 'single_turn_8k1k',
  '8k-1k': 'single_turn_8k1k',
  '8k/1k': 'single_turn_8k1k',
  agentx: 'agentx',
  agentic: 'agentx',
  'agentic-traces': 'agentx',
  agentic_traces: 'agentx',
};

function parseScenarioParam(value: string | null): OverviewScenario | null {
  if (!value) return null;
  const scenario = SCENARIO_ALIASES[value.toLowerCase()];
  if (!scenario) {
    throw new ViewsApiParamError('scenario', `Unknown scenario: ${value}`, SCENARIO_ALLOWED);
  }
  return scenario;
}

interface RankingsView {
  generatedAt: string | null;
  entries: RankingsViewEntry[];
}

/**
 * `modelDisplayName === null` means every ranking-page model; entries with no
 * measurable hardware are dropped there (an under-swept model is noise in the
 * all-models feed) but kept for an explicit model so the response stays
 * self-describing.
 */
async function loadRankingsView(
  kind: RankingKind,
  modelDisplayName: string | null,
  scenario: OverviewScenario | null,
): Promise<RankingsView> {
  const entries = getAllRankingPageEntries().filter(
    (entry) => entry.kind === kind && (!modelDisplayName || entry.model.model === modelDisplayName),
  );
  const perEntry = await Promise.all(
    entries.map(async (entry) => {
      const rows = await getCachedBenchmarks([...entry.dbKeys]);
      return { viewEntries: buildRankingsViewEntries(entry, rows, scenario), rows };
    }),
  );
  let generatedAt: string | null = null;
  const viewEntries: RankingsViewEntry[] = [];
  for (const { viewEntries: built, rows } of perEntry) {
    const kept = modelDisplayName ? built : built.filter((entry) => entry.rows.length > 0);
    if (kept.length === 0) continue;
    viewEntries.push(...kept);
    generatedAt = newestRowDate(rows, generatedAt);
  }
  return { generatedAt, entries: viewEntries };
}

const getCachedRankingsView = cachedDerivedData(loadRankingsView, 'views-rankings-v1');

export function GET(request: NextRequest) {
  return runViewsRoute('rankings', async () => {
    const searchParams = request.nextUrl.searchParams;
    const kind = parseEnumParam(searchParams.get('kind'), 'kind', RANKING_KINDS, 'cheapest-gpu');
    const modelParam = searchParams.get('model');
    const model = modelParam ? resolveModelParam(modelParam) : null;
    const scenario = parseScenarioParam(searchParams.get('scenario'));
    const format = parseFormatParam(searchParams.get('format'));

    const view = await getCachedRankingsView(kind, model?.displayName ?? null, scenario);

    if (format === 'csv') {
      return csvResponse(rankingsViewCsvRows(kind, OVERVIEW_PRIMARY_TIER, view.entries));
    }

    return cachedJson({
      view: 'rankings',
      apiVersion: 'v1',
      generatedAt: view.generatedAt,
      params: {
        kind,
        model: model?.displayName ?? 'all',
        scenario: scenario ?? 'all',
        tier: OVERVIEW_PRIMARY_TIER,
        engine: 'community',
        format,
      },
      kind,
      tier: OVERVIEW_PRIMARY_TIER,
      entries: view.entries,
    });
  });
}
