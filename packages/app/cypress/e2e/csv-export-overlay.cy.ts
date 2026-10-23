import { interceptDerivedAgenticMetrics, unlockAgenticGate, selectXAxisMode } from '../support/e2e';
import {
  captureCsvDownloads,
  exportFirstChart,
  readCapturedCsv,
  type CsvCaptureWindow,
} from '../support/csv-download';
import {
  interceptOverlayRun,
  OVERLAY_RUN_BRANCH,
  OVERLAY_RUN_ID,
  OVERLAY_RUN_URL,
} from '../support/overlay-fixtures';

describe('Inference CSV export with an unofficial-run overlay', () => {
  before(() => {
    interceptOverlayRun();
    interceptDerivedAgenticMetrics();
    cy.visit(`/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90`, {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
        captureCsvDownloads(win);
      },
    });
    cy.wait('@unofficialRun');
    selectXAxisMode('interactivity');
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should('exist');
    cy.get('[data-slot="unofficial-banner"]')
      .should('have.length', 1)
      .parents('[data-slot="dashboard-navigation"]')
      .should('have.length', 1);
  });

  it('exports second-based latency headers and only currently visible overlay rows', () => {
    exportFirstChart();
    readCapturedCsv().then((csv) => {
      expect(csv).to.include('Mean TTFT (s)');
      expect(csv).to.include('Mean TPOT (s)');
      expect(csv).to.not.include('Mean TTFT (ms)');
      expect(csv).to.include('Run URL');
      expect(csv).to.include(OVERLAY_RUN_URL);
    });

    cy.get(`[aria-label="Dismiss ${OVERLAY_RUN_BRANCH}"]`).click();
    cy.get('[data-slot="unofficial-banner"]').should('not.exist');
    cy.get('[data-slot="dashboard-navigation"]').should('be.visible');
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should(
      'not.exist',
    );
    cy.window().then((win) => {
      delete (win as CsvCaptureWindow).__capturedCsvBlob;
    });

    exportFirstChart();
    readCapturedCsv().then((csv) => {
      expect(csv).to.not.include(OVERLAY_RUN_URL);
    });
  });
});
