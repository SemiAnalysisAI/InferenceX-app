// @test-environment jsdom
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { describe, expect, it } from 'bun:test';

import type { AggDataEntry, InferenceData } from '@/components/inference/types';
import { $$, eventually, fakeLayout, render } from '@/test/dom';
import { createMockInferenceData, withProviders } from '@/test/mock-providers';

import PowerAnalysisPanels from './PowerAnalysisPanels';

const metric = (y: number) => ({ y, roof: false });
const point = (overrides: Partial<InferenceData> = {}) =>
  createMockInferenceData({
    hwKey: 'b200_sglang',
    hw: 'B200',
    framework: 'sglang',
    precision: 'fp8',
    physicalChips: 4,
    tp: 4,
    decode_tp: 4,
    conc: 8,
    date: '2026-09-23',
    run_url: 'https://example.invalid/runs/900000001',
    benchmark_type: 'single_turn',
    mean_tpot_intvty: 20,
    output_tput_per_gpu: 50,
    measuredAvgPower: metric(400),
    measuredJPerOutputToken: metric(10),
    ...overrides,
  });
const OVERLAY_RUN_URL = 'https://example.invalid/runs/900000002';
const overlayPoints = [100, 200].map((rate, index) =>
  point({
    id: 3 + index,
    hwKey: 'b300_sglang',
    run_url: OVERLAY_RUN_URL,
    conc: 2 ** index,
    output_tput_per_gpu: rate,
    measuredAvgPower: metric(600 + 2 * rate),
    measuredJPerOutputToken: metric(8 + 8 * index),
  }),
);
const fitLadder = [20, 60, 120, 260].map((rate, index) =>
  point({
    id: 20 + index,
    conc: 2 ** index,
    mean_tpot_intvty: 100 - 20 * index,
    output_tput_per_gpu: rate,
    measuredAvgPower: metric(250 + 0.5 * rate),
    measuredJPerOutputToken: metric((250 + 0.5 * rate) / rate),
  }),
);

describe('PowerAnalysisPanels', () => {
  for (const percentile of ['p75', 'p90']) {
    it(`renders role observations on the derived ${percentile.toUpperCase()} axis`, async () => {
      const rolePoints = [...fitLadder.slice(0, 2), overlayPoints[0]].map<InferenceData>(
        (entry, index) => ({
          ...entry,
          x: [31.2, 24.8, 28][index],
          benchmark_type: 'agentic_traces',
          disagg: true,
          physicalChips: 8,
          num_prefill_gpu: 4,
          num_decode_gpu: 4,
          measuredPrefillAvgPower: metric(300),
          measuredDecodeAvgPower: metric(500),
        }),
      );
      fakeLayout(1120);
      render(
        withProviders(
          <PathnameContext.Provider value="/infx/inference">
            <div style={{ width: '100%', maxWidth: 1120, padding: 12, boxSizing: 'border-box' }}>
              <PowerAnalysisPanels
                data={rolePoints}
                overlayData={[rolePoints[2]]}
                xField={`${percentile}_e2e_norm_intvty` as keyof AggDataEntry}
                xLabel="Interactivity (output tok/s/user)"
                chartId="power-analysis-test"
                showRoles
              />
            </div>
          </PathnameContext.Provider>,
          { inference: {}, unofficial: { runIndexByUrl: { [OVERLAY_RUN_URL]: 0 } } },
        ),
      );
      const plot = '[data-testid="power-analysis-test-role-power-plot"]';
      await eventually(() => expect($$(`${plot} circle.point`)).toHaveLength(6));
      expect($$(`${plot} circle.point[fill="var(--overlay-run-0)"]`)).toHaveLength(2);
    });
  }
});
