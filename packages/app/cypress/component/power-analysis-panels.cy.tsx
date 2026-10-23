import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { useState } from 'react';

import type { AggDataEntry, InferenceData } from '@/components/inference/types';
import PowerAnalysisPanels from '@/components/inference/ui/PowerAnalysisPanels';
import type { BenchmarkRow } from '@/lib/api/api';
import { modelSystemPower } from '@/lib/power/modeled-system-power';
import { writeUrlParams } from '@/lib/routing/url-state';

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

const breakdownRow = (gpuWatts: number) =>
  ({
    model: 'qwen3.5',
    hardware: 'b200',
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
    conc: 1,
    offload_mode: 'off',
    image: 'lmsysorg/sglang:v0.5.19-cu130',
    date: '2026-09-23',
    run_url: 'https://example.invalid/runs/900000001',
    metrics: {
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: gpuWatts,
      avg_total_gpu_power_w: gpuWatts * 8,
      median_intvty: 100,
    },
  }) as unknown as BenchmarkRow;
const breakdownLadder = [250, 380, 520, 640].map((watts, index) =>
  point({
    id: 40 + index,
    conc: 4 ** index,
    physicalChips: 8,
    tp: 8,
    decode_tp: 8,
    measuredAvgPower: metric(watts),
    utilityModeledWatts: metric(1),
    modeledSystemPower: modelSystemPower(breakdownRow(watts)),
  }),
);

function PanelsHarness({
  initial,
  added = [],
  overlay = overlayPoints,
  xField = 'mean_tpot_intvty',
}: {
  initial: InferenceData[];
  added?: InferenceData[];
  overlay?: InferenceData[];
  xField?: keyof AggDataEntry;
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
        />
      </div>
    </PathnameContext.Provider>
  );
}

const providers = {
  inference: {},
  unofficial: { runIndexByUrl: { [OVERLAY_RUN_URL]: 0 } },
};

describe('PowerAnalysisPanels', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (error) => {
      if (error.message.includes('ResizeObserver loop')) return false;
    });
    writeUrlParams({ i_roleshare: '0', i_powerfit: '0' });
  });

  it('keeps official and overlay power fits without the retired comparison controls', () => {
    mountWithProviders(<PanelsHarness initial={[...fitLadder, ...overlayPoints]} />, providers);
    cy.get('[data-testid="power-analysis-panels"]').should('be.visible');
    cy.get('[data-testid="power-fit-toggle"]').check();
    cy.get(
      '[data-testid="power-analysis-test-power-fit-plot"] circle.point[fill="var(--overlay-run-0)"]',
    ).should('have.length', 2);
    cy.get('[data-testid="power-analysis-test-power-fit-plot"] circle.point')
      .not('[fill="var(--overlay-run-0)"]')
      .should('have.length', 4);
    cy.get('[data-testid="power-fit-row"]').should('have.length', 2);
    cy.get('[data-testid^="equal-service-"]').should('not.exist');
    cy.get('[data-testid^="matched-concurrency"]').should('not.exist');
  });

  it('adds late official observations to an enabled fit without losing the overlay', () => {
    mountWithProviders(<PanelsHarness initial={overlayPoints} added={fitLadder} />, providers);
    cy.get('[data-testid="power-fit-toggle"]').check();
    cy.get('[data-testid="power-fit-row"]').should('have.length', 1);
    cy.get('[data-testid="add-source"]').click();
    cy.get('[data-testid="power-fit-row"]').should('have.length', 2);
    cy.get('[data-testid="power-analysis-test-power-fit-plot"] circle.point').should(
      'have.length',
      6,
    );
    cy.get(
      '[data-testid="power-analysis-test-power-fit-plot"] circle.point[fill="var(--overlay-run-0)"]',
    ).should('have.length', 2);
  });

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
        />,
        providers,
      );
      cy.get('[data-testid="role-share-toggle"]').check();
      cy.get('[data-testid="power-analysis-test-role-power-plot"] circle.point').should(
        'have.length',
        6,
      );
      cy.get(
        '[data-testid="power-analysis-test-role-power-plot"] circle.point[fill="var(--overlay-run-0)"]',
      ).should('have.length', 2);
    });
  }

  for (const width of [1280, 393]) {
    it(`stacks every measured point's system power at ${width}px and switches to the area view`, () => {
      cy.viewport(width, 900);
      writeUrlParams({ i_powerbreakdown: '0', i_pbview: 'bars' });
      mountWithProviders(<PanelsHarness initial={breakdownLadder} overlay={[]} />, providers);
      cy.get('[data-testid="power-breakdown-panel"]').should('not.exist');
      cy.get('[data-testid="power-breakdown-toggle"]').check();
      cy.get('[data-testid="power-breakdown-panel"]').should('be.visible');
      cy.get('[data-testid="power-breakdown-legend"]')
        .should('contain.text', 'Measured GPU')
        .and('contain.text', 'Facility overhead')
        .and('not.contain.text', 'Grace');
      // One stacked column per concurrency, each with a measured GPU base and a facility top.
      cy.get('[data-testid="power-breakdown-bar"][data-category="gpu"]').should('have.length', 4);
      cy.get('[data-testid="power-breakdown-bar"][data-category="facility"]').should(
        'have.length',
        4,
      );
      cy.get('[data-testid="power-breakdown-total"]').should('have.length', 4);
      cy.get('[data-testid="power-breakdown-tdp-line"]').should('exist');
      cy.get('[data-testid="power-breakdown-hit"]').eq(3).trigger('mouseenter', { force: true });
      cy.get('[data-testid="power-breakdown-tooltip"]')
        .should('contain.text', 'c64')
        .and('contain.text', '640')
        .and('contain.text', 'All in Measured');
      cy.get('[data-testid="power-breakdown-hit"]').eq(3).trigger('mouseleave', { force: true });

      cy.get('[data-testid="power-breakdown-view-area"]').click();
      cy.get('[data-testid="power-breakdown-view-area"]').should(
        'have.attr',
        'aria-pressed',
        'true',
      );
      cy.get('[data-testid="power-breakdown-bar"]').should('not.exist');
      cy.get('[data-testid="power-breakdown-area"]').should('have.length.at.least', 5);
      cy.get('[data-testid="power-breakdown-panel"]').then(($panel) => {
        expect($panel[0].scrollWidth).to.be.at.most($panel[0].clientWidth + 1);
      });
    });
  }
});
