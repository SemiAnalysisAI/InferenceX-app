describe('Intro Section', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/');
  });

  it('renders the intro section card', () => {
    cy.get('[data-testid="intro-section"]').should('be.visible');
  });

  it('mentions InferenceX in the intro text', () => {
    cy.get('[data-testid="intro-section"]').should('contain', 'InferenceX');
  });

  it('describes LLM inference performance', () => {
    cy.get('[data-testid="intro-section"]').should('contain', 'inference performance');
  });

  it('mentions InferenceMAX (formerly name)', () => {
    cy.get('[data-testid="intro-section"]').should('contain', 'InferenceMAX');
  });

  it('contains links to v1 and v2 articles', () => {
    cy.get('[data-testid="intro-section"]')
      .contains('v1')
      .should('have.attr', 'href')
      .and('include', 'semianalysis.com');
    cy.get('[data-testid="intro-section"]')
      .contains('v2')
      .should('have.attr', 'href')
      .and('include', 'semianalysis.com');
  });

  it('article links open in a new tab', () => {
    cy.get('[data-testid="intro-section"]')
      .find('a[target="_blank"]')
      .should('have.length.at.least', 2);
  });

  it('appears above the chart section', () => {
    cy.get('[data-testid="intro-section"]').then(($intro) => {
      cy.get('[data-testid="chart-section-tabs"]').then(($tabs) => {
        const introTop = $intro[0].getBoundingClientRect().top;
        const tabsTop = $tabs[0].getBoundingClientRect().top;
        expect(introTop).to.be.lessThan(tabsTop);
      });
    });
  });
});
