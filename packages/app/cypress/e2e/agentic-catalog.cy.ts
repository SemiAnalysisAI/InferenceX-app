import { unlockAgenticGate } from '../support/e2e';

describe('AgentX telemetry catalog', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('lists configurations grouped by model, each opening a point-detail page', () => {
    cy.visit('/inference/agentic', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentic-catalog-summary"]').should('be.visible');

    cy.get('[data-testid^="agentic-catalog-model-"]').should('have.length.greaterThan', 0);
    cy.get('[data-testid^="agentic-catalog-card-"]')
      .should('have.length.greaterThan', 0)
      .first()
      .should('have.attr', 'href')
      .and('match', /^\/inference\/agentic\/\d+$/u);
  });

  it('ships the Simplified Chinese catalog', () => {
    cy.visit('/zh/inference/agentic', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentic-catalog-tutorial-link"]').should(
      'have.attr',
      'href',
      '/zh/agentx/telemetry',
    );
    cy.get('[data-testid^="agentic-catalog-card-"]')
      .first()
      .should('have.attr', 'href')
      .and('match', /^\/zh\/inference\/agentic\/\d+$/u);
  });
});
