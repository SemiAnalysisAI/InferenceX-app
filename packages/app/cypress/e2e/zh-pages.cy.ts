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

  describe('About pages', () => {
    it('keeps both Chinese article links inside /zh and follows one to its translation', () => {
      cy.viewport(390, 844);
      cy.visit('/zh/about');

      cy.contains('a', 'InferenceX v1')
        .should('have.attr', 'href', '/zh/blog/inferencemax-open-source-inference-benchmarking')
        .and('not.have.attr', 'hreflang', 'en');
      cy.contains('a', 'InferenceX v2')
        .should('have.attr', 'href', '/zh/blog/inferencex-v2-nvidia-blackwell-vs-amd-vs-hopper')
        .and('not.have.attr', 'hreflang', 'en')
        .click();
      cy.location('pathname').should(
        'eq',
        '/zh/blog/inferencex-v2-nvidia-blackwell-vs-amd-vs-hopper',
      );
    });
  });

  describe('Glossary pages', () => {
    it('supports a mobile Chinese search, filter, and term navigation journey without overflow', () => {
      cy.viewport(375, 844);
      cy.visit('/zh/glossary');

      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(
          document.documentElement.clientWidth,
        );
      });
      cy.get('input[placeholder="搜索 MTP、延迟、FP4…"]').as('search').type('MTP');
      cy.get('a[href="/zh/glossary/multi-token-prediction"]').should('be.visible');
      cy.get('@search').clear().type('不存在的术语-xyz');
      cy.contains('h2', '未找到相关术语').should('be.visible');
      cy.contains('button', '显示全部术语').click();
      cy.get('@search').should('have.value', '');

      cy.contains('button', '智能体推理').click().should('have.attr', 'aria-pressed', 'true');
      cy.get('a[href="/zh/glossary/agentx"]').click();
      cy.location('pathname').should('eq', '/zh/glossary/agentx');
      cy.contains('a', 'AI 推理术语表').click();
      cy.location('pathname').should('eq', '/zh/glossary');
    });
  });

  describe('Land acknowledgement pages', () => {
    it('keeps every region and nation visible on mobile', () => {
      cy.viewport(375, 812);
      cy.visit('/zh/land-acknowledgement');

      cy.get('[data-testid="land-acknowledgement-page"]').should(
        'contain.text',
        '原住民传统领地声明',
      );
      cy.title().should('contain', '原住民传统领地声明');
      for (const [testId, region, nation] of [
        ['land-acknowledgement-san-jose', 'San Jose', 'Muwekma Ohlone'],
        ['land-acknowledgement-los-angeles', 'Los Angeles', 'Tongva'],
        ['land-acknowledgement-chicago', 'Chicago', 'Potawatomi'],
      ] as const) {
        cy.get(`[data-testid="${testId}"]`)
          .should('contain.text', region)
          .and('contain.text', nation);
      }
      cy.get('link[rel="alternate"][hreflang="en"]').should('exist');
      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(
          document.documentElement.clientWidth,
        );
      });
    });
  });

  describe('zh blog post page', () => {
    before(() => {
      cy.visit('/zh/blog/inferencemax-open-source-inference-benchmarking');
    });

    it('renders translated content with Chinese chrome', () => {
      cy.get('article.prose').should('exist');
      cy.contains('预计阅读').should('exist');
      cy.get('a[href="/zh/blog"]').should('exist');
    });

    it('links to the English original', () => {
      cy.get('a[href="/blog/inferencemax-open-source-inference-benchmarking"]').should('exist');
    });

    it('localizes the table of contents and heading-link controls at mobile widths', () => {
      cy.viewport(390, 844);
      cy.get('details[aria-label="本页目录"]')
        .should('be.visible')
        .find('summary')
        .should('contain.text', '点击展开');
      cy.get('article.prose a[aria-label="复制本节链接"]')
        .first()
        .should('have.attr', 'href')
        .and('match', /^#/u);
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
      });
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
      cy.get('[role="group"][aria-label="基准测试提交活动图表"]')
        .should('contain.text', 'Shift+滚轮横向缩放')
        .find('[data-testid="submissions-chart-svg"]')
        .should('contain.text', '数据点数量');
      cy.get('[data-testid="submissions-chart-svg"] .proximity-overlay').click('center', {
        force: true,
      });
      cy.get('[data-chart-tooltip]:visible')
        .should('contain.text', '点击其他区域关闭')
        .and('contain.text', '合计');
      cy.contains('th button', '投机解码').should('be.visible');
      cy.contains('th button', '数据点').click().parent('th').should('have.attr', 'aria-sort');
      cy.get('button[aria-label="展开配置详情"]').first().click();
      cy.get('[data-testid="submissions-display"]')
        .should('contain.text', '投机解码方法：')
        .and('contain.text', '分离式部署：')
        .and('contain.text', '聚合推理芯片数：');
      // Disaggregated deployments split the chip pool, so their expanded
      // details localize the prefill/decode fields instead of the aggregate ones.
      cy.contains('tr', 'Mooncake ATOMesh')
        .first()
        .find('button[aria-label="展开配置详情"]')
        .click();
      cy.get('[data-testid="submissions-display"]')
        .should('contain.text', '预填充芯片数：')
        .and('contain.text', '解码芯片数：');
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
      // Fail every request until the retry button is actually clicked — counting
      // attempts is race-prone because query retries can consume the "healthy"
      // response before the error UI is asserted.
      let failRequests = true;
      cy.intercept('GET', '**/api/v1/submissions', (request) => {
        request.reply(
          failRequests
            ? { statusCode: 500, body: { error: 'submissions-database-internal-detail' } }
            : { body: { summary: [], volume: [] } },
        );
      }).as('retrySubmissions');
      cy.reload();
      cy.wait('@retrySubmissions');
      cy.contains('加载提交数据失败。').should('be.visible');
      cy.contains('submissions-database-internal-detail').should('not.exist');
      cy.contains('button', '重试')
        .then(() => {
          failRequests = false;
        })
        .click();
      cy.contains('暂无提交记录。').should('be.visible');
    });

    it('keeps the chart labels readable and the table scrollable at 375px', () => {
      cy.viewport(375, 844);
      cy.get('[data-testid="submissions-chart-svg"] .x-axis .tick text').then(($ticks) => {
        expect($ticks.length, 'mobile date tick count').to.be.at.most(3);
        const boxes = [...$ticks]
          .map((tick) => tick.getBoundingClientRect())
          .sort((left, right) => left.left - right.left);
        for (let index = 1; index < boxes.length; index += 1) {
          expect(boxes[index - 1].right, 'adjacent mobile date ticks').to.be.at.most(
            boxes[index].left,
          );
        }
      });
      cy.get('[data-testid="submissions-display"] table').should('be.visible');
      cy.get('[data-testid="submissions-display"] .overflow-x-auto')
        .scrollTo('right')
        .should('be.visible');
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth).to.be.lte(doc.documentElement.clientWidth);
      });
    });
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
      cy.get('[data-testid="feedback-key-input"]')
        .clear()
        .type('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
      cy.get('[data-testid="feedback-key-submit"]').click();
      cy.contains('button', '清除密钥').should('be.visible');
    });

    it('names the feedback loading state instead of showing an objectless spinner label', () => {
      cy.intercept('GET', '**/api/v1/feedback/list', {
        delay: 500,
        body: { rows: [] },
      }).as('slowFeedbackList');
      cy.reload();
      cy.contains('正在加载反馈记录……').should('be.visible');
      cy.wait('@slowFeedbackList');
      cy.contains('暂无反馈记录。').should('be.visible');
    });

    it('shows a safe fetch error and retries through a real button click', () => {
      let failRequests = true;
      cy.intercept('GET', '**/api/v1/feedback/list', (request) => {
        request.reply(
          failRequests
            ? { statusCode: 500, body: { error: 'feedback-database-internal-detail' } }
            : { body: { rows: [] } },
        );
      }).as('retryFeedbackList');
      cy.reload();
      cy.wait('@retryFeedbackList');
      cy.wait('@retryFeedbackList');
      cy.contains('无法加载反馈数据。').should('be.visible');
      cy.contains('feedback-database-internal-detail').should('not.exist');
      cy.contains('button', '重试')
        .then(() => {
          failRequests = false;
        })
        .click();
      cy.wait('@retryFeedbackList');
      cy.contains('暂无反馈记录。').should('be.visible');
    });

    it('keeps the key controls and content within 375px', () => {
      cy.viewport(375, 844);
      cy.get('[data-testid="feedback-key-input"]').should('be.visible');
      cy.get('[data-testid="feedback-key-submit"]').should('be.visible');
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth).to.be.lte(doc.documentElement.clientWidth);
      });
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
