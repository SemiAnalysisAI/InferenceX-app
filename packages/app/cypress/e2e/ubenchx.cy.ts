const dismissModal = {
  onBeforeLoad(win: Cypress.AUTWindow) {
    win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  },
};

describe('ubenchX hub and test routes', () => {
  it('opens /ubenchx on the mem-bw view with the Beta title and test selector', () => {
    cy.visit('/ubenchx', dismissModal);
    cy.url().should('include', '/ubenchx/mem-bw');
    cy.contains('h1', 'ubenchX Microbenchmarks (Beta)').should('be.visible');
    cy.get('[data-testid="nav-link-ubenchx"]').should('have.attr', 'href', '/ubenchx');
    cy.get('[data-testid="ubenchx-test-select"]').should('contain', 'Device-Memory Copy Bandwidth');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
    cy.contains('H100 SXM').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').should('contain', 'MBU');
    cy.contains('h2', 'Memory Bandwidth Utilization').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').click();
    cy.contains('[role="option"]', 'Bandwidth (TB/s)').click();
    cy.contains('h2', 'Bandwidth vs Message Size').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').should('contain', 'TB/s');
  });

  it('switches to sm-l2-distance with the test selector', () => {
    cy.visit('/ubenchx/mem-bw', dismissModal);
    cy.get('[data-testid="ubenchx-test-select"]').click();
    cy.contains('[role="option"]', 'SM-SM L2 Latency Difference').click();
    cy.url().should('include', '/ubenchx/sm-l2-distance');
    cy.get('[data-testid="sm-l2-heatmap"]').should('be.visible');
    cy.get('[data-testid="ubenchx-test-select"]').should('contain', 'SM-SM L2 Latency Difference');
  });

  it('renders the mem-bw page directly with noindex', () => {
    cy.visit('/ubenchx/mem-bw', dismissModal);
    cy.contains('ubenchX').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').should('be.visible');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
    cy.get('link[rel="alternate"][hreflang="zh-CN"]')
      .invoke('attr', 'href')
      .should('include', '/zh/ubenchx/mem-bw');
  });

  it('renders the sm-l2-distance page directly with noindex', () => {
    cy.visit('/ubenchx/sm-l2-distance', dismissModal);
    cy.get('[data-testid="sm-l2-heatmap"]').should('be.visible');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
    cy.get('link[rel="alternate"][hreflang="zh-CN"]')
      .invoke('attr', 'href')
      .should('include', '/zh/ubenchx/sm-l2-distance');
  });

  it('keeps a pinned sm-l2-distance tooltip on its cell while the pointer moves', () => {
    cy.visit('/ubenchx/sm-l2-distance', dismissModal);
    cy.get('[data-testid="sm-l2-heatmap"] svg rect').last().as('overlay');
    cy.get('@overlay').click(520, 120, { force: true });
    cy.get('[data-testid="sm-l2-tooltip"]')
      .should('be.visible')
      .invoke('text')
      .then((pinned) => {
        cy.get('@overlay').trigger('mousemove', 60, 60, { force: true });
        cy.get('[data-testid="sm-l2-tooltip"]').should('be.visible').and('have.text', pinned);
      });
  });

  it('opens /zh/ubenchx on the Chinese mem-bw view with the Beta title', () => {
    cy.visit('/zh/ubenchx', dismissModal);
    cy.url().should('include', '/zh/ubenchx/mem-bw');
    cy.contains('h1', 'ubenchX 微基准测试（Beta）').should('be.visible');
    cy.get('[data-testid="ubenchx-test-select"]').should('contain', '显存拷贝带宽');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
    cy.get('link[rel="alternate"][hreflang="en"]')
      .invoke('attr', 'href')
      .should('include', '/ubenchx/mem-bw');
  });

  it('renders the Chinese mem-bw page', () => {
    cy.visit('/zh/ubenchx/mem-bw', dismissModal);
    cy.contains('显存拷贝带宽').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').should('contain', 'MBU');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
  });

  it('renders the Chinese sm-l2-distance page', () => {
    cy.visit('/zh/ubenchx/sm-l2-distance', dismissModal);
    cy.get('[data-testid="sm-l2-heatmap"]').should('be.visible');
    cy.contains('SM 间 L2 延迟差异').should('be.visible');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
  });
});
