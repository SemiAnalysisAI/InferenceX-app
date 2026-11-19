import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OverviewPageData } from './overview-data';

const { mockGetOverviewPageData } = vi.hoisted(() => ({
  mockGetOverviewPageData: vi.fn(),
}));

vi.mock('@/lib/overview/overview-data.server', () => ({
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
    'prerenders the default controls once and propagates the %s locale',
    async (locale) => {
      const element = await renderOverviewPage({ locale });

      expect(mockGetOverviewPageData).toHaveBeenCalledOnce();
      expect(mockGetOverviewPageData).toHaveBeenCalledWith();
      expect(isValidElement(element)).toBe(true);
      expect(element.props).toMatchObject({ data: PAGE_DATA, locale });
    },
  );
});
