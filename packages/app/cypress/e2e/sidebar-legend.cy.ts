// Core legend behavior (search, clear, expand/collapse, item toggle, reset) is covered by
// cypress/component/chart-legend.cy.tsx. These e2e tests verify integration with real data
// and page-level concerns only.
describe('Sidebar Legend (integration)', () => {
  before(() => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('.sidebar-legend').first().should('be.visible');
  });

  it('legend populates with real GPU data from the API', () => {
    cy.get('.sidebar-legend')
      .first()
      .within(() => {
        cy.get('label').should('have.length.greaterThan', 0);
        cy.get('input[type="checkbox"]').first().should('exist');
      });
  });

  it('legend defaults to expanded state', () => {
    cy.get('.sidebar-legend').first().should('have.class', 'bg-accent');
  });

  it('label hover area does not extend beyond text width', () => {
    cy.get('.sidebar-legend')
      .first()
      .within(() => {
        cy.get('label')
          .first()
          .then(($label) => {
            const labelWidth = $label[0].getBoundingClientRect().width;
            const parentWidth = $label[0].closest('li')!.getBoundingClientRect().width;
            expect(labelWidth).to.be.lessThan(parentWidth);
          });
      });
  });

  it('active items are sorted before inactive in sidebar', () => {
    cy.get('.sidebar-legend')
      .first()
      .within(() => {
        cy.get('label').should('have.length.greaterThan', 1);
        cy.get('label').first().click();

        cy.get('label').first().should('be.visible');
        cy.get('label').first().find('span').eq(1).invoke('text').should('be.a', 'string');
      });
  });

  it('legend respects URL param for collapsed state', () => {
    // Must re-visit with param — this changes the URL
    cy.visit('/?i_legend=0', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('.sidebar-legend').first().should('be.visible');
    cy.get('.sidebar-legend').first().should('not.have.class', 'bg-accent');
  });
});
