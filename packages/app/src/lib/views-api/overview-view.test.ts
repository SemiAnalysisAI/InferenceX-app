import { describe, expect, it } from 'vitest';

import type { OverviewPageData } from '@/lib/overview-data';

import { overviewViewGeneratedAt, projectOverviewView } from './overview-view';

function emptyData(overrides: Partial<OverviewPageData> = {}): OverviewPageData {
  return {
    models: [],
    tier: 50,
    engineScope: 'community',
    comparisonMode: 'hardware',
    referenceHardware: 'b200',
    modelScope: 'default',
    rowScope: 'all',
    hardwareRowScope: 'all',
    unchangedRowCount: 0,
    emptyRowCount: 0,
    historicalWindow: null,
    ...overrides,
  } as OverviewPageData;
}

describe('overviewViewGeneratedAt', () => {
  it('is null for an empty matrix without a historical window', () => {
    expect(overviewViewGeneratedAt(emptyData())).toBeNull();
  });

  it('falls back to the historical snapshot date when no cell has a config', () => {
    const data = emptyData({
      comparisonMode: '30d',
      historicalWindow: {
        key: '30d',
        snapshotDate: '2026-08-19',
        targetDate: '2026-07-20',
        earliestDate: '2026-06-20',
      },
    });
    expect(overviewViewGeneratedAt(data)).toBe('2026-08-19');
  });
});

describe('projectOverviewView', () => {
  it('projects an empty matrix into an empty rows list with stable option domains', () => {
    const payload = projectOverviewView(emptyData({ emptyRowCount: 3 }));
    expect(payload.rows).toEqual([]);
    expect(payload.tiers).toEqual([30, 50, 75, 100, 150, 200]);
    expect(payload.scenarios).toEqual(['single_turn_8k1k', 'agentx']);
    expect(payload.referenceHardware).toBe('b200');
    expect(payload.emptyRowCount).toBe(3);
  });
});
