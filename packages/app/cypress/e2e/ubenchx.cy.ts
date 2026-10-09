const dismissModal = {
  onBeforeLoad(win: Cypress.AUTWindow) {
    win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  },
};

describe('ubenchX hub and test routes', () => {
  it('renders the hub page with test cards', () => {
    cy.visit('/ubenchx', dismissModal);
    cy.contains('ubenchX').should('be.visible');
    cy.get('[data-testid="nav-link-ubenchx"]').should('have.attr', 'href', '/ubenchx');
    cy.get('[data-testid="ubenchx-test-mem-bw"]').should('be.visible');
    cy.get('[data-testid="ubenchx-test-sm-l2-distance"]').should('be.visible');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
    cy.get('link[rel="alternate"][hreflang="zh-CN"]')
      .invoke('attr', 'href')
      .should('include', '/zh/ubenchx');
  });

  it('navigates to mem-bw from the hub', () => {
    cy.visit('/ubenchx', dismissModal);
    cy.get('[data-testid="ubenchx-test-mem-bw"]').click();
    cy.url().should('include', '/ubenchx/mem-bw');
    cy.contains('H100 SXM').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').should('contain', 'MBU');
    cy.contains('h2', 'Memory Bandwidth Utilization').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').click();
    cy.contains('[role="option"]', 'Bandwidth (TB/s)').click();
    cy.contains('h2', 'Bandwidth vs Message Size').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').should('contain', 'TB/s');
  });

  it('navigates to sm-l2-distance from the hub', () => {
    cy.visit('/ubenchx', dismissModal);
    cy.get('[data-testid="ubenchx-test-sm-l2-distance"]').click();
    cy.url().should('include', '/ubenchx/sm-l2-distance');
    cy.get('[data-testid="sm-l2-heatmap"]').should('be.visible');
    cy.contains('SM-SM L2 Latency Difference').should('be.visible');
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

  it('renders the Chinese hub page with noindex', () => {
    cy.visit('/zh/ubenchx', dismissModal);
    cy.contains('ubenchX').should('be.visible');
    cy.contains('微基准测试').should('be.visible');
    cy.get('[data-testid="ubenchx-test-mem-bw"]').should('be.visible');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
    cy.get('link[rel="alternate"][hreflang="en"]')
      .invoke('attr', 'href')
      .should('include', '/ubenchx');
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
