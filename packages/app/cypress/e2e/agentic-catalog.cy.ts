import { unlockAgenticGate } from '../support/e2e';

/**
 * `/inference/agentic` is the telemetry catalog: a hero drawn from the AgentX
 * telemetry tutorial, then one card per (model, SKU, engine, precision) config
 * that has stored per-request telemetry.
 */
describe('AgentX telemetry catalog', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('leads with the telemetry hero and links to the full tutorial', () => {
    cy.visit('/inference/agentic', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentic-catalog-hero"]').within(() => {
      cy.get('h1').should('have.text', 'Exploring Agentic Workloads: Detailed Telemetry');
      // Highlight counts come from the tutorial guide, which agentx-telemetry.test.ts
      // pins to what the detail page actually renders.
      cy.get('dl div').should('have.length', 4);
      cy.contains('11').should('be.visible');
      cy.get('[data-testid="agentic-catalog-tutorial-link"]')
        .should('contain.text', 'Read the telemetry tutorial')
        .and('have.attr', 'href', '/agentx/telemetry');
    });
  });

  it('lists configurations grouped by model, each opening a point-detail page', () => {
    cy.visit('/inference/agentic', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentic-catalog-summary"]')
      .should('contain.text', 'AgentX runs with stored telemetry')
      .and('contain.text', 'serving configurations across');

    cy.get('[data-testid^="agentic-catalog-model-"]').should('have.length.greaterThan', 0);
    cy.get('[data-testid^="agentic-catalog-card-"]')
      .should('have.length.greaterThan', 0)
      .first()
      .should('have.attr', 'href')
      .and('match', /^\/inference\/agentic\/\d+$/u);
  });

  it('highlights Telemetry rather than Dashboard in the header nav', () => {
    cy.visit('/inference/agentic', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="nav-link-telemetry"]')
      .should('have.attr', 'href', '/inference/agentic')
      .and('have.class', 'text-brand');
    cy.get('[data-testid="nav-link-dashboard"]').should('not.have.class', 'text-brand');
  });

  it('ships the Simplified Chinese catalog', () => {
    cy.visit('/zh/inference/agentic', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentic-catalog-summary"]').should(
      'contain.text',
      '已存储遥测数据的 AgentX 运行',
    );
    cy.get('[data-testid="agentic-catalog-tutorial-link"]')
      .should('contain.text', '阅读遥测数据教程')
      .and('have.attr', 'href', '/zh/agentx/telemetry');
    cy.get('[data-testid^="agentic-catalog-card-"]')
      .first()
      .should('have.attr', 'href')
      .and('match', /^\/zh\/inference\/agentic\/\d+$/u);
  });
});
