import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { useState } from 'react';

import type { AggDataEntry, InferenceData } from '@/components/inference/types';
import PowerAnalysisPanels from '@/components/inference/ui/PowerAnalysisPanels';
import { writeUrlParams } from '@/lib/url-state';

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
    // URL state survives the previous component mount.
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
});
