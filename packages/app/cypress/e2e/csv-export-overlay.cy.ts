import { interceptDerivedAgenticMetrics, unlockAgenticGate, selectXAxisMode } from '../support/e2e';
import {
  interceptOverlayRun,
  OVERLAY_RUN_BRANCH,
  OVERLAY_RUN_ID,
  OVERLAY_RUN_URL,
} from '../support/overlay-fixtures';

type CsvCaptureWindow = Cypress.AUTWindow & {
  __capturedCsvBlob?: Blob;
};

function captureCsvDownloads(win: Cypress.AUTWindow): void {
  const captureWindow = win as CsvCaptureWindow;
  win.URL.createObjectURL = (object: Blob | MediaSource) => {
    if (object instanceof win.Blob) captureWindow.__capturedCsvBlob = object;
    return 'blob:csv-export-test';
  };
  win.HTMLAnchorElement.prototype.click = () => {};
}

function exportFirstChart(): void {
  cy.get('[data-testid="export-button"]').first().click();
  cy.get('[data-testid="export-csv-button"]').click();
}

function readCapturedCsv(): Cypress.Chainable<string> {
  return cy.window().then((win) => {
    const blob = (win as CsvCaptureWindow).__capturedCsvBlob;
    expect(blob, 'captured CSV Blob').to.be.instanceOf(win.Blob);
    return blob!.text();
  });
}

describe('Inference CSV export with an unofficial-run overlay', () => {
  before(() => {
    interceptOverlayRun();
    // Agentic charts default to Interactivity, where the overlay renders. The
    // derived-metrics fetch now happens only under E2E Normalized Interactivity,
    // so the stub below is a guard against a stray request rather than a
    // dependency of this suite.
    interceptDerivedAgenticMetrics();
    cy.visit(`/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90`, {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
        captureCsvDownloads(win);
      },
    });
    cy.wait('@unofficialRun');
    // Explicitly select Interactivity so this suite does not depend on the default.
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
