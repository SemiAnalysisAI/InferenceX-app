import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { useState } from 'react';

import type { InferenceData } from '@/components/inference/types';
import PowerServiceComparison from '@/components/inference/ui/PowerServiceComparison';
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
// The overlay run: two loads of a second source.
const comparator = [
  point({
    id: 3,
    hwKey: 'b300_sglang',
    run_url: 'https://example.invalid/runs/900000002',
    measuredAvgPower: metric(800),
    output_tput_per_gpu: 100,
    measuredJPerOutputToken: metric(8),
  }),
  point({
    id: 4,
    hwKey: 'b300_sglang',
    run_url: 'https://example.invalid/runs/900000002',
    mean_tpot_intvty: 60,
    conc: 1,
    measuredAvgPower: metric(1000),
    output_tput_per_gpu: 200,
    measuredJPerOutputToken: metric(16),
  }),
];
const OVERLAY_RUN_URL = 'https://example.invalid/runs/900000002';
// W/GPU = 250 + 0.5 × output tok/s/GPU on four loads of one source.
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

function mountComparison(points: InferenceData[], overlay: InferenceData[]) {
  mountWithProviders(
    <PathnameContext.Provider value="/inference">
      <div style={{ width: '100%', maxWidth: 1120, padding: 12, boxSizing: 'border-box' }}>
        <PowerServiceComparison
          data={[...points, ...overlay]}
          overlayData={overlay}
          xField="mean_tpot_intvty"
          xLabel="Mean interactivity (output tok/s/user)"
          interactivityField="mean_tpot_intvty"
          chartId="power-service-test"
        />
      </div>
    </PathnameContext.Provider>,
    {
      inference: {},
      unofficial: { runIndexByUrl: { [OVERLAY_RUN_URL]: 0 } },
    },
  );
}

// Its key sorts ahead of the B200 baseline, so an unpinned pair would jump to it.
const laterSource = point({
  id: 40,
  hwKey: 'b100_sglang',
  run_url: 'https://example.invalid/runs/900000003',
  measuredAvgPower: metric(600),
});
function PinnedComparisonHarness({
  initial,
  added,
}: {
  initial: InferenceData[];
  added: InferenceData[];
}) {
  const [extra, setExtra] = useState<InferenceData[]>([]);
  return (
    <PathnameContext.Provider value="/inference">
      <button type="button" data-testid="add-source" onClick={() => setExtra(added)}>
        add source
      </button>
      <PowerServiceComparison
        data={[...initial, ...extra]}
        overlayData={comparator}
        xField="mean_tpot_intvty"
        xLabel="Mean interactivity (output tok/s/user)"
        interactivityField="mean_tpot_intvty"
        chartId="power-service-pin"
      />
    </PathnameContext.Provider>
  );
}

describe('PowerServiceComparison', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (error) => {
      if (error.message.includes('ResizeObserver loop')) return false;
    });
    // The URL-state store is module-scoped and outlives the previous test's
    // Compare selection, which would otherwise pre-pin the next mount.
    writeUrlParams({ i_servicecompare: '0', i_servicebase: '', i_servicepeer: '' });
  });

  it('colours ?unofficialrun= sources with their run colour in every panel', () => {
    mountComparison(fitLadder, comparator);
    cy.get('[data-testid="power-fit-toggle"]').check();
    cy.get(
      '[data-testid="power-service-test-power-fit-plot"] circle.point[fill="var(--overlay-run-0)"]',
    ).should('have.length', 2);
    cy.get('[data-testid="power-service-test-power-fit-plot"] circle.point')
      .not('[fill="var(--overlay-run-0)"]')
      .should('have.length', 4);
    cy.get('[data-testid="equal-service-toggle"]').check();
    cy.get('[data-testid="equal-service-comparator"]')
      .invoke('val')
      .should('contain', OVERLAY_RUN_URL);
    // The selects are screen-only; exported images name the pair instead.
    for (const pair of ['equal-service-pair', 'matched-concurrency-pair']) {
      cy.get(`[data-testid="${pair}"]`)
        .should('not.be.visible')
        .and(
          'have.text',
          'Baseline: B200 (SGLang) · 2026-09-23 → Comparator: B300 (SGLang) · 2026-09-23',
        );
    }
    cy.get('[data-testid="matched-concurrency-row-8"]').should('exist');
  });

  it('keeps the compared pair when a new source sorts ahead of the baseline', () => {
    mountWithProviders(
      <PinnedComparisonHarness initial={[...fitLadder, ...comparator]} added={[laterSource]} />,
      {
        inference: {},
        unofficial: { runIndexByUrl: { [OVERLAY_RUN_URL]: 0 } },
      },
    );
    cy.get('[data-testid="equal-service-toggle"]').check();
    cy.get('[data-testid="equal-service-baseline"]').invoke('val').should('contain', 'b200_sglang');
    cy.get('[data-testid="equal-service-comparator"]')
      .invoke('val')
      .should('contain', OVERLAY_RUN_URL);
    cy.get('[data-testid="add-source"]').click();
    cy.get('[data-testid="equal-service-baseline"] option').should('have.length', 3);
    cy.get('[data-testid="equal-service-baseline"]').invoke('val').should('contain', 'b200_sglang');
    cy.get('[data-testid="equal-service-comparator"]')
      .invoke('val')
      .should('contain', OVERLAY_RUN_URL);
  });

  it('resolves a share link that pre-enables Compare as its rows arrive', () => {
    // The overlay run can land before the official rows; pinning that first
    // source would fix both sides on it.
    writeUrlParams({ i_servicecompare: '1' });
    mountWithProviders(<PinnedComparisonHarness initial={comparator} added={fitLadder} />, {
      inference: {},
      unofficial: { runIndexByUrl: { [OVERLAY_RUN_URL]: 0 } },
    });
    cy.get('[data-testid="equal-service-baseline"]')
      .invoke('val')
      .should('contain', OVERLAY_RUN_URL);
    cy.get('[data-testid="add-source"]').click();
    cy.get('[data-testid="equal-service-baseline"]').invoke('val').should('contain', 'b200_sglang');
    cy.get('[data-testid="equal-service-comparator"]')
      .invoke('val')
      .should('contain', OVERLAY_RUN_URL);
    cy.get('[data-testid="matched-concurrency-row-8"]').should('exist');
  });
});
