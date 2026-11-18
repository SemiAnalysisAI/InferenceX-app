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

import { PowerLoadSwings } from './PowerLoadSwings';
import { PowerXInsightCard } from './PowerXInsightCard';
import { powerXInsight, powerXLoadSwingInsight } from './powerx-insight';

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

function trace(hwKey: string, id: number, s: GpuPowerSeries): PowerTimelineTrace {
  const point = { id, hwKey, conc: 16, x: 40, y: 1, disagg: true } as InferenceData;
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

describe('Over time insight under All GPUs (5 s load swing)', () => {
  it('reads the largest Max Δ5s among traces that split into prefill and decode pools', () => {
    const insight = powerXLoadSwingInsight([mi355x, gb300, gb200]);
    expect(insight?.point).toBe(gb200.point);
    expect(insight?.finding).toMatchObject({ kind: 'swing', deltaWatts: 350, tdpWatts: 1200 });
    expect(insight?.hardware).toEqual(['gb300_dynamo-vllm', 'gb200_dynamo-vllm']);
    expect(
      powerXInsight({ view: 'time', role: 'all', points: [], traces: [gb200] })?.finding.kind,
    ).toBe('swing');
  });

  it('has no swing finding when every visible trace is aggregated or none has loaded', () => {
    expect(powerXLoadSwingInsight([mi355x])).toBeNull();
    expect(powerXInsight({ view: 'time', role: 'all', points: [], traces: [] })).toBeNull();
    expect(powerXInsight({ view: 'time', role: 'all', points: [] })).toBeNull();
  });

  it('prints the same W, % of TDP and rack kW as the load-swings table row it names', () => {
    const traces = [mi355x, gb300, gb200];
    const table = mount(
      <PowerLoadSwings traces={traces} colorOf={() => '#888'} labelOf={hwLabel} role="all" />,
    );
    const card = mount(
      <PowerXInsightCard
        view="time"
        role="all"
        points={[]}
        traces={traces}
        onRoleChange={vi.fn()}
        hardwareLabel={(hw) => hw}
      />,
    );
    const headline =
      card.querySelector('[data-testid="powerx-insight-headline"]')?.textContent ?? '';
    expect(headline).toContain('gb200_dynamo-vllm at c16');

    const perGpu = maxDelta5sCell(table, 'gb200_dynamo-vllm');
    expect(perGpu).toBe('350 W · 29% TDP');
    const [watts, tdp] = perGpu.split(' · ');
    expect(headline).toContain(`${watts} per GPU within 5 s (${tdp.replace(' TDP', '')} of TDP)`);

    act(() =>
      table.querySelector<HTMLButtonElement>('[data-testid="powerx-swings-rack"]')!.click(),
    );
    const perRack = maxDelta5sCell(table, 'gb200_dynamo-vllm');
    expect(perRack).toBe('25.2 kW · 29% TDP');
    expect(headline).toContain(`${perRack.split(' · ')[0]} per NVL72 rack`);
  });
});
