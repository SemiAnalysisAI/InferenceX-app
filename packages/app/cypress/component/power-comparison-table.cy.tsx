import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { useState } from 'react';

import type { AggDataEntry, InferenceData } from '@/components/inference/types';
import InferenceTable from '@/components/inference/ui/InferenceTable';
import PowerComparisonTable from '@/components/inference/ui/PowerComparisonTable';
import { equalServiceSourceKey } from '@/components/inference/utils/equal-service-comparison';

import { createMockChartDefinition, createMockInferenceData } from '../support/mock-data';
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
    date: '2026-09-23',
    run_url: 'https://example.invalid/runs/900000001',
    benchmark_type: 'single_turn',
    ...overrides,
  });
const baselinePoints = [
  point({
    id: 1,
    conc: 8,
    x: 20,
    mean_tpot_intvty: 20,
    output_tput_per_gpu: 40,
    measuredAvgPower: metric(400),
    measuredJPerOutputToken: metric(10),
  }),
  point({
    id: 2,
    conc: 16,
    x: 10,
    mean_tpot_intvty: 10,
    output_tput_per_gpu: 30,
    measuredAvgPower: metric(600),
    measuredJPerOutputToken: metric(20),
  }),
];
const comparatorPoints = [
  point({
    id: 3,
    hwKey: 'b300_sglang',
    run_url: 'https://example.invalid/runs/900000002',
    conc: 8,
    x: 20,
    mean_tpot_intvty: 20,
    output_tput_per_gpu: 75,
    measuredAvgPower: metric(600),
    measuredJPerOutputToken: metric(8),
  }),
  point({
    id: 4,
    hwKey: 'b300_sglang',
    run_url: 'https://example.invalid/runs/900000002',
    conc: 32,
    x: 10,
    mean_tpot_intvty: 10,
    output_tput_per_gpu: 50,
    measuredAvgPower: metric(800),
    measuredJPerOutputToken: metric(16),
  }),
];
const points = [...baselinePoints, ...comparatorPoints];
const baselineKey = equalServiceSourceKey(baselinePoints[0]);
const comparatorKey = equalServiceSourceKey(comparatorPoints[0]);
const addedPoint = point({
  ...baselinePoints[0],
  id: 5,
  hwKey: 'a100_sglang',
  run_url: 'https://example.invalid/runs/900000003',
  measuredAvgPower: metric(500),
  measuredJPerOutputToken: metric(12),
});

function ComparisonHarness({
  initial = points,
  xField = 'mean_tpot_intvty',
}: {
  initial?: InferenceData[];
  xField?: keyof AggDataEntry;
}) {
  const [data, setData] = useState(initial);
  return (
    <PathnameContext.Provider value="/inference">
      <div style={{ width: '100%', maxWidth: 1120, padding: 12, boxSizing: 'border-box' }}>
        <button
          type="button"
          data-testid="add-source"
          onClick={() => setData([...data, addedPoint])}
        >
          Add overlay
        </button>
        <button
          type="button"
          data-testid="filter-source"
          onClick={() => setData(data.filter((entry) => entry.hwKey !== 'b300_sglang'))}
        >
          Filter comparator
        </button>
        <PowerComparisonTable
          data={data}
          xField={xField}
          xLabel="Interactivity (output tok/s/user)"
          interactivityField="mean_tpot_intvty"
        />
      </div>
    </PathnameContext.Provider>
  );
}

const matchedRow = (concurrency: number) =>
  cy
    .get('[data-testid="power-concurrency-results"] tbody')
    .contains('td', new RegExp(`^${concurrency}$`, 'u'))
    .parent('tr');
const serviceRow = (label: string) =>
  cy.get('[data-testid="power-service-results"] tbody').contains('td', label).parent('tr');

describe('PowerComparisonTable', () => {
  it('shows measured values, signed differences, and unmatched concurrency rows', () => {
    mountWithProviders(<ComparisonHarness />);
    cy.get('[data-testid="power-table-baseline"]').should('have.value', baselineKey);
    cy.get('[data-testid="power-table-comparator"]').should('have.value', comparatorKey);
    cy.get('[data-testid="power-table-match"]').should('have.value', 'concurrency');
    cy.get('[data-testid="power-concurrency-results"] tbody tr').should('have.length', 3);
    matchedRow(8)
      .should('contain.text', '400 W/GPU')
      .and('contain.text', '600 W/GPU')
      .and('contain.text', '+200 W/GPU (+50%)')
      .and('contain.text', '-2 J/output token (-20%)');
    matchedRow(16).find('td').eq(2).should('have.text', 'Not measured');
    matchedRow(32).find('td').eq(1).should('have.text', 'Not measured');
    matchedRow(16).find('td').eq(3).should('have.text', '—');

    cy.get('[data-testid="power-table-baseline"]').select(comparatorKey);
    cy.get('[data-testid="power-table-comparator"]').select(baselineKey);
    matchedRow(8)
      .should('contain.text', '-200 W/GPU (-33.33%)')
      .and('contain.text', '+2 J/output token (+25%)');
  });

  it('keeps conflicting observations visible when no difference can be calculated', () => {
    mountWithProviders(
      <ComparisonHarness
        initial={[
          baselinePoints[0],
          point({ ...baselinePoints[0], id: 99, measuredAvgPower: metric(450) }),
          comparatorPoints[0],
        ]}
      />,
    );
    matchedRow(8).should('contain.text', 'Conflicting measurements');
    matchedRow(8).find('td').last().should('have.text', '—');
  });

  it('interpolates an explicit service target and preserves invalid or cleared targets', () => {
    mountWithProviders(<ComparisonHarness />);
    cy.get('[data-testid="power-table-match"]').select('service');
    cy.get('[data-testid="power-table-target"]').clear().type('15');
    serviceRow('Mean GPU power')
      .should('contain.text', '500')
      .and('contain.text', '700')
      .and('contain.text', 'Interpolated')
      .and('contain.text', '+200 W/GPU (+40%)');
    serviceRow('GPU energy')
      .should('contain.text', '15')
      .and('contain.text', '12')
      .and('contain.text', '-3 J/output token (-20%)');
    cy.get('[data-testid="power-concurrency-results"]').should('not.exist');

    cy.get('[data-testid="power-table-target"]').clear().type('100');
    serviceRow('Mean GPU power').should('contain.text', 'Target is outside the shared range.');
    serviceRow('Mean GPU power').find('td').last().should('have.text', '—');
    cy.get('[data-testid="power-table-target"]').clear().should('have.value', '');
    serviceRow('GPU energy').should('contain.text', 'Enter a positive target.');
    serviceRow('GPU energy').find('td').last().should('have.text', '—');
  });

  it('keeps the chosen sources when an overlay arrives and requires reselection after filtering', () => {
    mountWithProviders(<ComparisonHarness />);
    cy.get('[data-testid="add-source"]').click();
    cy.get('[data-testid="power-table-baseline"] option').should('have.length', 3);
    cy.get('[data-testid="power-table-baseline"]').should('have.value', baselineKey);
    cy.get('[data-testid="power-table-comparator"]').should('have.value', comparatorKey);
    matchedRow(8).should('contain.text', '+200 W/GPU (+50%)');

    cy.get('[data-testid="filter-source"]').click();
    cy.get('[data-testid="power-table-comparator"]').should('have.value', comparatorKey);
    cy.get('[data-testid="power-table-comparator"] option:selected').should(
      'have.text',
      'Selection no longer visible',
    );
    cy.get('[data-testid="power-comparison-table"] [role="status"]').should(
      'contain.text',
      'Choose two configurations',
    );
    cy.get('[data-testid="power-concurrency-results"]').should('not.exist');
    cy.get('[data-testid="power-table-comparator"]').select(equalServiceSourceKey(addedPoint));
    matchedRow(8)
      .should('contain.text', '+100 W/GPU (+25%)')
      .and('contain.text', '+2 J/output token (+20%)');
  });

  it('reports unavailable comparisons without inventing values or an empty table', () => {
    mountWithProviders(<ComparisonHarness initial={[baselinePoints[0], comparatorPoints[1]]} />);
    cy.get('[data-testid="power-comparison-table"] [role="status"]').should(
      'contain.text',
      'no comparable power or energy measurements at the same concurrency',
    );
    cy.get('[data-testid="power-concurrency-results"]').should('not.exist');
    cy.get('[data-testid="power-table-match"]').select('service');
    cy.get('[data-testid="power-comparison-table"] [role="status"]').should(
      'contain.text',
      'no overlapping speed / latency range',
    );
    cy.get('[data-testid="power-service-results"]').should('not.exist');
  });

  for (const percentile of ['p75', 'p90']) {
    it(`compares measured energy on the derived ${percentile.toUpperCase()} service axis`, () => {
      mountWithProviders(
        <ComparisonHarness
          initial={points.map((entry) => ({ ...entry, benchmark_type: 'agentic_traces' }))}
          xField={`${percentile}_e2e_norm_intvty` as keyof AggDataEntry}
        />,
      );
      cy.get('[data-testid="power-table-match"]').select('service');
      cy.get('[data-testid="power-table-target"]').clear().type('15');
      serviceRow('Mean GPU power').should('contain.text', '+200 W/GPU (+40%)');
      serviceRow('GPU energy').should('contain.text', '-3 J/output token (-20%)');
    });
  }

  it('uses one table at a time and keeps comparison controls inside a mobile viewport', () => {
    cy.viewport(390, 844);
    mountWithProviders(
      <PathnameContext.Provider value="/inference">
        <div style={{ width: '100%', padding: 12, boxSizing: 'border-box' }}>
          <InferenceTable
            data={points}
            chartDefinition={createMockChartDefinition({
              chartType: 'interactivity',
              x: 'mean_tpot_intvty',
              y_measuredAvgPower: 'measuredAvgPower.y',
            })}
            selectedYAxisMetric="y_measuredAvgPower"
            interactivityField="mean_tpot_intvty"
          />
        </div>
      </PathnameContext.Provider>,
    );
    cy.get('[data-testid="inference-results-table"]').should('be.visible');
    cy.contains('[data-testid="inference-table-content"] button', 'Compare power & energy').click();
    cy.get('[data-testid="inference-results-table"]').should('not.exist');
    matchedRow(8).should('contain.text', '+200 W/GPU (+50%)');
    cy.get('[data-testid="power-table-baseline"], [data-testid="power-table-comparator"]')
      .should('be.visible')
      .each(($control) => {
        const bounds = $control[0].getBoundingClientRect();
        expect(bounds.left).to.be.at.least(0);
        expect(bounds.right).to.be.at.most(390);
      });
    cy.document().should((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth + 1);
    });
    cy.screenshot('power-comparison-mobile');
    cy.get('[data-testid="power-concurrency-results"] table').parent().scrollTo('right');
    matchedRow(8).contains('+200 W/GPU (+50%)').should('be.visible');
    cy.screenshot('power-comparison-mobile-differences');
    cy.contains('[data-testid="inference-table-content"] button', 'Measurements').click();
    cy.get('[data-testid="inference-results-table"]').should('be.visible');
    cy.get('[data-testid="power-comparison-table"]').should('not.exist');
  });
});
