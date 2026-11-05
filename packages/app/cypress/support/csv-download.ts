export type CsvCaptureWindow = Cypress.AUTWindow & {
  __capturedCsvBlob?: Blob;
};

export function captureCsvDownloads(win: Cypress.AUTWindow): void {
  const captureWindow = win as CsvCaptureWindow;
  const createObjectURL = win.URL.createObjectURL.bind(win.URL);
  const click = win.HTMLAnchorElement.prototype.click;
  delete captureWindow.__capturedCsvBlob;
  win.URL.createObjectURL = (object: Blob | MediaSource) => {
    if (object instanceof win.Blob && object.type.startsWith('text/csv')) {
      captureWindow.__capturedCsvBlob = object;
      return 'blob:csv-export-test';
    }
    return createObjectURL(object);
  };
  win.HTMLAnchorElement.prototype.click = function () {
    if (this.href !== 'blob:csv-export-test') click.call(this);
  };
}

export function exportFirstChart(): void {
  cy.get('[data-testid="export-button"]').first().click();
  cy.get('[data-testid="export-csv-button"]')
    .should('be.visible')
    .and('contain.text', 'Download CSV')
    .click();
}

export function readCapturedCsv(): Cypress.Chainable<string> {
  return cy.window().then((win) => {
    const blob = (win as CsvCaptureWindow).__capturedCsvBlob;
    expect(blob, 'captured CSV Blob').to.be.instanceOf(win.Blob);
    return blob!.text();
  });
}
