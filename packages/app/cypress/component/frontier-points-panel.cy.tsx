import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import type { InferenceData } from '@/components/inference/types';
import FrontierPointsPanel from '@/components/inference/ui/FrontierPointsPanel';
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

function mountPanel() {
  cy.viewport(1280, 1000);
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
  it('lists each frontier point with its run and marks the ?unofficialrun= point', () => {
    mountPanel();
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
});
