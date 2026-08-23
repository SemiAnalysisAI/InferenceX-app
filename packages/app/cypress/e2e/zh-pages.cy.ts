function visitCurrentImage() {
  cy.visit('/zh/current-inferencex-image', {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    },
  });
}

describe('Chinese (/zh) pages', () => {
  describe('zh landing page', () => {
    before(() => {
      cy.visit('/zh');
    });

    it('renders the Chinese landing content', () => {
      cy.get('[data-testid="intro-section"]').should('contain.text', '智能体推理基准测试');
      cy.get('[data-testid="splash-text"]').should('have.text', 'AgentX 来了！！');
      cy.contains('h2', '探索 InferenceX').should('exist');
      // Quick Comparisons is hidden behind SHOW_QUICK_COMPARISONS in
      // landing-page.tsx; the card and its Chinese strings still exist in the
      // source, so assert it is not rendered rather than dropping the check.
      cy.get('[data-testid="landing-quick-comparisons"]').should('not.exist');
      cy.contains('快速对比').should('not.exist');
    });

    it('links to the Chinese overview and full dashboard', () => {
      cy.get('[data-testid="landing-overview-link"]')
        .should('have.attr', 'href', '/zh/overview')
        .and('have.text', '总览');
      cy.get('[data-testid="landing-full-dashboard-link"]')
        .should('have.attr', 'href', '/zh/inference')
        .and('have.text', '查看完整仪表板');
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
        cy.get('[data-testid="compare-agentx-methodology-link"]')
          .should('contain.text', '测试方法')
          .and('have.attr', 'href', '/zh/agentx');
      });
    });

    it('footer renders in Chinese with zh-internal links', () => {
      cy.get('[data-testid="footer-brand-description"]').should(
        'contain.text',
        'InferenceX 持续开展开源推理基准测试',
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

  describe('Current InferenceX Image Chinese route', () => {
    const today = new Date().toISOString().slice(0, 10);
    const imageRows = [
      {
        model: 'dsr1',
        hardware: 'h200',
        framework: 'mori-sglang',
        precision: 'fp8',
        spec_method: 'none',
        disagg: false,
        isl: 1024,
        osl: 1024,
        image: 'lmsysorg/sglang:v0.5.2',
        date: today,
      },
      {
        model: 'gptoss',
        hardware: 'b200',
        framework: 'vllm',
        precision: 'fp4',
        spec_method: 'mtp',
        disagg: false,
        isl: 1024,
        osl: 1024,
        image: 'vllm/vllm-openai:v0.10.1',
        date: today,
      },
    ];

    beforeEach(() => {
      cy.viewport(390, 844);
    });

    it('shows the localized loading state', () => {
      cy.intercept('GET', '**/api/v1/latest-images', {
        delay: 250,
        body: imageRows,
      });
      cy.intercept('GET', '**/api/v1/framework-releases', {});
      visitCurrentImage();
      cy.contains('加载中……').should('be.visible');
      cy.get('table').should('contain.text', 'lmsysorg/sglang:v0.5.2');
    });

    it('localizes spec decode, age text and tooltip while preserving image tags', () => {
      cy.intercept('GET', '**/api/v1/latest-images', imageRows).as('latestImages');
      cy.intercept('GET', '**/api/v1/framework-releases', {
        sglang: 'v0.5.2',
        vllm: 'v0.10.1',
      });
      visitCurrentImage();
      cy.wait('@latestImages');
      cy.get('table')
        .should('contain.text', '关闭')
        .and('contain.text', '0 天')
        .and('contain.text', 'lmsysorg/sglang:v0.5.2')
        .and('not.contain.text', '0d');
      cy.get('td[title^="上次提交："]').should('have.length.greaterThan', 0);
      cy.contains('label', '节点类型').find('button').trigger('mouseover');
      cy.get('[role="tooltip"]')
        .should('contain.text', '单节点指非分离式推理')
        .and('contain.text', '独立的 prefill/decode 池')
        .and('contain.text', 'MoRI')
        .and('not.contain.text', '=');
    });

    it('preserves the English status, age, and technical tooltip copy', () => {
      cy.intercept('GET', '**/api/v1/latest-images', imageRows);
      cy.intercept('GET', '**/api/v1/framework-releases', {
        sglang: 'v0.5.2',
        vllm: 'v0.10.1',
      });
      cy.visit('/current-inferencex-image');
      cy.get('table')
        .should('contain.text', 'Off')
        .and('contain.text', '0d')
        .and('not.contain.text', '关闭');
      cy.get('td[title^="Last submission:"]').should('have.length.greaterThan', 0);
      cy.contains('label', 'Node Type').find('button').trigger('mouseover');
      cy.get('[role="tooltip"]')
        .should('contain.text', 'Single node = non-disaggregated serving.')
        .and('contain.text', 'MoRI');
    });

    it('keeps rows available when release lookup fails and retries independently', () => {
      let releaseAttempts = 0;
      cy.intercept('GET', '**/api/v1/latest-images', imageRows);
      cy.intercept('GET', '**/api/v1/framework-releases', (req) => {
        releaseAttempts += 1;
        req.reply(
          releaseAttempts <= 2
            ? { statusCode: 500, body: { error: 'release failure' } }
            : { statusCode: 200, body: { sglang: 'v0.5.2', vllm: 'v0.10.1' } },
        );
      }).as('frameworkReleases');
      visitCurrentImage();
      cy.wait('@frameworkReleases');
      cy.wait('@frameworkReleases');
      cy.get('[data-testid="current-image-releases-error"]')
        .should('contain.text', '无法加载框架最新版本标签')
        .contains('button', '重试')
        .click();
      cy.get('table').should('contain.text', 'lmsysorg/sglang:v0.5.2');
      cy.wait('@frameworkReleases');
      cy.get('[data-testid="current-image-releases-error"]').should('not.exist');
    });

    it('shows a natural empty-filter message', () => {
      cy.intercept('GET', '**/api/v1/latest-images', imageRows);
      cy.intercept('GET', '**/api/v1/framework-releases', {});
      visitCurrentImage();
      cy.get('#image-precision-select').click();
      cy.get('[data-slot="select-item"]').contains('FP8').click();
      cy.get('#image-hardware-select').click();
      cy.get('[data-slot="select-item"]').contains('B200').click();
      cy.contains('当前筛选组合没有镜像记录，请调整一个或多个筛选条件。').should('be.visible');
    });

    it('hides primary API details, retries, and keeps the table internally scrollable', () => {
      let attempts = 0;
      cy.intercept('GET', '**/api/v1/latest-images', (req) => {
        attempts += 1;
        req.reply(
          attempts <= 2
            ? { statusCode: 500, body: { error: 'sensitive database detail' } }
            : { statusCode: 200, body: imageRows },
        );
      }).as('latestImagesRetry');
      cy.intercept('GET', '**/api/v1/framework-releases', {});
      visitCurrentImage();
      cy.wait('@latestImagesRetry');
      cy.wait('@latestImagesRetry');
      cy.get('[data-testid="current-image-error"]')
        .should('contain.text', '无法加载镜像数据。')
        .and('not.contain.text', 'sensitive database detail')
        .contains('button', '重试')
        .click();
      cy.wait('@latestImagesRetry');
      cy.get('table')
        .parents('.overflow-x-auto')
        .then(($scroller) => {
          expect($scroller[0].scrollWidth).to.be.greaterThan($scroller[0].clientWidth);
        });
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
      });
      cy.get('link[rel="alternate"][hreflang="en"]')
        .invoke('attr', 'href')
        .should('include', '/current-inferencex-image');
      cy.get('link[rel="alternate"][hreflang="zh-CN"]')
        .invoke('attr', 'href')
        .should('include', '/zh/current-inferencex-image');
    });

    it('supports the filter-to-table path at 1440px', () => {
      cy.viewport(1440, 900);
      cy.intercept('GET', '**/api/v1/latest-images', imageRows);
      cy.intercept('GET', '**/api/v1/framework-releases', {
        sglang: 'v0.5.2',
        vllm: 'v0.10.1',
      });
      visitCurrentImage();
      cy.get('#image-model-select').click();
      cy.get('[data-slot="select-item"]').contains('DeepSeek-R1').click();
      cy.get('table').should('contain.text', 'lmsysorg/sglang:v0.5.2');
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
      });
    });
  });
});
