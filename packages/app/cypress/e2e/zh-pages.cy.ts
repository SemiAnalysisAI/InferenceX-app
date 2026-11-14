import { SUPPORTERS_LINE_ZH } from '@semianalysisai/inferencex-constants';

describe('Chinese (/zh) pages', () => {
  describe('zh landing page', () => {
    before(() => {
      cy.visit('/zh');
    });

    it('footer renders in Chinese with zh-internal links', () => {
      cy.get('[data-testid="footer-brand-description"]').should(
        'contain.text',
        'InferenceX 持续开展开源的 AI 加速器系统基准测试',
      );
      cy.get('[data-testid="footer-link-supporters"]')
        .should('contain.text', '业界评价')
        .and('have.attr', 'href', '/zh/quotes');
      cy.get('[data-testid="footer-link-agentx"]')
        .should('contain.text', 'AgentX')
        .and('have.attr', 'href', '/zh/infx/agentx');
      cy.get('[data-testid="footer-link-about"]')
        .should('have.text', '关于 SemiAnalysis')
        .and('have.attr', 'href', 'https://semianalysis.com/about/');
      cy.get('[data-testid="footer-link-articles"]')
        .should('contain.text', '文章')
        .and('have.attr', 'href', '/zh/blog');
      cy.get('[data-testid="footer-link-hardware"]')
        .should('have.text', '硬件结果')
        .and('have.attr', 'href', '/zh/hardware');
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
      cy.visit('/zh/infx/inference');
    });

    it('renders the Chinese h1 without an intro box', () => {
      cy.location('pathname').should('eq', '/zh/infx/inference/kimi-k31-pro');
      cy.get('[data-testid="inference-page-heading"]').should(
        'have.text',
        'Kimi K3.1 Pro 推理基准测试',
      );
      cy.get('[data-testid="zh-tab-intro"]').should('not.exist');

      cy.get('[data-testid="tab-trigger-evaluation"]')
        .should('contain.text', '准确率评估')
        .and('have.attr', 'href')
        .and('match', /^\/zh\/infx\/evaluation/u);
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

  describe('Run and Rankings model links', () => {
    it('keeps index descriptions free of supporter attribution and identical across search, social, and JSON-LD', () => {
      for (const path of ['/zh/run', '/zh/rankings']) {
        cy.request(path).then(({ body }) => {
          const document = new DOMParser().parseFromString(body, 'text/html');
          const content = (selector: string) =>
            document.querySelector(selector)?.getAttribute('content');
          const description = content('meta[name="description"]');
          expect(description).to.be.a('string').and.not.include(SUPPORTERS_LINE_ZH);
          expect(content('meta[property="og:description"]')).to.eq(description);
          expect(content('meta[name="twitter:description"]')).to.eq(description);
          const collection = [...document.querySelectorAll('script[type="application/ld+json"]')]
            .map((script) => JSON.parse(script.textContent ?? '{}'))
            .find((data) => data['@type'] === 'CollectionPage');
          expect(collection?.description).to.eq(description);
        });
      }
    });

    for (const [path, section] of [
      ['/zh/run/deepseek-r1-on-b300', 'run-explore'],
      ['/zh/rankings/fastest-gpu-for-deepseek-r1', 'ranking-explore'],
    ] as const) {
      it(`opens the matching Chinese model detail from ${path}`, () => {
        cy.viewport(390, 844);
        cy.visit(path, {
          onBeforeLoad(win) {
            win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          },
        });

        cy.get('meta[name="description"]')
          .invoke('attr', 'content')
          .should('be.a', 'string')
          .and('not.include', SUPPORTERS_LINE_ZH)
          .then((description) => {
            cy.get('meta[property="og:description"]').should('have.attr', 'content', description);
            cy.get('meta[name="twitter:description"]').should('have.attr', 'content', description);
          });
        cy.get(`[aria-labelledby="${section}"] a[href="/zh/model/deepseek-r1"]`)
          .should('contain.text', 'DeepSeek R1')
          .click();
        cy.location('pathname').should('eq', '/zh/model/deepseek-r1');
        cy.get('h1').should('have.text', 'DeepSeek R1 0528');
      });
    }
  });

  describe('Glossary pages', () => {
    for (const { prefix, label, relatedLabel } of [
      { prefix: '', label: 'Draft acceptance rate', relatedLabel: 'Acceptance length' },
      { prefix: '/zh', label: '草稿接受率', relatedLabel: '接受长度' },
    ]) {
      it(`finds the new acceptance-rate entry and follows its distinct length concept in ${prefix || 'English'}`, () => {
        cy.viewport(375, 844);
        cy.visit(`${prefix}/glossary`);
        cy.get('main input[type="search"]').type('acceptance rate');
        cy.get(`a[href="${prefix}/glossary/acceptance-rate"]`)
          .should('contain.text', label)
          .click();
        cy.location('pathname').should('eq', `${prefix}/glossary/acceptance-rate`);
        cy.get('h1').should('contain.text', label);
        cy.get(`aside a[href="${prefix}/glossary/acceptance-length"]`)
          .should('contain.text', relatedLabel)
          .click();
        cy.location('pathname').should('eq', `${prefix}/glossary/acceptance-length`);
        cy.get('h1').should('contain.text', relatedLabel);
        cy.get('main').should('contain.text', prefix ? '额外生成的 token' : 'bonus token');
        cy.document().then((document) => {
          expect(document.documentElement.scrollWidth).to.be.at.most(
            document.documentElement.clientWidth,
          );
        });
      });
    }

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

  describe('localized not-found pages', { testIsolation: true }, () => {
    it('returns a noindex English 404 for unknown paths', () => {
      const path = '/this-route-does-not-exist';
      cy.request({ url: path, failOnStatusCode: false }).then(({ body, status }) => {
        const document = new DOMParser().parseFromString(body, 'text/html');
        const homeLinks = [...document.querySelectorAll<HTMLAnchorElement>('a[href="/"]')];

        expect(status).to.eq(404);
        expect(document.querySelector('h1')?.textContent).to.eq('Page not found');
        expect(homeLinks.some((link) => link.textContent === 'Go back home')).to.eq(true);
        expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).to.include(
          'noindex',
        );
        expect(document.querySelector('link[rel="canonical"]')).to.eq(null);
      });
    });

    it('renders a noindex Chinese 404 and returns home with an earlier server time origin', () => {
      const path = '/zh/this-route-does-not-exist';
      cy.request({ url: path, failOnStatusCode: false }).its('status').should('eq', 404);
      cy.visit(path, {
        failOnStatusCode: false,
        onBeforeLoad(win) {
          Object.defineProperty(win.performance, 'timeOrigin', {
            value: win.performance.timeOrigin + 60_000,
          });
        },
      });

      cy.contains('h1', '页面不存在').should('be.visible');
      cy.contains('找不到该页面').should('be.visible');
      cy.contains('a[href="/zh"]', '返回首页').should('be.visible');
      cy.get('meta[name="robots"]').should('have.attr', 'content').and('include', 'noindex');
      cy.get('link[rel="canonical"]').should('not.exist');
      cy.get('link[rel="alternate"][hreflang]').should('not.exist');
      cy.viewport(375, 812);
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
      });
      cy.contains('a[href="/zh"]', '返回首页').click();
      cy.location('pathname').should('eq', '/zh');
      cy.get('[data-testid="intro-section"]').should('contain.text', 'AI 加速器系统基准测试');
    });
  });

  describe('zh blog post with math', () => {
    before(() => {
      cy.visit('/zh/blog/kimi-k3-the-manos-the-mythos-the');
    });

    it('renders KaTeX in the translation too', () => {
      cy.get('article.prose .katex').should('have.length.gte', 1);
    });
  });

  describe('zh submissions workflow', () => {
    beforeEach(() => {
      cy.visit('/zh/infx/submissions');
      cy.get('[data-testid="submissions-display"]').should('be.visible');
    });

    it('localizes chart controls, table headers, sorting, and expanded details', () => {
      cy.viewport(1440, 900);
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
      cy.get('[data-testid="point-details-panel"]:visible')
        .should('have.attr', 'aria-label', '数据点详情')
        .and('contain.text', '合计')
        .find('[data-testid="point-details-close"]')
        .should('have.attr', 'aria-label', '关闭数据点详情');
      cy.contains('th button', '投机解码').should('be.visible');
      cy.contains('th button', '数据点').click().parent('th').should('have.attr', 'aria-sort');
      cy.get('button[aria-label="展开配置详情"]').first().click();
      cy.get('[data-testid="submissions-display"]')
        .should('contain.text', '投机解码方法：')
        .and('contain.text', '分离式部署：')
        .and('contain.text', '聚合推理芯片数：');
      cy.get('input[placeholder="搜索配置"]').type('atom-disagg');
      cy.contains('tr', 'Mooncake ATOMesh')
        .first()
        .find('button[aria-label="展开配置详情"]')
        .click();
      cy.get('[data-testid="submissions-display"]')
        .should('contain.text', '预填充芯片数：')
        .and('contain.text', '解码芯片数：');
    });

    it('gives every vendor with submissions its own series, legend entry and dot', () => {
      const row = {
        model: 'dsr1',
        framework: 'teacup',
        precision: 'fp4',
        spec_method: 'none',
        disagg: false,
        is_multinode: false,
        num_prefill_gpu: 8,
        num_decode_gpu: 8,
        prefill_tp: 8,
        prefill_ep: 1,
        decode_tp: 8,
        decode_ep: 1,
        date: '2026-08-22',
        total_datapoints: 8,
        distinct_sequences: 1,
        distinct_concurrencies: 8,
        max_concurrency: 512,
        image: null,
      };
      cy.intercept('GET', '**/api/v1/submissions', {
        body: {
          summary: ['h200', 'mi355x', 'jalapeno', 'tpuv7'].map((hardware) => ({
            ...row,
            hardware,
          })),
          volume: [
            { date: '2026-08-17', hardware: 'h200', datapoints: 40 },
            { date: '2026-08-17', hardware: 'mi355x', datapoints: 30 },
            { date: '2026-08-22', hardware: 'jalapeno', datapoints: 28 },
            { date: '2026-08-26', hardware: 'tpuv7', datapoints: 7 },
          ],
        },
      }).as('vendorSubmissions');
      cy.reload();
      cy.wait('@vendorSubmissions');
      cy.get('[role="group"][aria-label="基准测试提交活动图表"]').within(() => {
        for (const label of ['NVIDIA', 'AMD', 'OpenAI', 'Google', '合计']) {
          cy.contains('button, li', label).should('be.visible');
        }
      });
      for (const vendor of ['NVIDIA', 'AMD', 'OpenAI', 'Google']) {
        cy.get(`tbody span[role="img"][aria-label="${vendor}"]`).should('be.visible');
      }
    });

    it('separates localized empty chart and table states', () => {
      cy.intercept('GET', '**/api/v1/submissions', { body: { summary: [], volume: [] } }).as(
        'emptySubmissions',
      );
      cy.reload();
      cy.wait('@emptySubmissions');
      cy.contains('暂无提交活动数据').should('be.visible');
      cy.contains('暂无提交记录').should('be.visible');
    });

    it('shows a safe error and retries through a real button click', () => {
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
      cy.contains('加载提交数据失败').should('be.visible');
      cy.contains('submissions-database-internal-detail').should('not.exist');
      cy.contains('button', '重试')
        .then(() => {
          failRequests = false;
        })
        .click();
      cy.contains('暂无提交记录').should('be.visible');
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
          win.localStorage.setItem('inferencex-feature-gate-konami-v1', '1');
        },
      });
      cy.wait('@feedbackList');
    });

    it('localizes the empty state, key validation, and accessibility label', () => {
      cy.viewport(1440, 900);
      cy.get('[data-testid="feedback-viewer"]').should('contain.text', '暂无反馈记录');
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
      cy.contains('无法加载反馈数据').should('be.visible');
      cy.contains('feedback-database-internal-detail').should('not.exist');
      cy.contains('button', '重试')
        .then(() => {
          failRequests = false;
        })
        .click();
      cy.wait('@retryFeedbackList');
      cy.contains('暂无反馈记录').should('be.visible');
    });

    it('keeps the key controls and content within 375px', () => {
      cy.viewport(375, 844);
      cy.get('[data-testid="feedback-key-input"]').should('be.visible');
      cy.get('[data-testid="feedback-key-submit"]').should('be.visible');
      cy.get('[data-testid="feedback-key-input"]').invoke('outerHeight').should('be.gte', 44);
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
      cy.get('link[rel="alternate"][hreflang="zh-CN"]')
        .should('have.attr', 'href')
        .and('match', /\/zh\/blog$/u);
      cy.get('[data-testid="language-toggle"]')
        .should('contain.text', '中文')
        .and('have.attr', 'href', '/zh/blog');
    });
  });
});
