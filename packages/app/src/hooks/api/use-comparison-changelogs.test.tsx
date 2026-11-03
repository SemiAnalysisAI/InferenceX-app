// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChangelogRow, WorkflowChangelogDate } from '@/lib/api/api';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('@/lib/api/api', () => ({ fetchWorkflowChangelogs: mockFetch }));

import {
  type ComparisonChangelog,
  shouldFetchComparisonChangelogs,
  useComparisonChangelogs,
} from './use-comparison-changelogs';

const changelog = (date: string, id: number, description: string): ChangelogRow => ({
  workflow_run_id: id,
  date,
  base_ref: 'main',
  head_ref: `head-${id}-${description}`,
  config_keys: [`key-${description}`],
  description,
  pr_link: description === 'a' ? 'https://example.test/pr' : null,
  append_only: false,
});
const run = (date: string, id: number, createdAt: string) => ({
  github_run_id: id,
  name: `run ${id}`,
  conclusion: 'success',
  run_attempt: 1,
  html_url: id === 2 ? null : `https://example.test/runs/${id}`,
  created_at: createdAt,
  date,
});

const SERVER: WorkflowChangelogDate[] = [
  {
    date: '2026-01-01',
    runs: [
      run('2026-01-01', 1, '2026-01-01T05:00:00Z'),
      run('2026-01-01', 2, '2026-01-01T01:00:00Z'),
      run('2026-01-01', 3, '2026-01-01T03:00:00Z'),
    ],
    changelogs: [
      changelog('2026-01-01', 1, 'a'),
      changelog('2026-01-01', 2, 'b'),
      changelog('2026-01-01', 1, 'c'),
    ],
    runConfigs: [
      {
        github_run_id: 1,
        run_started_at: null,
        html_url: null,
        head_sha: 'abc',
        model: 'm',
        precision: 'fp8',
        hardware: 'h100',
        framework: 'sglang',
        spec_method: 'none',
        disagg: false,
      },
    ],
  },
  {
    date: '2026-01-02',
    runs: [run('2026-01-02', 4, '2026-01-02T01:00:00Z')],
    changelogs: [changelog('2026-01-02', 4, 'skipped')],
    runConfigs: [],
  },
  {
    date: '2026-01-04',
    runs: [run('2026-01-04', 5, '2026-01-04T01:00:00Z')],
    changelogs: [changelog('2026-01-04', 5, 'd')],
    runConfigs: [],
  },
];

function legacyChangelogs(dates: string[], perDate: Map<string, WorkflowChangelogDate>) {
  const results: ComparisonChangelog[] = [];
  for (const date of dates) {
    const data = perDate.get(date) ?? { runs: [], changelogs: [], runConfigs: [] };
    if (data.changelogs.length === 0) continue;
    const entriesByRun = new Map<number, ChangelogRow[]>();
    for (const c of data.changelogs) {
      const list = entriesByRun.get(c.workflow_run_id) ?? [];
      list.push(c);
      entriesByRun.set(c.workflow_run_id, list);
    }
    const runs = [...data.runs]
      .toSorted((a, b) => a.created_at.localeCompare(b.created_at))
      .map((r) => {
        const runEntries = entriesByRun.get(r.github_run_id) ?? [];
        return {
          runId: String(r.github_run_id),
          headRef: runEntries.at(-1)?.head_ref,
          runUrl: r.html_url ?? undefined,
          entries: runEntries.map((c) => ({
            config_keys: c.config_keys,
            description: c.description,
            pr_link: c.pr_link,
          })),
        };
      })
      .filter((r) => r.entries.length > 0);
    results.push({
      date,
      entries: data.changelogs.map((c) => ({
        config_keys: c.config_keys,
        description: c.description,
        pr_link: c.pr_link,
      })),
      runs,
      runConfigs: data.runConfigs ?? [],
    });
  }
  return results;
}

const NO_RANGE = { startDate: '', endDate: '' };

describe('shouldFetchComparisonChangelogs', () => {
  const base = {
    embedded: true,
    changelogOpened: false,
    selectedDateRange: NO_RANGE,
    selectedDates: [] as string[],
  };

  it('defers the changelog request for a collapsed embedded changelog', () => {
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

let observed: ReturnType<typeof useComparisonChangelogs> | undefined;

function Probe({
  gpus,
  availableDates,
  enabled,
}: {
  gpus: string[];
  availableDates: string[];
  enabled: boolean;
}) {
  observed = useComparisonChangelogs(
    gpus,
    { startDate: '2026-01-01', endDate: '2026-01-05' },
    availableDates,
    'agentic_traces',
    enabled,
  );
  return null;
}

describe('useComparisonChangelogs', () => {
  let root: Root | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    observed = undefined;
    vi.clearAllMocks();
  });

  async function render(gpus: string[], availableDates: string[], enabled = true) {
    if (root) act(() => root?.unmount());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    root = createRoot(document.createElement('div'));
    act(() => {
      root!.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(Probe, { gpus, availableDates, enabled }),
        ),
      );
    });
    await act(async () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 0);
      await promise;
    });
  }

  it('fetches the whole range once and matches the per-date construction', async () => {
    mockFetch.mockResolvedValue({ dates: SERVER });
    const availableDates = ['2025-12-31', '2026-01-04', '2026-01-01', '2026-01-03', '2026-01-06'];
    await render(['h100'], availableDates);
    await act(() => vi.waitFor(() => expect(observed?.loading).toBe(false)));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]!.slice(0, 2)).toEqual(['2026-01-01', '2026-01-04']);
    expect(mockFetch.mock.calls[0]![3]).toBe('agentic_traces');

    const datesToQuery = ['2026-01-04', '2026-01-01', '2026-01-03'];
    const expected = legacyChangelogs(datesToQuery, new Map(SERVER.map((d) => [d.date, d])));
    expect(observed?.changelogs).toEqual(expected);
    expect(observed?.changelogs.map((c) => c.date)).toEqual(['2026-01-04', '2026-01-01']);
    expect(observed?.loading).toBe(false);
    expect(observed?.totalDatesQueried).toBe(3);
  });

  it('requests nothing while disabled', async () => {
    await render(['h100'], ['2026-01-01'], false);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(observed).toEqual({ changelogs: [], loading: false, totalDatesQueried: 0 });
  });

  it('makes no request without GPUs or dates', async () => {
    await render([], ['2026-01-01']);
    await render(['h100'], ['2027-01-01']);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(observed).toEqual({ changelogs: [], loading: false, totalDatesQueried: 0 });
  });
});
