import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import type { AggDataEntry, InferenceData } from '@/components/inference/types';
import PowerServiceComparison from '@/components/inference/ui/PowerServiceComparison';
import { equalServiceSourceKey } from '@/components/inference/utils/equal-service-comparison';
import { buildShareUrl, readUrlParams, writeUrlParams } from '@/lib/url-state';
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
const baseline = [
  point({ id: 1 }),
  point({
    id: 2,
    conc: 1,
    mean_tpot_intvty: 60,
    measuredAvgPower: metric(800),
    output_tput_per_gpu: 150,
    measuredJPerOutputToken: metric(30),
  }),
];
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
const data = [...baseline, ...comparator];
const baseKey = equalServiceSourceKey(baseline[0]);
const peerKey = equalServiceSourceKey(comparator[0]);
const roles = [40, 50, 60].map((share, index) =>
  point({
    id: 10 + index,
    hwKey: 'gb200',
    disagg: true,
    physicalChips: 8,
    num_prefill_gpu: 4,
    num_decode_gpu: 4,
    mean_tpot_intvty: 20 + index * 20,
    conc: 2 ** index,
    power_valid: 1,
    power_metric_schema_version: 2,
    joules_per_input_token: 2,
    joules_per_output_token: 10,
    prefill_joules_per_input_token: share / 50,
    decode_joules_per_output_token: 10 - share / 10,
  }),
);

function mountComparison(points = data, xField: keyof AggDataEntry = 'mean_tpot_intvty') {
  mountWithProviders(
    <PathnameContext.Provider value="/inference">
      <div style={{ width: '100%', maxWidth: 1120, padding: 12, boxSizing: 'border-box' }}>
        <PowerServiceComparison
          data={points}
          xField={xField}
          xLabel={xField === 'conc' ? 'Concurrency' : 'Mean interactivity (output tok/s/user)'}
          chartId="power-service-test"
        />
      </div>
    </PathnameContext.Provider>,
    { inference: {}, unofficial: {} },
  );
}
const normalizedText = (element: JQuery<HTMLElement>) => element.text().replaceAll('−', '-');
const target = () => cy.get('[data-testid="equal-service-target"]');
const row = (metricName: string) => cy.get(`[data-testid="equal-service-${metricName}"]`);
const roleSvg = () => cy.get('[data-testid="power-service-test-role-share-plot"]');

function checkNoHorizontalOverflow() {
  cy.document().should((doc) => {
    expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth + 1);
  });
  cy.get('[data-testid="power-service-comparison"]').should(($panel) => {
    const rect = $panel[0].getBoundingClientRect();
    expect(rect.left).to.be.at.least(0);
    expect(rect.right).to.be.at.most($panel[0].ownerDocument.documentElement.clientWidth + 1);
  });
}

describe('PowerServiceComparison', () => {
  beforeEach(() => {
    writeUrlParams({
      i_servicecompare: '0',
      i_roleshare: '0',
      i_servicebase: '',
      i_servicepeer: '',
      i_servicetarget: '',
    });
    readUrlParams();
    cy.on('uncaught:exception', (error) => {
      if (error.message.includes('ResizeObserver loop')) return false;
    });
  });

  for (const width of [1280, 390]) {
    it(`shows raw interpolation, signed deltas and source endpoints without page overflow (${width}px)`, () => {
      cy.viewport(width, 1000);
      mountComparison();
      cy.get('[data-testid="equal-service-toggle"]').check();
      target().type('40');
      row('meanWattsPerGpu').within(() => {
        cy.get('td')
          .eq(0)
          .should('contain.text', '600')
          .and('contain.text', 'Interpolated')
          .and('contain.text', 'Observation 1: 20 · c8')
          .and('contain.text', 'Observation 2: 60 · c1');
        cy.get('td').eq(1).should('contain.text', '900');
        cy.get('td').eq(2).should('have.text', '+50.00%');
      });
      row('outputTokensPerSecond').within(() => {
        cy.get('td strong').eq(0).should('have.text', '400');
        cy.get('td strong').eq(1).should('have.text', '600');
        cy.get('td').eq(2).should('have.text', '+50.00%');
      });
      row('joulesPerOutputToken').should(($row) =>
        expect(normalizedText($row)).to.include('-40.00%'),
      );
      cy.get('[data-testid="power-service-test-service-plot"] circle.point').should(
        'have.length',
        9,
      );
      cy.get<SVGCircleElement & { __data__: { x: number; y: number } }>(
        '[data-testid="power-service-test-service-plot"] circle.point[r="6"]',
      )
        .should('have.length', 3)
        .and(($points) => {
          const values = Array.from($points, (element) => element.__data__);
          expect(values.map((entry) => entry.x)).to.deep.equal([40, 40, 40]);
          expect(values.map((entry) => entry.y)).to.deep.equal([50, 50, -40]);
        });
      checkNoHorizontalOverflow();
      cy.get('[data-testid="power-service-comparison"]').screenshot(`equal-service-${width}`, {
        overwrite: true,
      });
    });
  }

  it('marks out-of-range values unavailable instead of extrapolating', () => {
    mountComparison();
    cy.get('[data-testid="equal-service-toggle"]').check();
    target().type('80');
    cy.get('[data-testid="equal-service-table"] tbody tr').each(($row) => {
      cy.wrap($row).find('td').eq(2).should('have.text', 'Target is outside a source range.');
      cy.wrap($row).find('strong').should('not.exist');
    });
  });

  it('changes comparison direction and persists exact source keys and target in a share URL', () => {
    mountComparison();
    cy.get('[data-testid="equal-service-toggle"]').check();
    target().type('40');
    cy.get('[data-testid="equal-service-baseline"]').select(peerKey);
    cy.get('[data-testid="equal-service-comparator"]').select(baseKey);
    row('meanWattsPerGpu').should(($row) => expect(normalizedText($row)).to.include('-33.33%'));
    row('joulesPerOutputToken').should('contain.text', '+66.67%');
    cy.then(() => {
      const params = new URL(buildShareUrl()).searchParams;
      expect(params.get('i_servicebase')).to.equal(peerKey);
      expect(params.get('i_servicepeer')).to.equal(baseKey);
      expect(params.get('i_servicetarget')).to.equal('40');
      expect(params.get('i_servicecompare')).to.equal('1');
    });
  });

  it('restores source direction and target from a shared comparison URL', () => {
    writeUrlParams({
      i_servicecompare: '1',
      i_servicebase: peerKey,
      i_servicepeer: baseKey,
      i_servicetarget: '40',
    });
    readUrlParams();
    mountComparison();
    cy.get('[data-testid="equal-service-baseline"]').should('have.value', peerKey);
    target().should('have.value', '40');
    row('joulesPerOutputToken').should('contain.text', '+66.67%');
  });

  it('draws observed role shares with a 50% equality reference and omits invalid telemetry', () => {
    cy.viewport(1280, 1000);
    mountComparison([...roles, { ...roles[0], id: 99, power_valid: 0 }]);
    cy.get('[data-testid="role-share-toggle"]').check();
    roleSvg()
      .find<SVGCircleElement & { __data__: { y: number } }>('circle.point')
      .should('have.length', 3)
      .then(($points) => {
        const values = [...$points].map((element) => element.__data__.y);
        expect(values).to.deep.equal([40, 50, 60]);
        const center = Number($points[1].getAttribute('cy'));
        roleSvg()
          .find('line[stroke-dasharray="5,4"]')
          .should('have.length', 1)
          .should(($line) => {
            expect(Number($line.attr('y1'))).to.be.closeTo(center, 0.5);
            expect(Number($line.attr('y2'))).to.be.closeTo(center, 0.5);
          });
      });
    checkNoHorizontalOverflow();
  });

  it('keeps concurrency diagnostic role shares while suppressing equal-service comparisons on mobile', () => {
    cy.viewport(390, 1000);
    mountComparison(roles, 'conc');
    cy.get('[data-testid="equal-service-toggle"]').check();
    cy.get('[data-testid="equal-service-concurrency-note"]')
      .should('be.visible')
      .and('contain.text', 'load diagnostic');
    cy.get('[data-testid="equal-service-panel"]').should('not.exist');
    cy.get('[data-testid="role-share-toggle"]').check();
    roleSvg().find('circle.point').should('have.length', 3);
    checkNoHorizontalOverflow();
    cy.get('[data-testid="prefill-share-panel"]').screenshot('prefill-share-mobile', {
      overwrite: true,
    });
  });
});
