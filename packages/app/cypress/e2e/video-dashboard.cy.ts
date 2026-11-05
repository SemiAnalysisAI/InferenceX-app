// The spec injects retained H100/H200/B200 C1/C2/C4 observations from
// cypress/fixtures/api/video-history.json, including when CI starts a production server.
describe('Video hardware dashboard (E2E fixtures)', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/video-runs?format=history&page=1*', {
      fixture: 'api/video-history.json',
      headers: { 'X-VideoGenX-Replay': '1' },
    }).as('history');
    // The Compare panel fetches two published artifacts once in view; keep the spec offline.
    cy.intercept('GET', '/api/video-runs?run=*', { statusCode: 204 }).as('media');
  });
  it('keeps hardware visibility after reload and on a shared Chinese URL', () => {
    cy.visit('/video');
    cy.get('[data-testid="video-hardware-chart"] circle.point').should('have.length', 3);
    cy.contains('[data-testid="video-legend"] li', 'H100').click();
    cy.location('search').should('contain', 'v_hidden=h100');
    cy.get('[data-testid="video-hardware-chart"] circle.point').should('have.length', 2);
    cy.reload();
    cy.get('[data-testid="video-hardware-chart"] circle.point').should('have.length', 2);
    cy.location('search').then((search) => cy.visit(`/zh/video${search}&v_view=table`));
    cy.get('[data-testid="video-points-table"] tbody tr').should('have.length', 2);
    cy.get('[data-testid="video-points-table"]').should('not.contain', 'H100');
    cy.contains('[data-testid="video-legend"] li', 'H100').click();
    cy.get('[data-testid="video-points-table"] tbody tr').should('have.length', 3);
    cy.location('search').should('not.contain', 'v_hidden=');
  });
  it('fits a phone viewport without horizontal page scroll in both locales', () => {
    cy.viewport(390, 844);
    for (const path of ['/video', '/zh/video']) {
      cy.visit(path);
      cy.get('[data-testid="video-hardware-chart"] circle.point').should('have.length', 3);
      cy.get('[data-testid="video-kpi-card"]').should('have.length', 4);
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth, `${path} page width`).to.be.at.most(
          doc.documentElement.clientWidth,
        );
      });
    }
  });
});
