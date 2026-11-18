// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import type { GpuPowerSeries } from '@/components/gpu-power/power-series';
import type { InferenceData } from '@/components/inference/types';
import type { PowerTimelineTrace } from '@/components/inference/utils/powerTimeline';

vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));
vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsMobileViewport: () => false }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { formatLoadSwingWatts, loadSwingRows } from './load-swing-rows';
import { PowerLoadSwings } from './PowerLoadSwings';
import { PowerXSwingRanking, type PowerXSwingRankingRowView } from './PowerXSwingRanking';
import { powerXSwingRanking, swingDeltaVsBest } from './swing-ranking';
import type { PowerXRole } from './powerx-role';

const START_MS = Date.UTC(2026, 9, 21, 12);

/** One GPU row per entry: `role` tags the pool, undefined leaves the trace aggregated. */
function series(rows: { role?: 'prefill' | 'decode'; watts: number[] }[]): GpuPowerSeries {
  return {
    artifact: 'power_validation',
    startMs: START_MS,
    bucketSeconds: 1,
    gpus: rows.map((_, index) => index),
    t: rows[0].watts.map((_, index) => index),
    power: rows.map((row) => row.watts),
    devices: rows.map((row, index) => ({ id: `gpu-${index}`, role: row.role })),
  };
}

function trace(hwKey: string, id: number, s: GpuPowerSeries, x = 40): PowerTimelineTrace {
  const point = { id, hwKey, conc: 16, x, y: 1, disagg: true } as InferenceData;
  return {
    key: `${id}:${hwKey}`,
    point,
    runId: String(id),
    series: s,
    windowStartMs: null,
    windowEndMs: null,
  };
}

// GB200: the prefill pool ramps 200 → 900 W while decode holds 400 W, so the all-GPU mean
// moves 300 → 650 W, a 350 W swing within 5 s (29% of the 1,200 W TDP).
const gb200 = trace(
  'gb200_dynamo-vllm',
  101,
  series([
    { role: 'prefill', watts: [200, 200, 200, 200, 200, 200, 900, 900, 900, 900, 900, 900] },
    { role: 'decode', watts: [400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400] },
  ]),
);
// GB300: a smaller 150 W mean swing.
const gb300 = trace(
  'gb300_dynamo-vllm',
  102,
  series([
    { role: 'prefill', watts: [300, 300, 300, 300, 300, 300, 600, 600, 600, 600, 600, 600] },
    { role: 'decode', watts: [500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500] },
  ]),
);
// MI355X aggregated: the largest swing (800 W), but it has no prefill/decode pools to split.
const mi355x = trace(
  'mi355x_vllm',
  103,
  series([{ watts: [200, 200, 200, 200, 200, 200, 1000, 1000, 1000, 1000, 1000, 1000] }]),
);

function mount(node: React.ReactNode) {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(node));
  return container;
}

/** The Max Δ5s cell of a load-swings table row, e.g. "350 W · 29% TDP". */
const hwLabel = (point: InferenceData) => point.hwKey;

function maxDelta5sCell(table: HTMLElement, label: string): string {
  const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent ?? '');
  const column = headers.indexOf('Max Δ5s');
  const row = [...table.querySelectorAll('tbody tr')].find((tr) =>
    tr.querySelector('th')?.textContent?.includes(label),
  );
  return row?.children[column]?.textContent ?? '';
}

const at = {
  at: 40,
  seriesOf: (point: InferenceData) => point.hwKey,
  interactivityOf: (point: InferenceData) => point.x,
};

function ranking(traces: PowerTimelineTrace[], role: PowerXRole) {
  return powerXSwingRanking(loadSwingRows(traces, role), role, at);
}

/** The ranking as Over time renders it: value text from the same formatter as the table. */
function mountRanking(traces: PowerTimelineTrace[], role: PowerXRole, rack: boolean) {
  const rows: PowerXSwingRankingRowView[] = ranking(traces, role).map((row) => ({
    key: row.key,
    label: row.key,
    color: '#888',
    rank: row.rank,
    valueText: row.value === null ? null : formatLoadSwingWatts(row.value, rack),
    delta: row.delta,
    hidden: false,
    aggregated: row.aggregated,
    conc: row.trace.point.conc,
    x: row.trace.point.x,
  }));
  return mount(<PowerXSwingRanking at={40} unit="W per GPU" rows={rows} onToggle={vi.fn()} />);
}

function rankingValue(container: HTMLElement, key: string): string {
  return (
    container.querySelector(
      `[data-testid="powerx-swing-ranking-row"][data-key="${key}"] [data-testid="powerx-swing-ranking-value"]`,
    )?.textContent ?? ''
  );
}

describe('Over time ranking (Max 5 s swing per GPU)', () => {
  it('ranks the lowest Max 5 s swing best and prints Δ vs best', () => {
    const rows = ranking([mi355x, gb200, gb300], 'all');
    expect(rows.map((row) => [row.key, row.value, row.rank, row.delta])).toEqual([
      ['gb300_dynamo-vllm', 150, 1, 'best'],
      ['gb200_dynamo-vllm', 350, 2, '+133%'],
      ['mi355x_vllm', 800, 3, '+433%'],
    ]);
    expect(swingDeltaVsBest(150.4, 150)).toBe('+1%');
  });

  it('prints the same W and rack kW as the load-swings table Max Δ5s cell for each GPU', () => {
    const traces = [mi355x, gb300, gb200];
    for (const rack of [false, true]) {
      const table = mount(
        <PowerLoadSwings
          traces={traces}
          colorOf={() => '#888'}
          labelOf={hwLabel}
          role="all"
          rack={rack}
        />,
      );
      const card = mountRanking(traces, 'all', rack);
      for (const hw of ['gb200_dynamo-vllm', 'gb300_dynamo-vllm', 'mi355x_vllm']) {
        const cell = maxDelta5sCell(table, hw).split(' · ')[0];
        expect(rankingValue(card, hw)).toBe(cell);
      }
      expect(rankingValue(card, 'gb200_dynamo-vllm')).toBe(rack ? '25.2 kW' : '350 W');
    }
  });

  it('reads each GPU from its trace nearest Compare at', () => {
    // A second GB200 trace far from 40 tok/s/user with a flat line: the ranking keeps the
    // 350 W trace at 40 rather than the 0 W one at 200.
    const far = trace(
      'gb200_dynamo-vllm',
      104,
      series([
        { role: 'prefill', watts: Array.from({ length: 12 }, () => 500) },
        { role: 'decode', watts: Array.from({ length: 12 }, () => 500) },
      ]),
      200,
    );
    const [row] = ranking([far, gb200], 'all');
    expect(row.trace).toBe(gb200);
    expect(row.value).toBe(350);
    expect(
      powerXSwingRanking(loadSwingRows([far, gb200], 'all'), 'all', { ...at, at: 200 })[0].trace,
    ).toBe(far);
  });

  it('lists an aggregated trace under a GPU role with no value, never 0, and ranks it last', () => {
    const rows = ranking([mi355x, gb200], 'decode');
    const mi = rows.find((row) => row.key === 'mi355x_vllm');
    expect(mi).toMatchObject({ aggregated: true, value: null, rank: null, delta: null });
    expect(rows.at(-1)).toBe(mi);
    const card = mountRanking([mi355x, gb200], 'decode', false);
    expect(rankingValue(card, 'mi355x_vllm')).not.toMatch(/\d/u);
    const miRow = card.querySelector<HTMLElement>('[data-key="mi355x_vllm"]');
    expect(miRow?.dataset.aggregated).toBe('');
  });

  it('ranks Prefill vs decode by the larger of the two pools', () => {
    const [row] = ranking([gb200], 'split');
    expect(row.pools?.prefill).toBe(700);
    expect(row.pools?.decode).toBe(0);
    expect(row.value).toBe(700);
  });
});
