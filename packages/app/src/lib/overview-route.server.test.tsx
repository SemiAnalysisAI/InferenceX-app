import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OverviewPageData } from './overview-data';

const { mockGetOverviewPageData } = vi.hoisted(() => ({
  mockGetOverviewPageData: vi.fn(),
}));

vi.mock('@/lib/overview-data.server', () => ({
  getOverviewPageData: mockGetOverviewPageData,
}));

import { renderOverviewPage } from './overview-route.server';

const PAGE_DATA = { models: [] } as unknown as OverviewPageData;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOverviewPageData.mockResolvedValue(PAGE_DATA);
});

describe('renderOverviewPage', () => {
  it.each(['en', 'zh'] as const)(
    'resolves every query control once and propagates the %s locale',
    async (locale) => {
      const element = await renderOverviewPage({
        locale,
        searchParams: Promise.resolve({
          tier: ['100', '75'],
          engine: ['all', 'community'],
          compare: ['60d', 'hardware'],
          ref: ['gb300', 'b200'],
          models: ['all', 'default'],
          rows: ['changed', 'all'],
          hwrows: ['priced', 'all'],
        }),
      });

      expect(mockGetOverviewPageData).toHaveBeenCalledOnce();
      expect(mockGetOverviewPageData).toHaveBeenCalledWith(
        100,
        'all',
        '60d',
        'gb300',
        'all',
        'changed',
        'priced',
      );
      expect(isValidElement(element)).toBe(true);
      expect(element.props).toMatchObject({ data: PAGE_DATA, locale });
    },
  );

  it('normalizes invalid and array values with the canonical overview defaults', async () => {
    await renderOverviewPage({
      locale: 'en',
      searchParams: Promise.resolve({
        tier: ['999', '75'],
        engine: ['vendor', 'all'],
        compare: ['weekly', '30d'],
        ref: ['h100', 'b300'],
        models: ['inactive', 'all'],
        rows: ['some', 'changed'],
        hwrows: ['blank', 'priced'],
      }),
    });

    expect(mockGetOverviewPageData).toHaveBeenCalledOnce();
    expect(mockGetOverviewPageData).toHaveBeenCalledWith(
      50,
      'community',
      'hardware',
      'b200',
      'default',
      'all',
      'all',
    );
  });
});
