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
    // Interactivity falls as concurrency rises, as in a real sweep.
    mean_tpot_intvty: [120, 80, 45, 20][index],
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

describe('PowerAnalysisPanels', () => {
  beforeEach(() => {
    cy.on('uncaught:exception', (error) => {
      if (error.message.includes('ResizeObserver loop')) return false;
    });
  });

  it('leads with the chip comparison and has no retired comparison or fit controls', () => {
    mountWithProviders(<PanelsHarness initial={breakdownLadder} overlay={[]} />, providers);
    cy.get('[data-testid="power-analysis-panels"]').should('be.visible');
    cy.get('[data-testid="power-breakdown-panel"]').should('be.visible');
    cy.get('[data-testid="power-fit-panel"]').should('not.exist');
    cy.get('[data-testid$="-toggle"]').should('not.exist');
    cy.get('[data-testid^="equal-service-"]').should('not.exist');
    cy.get('[data-testid^="matched-concurrency"]').should('not.exist');
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

  for (const width of [1280, 393]) {
    it(`stacks every measured point's system power at ${width}px and switches to the area view`, () => {
      cy.viewport(width, 900);
      writeUrlParams({ i_pbview: 'bars' });
      mountWithProviders(<PanelsHarness initial={breakdownLadder} overlay={[]} />, providers);
      cy.get('[data-testid="power-breakdown-panel"]').should('be.visible');
      // Six layers less the empty Grace socket of an HGX chassis: five legend rows, top first.
      cy.get('[data-testid="power-breakdown-legend"]')
        .should('contain.text', 'Measured GPU')
        .and('contain.text', 'Server parts')
        .and('contain.text', 'Fans + PSU loss')
        .and('contain.text', 'Network share')
        .and('contain.text', 'Facility overhead')
        .and('contain.text', 'Modeled')
        .and('not.contain.text', 'Grace')
        .and('not.contain.text', 'Modeled server');
      cy.get('[data-testid="power-breakdown-legend-item"]').should('have.length', 5);
      cy.get('[data-testid="power-breakdown-legend-item"]')
        .first()
        .should('have.attr', 'data-band', 'facility');
      cy.get('[data-testid="power-breakdown-end-label"]').should('not.exist');
      // One stacked column per concurrency, each with a measured GPU base and a facility top.
      cy.get('[data-testid="power-breakdown-bar"][data-band="gpu"]').should('have.length', 4);
      cy.get('[data-testid="power-breakdown-bar"][data-band="facility"]').should('have.length', 4);
      // Modeled layers are hatched with their own pattern; measured layers are solid.
      cy.get('pattern.breakdown-hatch[data-band="server"]').should(
        'have.attr',
        'patternTransform',
        'rotate(45)',
      );
      cy.get('pattern.breakdown-hatch[data-band="fansPsu"]').should(
        'have.attr',
        'patternTransform',
        'rotate(135)',
      );
      cy.get('pattern.breakdown-hatch[data-band="gpu"]').should('not.exist');
      cy.get('[data-testid="power-breakdown-bar"][data-band="server"]')
        .first()
        .invoke('attr', 'fill')
        .should('match', /^url\(#.*-server-hatch\)$/u);
      cy.get('[data-testid="power-breakdown-bar"][data-band="gpu"]')
        .first()
        .invoke('attr', 'fill')
        .should('not.match', /^url/u);
      // The parts list beside the plot reads the compared point, heaviest part first.
      cy.get('[data-testid="power-parts-heading"]').should('contain.text', 'tok/s/user');
      cy.get('[data-testid="power-part-row"]').should('have.length.at.least', 9);
      cy.get('[data-testid="power-part-row"]').first().should('have.attr', 'data-category', 'gpu');
      cy.get('[data-testid="power-part-row"]')
        .last()
        .should('have.attr', 'data-category', 'facility');
      cy.get('[data-testid="power-part-sparkline"]').should('have.length.at.least', 9);
      // Bars sit on the chart's interactivity axis: lowest interactivity (c64) first.
      cy.get('[data-testid$="power-breakdown-plot"]').should(
        'contain.text',
        'Interactivity (output tok/s/user)',
      );
      cy.get('[data-testid="power-breakdown-bar"][data-band="gpu"]').then(($bars) => {
        const xs = [...$bars].map((bar) => Number(bar.getAttribute('x')));
        expect(xs).to.deep.equal(xs.toSorted((a, b) => a - b));
      });
      cy.get('[data-testid="power-breakdown-total"]').should('have.length.at.least', 2);
      cy.get('[data-testid="power-breakdown-tdp-line"]').should('exist');
      cy.get('[data-testid="power-breakdown-hit"]').eq(0).trigger('mouseenter', { force: true });
      cy.get('[data-testid="power-breakdown-tooltip"]')
        .should('contain.text', 'c64')
        .and('contain.text', '640')
        .and('contain.text', 'Interactivity (output tok/s/user): 20.0')
        .and('contain.text', 'Server parts')
        .and('contain.text', 'NICs')
        .and('contain.text', 'Fans + PSU loss')
        .and('contain.text', 'All in Measured');
      cy.get('[data-testid="power-breakdown-hit"]').eq(0).trigger('mouseleave', { force: true });

      cy.get('[data-testid="power-breakdown-view-area"]').click();
      cy.get('[data-testid="power-breakdown-view-area"]').should(
        'have.attr',
        'aria-pressed',
        'true',
      );
      cy.get('[data-testid="power-breakdown-bar"]').should('not.exist');
      cy.get('[data-testid="power-breakdown-area"]').should('have.length', 5);
      cy.get('[data-testid="power-breakdown-end-label"]').should('not.exist');
      // Hovering a list row raises its layer in the plot and fades the others.
      cy.get('[data-testid="power-part-row"][data-category="fans"]').trigger('mouseover');
      cy.get('[data-testid="power-breakdown-area"][data-band="fansPsu"]').should(
        'have.attr',
        'data-emphasis',
        'highlighted',
      );
      cy.get('[data-testid="power-breakdown-area"][data-band="gpu"]').should(
        'have.attr',
        'data-emphasis',
        'faded',
      );
      cy.get('[data-testid="power-breakdown-area"][data-band="server"]').should(
        'have.attr',
        'data-emphasis',
        'faded',
      );
      cy.get('[data-testid="power-part-row"][data-category="fans"]').trigger('mouseout');
      cy.get('[data-testid="power-breakdown-panel"]').then(($panel) => {
        expect($panel[0].scrollWidth).to.be.at.most($panel[0].clientWidth + 1);
      });
    });
  }

  it('pins the compared point of one chip from a drill-down column until the slider moves', () => {
    cy.viewport(1280, 900);
    mountWithProviders(<PanelsHarness initial={breakdownLadder} overlay={[]} />, providers);
    // The slider starts at the geometric middle (49 tok/s/user): the c16 point at 45.
    cy.get('[data-testid="power-chip-compare-point"]').should('contain.text', 'c16 · 45');
    cy.get('[data-testid="power-chip-compare-row"]').should('not.have.attr', 'data-pinned');
    cy.get('[data-testid="power-breakdown-compared"]').should('not.exist');
    // Columns sit in interactivity order: c64 (20), c16 (45), c4 (80), c1 (120).
    cy.get('[data-testid="power-breakdown-hit"]').eq(2).click({ force: true });
    cy.get('[data-testid="power-chip-compare-point"]').should('contain.text', 'c4 · 80');
    cy.get('[data-testid="power-chip-compare-row"]').should('have.attr', 'data-pinned', 'true');
    cy.get('[data-testid="power-chip-compare-unpin"]').should(
      'have.attr',
      'title',
      'Pinned to c4 · click to follow the slider',
    );
    cy.get('[data-testid="power-breakdown-compared"]').should('have.length', 1);
    cy.get('[data-testid="power-parts-heading"]').should('contain.text', 'c4 · 80 tok/s/user');
    // The slider did not move.
    cy.get('[data-testid="power-chip-compare-value"]').should('contain.text', '49 tok/s/user');
    // The marker unpins the chip; a column click pins again; the slider clears it.
    cy.get('[data-testid="power-chip-compare-unpin"]').click();
    cy.get('[data-testid="power-chip-compare-row"]').should('not.have.attr', 'data-pinned');
    cy.get('[data-testid="power-chip-compare-point"]').should('contain.text', 'c16 · 45');
    cy.get('[data-testid="power-breakdown-hit"]').eq(0).click({ force: true });
    cy.get('[data-testid="power-chip-compare-point"]').should('contain.text', 'c64 · 20');
    cy.get('[data-testid="power-chip-compare-target"]')
      .invoke('val', 200)
      .trigger('input', { force: true });
    cy.get('[data-testid="power-chip-compare-row"]').should('not.have.attr', 'data-pinned');
    cy.get('[data-testid="power-chip-compare-point"]').should('contain.text', 'c1 · 120');
    cy.get('[data-testid="power-chip-compare-unpin"]').should('not.exist');
  });
});
