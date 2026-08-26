/**
 * @file run-rankings-data.server.ts
 * @description Server-side data derivation for the `/run/<pair>` and
 * `/rankings/<slug>` pages.
 *
 * Both families read through `getCachedBenchmarks` — the same cached query the
 * dashboard, /compare, and /overview use — and derive their numbers with the
 * overview's own config building and read selection (`buildOverviewModelSummary`
 * for rankings, `overviewHardwareTierReader` for run pages, which also covers
 * SKUs outside the overview matrix), so a ranked or quoted figure on these
 * pages is always the figure the overview derivation yields for that cell.
 * Fixtures mode short-circuits inside those shared helpers, so tests and
 * DB-less builds never touch a connection here.
 */

import { resolveFrameworkPartLabel } from '@semianalysisai/inferencex-constants';

import type { BenchmarkRow } from '@/lib/api';
import { cachedDerivedData } from '@/lib/api-cache';
import { getCachedBenchmarks } from '@/lib/benchmark-data.server';
import { getChipHw } from '@/lib/chip-pages';
import { buildDbKeyToSlugMap, getCachedAvailability } from '@/lib/compare-availability';
import {
  buildOverviewModelSummary,
  OVERVIEW_PRIMARY_TIER,
  OVERVIEW_TIERS,
  overviewHardwareTierReader,
  overviewHeadlineScenarioForModel,
  type OverviewScenario,
  type OverviewTier,
} from '@/lib/overview-data';
import {
  buildRankingRows,
  getAllRankingPageEntries,
  type RankingPageEntry,
  type RankingRow,
} from '@/lib/rankings';
import { getAllRunPageEntries, type RunPageEntry } from '@/lib/run-pages';

// ---------------------------------------------------------------------------
// Availability: which (model, chip) pairs actually have benchmark rows
// ---------------------------------------------------------------------------

async function loadAvailableRunEntries(): Promise<RunPageEntry[]> {
  const rows = await getCachedAvailability();
  const dbKeyToSlug = buildDbKeyToSlugMap();
  const availableByModelSlug = new Map<string, Set<string>>();
  for (const row of rows) {
    const modelSlug = dbKeyToSlug.get(row.model);
    if (!modelSlug) continue;
    let set = availableByModelSlug.get(modelSlug);
    if (!set) {
      set = new Set<string>();
      availableByModelSlug.set(modelSlug, set);
    }
    set.add(row.hardware);
  }
  return getAllRunPageEntries().filter((entry) =>
    availableByModelSlug.get(entry.model.slug)?.has(entry.chip.hwKey),
  );
}

const getCachedAvailableRunEntries = cachedDerivedData(
  loadAvailableRunEntries,
  'run-pages-availability-v1',
);

/** Candidate pairs narrowed to those with at least one benchmark row. Used by
 *  the sitemap, the /run index, and related-page link lists. */
export function getAvailableRunEntries(): Promise<RunPageEntry[]> {
  return getCachedAvailableRunEntries();
}

// ---------------------------------------------------------------------------
// /run/<pair> page data
// ---------------------------------------------------------------------------

export interface RunTierRead {
  tier: OverviewTier;
  /** Tokens/s per GPU at this interactivity tier; null when unreachable. */
  throughputPerGpu: number | null;
  /** $ per million total tokens at hyperscaler $/GPU/hr; null when unknown. */
  costPerMtok: number | null;
  precision: string | null;
  framework: string | null;
  disagg: boolean | null;
}

export interface RunCostTier {
  tierLabel: 'hyperscaler' | 'neocloud' | 'retail';
  costPerGpuHour: number;
  costPerMtok: number;
}

export interface RunPageData {
  hasData: boolean;
  scenario: OverviewScenario;
  configCount: number;
  frameworks: string[];
  precisions: string[];
  hasDisagg: boolean;
  hasMultinode: boolean;
  bestThroughputPerGpu: number | null;
  bestMedianTtft: number | null;
  bestMedianTpot: number | null;
  primaryTier: OverviewTier;
  tierLadder: RunTierRead[];
  /** Cost per million tokens at the primary tier across the three $/GPU/hr
   *  pricing tiers from HW_REGISTRY. Empty when the tier is unreachable. */
  costTiers: RunCostTier[];
  oldest: string | null;
  newest: string | null;
}

function costPerMtokAt(costPerGpuHour: number, throughputPerGpu: number): number {
  return (costPerGpuHour * 1_000_000) / (throughputPerGpu * 3600);
}

function buildRunPageData(entry: RunPageEntry, rows: BenchmarkRow[]): RunPageData {
  const hwKey = entry.chip.hwKey;
  const hwRows = rows.filter((row) => row.hardware === hwKey);
  const scenario = overviewHeadlineScenarioForModel(entry.model.model, rows);

  const frameworks = new Set<string>();
  const precisions = new Set<string>();
  let hasDisagg = false;
  let hasMultinode = false;
  let bestThroughputPerGpu: number | null = null;
  let bestMedianTtft: number | null = null;
  let bestMedianTpot: number | null = null;
  let oldest: string | null = null;
  let newest: string | null = null;

  for (const row of hwRows) {
    frameworks.add(resolveFrameworkPartLabel(row.model, row.framework));
    precisions.add(row.precision);
    if (row.disagg) hasDisagg = true;
    if (row.is_multinode) hasMultinode = true;
    const metrics = row.metrics ?? {};
    const tput = typeof metrics.tput_per_gpu === 'number' ? metrics.tput_per_gpu : null;
    const ttft = typeof metrics.median_ttft === 'number' ? metrics.median_ttft : null;
    const tpot = typeof metrics.median_tpot === 'number' ? metrics.median_tpot : null;
    if (tput !== null && (bestThroughputPerGpu === null || tput > bestThroughputPerGpu)) {
      bestThroughputPerGpu = tput;
    }
    if (ttft !== null && (bestMedianTtft === null || ttft < bestMedianTtft)) {
      bestMedianTtft = ttft;
    }
    if (tpot !== null && (bestMedianTpot === null || tpot < bestMedianTpot)) {
      bestMedianTpot = tpot;
    }
    if (row.date && (oldest === null || row.date < oldest)) oldest = row.date;
    if (row.date && (newest === null || row.date > newest)) newest = row.date;
  }

  // Reads come from the same derivation as the overview matrix but without
  // its fixed platform list, so H100-class SKUs get real ladders too.
  const readAt = overviewHardwareTierReader(entry.model.model, rows, scenario);
  const tierLadder: RunTierRead[] = OVERVIEW_TIERS.map((tier) => {
    const { read, costPerMtok } = readAt(hwKey, tier);
    return {
      tier,
      throughputPerGpu: read.value,
      costPerMtok,
      precision: read.config?.precision ?? null,
      framework: read.config?.frameworkLabel ?? null,
      disagg: read.config?.disagg ?? null,
    };
  });

  const primaryRead = tierLadder.find((read) => read.tier === OVERVIEW_PRIMARY_TIER);
  const hw = getChipHw(entry.chip);
  const costTiers: RunCostTier[] =
    primaryRead?.throughputPerGpu && primaryRead.throughputPerGpu > 0
      ? (
          [
            ['hyperscaler', hw.costh],
            ['neocloud', hw.costn],
            ['retail', hw.costr],
          ] as const
        )
          .filter(([, costPerGpuHour]) => costPerGpuHour > 0)
          .map(([tierLabel, costPerGpuHour]) => ({
            tierLabel,
            costPerGpuHour,
            costPerMtok: costPerMtokAt(costPerGpuHour, primaryRead.throughputPerGpu as number),
          }))
      : [];

  return {
    hasData: hwRows.length > 0,
    scenario,
    configCount: hwRows.length,
    frameworks: [...frameworks].sort(),
    precisions: [...precisions].sort(),
    hasDisagg,
    hasMultinode,
    bestThroughputPerGpu,
    bestMedianTtft,
    bestMedianTpot,
    primaryTier: OVERVIEW_PRIMARY_TIER,
    tierLadder,
    costTiers,
    oldest,
    newest,
  };
}

async function loadRunPageData(slug: string): Promise<RunPageData | null> {
  const entry = getAllRunPageEntries().find((candidate) => candidate.slug === slug);
  if (!entry) return null;
  const rows = await getCachedBenchmarks(entry.dbKeys);
  return buildRunPageData(entry, rows);
}

const getCachedRunPageData = cachedDerivedData(loadRunPageData, 'run-page-data-v2');

export function getRunPageData(slug: string): Promise<RunPageData | null> {
  return getCachedRunPageData(slug);
}

// ---------------------------------------------------------------------------
// /rankings/<slug> page data
// ---------------------------------------------------------------------------

export interface RankingPageData {
  scenario: OverviewScenario;
  tier: OverviewTier;
  rows: RankingRow[];
  oldest: string | null;
  newest: string | null;
}

async function loadRankingPageData(slug: string): Promise<RankingPageData | null> {
  const entry: RankingPageEntry | undefined = getAllRankingPageEntries().find(
    (candidate) => candidate.slug === slug,
  );
  if (!entry) return null;
  const rows = await getCachedBenchmarks(entry.dbKeys);
  const scenario = overviewHeadlineScenarioForModel(entry.model.model, rows);
  const summary = buildOverviewModelSummary(
    entry.model.model,
    rows,
    OVERVIEW_PRIMARY_TIER,
    'community',
    scenario,
  );
  let oldest: string | null = null;
  let newest: string | null = null;
  for (const row of rows) {
    if (!row.date) continue;
    if (oldest === null || row.date < oldest) oldest = row.date;
    if (newest === null || row.date > newest) newest = row.date;
  }
  return {
    scenario: summary.scenario,
    tier: OVERVIEW_PRIMARY_TIER,
    rows: buildRankingRows(summary, entry.kind),
    oldest,
    newest,
  };
}

const getCachedRankingPageData = cachedDerivedData(loadRankingPageData, 'ranking-page-data-v2');

export function getRankingPageData(slug: string): Promise<RankingPageData | null> {
  return getCachedRankingPageData(slug);
}
