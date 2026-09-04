/**
 * The architecture diagram lives on the /model/[slug] deep-dive pages, always
 * expanded (`variant="inline"`). The dashboard renders a link row to those
 * pages where the collapsible drawer used to be — covered by the final
 * describe block.
 */

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

/** Visit a model deep-dive page and wait for the inline diagram to render. */
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
      // DeepSeek R1 has a rich architecture diagram (MoE + dense blocks)
      // that the tests below exercise.
      visitModelPage('deepseek-r1');
    });

    it('inline architecture header renders with MoE badges', () => {
      cy.get('[data-testid="model-architecture-inline"]').should(
        'contain.text',
        'Model Architecture',
      );
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'MoE');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'MLA');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', '671B');
    });

    it('renders the SVG diagram without any toggle click', () => {
      cy.get('[data-testid="model-architecture-toggle"]').should('not.exist');
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
    });

    it('shows collapsed transformer blocks by default with expand icons', () => {
      // MoE model (DeepSeek R1) should show both dense and MoE collapsed blocks
      cy.get('[data-testid="expand-denseTransformer"]').should('exist');
      cy.get('[data-testid="expand-transformer"]').should('exist');
    });

    it('expands dense transformer block on click', () => {
      cy.get('[data-testid="expand-denseTransformer"]').click({ force: true });
      cy.get('[data-testid="collapse-denseTransformer"]').should('exist');
      // Main transformer should still be collapsed
      cy.get('[data-testid="expand-transformer"]').should('exist');
    });

    it('collapses expanded dense transformer block', () => {
      // Already expanded from previous test
      cy.get('[data-testid="collapse-denseTransformer"]').click({ force: true });
      cy.get('[data-testid="expand-denseTransformer"]').should('exist');
    });

    it('expands MoE transformer block on click', () => {
      cy.get('[data-testid="expand-transformer"]').click({ force: true });
      cy.get('[data-testid="collapse-transformer"]').should('exist');
      // Dense block should still be collapsed
      cy.get('[data-testid="expand-denseTransformer"]').should('exist');
    });

    it('expanded MoE transformer block shows expert grid (not attention expand for MLA)', () => {
      // MLA attention should NOT be expandable
      cy.get('[data-testid="expand-attention"]').should('not.exist');
      // Expert grid should be expandable
      cy.get('[data-testid="expand-experts"]').should('exist');
    });

    it('expert grid can be expanded to show SwiGLU details', () => {
      cy.get('[data-testid="expand-experts"]').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
    });

    it('collapses expanded MoE transformer block', () => {
      cy.get('[data-testid="collapse-transformer"]').click({ force: true });
      cy.get('[data-testid="expand-transformer"]').should('exist');
    });

    it('both transformer blocks can be expanded simultaneously', () => {
      cy.get('[data-testid="expand-denseTransformer"]').click({ force: true });
      cy.get('[data-testid="expand-transformer"]').click({ force: true });

      cy.get('[data-testid="collapse-denseTransformer"]').should('exist');
      cy.get('[data-testid="collapse-transformer"]').should('exist');

      // Collapse both for clean state
      cy.get('[data-testid="collapse-denseTransformer"]').click({ force: true });
      cy.get('[data-testid="collapse-transformer"]').click({ force: true });
    });

    it('shows features badges and source link', () => {
      cy.contains('Multi-head Latent Attention').should('be.visible');
      cy.contains('Source').should('be.visible');
    });

    it('shows developer and release date', () => {
      cy.contains('Released by DeepSeek').should('be.visible');
    });
  });

  describe('Collapsible Transformer Block (Dense model - Llama 3.3 70B)', () => {
    before(() => {
      visitModelPage('llama-3-3-70b');
    });

    it('shows single transformer block without dense sub-block', () => {
      cy.get('[data-testid="expand-transformer"]').should('exist');
      cy.get('[data-testid="expand-denseTransformer"]').should('not.exist');
    });

    it('expanded transformer block contains expandable attention and FFN', () => {
      cy.get('[data-testid="expand-transformer"]').click({ force: true });

      cy.get('[data-testid="expand-attention"]').should('exist');
      cy.get('[data-testid="expand-ffn"]').should('exist');
    });

    it('nested expansion works: expand transformer then expand attention', () => {
      // Transformer already expanded from previous test
      cy.get('[data-testid="expand-attention"]').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
    });

    it('shows Dense badge and GQA badge', () => {
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'Dense');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'GQA');
    });
  });

  describe('Collapsible Transformer Blocks (MoE model - Kimi K2.5)', () => {
    before(() => {
      visitModelPage('kimi-k26');
    });

    it('shows MoE and MLA badges for Kimi K2.5', () => {
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'MoE');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'MLA');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', '1.0T');
    });

    it('shows both dense and MoE transformer blocks', () => {
      cy.get('[data-testid="expand-denseTransformer"]').should('exist');
      cy.get('[data-testid="expand-transformer"]').should('exist');
    });

    it('MLA attention is NOT expandable in MoE block', () => {
      cy.get('[data-testid="expand-transformer"]').click({ force: true });
      cy.get('[data-testid="expand-attention"]').should('not.exist');
      cy.get('[data-testid="expand-experts"]').should('exist');
    });

    it('expert grid can be expanded to show SwiGLU details', () => {
      cy.get('[data-testid="expand-experts"]').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
    });

    it('shows Kimi K2.5 features and developer info', () => {
      cy.contains('Multi-head Latent Attention').should('be.visible');
      cy.contains('DeepSeek-style MoE').should('be.visible');
      cy.contains('Released by Moonshot AI').should('be.visible');
    });
  });

  describe('Collapsible Transformer Blocks (MoE model - MiniMax M2.5)', () => {
    before(() => {
      visitModelPage('minimax-m27');
    });

    it('shows MoE and GQA badges for MiniMax M2.5', () => {
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'MoE');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'GQA');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', '230B');
    });

    it('shows single MoE transformer block without dense sub-block', () => {
      cy.get('[data-testid="expand-transformer"]').should('exist');
      cy.get('[data-testid="expand-denseTransformer"]').should('not.exist');
    });

    it('GQA attention is NOT expandable despite being GQA type', () => {
      cy.get('[data-testid="expand-transformer"]').click({ force: true });
      cy.get('[data-testid="expand-attention"]').should('not.exist');
      cy.get('[data-testid="expand-experts"]').should('exist');
    });

    it('expert grid can be expanded to show SwiGLU details', () => {
      cy.get('[data-testid="expand-experts"]').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
    });

    it('shows MiniMax M2.5 features and developer info', () => {
      cy.contains('GQA with QK Norm').should('be.visible');
      cy.contains('Multi-Token Prediction').should('be.visible');
      cy.contains('Released by MiniMax').should('be.visible');
    });
  });

  describe('Collapsible Transformer Blocks (MoE model - MiniMax M3)', () => {
    before(() => {
      visitModelPage('minimax-m3');
    });

    it('shows MoE and GQA badges for MiniMax M3', () => {
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'MoE');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'GQA');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', '428B');
    });

    it('GQA attention is NOT expandable (sparse attention rendered as a static block)', () => {
      cy.get('[data-testid="expand-transformer"]').click({ force: true });
      cy.get('[data-testid="expand-attention"]').should('not.exist');
      cy.get('[data-testid="expand-experts"]').should('exist');
    });

    it('shows MiniMax M3 sparse-attention features', () => {
      cy.contains('MiniMax Sparse Attention (MSA)').should('be.visible');
      cy.contains('GQA with QK Norm').should('be.visible');
    });
  });

  describe('Alternating Attention Blocks (MoE model - gpt-oss 120B)', () => {
    before(() => {
      visitModelPage('gptoss-120b');
    });

    it('shows MoE and Sink/Full GQA badges for gpt-oss', () => {
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'MoE');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'Sink/Full GQA');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', '120B');
    });

    it('shows two separate transformer blocks (no single expand-transformer)', () => {
      // Two alternating blocks should be visible
      cy.get('[data-testid="expand-altBlock0"]').should('exist');
      cy.get('[data-testid="expand-altBlock1"]').should('exist');
      // No single "expand-transformer" block (replaced by two alternating blocks)
      cy.get('[data-testid="expand-transformer"]').should('not.exist');
      cy.get('[data-testid="expand-denseTransformer"]').should('not.exist');
    });

    it('shows alternating indicator between the two blocks', () => {
      cy.get('[data-testid="alternating-indicator"]').should('exist');
    });

    it('first block expands to show Sliding Attention + Sink internals', () => {
      cy.get('[data-testid="expand-altBlock0"]').click({ force: true });
      cy.get('[data-testid="collapse-altBlock0"]').should('exist');
      // Expert grid should be expandable within the block
      cy.get('[data-testid="expand-altExperts0"]').should('exist');
      // Second block should remain collapsed
      cy.get('[data-testid="expand-altBlock1"]').should('exist');
    });

    it('second block expands to show Causal Grouped Query Attention internals', () => {
      cy.get('[data-testid="expand-altBlock1"]').click({ force: true });
      cy.get('[data-testid="collapse-altBlock1"]').should('exist');
      // Expert grid should be expandable within the block
      cy.get('[data-testid="expand-altExperts1"]').should('exist');
    });

    it('both blocks are expanded simultaneously', () => {
      // Both were expanded in previous tests
      cy.get('[data-testid="collapse-altBlock0"]').should('exist');
      cy.get('[data-testid="collapse-altBlock1"]').should('exist');
    });

    it('AlternatingSinkGQA attention is NOT expandable within blocks', () => {
      cy.get('[data-testid="expand-attention"]').should('not.exist');
    });

    it('expert grid can be expanded to show SwiGLU details', () => {
      cy.get('[data-testid="expand-altExperts0"]').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
    });

    it('shows gpt-oss features and developer info', () => {
      cy.contains('Alternating Sliding/Full Attention').should('be.visible');
      cy.contains('Attention Sink Tokens').should('be.visible');
      cy.contains('Released by OpenAI').should('be.visible');
    });
  });

  describe('Hybrid Attention Blocks (MoE model - DeepSeek V4 Pro)', () => {
    before(() => {
      visitModelPage('deepseek-v4');
    });

    it('shows MoE and Hybrid badges for DeepSeek V4 Pro', () => {
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'MoE');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'Hybrid');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', '1.6T');
    });

    it('shows two separate hybrid (CSA/HCA) blocks with an alternating indicator', () => {
      cy.get('[data-testid="expand-altBlock0"]').should('exist');
      cy.get('[data-testid="expand-altBlock1"]').should('exist');
      cy.get('[data-testid="expand-transformer"]').should('not.exist');
      cy.get('[data-testid="expand-denseTransformer"]').should('not.exist');
      cy.get('[data-testid="alternating-indicator"]').should('exist');
    });

    it('shows a hash-routed MoE prefix block; mHC caption appears once a block is open', () => {
      // First 3 layers render as a separate hash-routed prefix block
      cy.get('[data-testid="expand-hashBlock"]').should('exist');
      // mHC caption only appears once a block exposing the mixer nodes is expanded
      cy.get('[data-testid="mhc-note"]').should('not.exist');
      cy.get('[data-testid="expand-hashBlock"]').click({ force: true });
      cy.get('[data-testid="collapse-hashBlock"]').should('exist');
      cy.get('[data-testid="model-architecture-svg"]').contains('Hash Router').should('exist');
      cy.get('[data-testid="mhc-note"]').should('be.visible').and('contain', 'Hyper-Connections');
      // Restore collapsed state for subsequent tests (shared state: testIsolation off)
      cy.get('[data-testid="collapse-hashBlock"]').click({ force: true });
      cy.get('[data-testid="mhc-note"]').should('not.exist');
    });

    it('Hybrid attention is expandable and drills down to a Sliding Window block', () => {
      cy.get('[data-testid="expand-altBlock0"]').click({ force: true });
      cy.get('[data-testid="collapse-altBlock0"]').should('exist');
      // The union-softmax caption only appears once the attention drill-down is open
      cy.get('[data-testid="hybrid-attention-note"]').should('not.exist');
      // Hybrid attention drills down (unlike gpt-oss sink/full GQA, which does not)
      cy.get('[data-testid="expand-altAttention0"]').should('exist');
      cy.get('[data-testid="expand-altAttention0"]').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
      // Caption clarifies the two branches feed one softmax (not two attentions)
      cy.get('[data-testid="hybrid-attention-note"]')
        .should('be.visible')
        .and('contain', 'single softmax');
      // Expert grid still expandable within the block
      cy.get('[data-testid="expand-altExperts0"]').should('exist');
    });

    it('expert grid can be expanded to show SwiGLU details', () => {
      cy.get('[data-testid="expand-altExperts0"]').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
    });

    it('collapsing the parent block hides the union-softmax caption (no orphan caption)', () => {
      // altBlock0 + altAttention0 are expanded from the previous tests; collapsing
      // the parent removes the drill-down from the SVG, so the caption must go too
      // even though altAttention0 stays in the expansion state.
      cy.get('[data-testid="hybrid-attention-note"]').should('be.visible');
      cy.get('[data-testid="collapse-altBlock0"]').click({ force: true });
      cy.get('[data-testid="hybrid-attention-note"]').should('not.exist');
      // Re-expanding the parent restores the remembered drill-down and its caption.
      cy.get('[data-testid="expand-altBlock0"]').click({ force: true });
      cy.get('[data-testid="hybrid-attention-note"]')
        .should('be.visible')
        .and('contain', 'single softmax');
    });

    it('shows DeepSeek V4 Pro features (incl. sliding window) and developer info', () => {
      cy.contains('Hybrid CSA + HCA Attention').should('be.visible');
      cy.contains('Sliding window (128 tokens)').should('be.visible');
      cy.contains('Released by DeepSeek').should('be.visible');
    });
  });

  describe('Hybrid Attention Blocks (MoE model - Kimi K3)', () => {
    before(() => {
      // The /model page renders the diagram regardless of benchmark
      // availability, so no fixture patching is needed (unlike the old
      // dashboard drawer, which required the model to be selectable).
      visitModelPage('kimi-k3');
    });

    it('shows MoE and Hybrid badges for Kimi K3', () => {
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'MoE');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', 'Hybrid');
      cy.get('[data-testid="model-architecture-inline"]').should('contain.text', '2.8T');
    });

    it('renders the KDA and gated-MLA layer categories as two alternating blocks', () => {
      cy.get('[data-testid="expand-altBlock0"]').should('exist');
      cy.get('[data-testid="expand-altBlock1"]').should('exist');
      cy.get('[data-testid="alternating-indicator"]').should('exist');
      cy.get('[data-testid="model-architecture-svg"]').contains('KDA').should('exist');
      // K3 is a 68:24 split, not the 1:1 interleave the default caption implies.
      cy.get('[data-testid="model-architecture-svg"]')
        .contains('gated MLA every 4th layer')
        .should('exist');
      cy.get('[data-testid="model-architecture-svg"]')
        .contains('alternating every layer')
        .should('not.exist');
    });

    it('keeps attention static — no CSA/HCA drill-down or union-softmax caption', () => {
      // K3's hybrid is KDA + gated MLA, not DeepSeek V4's local/compressed CSA-HCA
      // pair, so `alternatingAttentionExpandable: false` must suppress both the
      // drill-down and the caption that explains it. DeepSeek V4 keeps both.
      // Retries re-run this test with the block already expanded, so expand
      // only when it is still collapsed.
      cy.get('body').then(($body) => {
        if ($body.find('[data-testid="expand-altBlock0"]').length > 0) {
          cy.get('[data-testid="expand-altBlock0"]').click({ force: true });
        }
      });
      cy.get('[data-testid="collapse-altBlock0"]').should('exist');
      cy.get('[data-testid="expand-altAttention0"]').should('not.exist');
      cy.get('[data-testid="hybrid-attention-note"]').should('not.exist');
      // The MoE expert grid inside the block is still expandable, and its router
      // line reports K3's own two shared experts rather than an assumed one.
      cy.get('[data-testid="expand-altExperts0"]').should('exist').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]')
        .contains('Top-16 of 896 routed + 2 shared')
        .should('exist');
      // Same count drives the Experts figure in the specs bar: 16 routed + 2
      // shared active out of 898, not the assumed "+1".
      cy.get('[data-testid="model-architecture-svg"]').contains('16+2/898').should('exist');
      // K3's FFN is SiTU-GLU, so the drill-down must not claim SwiGLU/SiLU.
      // The flow caption renders uppercased, so match case-insensitively.
      cy.get('[data-testid="model-architecture-svg"]')
        .contains(/expert ffn \(situ-glu\)/iu)
        .should('exist');
      cy.get('[data-testid="model-architecture-svg"]').contains('SiTU Activation').should('exist');
      cy.get('[data-testid="model-architecture-svg"]')
        .contains(/swiglu|silu/iu)
        .should('not.exist');
    });

    it('labels the dense prefix block KDA rather than the model-wide hybrid type', () => {
      // Layer 1 is the dense-FFN layer and a KDA layer, so "Hybrid Attention"
      // would misdescribe it next to correctly labelled KDA/MLA blocks.
      cy.get('[data-testid="expand-denseTransformer"]').should('exist').click({ force: true });
      cy.get('[data-testid="model-architecture-svg"]')
        .contains('Kimi Delta Attention (KDA)')
        .should('exist');
      cy.get('[data-testid="model-architecture-svg"]')
        .contains('Hybrid Attention')
        .should('not.exist');
      cy.get('[data-testid="collapse-denseTransformer"]').click({ force: true });
    });

    it('shows Kimi K3 features and developer info', () => {
      cy.contains('Kimi Delta Attention (KDA linear attention)').should('be.visible');
      cy.contains('Stable LatentMoE (3584-dim latent)').should('be.visible');
      cy.contains('Released by Moonshot AI').should('be.visible');
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
      // Models without a MODEL_ARCHITECTURES entry still get a card (no badges).
      cy.get('[data-testid="model-index-link-glm-5-2"]').should('contain.text', 'GLM-5.2');
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

        // The click assertions above cover the client transition. Canonical and
        // hreflang are SSR contracts, so verify them from a fresh document rather
        // than racing streamed App Router head updates after the soft navigation.
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
      // deepseek-r1 has fixture benchmark data, so the changelog renders.
      cy.visit('/model/deepseek-r1', {
        onBeforeLoad(win) {
          dismissStarModal(win);
        },
      });
    });

    it('renders the changelog header collapsed inside the embed', () => {
      cy.contains('button', 'Config Changelog', { timeout: 20000 })
        .should('be.visible')
        .and('have.attr', 'aria-expanded', 'false');
    });

    it('can still be expanded manually', () => {
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
      // The former banner copy and badges now live in the tooltip; Radix
      // tooltips open on keyboard focus, which is more reliable in Cypress
      // than synthetic hover.
      cy.get('[data-testid="model-architecture-link"]').focus();
      cy.get('[data-testid="model-architecture-tooltip"]')
        .should('be.visible')
        .and('contain.text', 'Learn more about the DeepSeek R1 0528 671B architecture')
        .and('contain.text', 'MoE')
        .and('contain.text', 'MLA')
        .and('contain.text', '671B');
      // Dismiss the tooltip so it doesn't cover the link for the next test.
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
