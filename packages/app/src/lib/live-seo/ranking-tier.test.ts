import { describe, expect, it } from 'vitest';

import type {
  OverviewMissingReason,
  OverviewModelSummary,
  OverviewPlatformResult,
} from '@/lib/overview/overview-data';

import {
  pickRankingTier,
  RANKING_STANDARD_TIER,
  RANKING_TIERS,
  rankingTierRows,
  unrankedHardwareLabels,
  type RankingTier,
  type RankingTierCandidate,
} from './ranking-tier';

const HARDWARE = ['b200', 'mi355x', 'b300', 'gb200', 'gb300'] as const;

function platform(
  hardware: string,
  tier: number,
  measured: boolean,
  missingReason: OverviewMissingReason | null = measured ? null : 'no_exact_at_tier',
): OverviewPlatformResult {
  return {
    hardware,
    hardwareLabel: hardware.toUpperCase(),
    precision: 'fp8',
    read: {
      tier,
      value: measured ? 1000 : null,
      boundary: measured ? 'interpolated' : 'clamped_low',
      estimated: false,
      evidenceDate: null,
      evidenceTopologies: [],
      config: null,
    },
    missingReason,
    costPerMtok: measured ? 1 : null,
    costVsReferencePct: null,
    historicalComparison: null,
  };
}

function summary(platforms: OverviewPlatformResult[]): OverviewModelSummary {
  return {
    modelLabel: 'Synthetic',
    scenario: 'single_turn_8k1k',
    platforms,
  } as OverviewModelSummary;
}

function ladder(measured: Partial<Record<RankingTier, readonly string[]>>): RankingTierCandidate[] {
  return RANKING_TIERS.map((tier) => ({
    tier,
    summary: summary(
      HARDWARE.map((hardware) =>
        platform(hardware, tier, measured[tier]?.includes(hardware) ?? false),
      ),
    ),
  }));
}

describe('RANKING_TIERS', () => {
  it('steps by 25 tok/s/user from 50 to 200 and defaults to 125', () => {
    expect(RANKING_TIERS).toEqual([50, 75, 100, 125, 150, 175, 200]);
    expect(RANKING_STANDARD_TIER).toBe(125);
  });
});

describe('pickRankingTier', () => {
  it('keeps the standard tier when it ties the most chips', () => {
    const choice = pickRankingTier(
      ladder({ 50: ['b200', 'mi355x', 'b300'], 125: ['b200', 'gb200', 'gb300'] }),
    );
    expect(choice).toMatchObject({ tier: 125, ranked: 3, eligible: 5 });
  });

  it('overrides the standard tier when another tier ranks more chips', () => {
    const choice = pickRankingTier(
      ladder({ 50: ['b200', 'mi355x', 'b300'], 125: ['b200', 'mi355x'], 150: ['b200'] }),
    );
    expect(choice).toMatchObject({ tier: 50, ranked: 3, eligible: 3 });
  });

  it('picks the lowest of the tied tiers when the standard tier is not among them', () => {
    const choice = pickRankingTier(
      ladder({
        75: ['b200', 'mi355x', 'b300'],
        125: ['b200', 'mi355x'],
        150: ['b200', 'gb200', 'gb300'],
      }),
    );
    expect(choice).toMatchObject({ tier: 75, ranked: 3, eligible: 5 });
  });

  it('returns null when no tier ranks at least two chips', () => {
    expect(pickRankingTier(ladder({ 100: ['b300'], 125: ['gb300'], 175: ['gb200'] }))).toBeNull();
    expect(pickRankingTier(ladder({}))).toBeNull();
    expect(pickRankingTier([])).toBeNull();
  });
});

describe('rankingTierRows and unrankedHardwareLabels', () => {
  const tierSummary = summary([
    platform('b200', 100, true),
    platform('mi355x', 100, false, 'no_exact_at_tier'),
    platform('b300', 100, false, 'cannot_reach_at_tier'),
    platform('gb200', 100, false, 'no_scenario_data'),
    platform('gb300', 100, false, 'int4_bf16_only'),
  ]);

  it('lists chips with data that cannot be read at the chosen tier', () => {
    const choice = { tier: 100, summary: tierSummary, ranked: 1, eligible: 3 } as const;
    expect(rankingTierRows(choice, 'fastest-gpu').map((row) => row.hardware)).toEqual(['b200']);
    expect(unrankedHardwareLabels(choice)).toEqual(['MI355X', 'B300']);
  });

  it('ranks nothing and lists every chip with data when no tier was chosen', () => {
    const choice = { tier: 100, summary: tierSummary, ranked: 0, eligible: 1 } as const;
    expect(rankingTierRows(choice, 'fastest-gpu')).toEqual([]);
    expect(unrankedHardwareLabels(choice)).toEqual(['B200', 'MI355X', 'B300']);
  });
});
