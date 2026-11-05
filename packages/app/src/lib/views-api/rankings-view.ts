import type { BenchmarkRow } from '@/lib/api/api';
import {
  buildOverviewModelSummary,
  OVERVIEW_PRIMARY_TIER,
  overviewScenariosForModel,
  type OverviewScenario,
} from '@/lib/overview/overview-data';
import {
  buildRankingRows,
  type RankingKind,
  type RankingPageEntry,
  type RankingRow,
} from '@/lib/live-seo/rankings';

export const RANKING_VALUE_UNITS: Readonly<Record<RankingKind, string>> = {
  'fastest-gpu': 'tokens_per_second_per_gpu',
  'cheapest-gpu': 'usd_per_million_tokens',
};

export interface RankingsViewRow {
  rank: number;
  hardware: string;
  hardwareLabel: string;
  chip: string | null;
  value: number | null;
  unit: string;
  framework: string | null;
  precision: string | null;
  disagg: boolean | null;
}

export interface RankingsViewEntry {
  model: string;
  modelSlug: string;
  modelLabel: string;
  scenario: OverviewScenario;
  rows: RankingsViewRow[];
}

function projectRankingRow(row: RankingRow, kind: RankingKind): RankingsViewRow {
  return {
    rank: row.rank,
    hardware: row.hardware,
    hardwareLabel: row.hardwareLabel,
    chip: row.chip?.slug ?? null,
    value: kind === 'fastest-gpu' ? row.throughputPerGpu : row.costPerMtok,
    unit: RANKING_VALUE_UNITS[kind],
    framework: row.framework,
    precision: row.precision,
    disagg: row.disagg,
  };
}

export function buildRankingsViewEntries(
  entry: RankingPageEntry,
  rows: BenchmarkRow[],
  scenario: OverviewScenario | null,
): RankingsViewEntry[] {
  const scenarios = scenario ? [scenario] : overviewScenariosForModel(entry.model.model, rows);
  return scenarios.map((candidate) => {
    const summary = buildOverviewModelSummary(
      entry.model.model,
      rows,
      OVERVIEW_PRIMARY_TIER,
      'community',
      candidate,
    );
    return {
      model: entry.model.model,
      modelSlug: entry.model.slug,
      modelLabel: entry.model.label,
      scenario: summary.scenario,
      rows: buildRankingRows(summary, entry.kind).map((row) => projectRankingRow(row, entry.kind)),
    };
  });
}

export function newestRowDate(
  rows: readonly BenchmarkRow[],
  current: string | null,
): string | null {
  let newest = current;
  for (const row of rows) {
    if (row.date && (newest === null || row.date > newest)) newest = row.date;
  }
  return newest;
}

export function rankingsViewCsvRows(
  kind: RankingKind,
  tier: number,
  entries: readonly RankingsViewEntry[],
): Record<string, unknown>[] {
  return entries.flatMap((entry) =>
    entry.rows.map((row) => ({
      kind,
      model: entry.model,
      model_slug: entry.modelSlug,
      scenario: entry.scenario,
      tier,
      rank: row.rank,
      hardware: row.hardware,
      hardware_label: row.hardwareLabel,
      chip: row.chip,
      value: row.value,
      unit: row.unit,
      framework: row.framework,
      precision: row.precision,
      disagg: row.disagg,
    })),
  );
}
