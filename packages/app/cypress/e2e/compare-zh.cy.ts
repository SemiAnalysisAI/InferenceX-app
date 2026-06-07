/**
 * Chinese (`/zh/compare*`) locale smoke tests. Verifies the Chinese variants of
 * the compare master + detail pages render localized copy, keep the interactive
 * chart + interpolated table working, and cross-link within the zh locale.
 */
describe('Compare — Chinese (zh) locale', () => {
  const SLUG = 'deepseek-r1-gb200-vs-h100';

  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  describe('master index pages', () => {
    it('renders the Chinese GPU comparisons index', () => {
      cy.visit('/zh/compare');
      cy.get('h1').should('contain.text', 'GPU 对比');
      // Localized per-dollar CTA links within the zh locale.
      cy.get('[data-testid="compare-index-per-dollar-link"]')
        .should('contain.text', '对比 GPU 每美元性能')
        .and('have.attr', 'href')
        .and('match', /^\/zh\/compare-per-dollar/u);
    });

    it('renders the Chinese performance-per-dollar index', () => {
      cy.visit('/zh/compare-per-dollar');
      cy.get('h1').should('contain.text', 'GPU 每美元性能');
    });
  });

  describe('full detail page', () => {
    before(() => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit(`/zh/compare/${SLUG}`);
      cy.get('[data-testid="compare-interpolated-table"]').should('exist');
    });

    it('shows the localized eyebrow and description', () => {
      cy.contains('GPU 对比').should('exist');
      cy.contains('AI 推理基准对比').should('exist');
    });

    it('renders the interpolated table with localized metric labels', () => {
      cy.get('[data-testid="compare-interpolated-table"]').should('be.visible');
      cy.get('[data-testid="compare-interpolated-table"]').should('contain.text', '并发数');
      // GPU labels stay in their original (language-neutral) form.
      cy.get('[data-testid="compare-interpolated-table"] tbody td').should('contain.text', 'GB200');
    });

    it('mounts the interactive chart', () => {
      cy.get('[data-testid="scatter-graph"]').should('exist');
    });

    it('cross-links to the zh per-dollar view', () => {
      cy.contains('a', '查看每美元性能视图')
        .should('have.attr', 'href')
        .and('match', new RegExp(`^/zh/compare-per-dollar/${SLUG}$`, 'u'));
    });
  });

  describe('per-dollar detail page', () => {
    before(() => {
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      });
      cy.visit(`/zh/compare-per-dollar/${SLUG}`);
      cy.get('[data-testid="compare-interpolated-table"]').should('exist');
    });

    it('shows the localized heading and cost-row label', () => {
      cy.get('h1').should('contain.text', '每美元性能');
      cy.get('[data-testid="compare-interpolated-table"]').should(
        'contain.text',
        '每百万 Token 美元成本',
      );
    });

    it('cross-links to the zh full comparison view', () => {
      cy.contains('a', '查看完整的延迟 + 吞吐量对比')
        .should('have.attr', 'href')
        .and('match', new RegExp(`^/zh/compare/${SLUG}$`, 'u'));
    });
  });
});
