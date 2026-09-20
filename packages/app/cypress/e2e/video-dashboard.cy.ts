// Runs against the E2E_FIXTURES=1 server, which serves the retained
// H100/H200/B200 observations from cypress/fixtures/api/video-history.json.
describe('Video hardware dashboard (E2E fixtures)', () => {
  it('leads with the cross-hardware chart and restores v_ params from the URL', () => {
    cy.visit('/video?v_y=kjPerVideo&v_tier=r&v_queue=1');
    cy.get('[data-testid="video-hardware-chart"] circle.point').should('have.length', 9);
    cy.get('[data-testid="video-hardware-chart"] path.line-path').should('have.length', 3);
    cy.get('[data-testid="video-chart-card"]')
      .should('contain', 'GPU-board energy per video (kJ)')
      .and('contain', 'Rent - 3 Year Commit');
    cy.get('[data-testid="video-tco-badge"]').first().should('contain', 'B200');
    cy.get('[data-testid="video-replay"]').should('be.visible');
    cy.get('[data-testid="video-kpi-card"]').should('have.length', 4);
    cy.get('[data-testid="video-runs-section"]').should('not.have.attr', 'open');
    cy.get('[data-testid="video-ci-runs"]').should('not.exist');
  });
  it('opens the runs section for history deep links and renders the Chinese dashboard', () => {
    cy.visit('/video?view=history');
    cy.get('[data-testid="video-runs-section"]').should('have.attr', 'open');
    cy.get('[data-testid="video-history"] h1').should('contain', 'Performance history');
    cy.visit('/zh/video');
    cy.get('[data-testid="video-hardware-chart"] circle.point').should('have.length', 3);
    cy.get('[data-testid="video-chart-card"]').should(
      'contain',
      '每 1 美元 TCO 生成视频数（Hyperscaler 自有设备）',
    );
    cy.get('[data-testid="video-kpi-card"][data-hardware="mi355x"]').should('contain', '未测得');
  });
  it('fits a phone viewport without horizontal page scroll in both locales', () => {
    cy.viewport(390, 844);
    for (const path of ['/video?v_queue=1', '/zh/video']) {
      cy.visit(path);
      cy.get('[data-testid="video-hardware-chart"] circle.point').should('have.length.at.least', 3);
      cy.get('[data-testid="video-kpi-card"]').should('have.length', 4);
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth, `${path} page width`).to.be.at.most(
          doc.documentElement.clientWidth,
        );
      });
      cy.screenshot(`video-dashboard-390${path.startsWith('/zh') ? '-zh' : '-en'}`, {
        capture: 'fullPage',
        overwrite: true,
      });
    }
  });
});
