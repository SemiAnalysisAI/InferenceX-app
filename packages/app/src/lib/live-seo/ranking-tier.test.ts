import { describe, expect, it } from 'vitest';

import type {
  OverviewMissingReason,
  OverviewModelSummary,
  OverviewPlatformResult,
  OverviewTier,
} from '@/lib/overview/overview-data';

import {
  pickRankingTier,
  RANKING_TIERS,
  unrankedHardwareLabels,
  type RankingTierCandidate,
} from './ranking-tier';

const HARDWARE = ['b200', 'mi355x', 'b300', 'gb200', 'gb300'] as const;

function platform(
  hardware: string,
  tier: OverviewTier,
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

function ladder(
  measured: Partial<Record<OverviewTier, readonly string[]>>,
): RankingTierCandidate[] {
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
  it('walks the overview tiers upward from 50', () => {
    expect(RANKING_TIERS).toEqual([50, 75, 100, 150, 200]);
  });
});

describe('pickRankingTier', () => {
  it('keeps the first tier that ranks enough chips even when a later tier ranks more', () => {
    const choice = pickRankingTier(
      ladder({ 50: ['b200'], 75: ['b200', 'mi355x'], 100: ['b200', 'mi355x', 'b300', 'gb200'] }),
    );
    expect(choice).toMatchObject({ tier: 75, ranked: 2, eligible: 4 });
  });

  it('stays at 50 when it already ranks half of the eligible chips', () => {
    const choice = pickRankingTier(ladder({ 50: ['b200', 'mi355x'], 75: ['b300', 'gb200'] }));
    expect(choice).toMatchObject({ tier: 50, ranked: 2, eligible: 4 });
  });

  it('requires half of the eligible chips, rounded up', () => {
    const choice = pickRankingTier(
      ladder({
        50: ['b200', 'mi355x'],
        75: ['b200', 'mi355x', 'b300'],
        150: ['gb200', 'gb300'],
      }),
    );
    expect(choice).toMatchObject({ tier: 75, ranked: 3, eligible: 5 });
  });

  it('falls back to the lowest tier with the most ranked chips when none qualifies', () => {
    const choice = pickRankingTier(
      ladder({ 50: ['b200'], 75: ['mi355x', 'b300'], 100: ['gb200', 'gb300'], 150: ['b200'] }),
    );
    expect(choice).toMatchObject({ tier: 75, ranked: 2, eligible: 5 });
  });

  it('never accepts a single ranked chip as coverage', () => {
    const choice = pickRankingTier(ladder({ 100: ['b300'], 150: ['b300'] }));
    expect(choice).toMatchObject({ tier: 100, ranked: 1, eligible: 1 });
  });

  it('returns null when no chip ranks at any tier', () => {
    expect(pickRankingTier(ladder({}))).toBeNull();
    expect(pickRankingTier([])).toBeNull();
  });
});

describe('unrankedHardwareLabels', () => {
  it('lists chips with data that cannot be read at the tier', () => {
    const labels = unrankedHardwareLabels(
      summary([
        platform('b200', 100, true),
        platform('mi355x', 100, false, 'no_exact_at_tier'),
        platform('b300', 100, false, 'cannot_reach_at_tier'),
        platform('gb200', 100, false, 'no_scenario_data'),
        platform('gb300', 100, false, 'int4_bf16_only'),
      ]),
    );
    expect(labels).toEqual(['MI355X', 'B300']);
  });
});
