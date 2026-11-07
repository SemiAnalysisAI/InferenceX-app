import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { useState } from 'react';

import type { AggDataEntry, InferenceData } from '@/components/inference/types';
import PowerAnalysisPanels from '@/components/inference/ui/PowerAnalysisPanels';
import type { BenchmarkRow } from '@/lib/api/api';
import { modelSystemPower } from '@/lib/power/modeled-system-power';

import { createMockInferenceData } from '../support/mock-data';
import { mountWithProviders } from '../support/test-utils';

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

function PanelsHarness({
  initial,
  added = [],
  overlay = overlayPoints,
  xField = 'mean_tpot_intvty',
  showRoles = false,
}: {
  initial: InferenceData[];
  added?: InferenceData[];
  overlay?: InferenceData[];
  xField?: keyof AggDataEntry;
  showRoles?: boolean;
}) {
  const [extra, setExtra] = useState<InferenceData[]>([]);
  return (
    <PathnameContext.Provider value="/inference">
      <div style={{ width: '100%', maxWidth: 1120, padding: 12, boxSizing: 'border-box' }}>
        {added.length > 0 && (
          <button type="button" data-testid="add-source" onClick={() => setExtra(added)}>
            add source
          </button>
        )}
        <PowerAnalysisPanels
          data={[...initial, ...extra]}
          overlayData={overlay}
          xField={xField}
          xLabel="Interactivity (output tok/s/user)"
          chartId="power-analysis-test"
          showRoles={showRoles}
        />
      </div>
    </PathnameContext.Provider>
  );
}

const providers = {
  inference: {},
  unofficial: { runIndexByUrl: { [OVERLAY_RUN_URL]: 0 } },
};

/** A single-node MI355X row whose window also passed the RAPL package check. */
const raplRow = (gpuWatts: number): BenchmarkRow => ({
  id: 1,
  model: 'qwen3.5',
  hardware: 'mi355x',
  framework: 'sglang',
  precision: 'fp8',
  spec_method: 'none',
  disagg: false,
  is_multinode: false,
  prefill_tp: 8,
  prefill_ep: 1,
  prefill_dp_attention: false,
  prefill_num_workers: 0,
  decode_tp: 8,
  decode_ep: 1,
  decode_dp_attention: false,
  decode_num_workers: 0,
  num_prefill_gpu: 8,
  num_decode_gpu: 8,
  benchmark_type: 'single_turn',
  isl: 8192,
  osl: 1024,
  conc: 8,
  offload_mode: 'off',
  image: 'lmsysorg/sglang:v0.5.19-rocm',
  date: '2026-09-23',
  run_url: 'https://example.invalid/runs/900000001',
  power_audit: { cpu: { sensor_kind: 'rapl_package', expected_sockets: 2, observed_sockets: 2 } },
  metrics: {
    power_valid: 1,
    power_metric_schema_version: 2,
    avg_power_w: gpuWatts,
    avg_total_gpu_power_w: gpuWatts * 8,
    cpu_power_valid: 1,
    avg_cpu_socket_power_w: 210.25,
    avg_total_cpu_power_w: 420.5,
  },
});
const raplPoints = (runUrl?: string) =>
  [500, 700].map((gpuWatts, index) =>
    point({
      id: (runUrl ? 40 : 30) + index,
      hwKey: 'mi355x_sglang',
      hw: 'MI355X',
      physicalChips: 8,
      tp: 8,
      decode_tp: 8,
      conc: 8 * 2 ** index,
      mean_tpot_intvty: 60 - 20 * index,
      ...(runUrl ? { run_url: runUrl } : {}),
      measuredAvgPower: metric(gpuWatts),
      utilityModeledWatts: metric(gpuWatts * 1.6),
      modeledSystemPower: modelSystemPower(raplRow(gpuWatts)),
    }),
  );

describe('PowerAnalysisPanels', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (error) => {
      if (error.message.includes('ResizeObserver loop')) return false;
    });
  });

  for (const [width, overlay] of [
    [1280, false],
    [390, true],
  ] as const) {
    it(`lists x86 RAPL packages as the measured CPU part (${overlay ? 'overlay' : 'official'}, ${width}px)`, () => {
      cy.viewport(width, 900);
      mountWithProviders(
        <PanelsHarness
          initial={overlay ? fitLadder : raplPoints()}
          overlay={overlay ? raplPoints(OVERLAY_RUN_URL) : []}
        />,
        providers,
      );
      // Only the MI355X rows carry a system model, so they are the breakdown's one series.
      cy.get('[data-testid="power-breakdown-source"]').should('contain.text', 'MI355X');
      cy.get('[data-testid="power-part-row"][data-category="measuredCpu"]').should(
        'contain.text',
        'Measured CPU',
      );
      cy.get('[data-testid="power-part-row"][data-category="cpu"]').should('not.exist');
    });
  }

  for (const percentile of ['p75', 'p90']) {
    it(`renders role observations on the derived ${percentile.toUpperCase()} axis`, () => {
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
      mountWithProviders(
        <PanelsHarness
          initial={rolePoints}
          overlay={[rolePoints[2]]}
          xField={`${percentile}_e2e_norm_intvty` as keyof AggDataEntry}
          showRoles
        />,
        providers,
      );
      cy.get('[data-testid="power-analysis-test-role-power-plot"] circle.point').should(
        'have.length',
        6,
      );
      cy.get(
        '[data-testid="power-analysis-test-role-power-plot"] circle.point[fill="var(--overlay-run-0)"]',
      ).should('have.length', 2);
    });
  }
});
