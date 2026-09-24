import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import type { InferenceData } from '@/components/inference/types';
import FrontierPointsPanel from '@/components/inference/ui/FrontierPointsPanel';
import { FRONTIER_EXPORT_HEADERS } from '@/components/inference/utils/frontier-points';
import { globalParetoFrontier } from '@/components/inference/utils/global-pareto';
import { createMockInferenceData } from '../support/mock-data';
import { mountWithProviders } from '../support/test-utils';

const RUN = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs';
const OVERLAY_RUN_URL = `${RUN}/33348766792/attempts/2`;
const point = (overrides: Partial<InferenceData>) =>
  createMockInferenceData({
    hwKey: 'b200_sglang',
    framework: 'sglang',
    precision: 'fp8',
    physicalChips: 4,
    tp: 4,
    decode_tp: 4,
    date: '2026-09-18',
    run_url: `${RUN}/35317697106/attempts/1`,
    image: 'lmsysorg/sglang:nightly-dev-cu13-20260918-20518d85',
    ...overrides,
  });
const gb300 = (overrides: Partial<InferenceData>) =>
  point({
    hwKey: 'gb300_dynamo-sglang',
    framework: 'dynamo-sglang',
    disagg: true,
    physicalChips: 8,
    num_prefill_gpu: 4,
    num_decode_gpu: 4,
    run_url: `${RUN}/35319969159/attempts/1`,
    ...overrides,
  });
// Interactivity (higher is better) against J/output token (lower is better).
const official = [
  point({ id: 1, conc: 128, x: 31.6, y: 0.824 }),
  point({ id: 2, conc: 1, x: 186.9, y: 9.065 }),
  gb300({ id: 3, conc: 1, x: 206.3, y: 12.275 }),
  gb300({ id: 4, conc: 4, x: 172.2, y: 4.634 }),
  gb300({ id: 5, conc: 64, x: 72.2, y: 1.311 }),
];
// Faster and cheaper than GB300 c1, so the overlay point displaces it.
const overlay = [
  point({
    id: 0,
    hwKey: 'mi355x_sglang',
    conc: 1,
    x: 215,
    y: 11,
    run_url: OVERLAY_RUN_URL,
    image: 'lmsysorg/sglang-rocm:v0.5.18-rocm720-mi35x-20260828',
  }),
];
const eligible = [...official, ...overlay];
const frontier = globalParetoFrontier(eligible, true, false);

type CsvWindow = Cypress.AUTWindow & { __csv?: Blob };

function mountPanel(width: number) {
  cy.viewport(width, 1000);
  mountWithProviders(
    <PathnameContext.Provider value="/inference">
      <div style={{ width: '100%', maxWidth: 1120, padding: 12, boxSizing: 'border-box' }}>
        <FrontierPointsPanel
          chartId="frontier-test"
          eligible={eligible}
          frontier={frontier}
          xLabel="Interactivity (tok/s/user)"
          yLabel="J/output token"
          maximizeX
          maximizeY={false}
          overlayPoints={overlay}
          hardwareLabel={(entry) => entry.hwKey.split('_')[0].toUpperCase()}
          hardwareColor={() => 'rgb(200, 0, 0)'}
        />
      </div>
    </PathnameContext.Provider>,
    { unofficial: { runIndexByUrl: { [OVERLAY_RUN_URL]: 0 } } },
  );
}

describe('FrontierPointsPanel', () => {
  it('states the competing scope and lists each frontier point with its run', () => {
    mountPanel(1280);
    cy.get('[data-testid="frontier-points-scope"]')
      .should(
        'contain.text',
        '5 of 6 visible observations are on the frontier; they competed across 3 sources from 3 runs.',
      )
      .and('contain.text', 'Better: higher Interactivity (tok/s/user) and lower J/output token.');
    cy.get('[data-testid="frontier-points-mixed"]').should(
      'contain.text',
      'span 2 topologies and 2 images',
    );
    cy.get('[data-testid="frontier-points-owner"]').then(($owners) =>
      expect([...$owners].map((owner) => owner.textContent)).to.deep.equal([
        'B200 ×2',
        'GB300 ×2',
        'MI355X ×1',
      ]),
    );
    cy.get('[data-testid="frontier-points-row"]').should('have.length', 5);
    cy.get('[data-testid="frontier-points-row"]')
      .filter(':contains("MI355X")')
      .should('contain.text', 'unofficial')
      .and('contain.text', 'attempt 2')
      .find('a')
      .should('have.attr', 'href', OVERLAY_RUN_URL)
      .and('have.text', 'run 33348766792');
    cy.get('[data-testid="frontier-points-row"]')
      .filter(':contains("MI355X")')
      .find('th > span')
      .first()
      .should('have.attr', 'style')
      .and('contain', 'var(--overlay-run-0)');
    cy.get('[data-testid="frontier-points-table"]').should('not.contain.text', '206.3');
  });

  it('exports the frontier with run, attempt and unofficial provenance', () => {
    mountPanel(1280);
    cy.window().then((win) => {
      cy.stub(win.URL, 'createObjectURL').callsFake((blob: Blob) => {
        (win as CsvWindow).__csv = blob;
        return 'blob:csv-test';
      });
      cy.stub(win.HTMLAnchorElement.prototype, 'click');
    });
    cy.get('#frontier-test-frontier-points [data-testid="export-button"]').click();
    cy.get('[data-testid="export-csv-button"]').click();
    cy.window()
      .then((win) => (win as CsvWindow).__csv!.text())
      .then((text) => {
        expect(text).to.include('# x: Interactivity (tok/s/user)');
        const [header, ...rows] = text
          .split('\n')
          .filter((line) => !line.startsWith('#'))
          .map((line) => line.split(','));
        expect(header).to.deep.equal([...FRONTIER_EXPORT_HEADERS, 'unofficial']);
        const column = (name: string) => rows.map((row) => row[header.indexOf(name)]);
        expect(rows).to.have.length(5);
        expect(column('point_id').toSorted()).to.deep.equal(['0', '1', '2', '4', '5']);
        expect(column('unofficial').filter((value) => value === 'true')).to.have.length(1);
        expect(column('run_attempt')).to.include('2');
      });
  });

  it('keeps the table inside its own scroller on mobile', () => {
    mountPanel(390);
    cy.document().should((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth + 1);
    });
    cy.get('[data-testid="frontier-points-panel"]').screenshot('frontier-points-mobile', {
      overwrite: true,
    });
  });
});
