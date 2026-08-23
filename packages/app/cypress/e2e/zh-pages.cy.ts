describe('Chinese (/zh) pages', () => {
  describe('zh landing page', () => {
    before(() => {
      cy.visit('/zh');
    });

    it('renders the Chinese landing content', () => {
      cy.get('[data-testid="intro-section"]').should('contain.text', '智能体推理基准测试');
      cy.get('[data-testid="splash-text"]').should('have.text', 'AgentX 来了！！');
      // Quick Comparisons is hidden behind SHOW_QUICK_COMPARISONS in
      // landing-page.tsx; the card and its Chinese strings still exist in the
      // source, so assert it is not rendered rather than dropping the check.
      cy.get('[data-testid="landing-quick-comparisons"]').should('not.exist');
      cy.contains('快速对比').should('not.exist');
    });

    it('sets hreflang alternates to the English homepage', () => {
      cy.get('link[rel="alternate"][hreflang="en"]').should('exist');
      cy.get('link[rel="alternate"][hreflang="zh-CN"]').should('exist');
    });

    it('header language toggle points back to English', () => {
      cy.get('[data-testid="language-toggle"]').should('have.attr', 'href', '/');
    });

    it('header links to the Chinese AgentX page', () => {
      cy.get('[data-testid="nav-link-agentx"]')
        .should('contain.text', 'AgentX')
        .and('have.attr', 'href', '/zh/agentx');
    });

    it('renders the AgentX hero on the Chinese landing page', () => {
      cy.get('[data-testid="compare-agentx-primary"]').within(() => {
        cy.get('h2').should('have.text', '真实智能体工作负载下的推理性能对比');
        cy.get('[data-testid="compare-agentx-overview-link"]')
          .should('contain.text', '总览')
          .and('have.attr', 'href', '/zh/overview');
        cy.get('[data-testid="compare-agentx-methodology-link"]').should('not.exist');
        // Ledger NEW pills localize to 新 on the Chinese landing page.
        cy.get('[data-testid^="compare-agentx-model-"] [data-new-badge="agentx-ledger"]')
          .should('have.length', 6)
          .each(($badge) => expect($badge.text()).to.equal('新'));
      });
    });

    it('footer renders in Chinese with zh-internal links', () => {
      cy.get('[data-testid="footer-brand-description"]').should(
        'contain.text',
        'InferenceX 持续开展开源的 agentic 推理基准测试',
      );
      cy.get('[data-testid="footer-link-supporters"]')
        .should('contain.text', '业界评价')
        .and('have.attr', 'href', '/zh/quotes');
      cy.get('[data-testid="footer-link-agentx"]')
        .should('contain.text', 'AgentX')
        .and('have.attr', 'href', '/zh/agentx');
      cy.get('[data-testid="footer-link-about"]')
        .should('have.text', '关于 SemiAnalysis')
        .and('have.attr', 'href', 'https://semianalysis.com/about/');
      cy.get('[data-testid="footer-link-articles"]')
        .should('contain.text', '文章')
        .and('have.attr', 'href', '/zh/blog');
      cy.get('[data-testid="footer-link-land-acknowledgement"]').should(
        'have.attr',
        'href',
        '/zh/land-acknowledgement',
      );
      cy.get('[data-testid="footer-link-zh"]').should('not.exist');
    });
  });

  describe('zh dashboard tab page', () => {
    before(() => {
      cy.visit('/zh/inference');
    });

    it('renders the Chinese SEO intro above the chart', () => {
      cy.get('[data-testid="zh-tab-intro"]').within(() => {
        cy.contains('h1', '智能体推理基准测试').should('exist');
        cy.contains('长上下文、多轮').should('exist');
      });
    });

    it('tab nav shows Chinese labels linking within /zh', () => {
      cy.get('[data-testid="tab-trigger-evaluation"]')
        .should('contain.text', '准确率评估')
        .and('have.attr', 'href')
        .and('match', /^\/zh\/evaluation/u);
    });
  });

  describe('zh FAQ', () => {
    it('uses the same direct-link anchor as the English FAQ', () => {
      cy.visit('/zh/about#faq-normalized-interactivity');

      cy.get('#faq-normalized-interactivity')
        .should('be.visible')
        .within(() => {
          cy.contains(
            'a[href="#faq-normalized-interactivity"]',
            '端到端归一化交互性与交互性有何区别？',
          ).should('be.visible');
          cy.contains('TTFT 越长，归一化指标越低').should('be.visible');
          cy.get('[data-testid="faq-copy-link-faq-normalized-interactivity"]')
            .should('be.visible')
            .and('have.attr', 'title', '复制链接')
            .find('svg.lucide-link')
            .should('be.visible');
        });
      cy.location('hash').should('eq', '#faq-normalized-interactivity');
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

  describe('zh submissions workflow', () => {
    beforeEach(() => {
      cy.visit('/zh/submissions');
      cy.get('[data-testid="submissions-display"]').should('be.visible');
    });

    it('localizes chart controls, table headers, sorting, and expanded details', () => {
      cy.viewport(1440, 900);
      cy.contains('h2', '基准测试提交').should('be.visible');
      cy.get('[data-testid="submissions-mode-toggle"]')
        .should('have.attr', 'aria-label', '图表模式')
        .and('contain.text', '按周')
        .and('contain.text', '累计');
      cy.contains('th button', '投机解码').should('be.visible');
      cy.contains('th button', '数据点').click().parent('th').should('have.attr', 'aria-sort');
      cy.get('button[aria-label="展开配置详情"]').first().click();
      cy.get('[data-testid="submissions-display"]')
        .should('contain.text', '投机解码方法：')
        .and('contain.text', '预填充')
        .and('contain.text', '解码');
    });

    it('separates localized empty chart and table states', () => {
      cy.intercept('GET', '**/api/v1/submissions', { body: { summary: [], volume: [] } }).as(
        'emptySubmissions',
      );
      cy.reload();
      cy.wait('@emptySubmissions');
      cy.contains('暂无提交活动数据。').should('be.visible');
      cy.contains('暂无提交记录。').should('be.visible');
    });

    it('shows a safe error and retries through a real button click', () => {
      let attempts = 0;
      cy.intercept('GET', '**/api/v1/submissions', (request) => {
        attempts += 1;
        request.reply(
          attempts <= 2
            ? { statusCode: 500, body: { error: 'submissions-database-internal-detail' } }
            : { body: { summary: [], volume: [] } },
        );
      }).as('retrySubmissions');
      cy.reload();
      cy.wait('@retrySubmissions');
      cy.wait('@retrySubmissions');
      cy.contains('加载提交数据失败。').should('be.visible');
      cy.contains('submissions-database-internal-detail').should('not.exist');
      cy.contains('button', '重试').click();
      cy.wait('@retrySubmissions');
      cy.contains('暂无提交记录。').should('be.visible');
    });

    for (const width of [375, 390]) {
      it(`keeps the table available through horizontal scrolling at ${width}px`, () => {
        cy.viewport(width, 844);
        cy.get('[data-testid="submissions-display"] table').should('be.visible');
        cy.get('[data-testid="submissions-display"] .overflow-x-auto')
          .scrollTo('right')
          .should('be.visible');
        cy.document().then((doc) => {
          expect(doc.documentElement.scrollWidth).to.be.lte(doc.documentElement.clientWidth);
        });
      });
    }
  });

  describe('zh feedback viewer workflow', () => {
    beforeEach(() => {
      cy.intercept('GET', '**/api/v1/feedback/list', { body: { rows: [] } }).as('feedbackList');
      cy.visit('/zh/feedback', {
        onBeforeLoad(win) {
          win.localStorage.setItem('inferencex-feature-gate', '1');
        },
      });
      cy.wait('@feedbackList');
    });

    it('localizes the empty state, key validation, and accessibility label', () => {
      cy.viewport(1440, 900);
      cy.get('[data-testid="feedback-viewer"]')
        .should('contain.text', '用户反馈')
        .and('contain.text', '暂无反馈记录。');
      cy.get('button[aria-label="显示密钥"]').should('be.visible');
      cy.get('[data-testid="feedback-key-input"]').type('invalid-key');
      cy.get('[data-testid="feedback-key-submit"]').click();
      cy.get('[role="alert"]').should('contain.text', '解密密钥必须是有效的 base64 编码');
    });

    it('shows a safe fetch error and retries through a real button click', () => {
      let attempts = 0;
      cy.intercept('GET', '**/api/v1/feedback/list', (request) => {
        attempts += 1;
        request.reply(
          attempts <= 2
            ? { statusCode: 500, body: { error: 'feedback-database-internal-detail' } }
            : { body: { rows: [] } },
        );
      }).as('retryFeedbackList');
      cy.reload();
      cy.wait('@retryFeedbackList');
      cy.wait('@retryFeedbackList');
      cy.contains('无法加载反馈数据。').should('be.visible');
      cy.contains('feedback-database-internal-detail').should('not.exist');
      cy.contains('button', '重试').click();
      cy.wait('@retryFeedbackList');
      cy.contains('暂无反馈记录。').should('be.visible');
    });

    for (const width of [375, 390]) {
      it(`keeps the key controls and content within ${width}px`, () => {
        cy.viewport(width, 844);
        cy.get('[data-testid="feedback-key-input"]').should('be.visible');
        cy.get('[data-testid="feedback-key-submit"]').should('be.visible');
        cy.document().then((doc) => {
          expect(doc.documentElement.scrollWidth).to.be.lte(doc.documentElement.clientWidth);
        });
      });
    }
  });

  it('uses the route locale in the global feedback modal and dismisses it through the UI', () => {
    cy.viewport(1440, 900);
    cy.visit('/zh/inference', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('inferencex-feedback-modal-snoozed');
      },
    });

    cy.get('[data-testid="feedback-modal"]')
      .should('be.visible')
      .and('contain.text', '帮助我们改进 InferenceX')
      .and('contain.text', '您的反馈会加密保存');
    cy.get('[data-testid="feedback-modal-dismiss"]').click();
    cy.get('[data-testid="feedback-modal"]').should('not.exist');
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
