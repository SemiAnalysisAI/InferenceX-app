describe('Chinese (/zh) pages', () => {
  describe('zh landing page', () => {
    before(() => {
      cy.visit('/zh');
    });

    it('renders the Chinese landing content', () => {
      cy.contains('h2', '探索 InferenceX').should('exist');
      cy.contains('快速对比').should('exist');
    });

    it('links to the Chinese overview and full dashboard', () => {
      cy.get('[data-testid="landing-overview-link"]')
        .should('have.attr', 'href', '/zh/overview')
        .and('have.text', '总览');
      cy.get('[data-testid="landing-full-dashboard-link"]')
        .should('have.attr', 'href', '/zh/inference')
        .and('have.text', '完整仪表板');
    });

    it('sets hreflang alternates to the English homepage', () => {
      cy.get('link[rel="alternate"][hreflang="en"]').should('exist');
      cy.get('link[rel="alternate"][hreflang="zh-CN"]').should('exist');
    });

    it('header language toggle points back to English', () => {
      cy.get('[data-testid="language-toggle"]').should('have.attr', 'href', '/');
    });

    it('footer renders in Chinese with zh-internal links', () => {
      cy.get('[data-testid="footer-brand-description"]').should('contain.text', '开源推理基准测试');
      cy.get('[data-testid="footer-link-supporters"]')
        .should('contain.text', '支持者')
        .and('have.attr', 'href', '/zh/quotes');
      cy.get('[data-testid="footer-link-datasets"]')
        .should('contain.text', '数据集')
        .and('have.attr', 'href', '/zh/datasets');
      cy.get('[data-testid="footer-link-articles"]')
        .should('contain.text', '文章')
        .and('have.attr', 'href', '/zh/blog');
      cy.get('[data-testid="footer-link-land-acknowledgement"]').should(
        'have.attr',
        'href',
        '/zh/land-acknowledgement',
      );
      cy.get('[data-testid="footer-link-zh"]')
        .should('contain.text', 'English')
        .and('have.attr', 'href', '/');
    });
  });

  describe('zh dashboard tab page', () => {
    before(() => {
      cy.visit('/zh/inference');
    });

    it('renders the Chinese SEO intro above the chart', () => {
      cy.get('[data-testid="zh-tab-intro"]').within(() => {
        cy.contains('h1', 'AI 推理基准测试').should('exist');
      });
    });

    it('tab nav shows Chinese labels linking within /zh', () => {
      cy.get('[data-testid="tab-trigger-evaluation"]')
        .should('contain.text', '准确率评估')
        .and('have.attr', 'href')
        .and('match', /^\/zh\/evaluation/u);
    });
  });

  describe('zh blog', () => {
    before(() => {
      cy.visit('/zh/blog');
    });

    it('renders the Chinese blog listing', () => {
      cy.contains('h2', '文章').should('exist');
      cy.get('a[href^="/zh/blog/"]').should('have.length.gte', 1);
    });
  });

  describe('zh blog post page', () => {
    before(() => {
      cy.visit('/zh/blog/inferencemax-open-source-inference-benchmarking');
    });

    it('renders translated content with Chinese chrome', () => {
      cy.get('article.prose').should('exist');
      cy.contains('分钟阅读').should('exist');
      cy.get('a[href="/zh/blog"]').should('exist');
    });

    it('links to the English original', () => {
      cy.get('a[href="/blog/inferencemax-open-source-inference-benchmarking"]').should('exist');
    });
  });

  describe('zh blog post with math', () => {
    before(() => {
      cy.visit('/zh/blog/kimi-k3-the-manos-the-mythos-the');
    });

    it('renders KaTeX in the translation too', () => {
      cy.get('article.prose .katex').should('have.length.gte', 1);
    });

    it('keeps figures and their Chinese captions', () => {
      cy.get('article.prose figure img').should('have.length.gte', 20);
      cy.get('article.prose figcaption').first().should('contain.text', '来源');
    });
  });

  describe('English pages expose the Chinese sibling', () => {
    before(() => {
      cy.visit('/blog');
    });

    it('has a zh-CN hreflang alternate and a language toggle', () => {
      // hreflang URLs are absolute against the production origin.
      cy.get('link[rel="alternate"][hreflang="zh-CN"]')
        .should('have.attr', 'href')
        .and('match', /\/zh\/blog$/u);
      cy.get('[data-testid="language-toggle"]')
        .should('contain.text', '中文')
        .and('have.attr', 'href', '/zh/blog');
    });
  });
});
