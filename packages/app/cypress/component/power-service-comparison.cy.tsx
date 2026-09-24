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
const OVERLAY_RUN_URL = 'https://example.invalid/runs/900000002';
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

// Validated role telemetry on the same three disaggregated observations.
const measuredRoles = roles.map((entry, index) => ({
  ...entry,
  measuredPrefillAvgPower: metric(800 + 10 * index),
  measuredDecodeAvgPower: metric(600 + 10 * index),
  measuredPrefillJPerInputToken: metric(entry.prefill_joules_per_input_token!),
  measuredDecodeJPerOutputToken: metric(entry.decode_joules_per_output_token!),
}));
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

function mountComparison(
  points = data,
  xField: keyof AggDataEntry = 'mean_tpot_intvty',
  overlay: InferenceData[] = [],
) {
  mountWithProviders(
    <PathnameContext.Provider value="/inference">
      <div style={{ width: '100%', maxWidth: 1120, padding: 12, boxSizing: 'border-box' }}>
        <PowerServiceComparison
          data={[...points, ...overlay]}
          overlayData={overlay}
          xField={xField}
          xLabel={xField === 'conc' ? 'Concurrency' : 'Mean interactivity (output tok/s/user)'}
          interactivityField="mean_tpot_intvty"
          chartId="power-service-test"
        />
      </div>
    </PathnameContext.Provider>,
    {
      inference: {},
      unofficial: overlay.length > 0 ? { runIndexByUrl: { [OVERLAY_RUN_URL]: 0 } } : {},
    },
  );
}
type CsvWindow = Cypress.AUTWindow & { __csv?: Blob };
/** Keep the next CSV download in memory instead of saving it. */
function captureCsv() {
  cy.window().then((win) => {
    cy.stub(win.URL, 'createObjectURL').callsFake((blob: Blob) => {
      (win as CsvWindow).__csv = blob;
      return 'blob:csv-test';
    });
    cy.stub(win.HTMLAnchorElement.prototype, 'click');
  });
}
function exportCsv(sectionId: string): Cypress.Chainable<string[][]> {
  cy.get(`#${sectionId} [data-testid="export-button"]`).click();
  cy.get('[data-testid="export-csv-button"]').click();
  return cy
    .window()
    .then((win) => (win as CsvWindow).__csv!.text())
    .then((text) =>
      text
        .split('\n')
        .filter((line) => !line.startsWith('#'))
        .map((line) => line.split(',')),
    );
}
const plotValues = (plot: string) =>
  cy
    .get<SVGCircleElement & { __data__: { y: number } }>(
      `[data-testid="power-service-test-${plot}-plot"] circle.point`,
    )
    .then(($points) => [...$points].map((element) => element.__data__.y).toSorted((a, b) => a - b));
const closeTo = (actual: number[], expected: number[]) => {
  expect(actual).to.have.length(expected.length);
  actual.forEach((value, index) => expect(value).to.be.closeTo(expected[index], 1e-9));
};
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
      i_powerfit: '0',
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
  it('pairs sources at each observed concurrency and marks loads measured once or twice', () => {
    captureCsv();
    mountComparison([
      ...data,
      point({
        id: 5,
        conc: 64,
        mean_tpot_intvty: 10,
        measuredAvgPower: metric(300),
        measuredJPerOutputToken: metric(5),
      }),
      // A second baseline observation at c8 that disagrees with the first.
      point({ id: 6, measuredAvgPower: metric(420), measuredJPerOutputToken: metric(11) }),
    ]);
    cy.get('[data-testid="equal-service-toggle"]').check();
    cy.get('[data-testid="matched-concurrency-table"] tbody tr').should('have.length', 3);
    cy.get('[data-testid="matched-concurrency-row-1"]').should(($row) => {
      const text = normalizedText($row);
      expect(text).to.include('30.000').and.include('16.000').and.include('-46.7%');
      expect(text).to.include('W/GPU +25.0%').and.include('tok/s/user +0.0%');
    });
    cy.get('[data-testid="matched-concurrency-row-8"] td')
      .eq(0)
      .should('contain.text', '2 conflicting observations; none selected');
    cy.get('[data-testid="matched-concurrency-row-64"] td')
      .eq(1)
      .should('have.text', 'Not measured');
    exportCsv('power-service-test-matched-concurrency').then((rows) => {
      const [header, ...body] = rows;
      expect(header.slice(0, 3)).to.deep.equal([
        'concurrency',
        'baseline_status',
        'baseline_j_per_output_token',
      ]);
      expect(body.map((cells) => [cells[0], cells[1], cells[7]])).to.deep.equal([
        ['1', 'observed', 'observed'],
        ['8', 'ambiguous', 'observed'],
        ['64', 'observed', 'missing'],
      ]);
    });
  });

  it('keeps load-matched rows in concurrency mode and follows the chosen direction on mobile', () => {
    cy.viewport(390, 1000);
    mountComparison(data, 'conc');
    cy.get('[data-testid="equal-service-toggle"]').check();
    cy.get('[data-testid="equal-service-concurrency-note"]').should('be.visible');
    cy.get('[data-testid="equal-service-panel"]').should('not.exist');
    cy.get('[data-testid="equal-service-baseline"]').select(peerKey);
    cy.get('[data-testid="equal-service-comparator"]').select(baseKey);
    // B300 c8 is 8 J and 800 W; B200 c8 is 10 J and 400 W.
    cy.get('[data-testid="matched-concurrency-row-8"]').should(($row) => {
      const text = normalizedText($row);
      expect(text).to.include('+25.0%').and.include('W/GPU -50.0%');
    });
    checkNoHorizontalOverflow();
    cy.get('[data-testid="matched-concurrency-panel"]').screenshot('matched-concurrency-mobile', {
      overwrite: true,
    });
  });

  it('draws role power, both energy denominators and the share from the same observations', () => {
    cy.viewport(1280, 1400);
    captureCsv();
    mountComparison(measuredRoles);
    cy.get('[data-testid="role-share-toggle"]').check();
    plotValues('role-power').should((values) => closeTo(values, [600, 610, 620, 800, 810, 820]));
    // Role-local: prefill J/input token beside decode J/output token.
    plotValues('role-local-energy').should((values) => closeTo(values, [0.8, 1, 1.2, 4, 5, 6]));
    // Output-token basis: prefill 0.8 J/in × (10 J/out ÷ 2 J/in) = 4, decode 6, total 10.
    plotValues('role-output-energy').should((values) =>
      closeTo(values, [4, 4, 5, 5, 6, 6, 10, 10, 10]),
    );
    plotValues('role-share').should((values) => closeTo(values, [40, 50, 60]));
    cy.get('[data-testid="power-service-test-role-power-plot"] path.line-path')
      .should('have.length', 2)
      .then(($paths) =>
        expect([...$paths].map((path) => path.getAttribute('stroke-dasharray'))).to.have.members([
          '7 3',
          '2 3',
        ]),
      );
    exportCsv('power-service-test-roles').then((rows) => {
      const [header, ...body] = rows;
      const column = (name: string) => body.map((cells) => Number(cells[header.indexOf(name)]));
      expect(body).to.have.length(3);
      closeTo(column('prefill_j_per_output_token'), [4, 5, 6]);
      closeTo(column('total_j_per_output_token'), [10, 10, 10]);
      closeTo(column('prefill_energy_share_pct'), [40, 50, 60]);
    });
    checkNoHorizontalOverflow();
    cy.get('[data-testid="prefill-share-panel"]').screenshot('power-roles-desktop', {
      overwrite: true,
    });
  });

  it('fits power against output rate per source and states the fitted range', () => {
    cy.viewport(1280, 1200);
    captureCsv();
    mountComparison([...fitLadder, ...comparator]);
    cy.get('[data-testid="power-fit-toggle"]').check();
    cy.get('[data-testid="power-fit-row"]').should('have.length', 2);
    cy.get('[data-testid="power-fit-row"]')
      .eq(0)
      .find('td')
      .then(($cells) =>
        expect([...$cells].map((cell) => cell.textContent)).to.deep.equal([
          '250',
          '25% · 1,000 W',
          '0.500',
          '1.000',
          '4',
          '20.0–260.0',
        ]),
      );
    cy.get('[data-testid="power-fit-row"]')
      .eq(1)
      .should('contain.text', 'Not fitted: needs 3 distinct output rates, has 2.');
    // One solid fitted segment plus the dashed extension to zero output.
    cy.get('[data-testid="power-service-test-power-fit-plot"] path.line-path')
      .should('have.length', 2)
      .then(($paths) =>
        expect([...$paths].map((path) => path.getAttribute('stroke-dasharray'))).to.have.members([
          'none',
          '4 4',
        ]),
      );
    cy.get('[data-testid="power-service-test-power-fit-plot"] circle.point').should(
      'have.length',
      6,
    );
    cy.then(() => expect(new URL(buildShareUrl()).searchParams.get('i_powerfit')).to.equal('1'));
    exportCsv('power-service-test-power-fit').then(([header, first, second]) => {
      expect(header).to.include('p0_over_tdp');
      expect(Number(first[header.indexOf('m_j_per_output_token')])).to.be.closeTo(0.5, 1e-9);
      expect(second[header.indexOf('status')]).to.equal('too-few-points');
    });
    cy.get('[data-testid="power-fit-panel"]').screenshot('power-fit-desktop', { overwrite: true });
  });

  it('colours ?unofficialrun= sources with their run colour in every panel', () => {
    mountComparison([...fitLadder], 'mean_tpot_intvty', comparator);
    cy.get('[data-testid="power-fit-toggle"]').check();
    cy.get(
      '[data-testid="power-service-test-power-fit-plot"] circle.point[fill="var(--overlay-run-0)"]',
    ).should('have.length', 2);
    cy.get('[data-testid="power-service-test-power-fit-plot"] circle.point')
      .not('[fill="var(--overlay-run-0)"]')
      .should('have.length', 4);
    cy.get('[data-testid="equal-service-toggle"]').check();
    cy.get('[data-testid="equal-service-comparator"] option:selected').should(
      'contain.text',
      '900000002',
    );
    cy.get('[data-testid="matched-concurrency-row-8"]').should('exist');
  });
});
