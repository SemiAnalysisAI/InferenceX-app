import { describe, expect, it } from 'vitest';

import {
  RANKING_KINDS,
  buildRankingRows,
  chipForHardware,
  getAllRankingPageEntries,
  getRankingPageEntry,
  rankingPageDescription,
  rankingPageHeading,
  rankingPageKeywords,
  rankingPagePath,
  rankingPageTitle,
  scenarioLabel,
} from '@/lib/rankings';
import {
  rankingPageDescriptionZh,
  rankingPageHeadingZh,
  rankingPageKeywordsZh,
  rankingPageTitleZh,
} from '@/lib/rankings-zh';
import { INFERENCE_MODEL_SLUGS } from '@/lib/inference-model-slug';
import type {
  OverviewModelSummary,
  OverviewPlatformResult,
  OverviewTierRead,
} from '@/lib/overview-data';

const FORBIDDEN_DASHES = /[\u2013\u2014]/;
const CJK = /[\u4E00-\u9FFF]/;

function syntheticRead(value: number | null): OverviewTierRead {
  return {
    tier: 50,
    value,
    boundary: null,
    estimated: false,
    evidenceDate: null,
    evidenceTopologies: [],
    config: null,
  };
}

function syntheticPlatform(overrides: Partial<OverviewPlatformResult>): OverviewPlatformResult {
  return {
    hardware: 'h100',
    hardwareLabel: 'H100',
    precision: 'fp8',
    read: syntheticRead(100),
    missingReason: null,
    costPerMtok: 1,
    costVsReferencePct: null,
    historicalComparison: null,
    ...overrides,
  };
}

function syntheticSummary(platforms: OverviewPlatformResult[]): OverviewModelSummary {
  return {
    modelLabel: 'Synthetic',
    scenario: 'single_turn_8k1k',
    platforms,
  } as OverviewModelSummary;
}

describe('rankings registry', () => {
  it('has one page per (kind, model) pair', () => {
    const entries = getAllRankingPageEntries();
    expect(entries.length).toBe(RANKING_KINDS.length * INFERENCE_MODEL_SLUGS.length);
    expect(entries.length).toBe(24);
  });

  it('has unique, well-formed slugs', () => {
    const entries = getAllRankingPageEntries();
    expect(new Set(entries.map((entry) => entry.slug)).size).toBe(entries.length);
    for (const entry of entries) {
      expect(entry.slug).toBe(`${entry.kind}-for-${entry.model.slug}`);
      expect(entry.slug).toMatch(/^[a-z0-9-]+$/);
      expect(rankingPagePath(entry)).toBe(`/rankings/${entry.slug}`);
      expect(entry.dbKeys.length).toBeGreaterThan(0);
    }
  });

  it('resolves slugs case-insensitively and rejects unknown slugs', () => {
    const [first] = getAllRankingPageEntries();
    expect(getRankingPageEntry(first.slug)).toBe(first);
    expect(getRankingPageEntry(first.slug.toUpperCase())).toBe(first);
    expect(getRankingPageEntry('fastest-gpu-for-nonexistent')).toBeUndefined();
  });

  it('maps hardware keys to chip pages', () => {
    expect(chipForHardware('gb200')?.slug).toBe('gb200-nvl72');
    expect(chipForHardware('not-a-gpu')).toBeNull();
  });
});

describe('rankings copy', () => {
  it('contains no em or en dashes and enough keywords in either locale', () => {
    for (const entry of getAllRankingPageEntries()) {
      const copy = [
        rankingPageTitle(entry),
        rankingPageHeading(entry),
        rankingPageDescription(entry),
        ...rankingPageKeywords(entry),
        rankingPageTitleZh(entry),
        rankingPageHeadingZh(entry),
        rankingPageDescriptionZh(entry),
        ...rankingPageKeywordsZh(entry),
      ];
      for (const text of copy) {
        expect(text, `dash found in copy for ${entry.slug}: ${text}`).not.toMatch(FORBIDDEN_DASHES);
        expect(text.length).toBeGreaterThan(0);
      }
      expect(rankingPageKeywords(entry).length).toBeGreaterThanOrEqual(6);
      expect(rankingPageKeywordsZh(entry).length).toBeGreaterThanOrEqual(6);
    }
  });

  it('keeps Chinese copy Chinese while model names stay English', () => {
    for (const entry of getAllRankingPageEntries()) {
      expect(rankingPageTitleZh(entry)).toMatch(CJK);
      expect(rankingPageDescriptionZh(entry)).toMatch(CJK);
      expect(rankingPageTitleZh(entry)).toContain(entry.model.seoName);
    }
  });

  it('words every scenario in both locales without dashes', () => {
    for (const scenario of ['single_turn_8k1k', 'agentx'] as const) {
      for (const locale of ['en', 'zh'] as const) {
        const label = scenarioLabel(scenario, locale);
        expect(label.length).toBeGreaterThan(0);
        expect(label).not.toMatch(FORBIDDEN_DASHES);
      }
    }
  });
});

describe('buildRankingRows', () => {
  const platforms = [
    syntheticPlatform({
      hardware: 'h100',
      hardwareLabel: 'H100',
      read: syntheticRead(100),
      costPerMtok: 3,
    }),
    syntheticPlatform({
      hardware: 'mi355x',
      hardwareLabel: 'MI355X',
      read: syntheticRead(250),
      costPerMtok: 1,
    }),
    syntheticPlatform({
      hardware: 'b200',
      hardwareLabel: 'B200',
      read: syntheticRead(null),
      costPerMtok: null,
    }),
    syntheticPlatform({
      hardware: 'h200',
      hardwareLabel: 'H200',
      read: syntheticRead(180),
      costPerMtok: 2,
    }),
  ];

  it('ranks fastest-gpu by descending throughput and drops unmeasured platforms', () => {
    const rows = buildRankingRows(syntheticSummary(platforms), 'fastest-gpu');
    expect(rows.map((row) => row.hardware)).toEqual(['mi355x', 'h200', 'h100']);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3]);
    expect(rows[0].throughputPerGpu).toBe(250);
  });

  it('ranks cheapest-gpu by ascending cost and drops platforms without cost', () => {
    const rows = buildRankingRows(syntheticSummary(platforms), 'cheapest-gpu');
    expect(rows.map((row) => row.hardware)).toEqual(['mi355x', 'h200', 'h100']);
    expect(rows[0].costPerMtok).toBe(1);
    expect(rows.at(-1)?.costPerMtok).toBe(3);
  });

  it('links ranked rows to chip pages when the hardware has one', () => {
    const rows = buildRankingRows(syntheticSummary(platforms), 'fastest-gpu');
    expect(rows.find((row) => row.hardware === 'mi355x')?.chip?.slug).toBe('mi355x');
  });
});
