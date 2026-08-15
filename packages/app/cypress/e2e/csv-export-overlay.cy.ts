import { interceptDerivedAgenticMetrics, unlockAgenticGate } from '../support/e2e';
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
    // The agentic default mode is E2E Normalized Interactivity (which suppresses overlays and
    // fetches derived metrics) — stub the fetch, then switch to the
    // Interactivity mode this suite's overlay assertions rely on.
    interceptDerivedAgenticMetrics();
    cy.visit(`/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces&i_pctl=p90`, {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
        captureCsvDownloads(win);
      },
    });
    cy.wait('@unofficialRun');
    // Interactivity is nested under the Advanced menu on agentic charts.
    cy.get('[data-testid="x-axis-mode-advanced"]').click();
    cy.get('[data-testid="x-axis-mode-interactivity"]').click();
    cy.get('[data-testid="x-axis-mode-advanced"]')
      .should('have.attr', 'data-state', 'active')
      .and('contain.text', 'Interactivity');
    cy.get('[data-testid="inference-chart-display"] svg .unofficial-overlay-pt').should('exist');
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
