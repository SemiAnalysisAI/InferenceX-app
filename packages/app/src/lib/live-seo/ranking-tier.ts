import type { BenchmarkRow } from '@/lib/api/api';
import type { Model } from '@/lib/catalog/data-mappings';
import {
  buildOverviewModelSummaries,
  OVERVIEW_PRIMARY_TIER,
  OVERVIEW_TIERS,
  type OverviewModelSummary,
  type OverviewScenario,
  type OverviewTier,
} from '@/lib/overview/overview-data';

export const RANKING_TIERS: readonly OverviewTier[] = OVERVIEW_TIERS.filter(
  (tier) => tier >= OVERVIEW_PRIMARY_TIER,
);

export interface RankingTierCandidate {
  tier: OverviewTier;
  summary: OverviewModelSummary;
}

export interface RankingTierChoice extends RankingTierCandidate {
  ranked: number;
  eligible: number;
}

function rankedHardware(summary: OverviewModelSummary): string[] {
  return summary.platforms
    .filter((platform) => platform.read.value !== null)
    .map((platform) => platform.hardware);
}

export function pickRankingTier(
  candidates: readonly RankingTierCandidate[],
): RankingTierChoice | null {
  const eligible = new Set(candidates.flatMap(({ summary }) => rankedHardware(summary))).size;
  if (eligible === 0) return null;
  const counted = candidates.map((candidate) => ({
    ...candidate,
    ranked: rankedHardware(candidate.summary).length,
    eligible,
  }));
  const threshold = Math.max(2, Math.ceil(eligible / 2));
  return (
    counted.find((candidate) => candidate.ranked >= threshold) ??
    counted.reduce((best, candidate) => (candidate.ranked > best.ranked ? candidate : best))
  );
}

export function selectRankingTier(
  model: Model,
  rows: BenchmarkRow[],
  scenario: OverviewScenario,
): RankingTierChoice {
  const summaries = buildOverviewModelSummaries(model, rows, RANKING_TIERS, 'community', scenario);
  const candidates = RANKING_TIERS.map((tier, index) => ({ tier, summary: summaries[index] }));
  return pickRankingTier(candidates) ?? { ...candidates[0], ranked: 0, eligible: 0 };
}

export function unrankedHardwareLabels(summary: OverviewModelSummary): string[] {
  return summary.platforms
    .filter(
      (platform) =>
        platform.missingReason === 'cannot_reach_at_tier' ||
        platform.missingReason === 'no_exact_at_tier',
    )
    .map((platform) => platform.hardwareLabel);
}
