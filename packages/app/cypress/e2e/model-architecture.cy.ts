describe('Model Architecture Diagram', () => {
  before(() => {
    // Use desktop viewport to ensure all UI elements are visible
    cy.viewport(1280, 800);
    // Pin to DeepSeek R1 — it has a rich architecture diagram (MoE + dense blocks)
    // that the tests below exercise. The app's default model is DeepSeek V4 Pro,
    // which has no architecture entry, so we select R1 explicitly via URL.
    cy.visit('/inference?g_model=DeepSeek-R1-0528', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    // Wait for the page to load
    cy.get('[data-testid="inference-chart-display"]').should('be.visible');
  });

  it('architecture toggle renders for DeepSeek R1 with MoE badges', () => {
    cy.get('[data-testid="model-architecture-toggle"]').should('be.visible');
    cy.get('[data-testid="model-architecture-toggle"]').should(
      'contain.text',
      'Model Architecture',
    );
    cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', 'MoE');
    cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', 'MLA');
    cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', '671B');
  });

  it('clicking toggle expands and renders the SVG diagram', () => {
    cy.get('[data-testid="model-architecture-toggle"]').click();
    cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
  });

  describe('Collapsible Transformer Blocks (MoE model - DeepSeek R1)', () => {
    before(() => {
      // SVG is already visible from previous test (testIsolation: false)
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
      // Switch model and open architecture
      // Clear any stale Radix scroll lock from prior Select interactions
      cy.document().then((doc) => {
        delete doc.body.dataset.scrollLocked;
        doc.body.style.removeProperty('pointer-events');
      });
      cy.get('[role="combobox"]').filter(':visible').first().click();
      cy.get('[role="option"]').contains('Llama 3.3').click();

      // Only click toggle if SVG is not already visible (previous describe may have left it open)
      cy.get('body').then(($body) => {
        if ($body.find('[data-testid="model-architecture-svg"]:visible').length === 0) {
          cy.get('[data-testid="model-architecture-toggle"]').click();
        }
      });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
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
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', 'Dense');
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', 'GQA');
    });
  });

  describe('Collapsible Transformer Blocks (MoE model - Kimi K2.5)', () => {
    before(() => {
      // Clear any stale Radix scroll lock from prior Select interactions
      cy.document().then((doc) => {
        delete doc.body.dataset.scrollLocked;
        doc.body.style.removeProperty('pointer-events');
      });
      cy.get('[role="combobox"]').filter(':visible').first().click();
      cy.get('[role="option"]').contains('Kimi K2.5/2.6').click();

      cy.get('[data-testid="model-architecture-toggle"]').should('be.visible');
      cy.get('body').then(($body) => {
        if ($body.find('[data-testid="model-architecture-svg"]:visible').length === 0) {
          cy.get('[data-testid="model-architecture-toggle"]').click();
        }
      });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
    });

    it('shows MoE and MLA badges for Kimi K2.5', () => {
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', 'MoE');
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', 'MLA');
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', '1.0T');
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
      // Clear any stale Radix scroll lock from prior Select interactions
      cy.document().then((doc) => {
        delete doc.body.dataset.scrollLocked;
        doc.body.style.removeProperty('pointer-events');
      });
      cy.get('[role="combobox"]').filter(':visible').first().click();
      cy.get('[role="option"]').contains('MiniMax M2.5/2.7').click();

      cy.get('[data-testid="model-architecture-toggle"]').should('be.visible');
      cy.get('body').then(($body) => {
        if ($body.find('[data-testid="model-architecture-svg"]:visible').length === 0) {
          cy.get('[data-testid="model-architecture-toggle"]').click();
        }
      });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
    });

    it('shows MoE and GQA badges for MiniMax M2.5', () => {
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', 'MoE');
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', 'GQA');
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', '230B');
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
      // Clear any stale Radix scroll lock from prior Select interactions
      cy.document().then((doc) => {
        delete doc.body.dataset.scrollLocked;
        doc.body.style.removeProperty('pointer-events');
      });
      cy.get('[role="combobox"]').filter(':visible').first().click();
      cy.get('[role="option"]').contains('MiniMax M3').click();

      cy.get('[data-testid="model-architecture-toggle"]').should('be.visible');
      cy.get('body').then(($body) => {
        if ($body.find('[data-testid="model-architecture-svg"]:visible').length === 0) {
          cy.get('[data-testid="model-architecture-toggle"]').click();
        }
      });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
    });

    it('shows MoE and GQA badges for MiniMax M3', () => {
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', 'MoE');
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', 'GQA');
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', '428B');
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
      // Clear any stale Radix scroll lock from prior Select interactions
      cy.document().then((doc) => {
        delete doc.body.dataset.scrollLocked;
        doc.body.style.removeProperty('pointer-events');
      });
      cy.get('[role="combobox"]').filter(':visible').first().click();
      cy.get('[role="option"]').contains('gpt-oss').click();

      cy.get('[data-testid="model-architecture-toggle"]').should('be.visible');
      cy.get('body').then(($body) => {
        if ($body.find('[data-testid="model-architecture-svg"]:visible').length === 0) {
          cy.get('[data-testid="model-architecture-toggle"]').click();
        }
      });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
    });

    it('shows MoE and Sink/Full GQA badges for gpt-oss', () => {
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', 'MoE');
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', 'Sink/Full GQA');
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', '120B');
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
      // Clear any stale Radix scroll lock from prior Select interactions
      cy.document().then((doc) => {
        delete doc.body.dataset.scrollLocked;
        doc.body.style.removeProperty('pointer-events');
      });
      cy.get('[role="combobox"]').filter(':visible').first().click();
      cy.get('[role="option"]').contains('DeepSeek V4 Pro').click();

      cy.get('[data-testid="model-architecture-toggle"]').should('be.visible');
      cy.get('body').then(($body) => {
        if ($body.find('[data-testid="model-architecture-svg"]:visible').length === 0) {
          cy.get('[data-testid="model-architecture-toggle"]').click();
        }
      });
      cy.get('[data-testid="model-architecture-svg"]').should('be.visible');
    });

    it('shows MoE and Hybrid badges for DeepSeek V4 Pro', () => {
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', 'MoE');
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', 'Hybrid');
      cy.get('[data-testid="model-architecture-toggle"]').should('contain.text', '1.6T');
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
});
