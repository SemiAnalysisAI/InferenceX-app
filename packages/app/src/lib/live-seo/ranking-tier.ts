import type { BenchmarkRow } from '@/lib/api/api';
import type { Model } from '@/lib/catalog/data-mappings';
import {
  buildOverviewModelSummaries,
  type OverviewModelSummary,
  type OverviewScenario,
} from '@/lib/overview/overview-data';
import { buildRankingRows, type RankingKind, type RankingRow } from '@/lib/live-seo/rankings';

export const RANKING_TIERS = [50, 75, 100, 125, 150, 175, 200] as const;
export type RankingTier = (typeof RANKING_TIERS)[number];
export const RANKING_STANDARD_TIER: RankingTier = 125;

const MIN_RANKED_CHIPS = 2;

export interface RankingTierCandidate {
  tier: RankingTier;
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
  const best = counted.reduce((top, candidate) =>
    candidate.ranked > top.ranked || (candidate.ranked === top.ranked && candidate.tier < top.tier)
      ? candidate
      : top,
  );
  const standard = counted.find((candidate) => candidate.tier === RANKING_STANDARD_TIER);
  const choice = standard && standard.ranked >= best.ranked ? standard : best;
  return choice.ranked >= MIN_RANKED_CHIPS ? choice : null;
}

export function selectRankingTier(
  model: Model,
  rows: BenchmarkRow[],
  scenario: OverviewScenario,
): RankingTierChoice {
  const summaries = buildOverviewModelSummaries(model, rows, RANKING_TIERS, 'community', scenario);
  const candidates = RANKING_TIERS.map((tier, index) => ({ tier, summary: summaries[index] }));
  return (
    pickRankingTier(candidates) ?? {
      ...candidates[RANKING_TIERS.indexOf(RANKING_STANDARD_TIER)],
      ranked: 0,
      eligible: new Set(candidates.flatMap(({ summary }) => rankedHardware(summary))).size,
    }
  );
}

export function rankingTierRows(choice: RankingTierChoice, kind: RankingKind): RankingRow[] {
  return choice.ranked === 0 ? [] : buildRankingRows(choice.summary, kind);
}

export function unrankedHardwareLabels(choice: RankingTierChoice): string[] {
  return choice.summary.platforms
    .filter(
      (platform) =>
        (choice.ranked === 0 && platform.read.value !== null) ||
        platform.missingReason === 'cannot_reach_at_tier' ||
        platform.missingReason === 'no_exact_at_tier',
    )
    .map((platform) => platform.hardwareLabel);
}
