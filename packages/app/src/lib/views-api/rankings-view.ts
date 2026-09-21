/**
 * Pure projection for GET /api/v1/views/rankings.
 *
 * Ranking derivation is NOT reimplemented here: rows come from
 * `buildOverviewModelSummary` (the /overview derivation) sorted by
 * `buildRankingRows` — exactly what the `/rankings/<slug>` pages render via
 * `lib/run-rankings-data.server.ts`. This module only widens the page's
 * headline-scenario view to an explicit scenario parameter (default: every
 * curated overview scenario for the model) and maps rows to the documented
 * public shape.
 */
import type { BenchmarkRow } from '@/lib/api';
import {
  buildOverviewModelSummary,
  OVERVIEW_PRIMARY_TIER,
  overviewScenariosForModel,
  type OverviewScenario,
} from '@/lib/overview-data';
import {
  buildRankingRows,
  type RankingKind,
  type RankingPageEntry,
  type RankingRow,
} from '@/lib/rankings';

/** Machine-readable unit for the ranked `value` of each kind. */
export const RANKING_VALUE_UNITS: Readonly<Record<RankingKind, string>> = {
  'fastest-gpu': 'tokens_per_second_per_gpu',
  'cheapest-gpu': 'usd_per_million_tokens',
};

export interface RankingsViewRow {
  rank: number;
  hardware: string;
  hardwareLabel: string;
  /** /chips/<slug> registry slug when one exists for this hardware. */
  chip: string | null;
  /** Ranked value — tok/s per GPU (fastest-gpu) or $/M total tokens (cheapest-gpu). */
  value: number | null;
  unit: string;
  framework: string | null;
  precision: string | null;
  disagg: boolean | null;
}

export interface RankingsViewEntry {
  /** Dashboard display model name, e.g. `DeepSeek-V4-Pro`. */
  model: string;
  /** Public model slug shared with /compare and /rankings URLs. */
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

/**
 * Build the view entries for one ranking-page model. With `scenario === null`
 * (the API default) every curated overview scenario for the model gets an
 * entry — the same row set the /overview matrix shows; an explicit scenario
 * pins a single entry, even where the page would headline the other workload.
 */
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

/** Newest benchmark date across the rows backing a set of entries. */
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

/** Flat CSV projection: one row per ranked hardware. */
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
