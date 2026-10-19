const AGENTX_SLUG = 'deepseek-v4-b200-vs-h200';

describe('Compare scenario routes', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('serves the agentic workload at its own path with the AgentX explainer', () => {
    cy.visit(`/compare/${AGENTX_SLUG}/agentic`);

    cy.get('[data-testid="compare-agentic-intro"]')
      .should('contain.text', 'AgentX replays real coding-agent sessions')
      .find('[data-testid="compare-agentic-intro-link"]')
      .should('contain.text', 'Learn more about AgentX')
      .and('have.attr', 'href', '/agentx');
  });

  it('lets the path segment override the pair default', () => {
    cy.visit(`/compare/${AGENTX_SLUG}`);
    cy.get('[data-testid="compare-narrative"]')
      .invoke('text')
      .then((bare) => {
        cy.visit(`/compare/${AGENTX_SLUG}/8k-1k`);
        cy.get('[data-testid="compare-narrative"]').should('contain.text', '8k/1k');
        cy.get('[data-testid="compare-narrative"]')
          .invoke('text')
          .should((pinned) => {
            expect(pinned, 'segment changes the rendered workload').to.not.equal(bare);
          });
      });
  });

  it('canonicalizes every scenario view onto the bare slug URL', () => {
    cy.visit(`/compare/${AGENTX_SLUG}/8k-1k`);
    cy.get('link[rel="canonical"]')
      .should('have.attr', 'href')
      .and('match', new RegExp(`/compare/${AGENTX_SLUG}$`, 'u'));
  });

  it('404s an unknown scenario segment instead of silently defaulting', () => {
    cy.request({ url: `/compare/${AGENTX_SLUG}/bogus`, failOnStatusCode: false })
      .its('status')
      .should('eq', 404);
  });

  it('keeps the segment when redirecting a non-canonical slug', () => {
    cy.request({
      url: `/compare/deepseek-v4-h200-vs-b200/8k-1k`,
      followRedirect: false,
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(308);
      expect(res.headers.location).to.eq(`/compare/${AGENTX_SLUG}/8k-1k`);
    });
  });

  it('carries the scenario routes across the other compare families', () => {
    for (const base of ['/compare-per-dollar', '/zh/compare']) {
      cy.request({ url: `${base}/${AGENTX_SLUG}/agentic`, failOnStatusCode: false })
        .its('status')
        .should('eq', 200);
    }
  });

  it('links catalog cards to scenario paths rather than query strings', () => {
    for (const base of ['/compare', '/compare-per-dollar']) {
      cy.visit(base);
      cy.get('#deepseek-v4 a[data-scenario="AgentX"]')
        .first()
        .should('have.attr', 'href')
        .and('match', new RegExp(`^${base}/.+/agentic$`, 'u'));
      cy.get('#deepseek-r1 a[data-scenario="8K/1K"]')
        .first()
        .should('have.attr', 'href')
        .and('match', new RegExp(`^${base}/.+/8k-1k$`, 'u'));
    }
  });

  it('ships the Chinese explainer on the Chinese scenario route', () => {
    cy.visit(`/zh/compare/${AGENTX_SLUG}/agentic`);

    cy.get('[data-testid="compare-agentic-intro"]')
      .should('contain.text', 'AgentX 回放真实的 coding agent 会话')
      .find('[data-testid="compare-agentic-intro-link"]')
      .should('contain.text', '进一步了解 AgentX')
      .and('have.attr', 'href', '/zh/agentx');
  });
});
