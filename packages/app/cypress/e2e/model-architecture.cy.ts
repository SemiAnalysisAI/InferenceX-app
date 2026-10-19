const MODEL_SITE_URL = 'https://inferencex.semianalysis.com';

function dismissStarModal(win: Window): void {
  win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
}

function expectNoPageOverflow(): void {
  cy.window().should((win) => {
    expect(win.document.body.scrollWidth, 'body scroll width').to.be.at.most(win.innerWidth);
    expect(win.document.documentElement.scrollWidth, 'document scroll width').to.be.at.most(
      win.innerWidth,
    );
  });
}

function visitModelPage(slug: string) {
  cy.viewport(1280, 800);
  cy.visit(`/model/${slug}`, {
    onBeforeLoad(win) {
      dismissStarModal(win);
    },
  });
  cy.get('[data-testid="model-architecture-inline"]').should('be.visible');
  cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
}

describe('Model Architecture Diagram', () => {
  describe('Collapsible Transformer Blocks (MoE model - DeepSeek R1)', () => {
    before(() => {
      visitModelPage('deepseek-r1');
    });

    it('expands dense transformer block on click', () => {
      cy.get('[data-testid="model-architecture-inline"]').should(
        'contain.text',
        'Model Architecture',
      );
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'MoE');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'MLA');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', '671B');

      cy.get('[data-testid="expand-denseTransformer"]').should('exist');
      cy.get('[data-testid="expand-transformer"]').should('exist');

      cy.get('[data-testid="expand-denseTransformer"]').click({ force: true });
      cy.get('[data-testid="collapse-denseTransformer"]').should('exist');
      cy.get('[data-testid="expand-transformer"]').should('exist');

      cy.get('[data-testid="collapse-denseTransformer"]').click({ force: true });
      cy.get('[data-testid="expand-denseTransformer"]').should('exist');
    });

    it('expands MoE transformer block on click', () => {
      cy.get('[data-testid="expand-transformer"]').click({ force: true });
      cy.get('[data-testid="collapse-transformer"]').should('exist');
      cy.get('[data-testid="expand-denseTransformer"]').should('exist');

      cy.get('[data-testid="expand-attention"]').should('not.exist');
      cy.get('[data-testid="expand-experts"]').should('exist');

      cy.get('[data-testid="expand-experts"]').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');

      cy.get('[data-testid="collapse-transformer"]').click({ force: true });
      cy.get('[data-testid="expand-transformer"]').should('exist');
    });

    it('both transformer blocks can be expanded simultaneously', () => {
      cy.get('[data-testid="expand-denseTransformer"]').click({ force: true });
      cy.get('[data-testid="expand-transformer"]').click({ force: true });

      cy.get('[data-testid="collapse-denseTransformer"]').should('exist');
      cy.get('[data-testid="collapse-transformer"]').should('exist');

      cy.get('[data-testid="collapse-denseTransformer"]').click({ force: true });
      cy.get('[data-testid="collapse-transformer"]').click({ force: true });
    });
  });

  describe('Collapsible Transformer Block (Dense model - Llama 3.3 70B)', () => {
    before(() => {
      visitModelPage('llama-3-3-70b');
    });

    it('expanded transformer block contains expandable attention and FFN', () => {
      cy.get('[data-testid="expand-transformer"]').should('exist');
      cy.get('[data-testid="expand-denseTransformer"]').should('not.exist');

      cy.get('[data-testid="expand-transformer"]').click({ force: true });

      cy.get('[data-testid="expand-attention"]').should('exist');
      cy.get('[data-testid="expand-ffn"]').should('exist');

      cy.get('[data-testid="expand-attention"]').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');

      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'Dense');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'GQA');
    });
  });

  describe('Collapsible Transformer Blocks (MoE model - Kimi K2.5)', () => {
    before(() => {
      visitModelPage('kimi-k26');
    });

    it('MLA attention is NOT expandable in MoE block', () => {
      cy.get('[data-testid="expand-denseTransformer"]').should('exist');
      cy.get('[data-testid="expand-transformer"]').should('exist');

      cy.get('[data-testid="expand-transformer"]').click({ force: true });
      cy.get('[data-testid="expand-attention"]').should('not.exist');
      cy.get('[data-testid="expand-experts"]').should('exist');

      cy.get('[data-testid="expand-experts"]').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
    });
  });

  describe('Collapsible Transformer Blocks (MoE model - MiniMax M2.5)', () => {
    before(() => {
      visitModelPage('minimax-m27');
    });

    it('GQA attention is NOT expandable despite being GQA type', () => {
      cy.get('[data-testid="expand-transformer"]').should('exist');
      cy.get('[data-testid="expand-denseTransformer"]').should('not.exist');

      cy.get('[data-testid="expand-transformer"]').click({ force: true });
      cy.get('[data-testid="expand-attention"]').should('not.exist');
      cy.get('[data-testid="expand-experts"]').should('exist');

      cy.get('[data-testid="expand-experts"]').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
    });
  });

  describe('Collapsible Transformer Blocks (MoE model - MiniMax M3)', () => {
    before(() => {
      visitModelPage('minimax-m3');
    });

    it('GQA attention is NOT expandable (sparse attention rendered as a static block)', () => {
      cy.get('[data-testid="expand-transformer"]').click({ force: true });
      cy.get('[data-testid="expand-attention"]').should('not.exist');
      cy.get('[data-testid="expand-experts"]').should('exist');
    });
  });

  describe('Alternating Attention Blocks (MoE model - gpt-oss 120B)', () => {
    before(() => {
      visitModelPage('gptoss-120b');
    });

    it('shows two separate transformer blocks (no single expand-transformer)', () => {
      cy.get('[data-testid="expand-altBlock0"]').should('exist');
      cy.get('[data-testid="expand-altBlock1"]').should('exist');
      cy.get('[data-testid="expand-transformer"]').should('not.exist');
      cy.get('[data-testid="expand-denseTransformer"]').should('not.exist');

      cy.get('[data-testid="alternating-indicator"]').should('exist');
    });

    it('first block expands to show Sliding Attention + Sink internals', () => {
      cy.get('[data-testid="expand-altBlock0"]').click({ force: true });
      cy.get('[data-testid="collapse-altBlock0"]').should('exist');
      cy.get('[data-testid="expand-altExperts0"]').should('exist');
      cy.get('[data-testid="expand-altBlock1"]').should('exist');

      cy.get('[data-testid="expand-altBlock1"]').click({ force: true });
      cy.get('[data-testid="collapse-altBlock1"]').should('exist');
      cy.get('[data-testid="expand-altExperts1"]').should('exist');

      cy.get('[data-testid="collapse-altBlock0"]').should('exist');
      cy.get('[data-testid="collapse-altBlock1"]').should('exist');

      cy.get('[data-testid="expand-attention"]').should('not.exist');

      cy.get('[data-testid="expand-altExperts0"]').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
    });
  });

  describe('Hybrid Attention Blocks (MoE model - DeepSeek V4 Pro)', () => {
    before(() => {
      visitModelPage('deepseek-v4');
    });

    it('shows two separate hybrid (CSA/HCA) blocks with an alternating indicator', () => {
      cy.get('[data-testid="expand-altBlock0"]').should('exist');
      cy.get('[data-testid="expand-altBlock1"]').should('exist');
      cy.get('[data-testid="expand-transformer"]').should('not.exist');
      cy.get('[data-testid="expand-denseTransformer"]').should('not.exist');
      cy.get('[data-testid="alternating-indicator"]').should('exist');
    });

    it('shows a hash-routed MoE prefix block; mHC caption appears once a block is open', () => {
      cy.get('[data-testid="expand-hashBlock"]').should('exist');
      cy.get('[data-testid="mhc-note"]').should('not.exist');
      cy.get('[data-testid="expand-hashBlock"]').click({ force: true });
      cy.get('[data-testid="collapse-hashBlock"]').should('exist');
      cy.get('[data-testid="model-architecture-svg"]').contains('Hash Router').should('exist');
      cy.get('[data-testid="mhc-note"]').should('be.visible').and('contain', 'Hyper-Connections');
      cy.get('[data-testid="collapse-hashBlock"]').click({ force: true });
      cy.get('[data-testid="mhc-note"]').should('not.exist');
    });

    it('Hybrid attention is expandable and drills down to a Sliding Window block', () => {
      cy.get('[data-testid="expand-altBlock0"]').click({ force: true });
      cy.get('[data-testid="collapse-altBlock0"]').should('exist');
      cy.get('[data-testid="hybrid-attention-note"]').should('not.exist');
      cy.get('[data-testid="expand-altAttention0"]').should('exist');
      cy.get('[data-testid="expand-altAttention0"]').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
      cy.get('[data-testid="hybrid-attention-note"]')
        .should('be.visible')
        .and('contain', 'single softmax');
      cy.get('[data-testid="expand-altExperts0"]').should('exist');

      cy.get('[data-testid="expand-altExperts0"]').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
    });

    it('collapsing the parent block hides the union-softmax caption (no orphan caption)', () => {
      cy.get('[data-testid="hybrid-attention-note"]').should('be.visible');
      cy.get('[data-testid="collapse-altBlock0"]').click({ force: true });
      cy.get('[data-testid="hybrid-attention-note"]').should('not.exist');
      cy.get('[data-testid="expand-altBlock0"]').click({ force: true });
      cy.get('[data-testid="hybrid-attention-note"]')
        .should('be.visible')
        .and('contain', 'single softmax');
    });
  });

  describe('Hybrid Attention Blocks (MoE model - Kimi K3)', () => {
    before(() => {
      visitModelPage('kimi-k3');
    });

    it('renders the KDA and gated-MLA layer categories as two alternating blocks', () => {
      cy.get('[data-testid="expand-altBlock0"]').should('exist');
      cy.get('[data-testid="expand-altBlock1"]').should('exist');
      cy.get('[data-testid="alternating-indicator"]').should('exist');
      cy.get('[data-testid="model-architecture-svg"]').contains('KDA').should('exist');
      cy.get('[data-testid="model-architecture-svg"]')
        .contains('gated MLA every 4th layer')
        .should('exist');
      cy.get('[data-testid="model-architecture-svg"]')
        .contains('alternating every layer')
        .should('not.exist');
    });

    it('keeps attention static — no CSA/HCA drill-down or union-softmax caption', () => {
      cy.get('body').then(($body) => {
        if ($body.find('[data-testid="expand-altBlock0"]').length > 0) {
          cy.get('[data-testid="expand-altBlock0"]').click({ force: true });
        }
      });
      cy.get('[data-testid="collapse-altBlock0"]').should('exist');
      cy.get('[data-testid="expand-altAttention0"]').should('not.exist');
      cy.get('[data-testid="hybrid-attention-note"]').should('not.exist');
      cy.get('[data-testid="expand-altExperts0"]').should('exist').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]')
        .contains('Top-16 of 896 routed + 2 shared')
        .should('exist');
      cy.get('[data-testid="model-architecture-svg"]').contains('16+2/898').should('exist');
      cy.get('[data-testid="model-architecture-svg"]')
        .contains(/expert ffn \(situ-glu\)/iu)
        .should('exist');
      cy.get('[data-testid="model-architecture-svg"]').contains('SiTU Activation').should('exist');
      cy.get('[data-testid="model-architecture-svg"]')
        .contains(/swiglu|silu/iu)
        .should('not.exist');
    });

    it('labels the dense prefix block KDA rather than the model-wide hybrid type', () => {
      cy.get('[data-testid="expand-denseTransformer"]').should('exist').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]')
        .contains('Kimi Delta Attention (KDA)')
        .should('exist');
      cy.get('[data-testid="model-architecture-svg"]')
        .contains('Hybrid Attention')
        .should('not.exist');
      cy.get('[data-testid="collapse-denseTransformer"]').click({ force: true });
    });
  });

  describe('Model index page (/model)', () => {
    before(() => {
      cy.viewport(1280, 800);
      cy.visit('/model', {
        onBeforeLoad(win) {
          dismissStarModal(win);
        },
      });
    });

    it('lists every model page with architecture badges', () => {
      cy.get('h1').should('contain.text', 'Model Architectures');
      cy.get('[data-testid="model-index-list"] a').should('have.length.at.least', 11);
      cy.get('[data-testid="model-index-link-kimi-k3"]')
        .should('contain.text', 'Kimi K3')
        .and('contain.text', 'MoE')
        .and('contain.text', 'Hybrid')
        .and('contain.text', '2.8T')
        .and('have.attr', 'href', '/model/kimi-k3');
      cy.get('[data-testid="model-index-link-glm-5-3"]').should('contain.text', 'GLM-5.3');
    });

    it('navigates to a model deep-dive page', () => {
      cy.get('[data-testid="model-index-link-deepseek-r1"]').click();
      cy.url().should('include', '/model/deepseek-r1');
      cy.get('[data-testid="model-architecture-inline"]').should('be.visible');
    });

    it('is linked from the footer', () => {
      cy.get('[data-testid="footer-link-model-architectures"]')
        .should('have.attr', 'href', '/model')
        .and('contain.text', 'Model Architectures');
    });
  });

  describe('Chinese model index and detail journey', () => {
    const viewports = [
      { label: 'desktop', width: 1440, height: 900 },
      { label: '375px mobile', width: 375, height: 812 },
      { label: '390px mobile', width: 390, height: 844 },
    ] as const;

    for (const viewport of viewports) {
      it(`keeps Chinese chrome, metadata, and navigation at ${viewport.label}`, () => {
        cy.viewport(viewport.width, viewport.height);
        cy.visit('/zh/model', { onBeforeLoad: dismissStarModal });

        cy.get('[data-testid="model-index-page"]').should('be.visible');
        cy.get('h1').should('have.text', '模型架构');
        cy.get('[data-testid="model-index-link-deepseek-r1"]')
          .should('contain.text', 'DeepSeek R1 0528')
          .and('contain.text', '总参数量 671B')
          .and('contain.text', 'MLA')
          .and('contain.text', '发布日期 2025 年 5 月 28 日')
          .and('have.attr', 'href', '/zh/model/deepseek-r1');
        cy.get('[data-testid="model-index-link-deepseek-r1"] img').should(
          'have.attr',
          'alt',
          'DeepSeek 标志',
        );
        cy.get('[data-testid="footer-link-model-architectures"]')
          .should('have.attr', 'href', '/zh/model')
          .and('contain.text', '模型架构');
        cy.get('[data-testid="language-toggle"]').should('have.attr', 'href', '/model');
        cy.get('link[rel="canonical"]').should('have.attr', 'href', `${MODEL_SITE_URL}/zh/model`);
        cy.get('link[rel="alternate"][hreflang="en"]').should(
          'have.attr',
          'href',
          `${MODEL_SITE_URL}/model`,
        );
        cy.get('link[rel="alternate"][hreflang="zh-CN"]').should(
          'have.attr',
          'href',
          `${MODEL_SITE_URL}/zh/model`,
        );
        expectNoPageOverflow();

        cy.get('[data-testid="model-index-link-deepseek-r1"]').scrollIntoView().click();
        cy.location('pathname').should('eq', '/zh/model/deepseek-r1');
        cy.get('[data-testid="model-detail-page"]').should('be.visible');
        cy.get('h1').should('have.text', 'DeepSeek R1 0528');
        cy.get('[data-testid="model-detail-page"]').should(
          'contain.text',
          '发布日期 2025 年 5 月 28 日',
        );
        cy.get('[data-testid="model-english-article-notice"]')
          .should('contain.text', '模型深度解析正文目前仅提供英文版')
          .find('a')
          .should('have.attr', 'href', '/model/deepseek-r1')
          .and('have.text', '查看英文原文');
        cy.get('[data-testid="model-page-article"]').should('have.attr', 'lang', 'en');
        cy.get('[data-testid="model-page-dashboard"]')
          .should('contain.text', 'DeepSeek R1 0528 推理性能')
          .find('a[href^="/zh/inference?"]')
          .should('contain.text', '在完整仪表板中查看');
        cy.get('[data-testid="language-toggle"]').should('have.attr', 'href', '/model/deepseek-r1');

        cy.reload();
        cy.get('[data-testid="model-detail-page"]').should('be.visible');
        cy.get('link[rel="canonical"]').should(
          'have.attr',
          'href',
          `${MODEL_SITE_URL}/zh/model/deepseek-r1`,
        );
        cy.get('link[rel="alternate"][hreflang="en"]').should(
          'have.attr',
          'href',
          `${MODEL_SITE_URL}/model/deepseek-r1`,
        );
        cy.get('link[rel="alternate"][hreflang="zh-CN"]').should(
          'have.attr',
          'href',
          `${MODEL_SITE_URL}/zh/model/deepseek-r1`,
        );
        expectNoPageOverflow();
      });
    }

    it('keeps the dashboard architecture link inside the Chinese route tree', () => {
      cy.viewport(1440, 900);
      cy.visit('/zh/inference?g_model=DeepSeek-R1-0528', {
        onBeforeLoad: dismissStarModal,
      });
      cy.get('[data-testid="inference-chart-display"]').should('be.visible');
      cy.get('[data-testid="model-architecture-link"]')
        .should('have.attr', 'href', '/zh/model/deepseek-r1')
        .and('have.attr', 'aria-label', '了解 DeepSeek R1 0528 671B 模型架构');
    });
  });

  describe('Embedded dashboard changelog starts collapsed', () => {
    before(() => {
      cy.viewport(1280, 800);
      cy.visit('/model/deepseek-r1', {
        onBeforeLoad(win) {
          dismissStarModal(win);
        },
      });
    });

    it('can still be expanded manually', () => {
      cy.contains('button', 'Config Changelog', { timeout: 20000 })
        .should('be.visible')
        .and('have.attr', 'aria-expanded', 'false');

      cy.contains('button', 'Config Changelog').click();
      cy.contains('button', 'Config Changelog').should('have.attr', 'aria-expanded', 'true');
    });

    it('retains the axis selector even though the full filter panel is hidden', () => {
      cy.get('[data-testid="chart-figure"] [data-testid^="option-help-y_"]')
        .first()
        .should('have.class', 'no-export')
        .click();
      cy.get('[data-testid^="option-help-content-y_"]')
        .should('contain.text', 'infrastructure spend')
        .and('contain.text', 'Formula')
        .type('{esc}');
      cy.get('[data-testid^="axis-metric-row-"]').should('not.exist');
      cy.get('[data-testid="x-axis-mode-selector"]').scrollIntoView().click();
      cy.get('[data-testid="x-axis-mode-ttft"]').click();
      cy.get('[data-testid="x-axis-mode-selector"]')
        .should('contain.text', 'TTFT')
        .and('have.attr', 'aria-expanded', 'false');
      cy.get('[data-testid="chart-figure"] h2')
        .first()
        .should('contain.text', 'Time To First Token');
      cy.get('[data-testid="model-selector"]').should('not.exist');
    });
  });

  describe('Dashboard architecture icon link (replaces the banner row)', () => {
    before(() => {
      cy.viewport(1280, 800);
      cy.visit('/inference?g_model=DeepSeek-R1-0528', {
        onBeforeLoad(win) {
          dismissStarModal(win);
        },
      });
      cy.get('[data-testid="inference-chart-display"]').should('be.visible');
    });

    it('renders an icon link beside the model selector instead of a banner row', () => {
      cy.get('[data-testid="model-architecture-toggle"]').should('not.exist');
      cy.get('[data-testid="model-architecture-link"]').should('be.visible');
      cy.get('[data-testid="model-architecture-link"]').should(
        'have.attr',
        'aria-label',
        'Learn more about the DeepSeek R1 0528 671B architecture',
      );
      cy.get('[data-testid="model-architecture-link"]')
        .should('have.attr', 'href')
        .and('equal', '/model/deepseek-r1');
      cy.get('[data-testid="model-architecture-link"]').focus();
      cy.get('[data-testid="model-architecture-tooltip"]')
        .should('be.visible')
        .and('contain.text', 'Learn more about the DeepSeek R1 0528 671B architecture')
        .and('contain.text', 'MoE')
        .and('contain.text', 'MLA')
        .and('contain.text', '671B');
      cy.get('body').type('{esc}');
    });

    it('navigates to the model deep-dive page', () => {
      cy.get('[data-testid="model-architecture-link"]').click();
      cy.url().should('include', '/model/deepseek-r1');
      cy.get('[data-testid="model-architecture-inline"]').should('be.visible');
      cy.get('[data-testid="model-page-dashboard"]').should('exist');
    });
  });
});
