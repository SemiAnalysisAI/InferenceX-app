// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  shouldFetchComparisonChangelogs,
  useComparisonChangelogs,
} from '@/hooks/api/use-comparison-changelogs';

const NO_RANGE = { startDate: '', endDate: '' };
const DATES = ['2026-10-01', '2026-10-02', '2026-10-03'];

describe('shouldFetchComparisonChangelogs', () => {
  const base = {
    embedded: true,
    changelogOpened: false,
    selectedDateRange: NO_RANGE,
    selectedDates: [] as string[],
  };

  it('defers the per-date fan-out for a collapsed embedded changelog', () => {
    expect(shouldFetchComparisonChangelogs(base)).toBe(false);
  });

  it('fetches once the reader opens the changelog', () => {
    expect(shouldFetchComparisonChangelogs({ ...base, changelogOpened: true })).toBe(true);
  });

  it('fetches when a date comparison needs per-date run configs', () => {
    expect(
      shouldFetchComparisonChangelogs({
        ...base,
        selectedDateRange: { startDate: '2026-10-01', endDate: '2026-10-02' },
      }),
    ).toBe(true);
    expect(shouldFetchComparisonChangelogs({ ...base, selectedDates: ['2026-10-01'] })).toBe(true);
  });

  it('ignores a half-set date range', () => {
    expect(
      shouldFetchComparisonChangelogs({
        ...base,
        selectedDateRange: { startDate: '2026-10-01', endDate: '' },
      }),
    ).toBe(false);
  });

  it('always fetches on the full dashboard, where the changelog starts expanded', () => {
    expect(shouldFetchComparisonChangelogs({ ...base, embedded: false })).toBe(true);
  });
});

let totalDatesQueried = -1;

function Probe({ enabled }: { enabled: boolean }) {
  totalDatesQueried = useComparisonChangelogs(
    ['h200_sglang'],
    NO_RANGE,
    DATES,
    undefined,
    enabled,
  ).totalDatesQueried;
  return null;
}

function mount(enabled: boolean) {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() =>
      Promise.resolve(Response.json({ runs: [], changelogs: [], configs: [], runConfigs: [] })),
    );
  totalDatesQueried = -1;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(document.createElement('div'));
  act(() => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Probe, { enabled })));
  });
  return { fetchSpy, root, total: () => totalDatesQueried };
}

describe('useComparisonChangelogs', () => {
  afterEach(() => vi.restoreAllMocks());

  it('requests nothing while disabled', async () => {
    const { fetchSpy, root, total } = mount(false);
    await act(async () => {});
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(total()).toBe(0);
    act(() => root.unmount());
  });

  it('requests every available date when enabled without a date range', async () => {
    const { fetchSpy, root, total } = mount(true);
    await act(async () => {});
    expect(total()).toBe(DATES.length);
    expect(fetchSpy.mock.calls.map(([input]) => String(input))).toEqual(
      DATES.map((date) => `/api/v1/workflow-info?date=${date}`),
    );
    act(() => root.unmount());
  });
});
