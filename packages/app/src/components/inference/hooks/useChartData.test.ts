import { describe, it, expect } from 'vitest';

import chartDefinitions from '@/components/inference/inference-chart-config.json';
import { dedupeAgenticHistoryRuns } from '@/lib/benchmark-run-selection';

import type { InferenceData } from '@/components/inference/types';
import { EMPTY_QUICK_FILTERS } from '@/components/inference/utils/quickFilters';

import {
  applyAgenticPercentileToXLabel,
  applyScopeFilters,
  buildComparisonDates,
  dedupeRowsToLatestPerConfig,
  filterOverviewHistoryRows,
  filterByGPU,
  derivedModeRoofline,
  flipRooflineDirection,
} from './useChartData';

interface DedupeInput {
  id: number;
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
  precision: string;
  offload_mode?: string | null;
  benchmark_type?: string;
  date: string;
  workflow_run_id?: number;
  run_started_at?: string | null;
}

const drow = (over: Partial<DedupeInput> = {}): DedupeInput => ({
  id: 1,
  hardware: 'b300',
  framework: 'vllm',
  spec_method: 'none',
  disagg: false,
  precision: 'fp4',
  offload_mode: 'off',
  date: '2026-06-01',
  ...over,
});

describe('dedupeRowsToLatestPerConfig', () => {
  it('keeps only the latest date within a single series', () => {
    const rows = [
      drow({ id: 1, date: '2026-06-01' }),
      drow({ id: 2, date: '2026-06-03' }),
      drow({ id: 3, date: '2026-06-02' }),
    ];
    expect(dedupeRowsToLatestPerConfig(rows).map((r) => r.id)).toEqual([2]);
  });

  it('keeps BOTH offload variants even when they were ingested on different dates', () => {
    // The regression: offload=on sweep landed LATER than offload=off. Without
    // offload in the key, the on-variant's newer date would win the shared group
    // and silently drop the (older) off-variant series entirely.
    const rows = [
      drow({ id: 1, offload_mode: 'off', date: '2026-06-01' }),
      drow({ id: 2, offload_mode: 'on', date: '2026-06-05' }),
    ];
    const kept = dedupeRowsToLatestPerConfig(rows)
      .map((r) => r.offload_mode)
      .toSorted();
    expect(kept).toEqual(['off', 'on']);
  });

  it('still dedupes each offload variant to its own latest date', () => {
    const rows = [
      drow({ id: 1, offload_mode: 'off', date: '2026-06-01' }),
      drow({ id: 2, offload_mode: 'off', date: '2026-06-04' }),
      drow({ id: 3, offload_mode: 'on', date: '2026-06-02' }),
      drow({ id: 4, offload_mode: 'on', date: '2026-06-05' }),
    ];
    expect(
      dedupeRowsToLatestPerConfig(rows)
        .map((r) => r.id)
        .toSorted(),
    ).toEqual([2, 4]);
  });

  it('normalizes a missing offload_mode to "off" (matches the SQL lineKey)', () => {
    // A row with no offload_mode collides with an explicit offload=off row of the
    // same config — both are the "off" series, so latest-date dedup applies.
    const rows = [
      drow({ id: 1, offload_mode: undefined, date: '2026-06-01' }),
      drow({ id: 2, offload_mode: 'off', date: '2026-06-03' }),
    ];
    expect(dedupeRowsToLatestPerConfig(rows).map((r) => r.id)).toEqual([2]);
  });

  it('dedupes mixed agentic spec methods as one curve', () => {
    const rows = [
      drow({ id: 1, benchmark_type: 'agentic_traces', spec_method: 'none', date: '2026-06-01' }),
      drow({ id: 2, benchmark_type: 'agentic_traces', spec_method: 'mtp', date: '2026-06-03' }),
      drow({ id: 3, benchmark_type: 'agentic_traces', spec_method: 'eagle', date: '2026-06-03' }),
    ];

    expect(dedupeRowsToLatestPerConfig(rows).map((r) => r.id)).toEqual([2, 3]);
  });

  it('continues deduping fixed-sequence spec methods independently', () => {
    const rows = [
      drow({ id: 1, benchmark_type: 'single_turn', spec_method: 'none', date: '2026-06-01' }),
      drow({ id: 2, benchmark_type: 'single_turn', spec_method: 'mtp', date: '2026-06-03' }),
    ];

    expect(dedupeRowsToLatestPerConfig(rows).map((r) => r.id)).toEqual([1, 2]);
  });

  it('keeps mixed agentic points from only the newest same-day workflow run', () => {
    const rows = [
      drow({
        id: 1,
        benchmark_type: 'agentic_traces',
        spec_method: 'none',
        workflow_run_id: 10,
        run_started_at: '2026-06-03T10:00:00Z',
      }),
      drow({
        id: 2,
        benchmark_type: 'agentic_traces',
        spec_method: 'mtp',
        workflow_run_id: 10,
        run_started_at: '2026-06-03T10:00:00Z',
      }),
      drow({
        id: 3,
        benchmark_type: 'agentic_traces',
        spec_method: 'mtp',
        workflow_run_id: 11,
        run_started_at: '2026-06-03T12:00:00Z',
      }),
    ];

    expect(dedupeRowsToLatestPerConfig(rows).map((r) => r.id)).toEqual([3]);
  });

  it('keeps every spec method produced by the winning agentic workflow run', () => {
    const rows = [
      drow({
        id: 1,
        benchmark_type: 'agentic_traces',
        spec_method: 'none',
        workflow_run_id: 12,
        run_started_at: '2026-06-03T12:00:00Z',
      }),
      drow({
        id: 2,
        benchmark_type: 'agentic_traces',
        spec_method: 'mtp',
        workflow_run_id: 12,
        run_started_at: '2026-06-03T12:00:00Z',
      }),
      drow({
        id: 3,
        benchmark_type: 'agentic_traces',
        spec_method: 'eagle',
        workflow_run_id: 12,
        run_started_at: '2026-06-03T12:00:00Z',
      }),
    ];

    expect(dedupeRowsToLatestPerConfig(rows).map((r) => r.spec_method)).toEqual([
      'none',
      'mtp',
      'eagle',
    ]);
  });
});

describe('dedupeAgenticHistoryRuns', () => {
  it('keeps the newest agentic workflow per series on each date', () => {
    const rows = [
      drow({
        id: 1,
        benchmark_type: 'agentic_traces',
        spec_method: 'none',
        workflow_run_id: 20,
        run_started_at: '2026-06-01T10:00:00Z',
      }),
      drow({
        id: 2,
        benchmark_type: 'agentic_traces',
        spec_method: 'mtp',
        workflow_run_id: 21,
        run_started_at: '2026-06-01T12:00:00Z',
      }),
      drow({
        id: 3,
        benchmark_type: 'agentic_traces',
        spec_method: 'none',
        date: '2026-06-02',
        workflow_run_id: 22,
        run_started_at: '2026-06-02T10:00:00Z',
      }),
    ];

    expect(dedupeAgenticHistoryRuns(rows).map((row) => row.id)).toEqual([2, 3]);
  });

  it('keeps mixed spec points together in the winning workflow on every date', () => {
    const rows = [
      drow({
        id: 1,
        benchmark_type: 'agentic_traces',
        spec_method: 'none',
        workflow_run_id: 30,
        run_started_at: '2026-06-01T10:00:00Z',
      }),
      drow({
        id: 2,
        benchmark_type: 'agentic_traces',
        spec_method: 'mtp',
        workflow_run_id: 30,
        run_started_at: '2026-06-01T10:00:00Z',
      }),
      drow({
        id: 3,
        benchmark_type: 'agentic_traces',
        spec_method: 'eagle',
        date: '2026-06-02',
        workflow_run_id: 31,
        run_started_at: '2026-06-02T10:00:00Z',
      }),
      drow({
        id: 4,
        benchmark_type: 'agentic_traces',
        spec_method: 'none',
        date: '2026-06-02',
        workflow_run_id: 31,
        run_started_at: '2026-06-02T10:00:00Z',
      }),
    ];

    expect(
      dedupeAgenticHistoryRuns(rows).map((row) => [row.date, row.workflow_run_id, row.spec_method]),
    ).toEqual([
      ['2026-06-01', 30, 'none'],
      ['2026-06-01', 30, 'mtp'],
      ['2026-06-02', 31, 'eagle'],
      ['2026-06-02', 31, 'none'],
    ]);
  });
});

describe('buildComparisonDates', () => {
  it('returns empty when no GPUs selected (comparison disabled)', () => {
    expect(
      buildComparisonDates([], ['2026-03-01'], { startDate: '', endDate: '' }, '2026-03-01'),
    ).toEqual([]);
  });

  it('excludes the main run date from comparisons', () => {
    const result = buildComparisonDates(
      ['h100'],
      ['2026-03-01', '2026-02-01'],
      { startDate: '', endDate: '' },
      '2026-03-01',
    );
    expect(result).toEqual(['2026-02-01']);
  });

  it('keeps other same-day runs but excludes the selected main run', () => {
    const result = buildComparisonDates(
      ['h100'],
      ['2026-03-01~r301', '2026-03-01~r300', '2026-02-01~r200'],
      { startDate: '', endDate: '' },
      '2026-03-01',
      '300',
    );
    expect(result).toEqual(['2026-03-01~r301', '2026-02-01~r200']);
  });

  it('deduplicates dates appearing in both range and explicit list', () => {
    const result = buildComparisonDates(
      ['h100'],
      ['2026-03-01'],
      { startDate: '2026-02-01', endDate: '2026-03-01' },
      undefined,
    );
    expect(result).toEqual(['2026-02-01', '2026-03-01']);
  });

  it('skips date range when only start is set', () => {
    const result = buildComparisonDates(
      ['h100'],
      ['2026-02-01'],
      { startDate: '2026-01-01', endDate: '' },
      undefined,
    );
    expect(result).toEqual(['2026-02-01']);
  });
});

describe('filterByGPU', () => {
  it('passes through all data when no GPUs selected', () => {
    expect(filterByGPU([{ hwKey: 'h100' }, { hwKey: 'a100' }], [], {})).toHaveLength(2);
  });

  it('resolves aliases to canonical GPU key', () => {
    const data = [{ hwKey: 'h100-sxm' }];
    const result = filterByGPU(data, ['h100'], { 'h100-sxm': 'h100' });
    expect(result).toHaveLength(1);
  });

  it('matches both direct keys and aliases in same dataset', () => {
    const data = [{ hwKey: 'h100' }, { hwKey: 'h100-sxm' }, { hwKey: 'a100' }];
    const result = filterByGPU(data, ['h100'], { 'h100-sxm': 'h100' });
    expect(result.map((d) => d.hwKey)).toEqual(['h100', 'h100-sxm']);
  });

  it('excludes when neither key nor alias matches', () => {
    expect(filterByGPU([{ hwKey: 'unknown' }], ['h100'], {})).toHaveLength(0);
  });
});

describe('filterOverviewHistoryRows', () => {
  it('keeps only the serving envelope encoded by the Overview history link', () => {
    const rows = [
      drow({ id: 1, hardware: 'mi355x', framework: 'sglang', precision: 'fp8' }),
      drow({ id: 2, hardware: 'mi355x', framework: 'vllm', precision: 'fp4' }),
      drow({ id: 3, hardware: 'mi355x', framework: 'sglang', precision: 'fp4' }),
    ];
    const key = JSON.stringify(['qwen3.5', 'mi355x', 'vllm', 'none', 'fp4', false, false, 'off']);

    expect(
      filterOverviewHistoryRows(
        rows.map((row) => ({ ...row, model: 'qwen3.5', is_multinode: false })),
        key,
      ).map((row) => row.id),
    ).toEqual([2]);
  });

  it('is a no-op outside an Overview history pair', () => {
    const rows = [drow({ id: 1 }), drow({ id: 2 })].map((row) => ({
      ...row,
      model: 'qwen3.5',
      is_multinode: false,
    }));
    expect(filterOverviewHistoryRows(rows, undefined)).toBe(rows);
  });
});

describe('applyAgenticPercentileToXLabel', () => {
  it('prefixes the percentile when the interactivity label has no statistic word', () => {
    expect(applyAgenticPercentileToXLabel('Interactivity (tok/s/user)', 'P90')).toBe(
      'P90 Interactivity (tok/s/user)',
    );
  });

  it('prefixes the percentile when the e2e latency label has no statistic word', () => {
    expect(applyAgenticPercentileToXLabel('End-to-end Latency (s)', 'P90')).toBe(
      'P90 End-to-end Latency (s)',
    );
  });

  it('follows the selected percentile (p75)', () => {
    expect(applyAgenticPercentileToXLabel('Interactivity (tok/s/user)', 'P75')).toBe(
      'P75 Interactivity (tok/s/user)',
    );
  });

  it('replaces an existing percentile prefix instead of doubling it', () => {
    expect(applyAgenticPercentileToXLabel('P90 Time To First Token (s)', 'P75')).toBe(
      'P75 Time To First Token (s)',
    );
  });

  it('replaces Median/Mean statistic prefixes', () => {
    expect(applyAgenticPercentileToXLabel('Median Time To First Token (s)', 'P90')).toBe(
      'P90 Time To First Token (s)',
    );
    expect(applyAgenticPercentileToXLabel('Mean Interactivity (tok/s/user)', 'P75')).toBe(
      'P75 Interactivity (tok/s/user)',
    );
  });

  it('is a no-op when the label already carries the selected percentile', () => {
    expect(applyAgenticPercentileToXLabel('P90 Interactivity (tok/s/user)', 'P90')).toBe(
      'P90 Interactivity (tok/s/user)',
    );
  });

  it('does not touch mid-label statistic words', () => {
    // Only a LEADING statistic word is a prefix; words later in the label are content.
    expect(applyAgenticPercentileToXLabel('Normalized E2E @ 400 output tokens (s)', 'P90')).toBe(
      'P90 Normalized E2E @ 400 output tokens (s)',
    );
  });
});

describe('flipRooflineDirection', () => {
  it('flips left/right while preserving upper/lower', () => {
    expect(flipRooflineDirection('upper_left')).toBe('upper_right');
    expect(flipRooflineDirection('lower_right')).toBe('lower_left');
  });

  it('double flip is identity', () => {
    for (const dir of ['upper_left', 'upper_right', 'lower_left', 'lower_right'] as const) {
      expect(flipRooflineDirection(flipRooflineDirection(dir))).toBe(dir);
    }
  });
});

describe('derived higher-is-better x-axis rooflines', () => {
  // The E2E Normalized Interactivity mode renders on the e2e chart definition (lower-x-is-better)
  // but its x-axis is higher-is-better, like interactivity. ChartDisplay
  // therefore mirrors each configured e2e corner horizontally rather than
  // hardcoding one corner — hardcoding `upper_left` inverted the frontier for
  // cost and joules metrics, whose good direction is a LOWER corner.
  it('mirroring the e2e corner reproduces the interactivity corner for every y-metric', () => {
    const defs = chartDefinitions as Record<string, unknown>[];
    const e2e = defs.find((d) => d.chartType === 'e2e')!;
    const interactivity = defs.find((d) => d.chartType === 'interactivity')!;

    const rooflineKeys = Object.keys(e2e).filter((k) => k.endsWith('_roofline'));
    expect(rooflineKeys.length).toBeGreaterThan(0);

    for (const key of rooflineKeys) {
      const e2eCorner = e2e[key] as Parameters<typeof flipRooflineDirection>[0];
      expect(
        derivedModeRoofline(e2eCorner, true),
        `${key}: mirrored e2e corner must match the interactivity chart`,
      ).toBe(interactivity[key]);
    }
  });

  it('covers the cost metrics Bugbot flagged, not just throughput', () => {
    const defs = chartDefinitions as Record<string, unknown>[];
    const e2e = defs.find((d) => d.chartType === 'e2e')!;
    // Throughput wants an upper corner, cost a lower one — a single hardcoded
    // corner cannot serve both.
    expect(derivedModeRoofline(e2e.y_tpPerGpu_roofline as 'upper_right', true)).toBe('upper_left');
    expect(derivedModeRoofline(e2e.y_costh_roofline as 'lower_left', true)).toBe('lower_right');
    expect(derivedModeRoofline(e2e.y_jTotal_roofline as 'lower_left', true)).toBe('lower_right');
  });

  it('leaves the corner alone for a lower-is-better derived metric', () => {
    expect(derivedModeRoofline('upper_right', false)).toBe('upper_right');
    expect(derivedModeRoofline(undefined, true)).toBeUndefined();
  });
});

const scopePoint = (hwKey: string, extra: Record<string, unknown> = {}): InferenceData =>
  ({
    x: 10,
    y: 100,
    hwKey,
    model: 'DeepSeek-V4-Pro',
    date: '2026-08-01',
    tp: 8,
    conc: 16,
    precision: 'fp8',
    framework: hwKey.split('_')[1],
    disagg: false,
    spec_method: 'none',
    ...extra,
  }) as unknown as InferenceData;

describe('applyScopeFilters', () => {
  // The legend's selection universe is built from this filter chain. It must
  // depend on the GPU picker / quick filters / compare scope and on nothing
  // else — in particular NOT on which y-axis metric is drawn. See the
  // `selectionPoints` comment in useChartData: reconcileActiveSet intersects
  // the user's legend selection with whatever set it is handed and never
  // re-widens, so a universe that shrinks when a Measured Energy axis is
  // picked deletes the telemetry-less configs for good.
  const withTelemetry = scopePoint('b200_sglang', { measuredAvgPower: { y: 900, roof: false } });
  const withoutTelemetry = scopePoint('h200_vllm');
  const points = [withTelemetry, withoutTelemetry];

  it('keeps configs that carry no measured-power telemetry', () => {
    const scoped = applyScopeFilters(points, [], EMPTY_QUICK_FILTERS, null);
    expect(scoped.map((p) => p.hwKey)).toEqual(['b200_sglang', 'h200_vllm']);
  });

  it('still applies the GPU picker', () => {
    const scoped = applyScopeFilters(points, ['b200_sglang'], EMPTY_QUICK_FILTERS, null);
    expect(scoped.map((p) => p.hwKey)).toEqual(['b200_sglang']);
  });

  it('still applies the framework quick filter', () => {
    const scoped = applyScopeFilters(
      points,
      [],
      { ...EMPTY_QUICK_FILTERS, frameworks: ['vllm'] },
      null,
    );
    expect(scoped.map((p) => p.hwKey)).toEqual(['h200_vllm']);
  });

  it('still applies the two-GPU compare scope', () => {
    const scoped = applyScopeFilters(points, [], EMPTY_QUICK_FILTERS, ['h200', 'mi355x']);
    expect(scoped.map((p) => p.hwKey)).toEqual(['h200_vllm']);
  });
});
