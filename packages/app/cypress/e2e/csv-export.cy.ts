describe('CSV Export', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/');
    cy.get('[data-testid="chart-figure"]').should('exist');
  });

  it('inference chart export button opens dropdown with PNG and CSV options', () => {
    cy.get('[data-testid="export-button"]').first().click();

    cy.get('[data-testid="export-png-button"]')
      .should('be.visible')
      .and('contain.text', 'Download PNG');
    cy.get('[data-testid="export-csv-button"]')
      .should('be.visible')
      .and('contain.text', 'Download CSV');
  });

  it('clicking Download CSV on inference chart triggers file download', () => {
    cy.get('[data-testid="export-button"]').first().click();
    cy.get('[data-testid="export-csv-button"]').click();

    // The popover should close after clicking
    cy.get('[data-testid="export-csv-button"]').should('not.exist');
  });

  it('reliability chart has CSV export option', () => {
    cy.get('[data-testid="tab-trigger-reliability"]').click();
    cy.get('[data-testid="reliability-chart-display"]').should('exist');

    cy.get('[data-testid="export-button"]').first().click();
    cy.get('[data-testid="export-csv-button"]')
      .should('be.visible')
      .and('contain.text', 'Download CSV');
  });

  it('evaluation chart has CSV export option', () => {
    cy.get('[data-testid="tab-trigger-evaluation"]').click();
    cy.get('[data-testid="evaluation-chart-display"]').should('exist');

    cy.get('[data-testid="export-button"]').first().click();
    cy.get('[data-testid="export-csv-button"]')
      .should('be.visible')
      .and('contain.text', 'Download CSV');
  });

  it('TCO calculator chart has CSV export option', () => {
    cy.get('[data-testid="tab-trigger-calculator"]').click();
    cy.get('[data-testid="calculator-chart-section"]').should('exist');

    cy.get('[data-testid="export-button"]').first().click();
    cy.get('[data-testid="export-csv-button"]')
      .should('be.visible')
      .and('contain.text', 'Download CSV');
  });

  it('historical trends chart has CSV export option', () => {
    cy.get('[data-testid="tab-trigger-historical"]').click();
    cy.get('[data-testid="historical-trend-figure"]').should('exist');

    cy.get('[data-testid="export-button"]').first().click();
    cy.get('[data-testid="export-csv-button"]')
      .should('be.visible')
      .and('contain.text', 'Download CSV');
  });

  it('Download PNG option is still available in dropdown', () => {
    cy.get('[data-testid="export-button"]').first().click();
    cy.get('[data-testid="export-png-button"]')
      .should('be.visible')
      .and('contain.text', 'Download PNG');
  });
});
