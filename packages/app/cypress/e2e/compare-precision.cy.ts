describe('Compare precision index page', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('leads the /compare index with AgentX results and keeps fixed-sequence tools', () => {
    cy.visit('/compare');
    cy.get('[data-testid="compare-agentx-primary"]').within(() => {
      cy.get('h1').should('have.text', 'Compare Realistic Agentic Inference Perf');
      cy.get('[data-testid^="compare-agentx-model-"]').should('have.length', 6);
      cy.get('[data-testid="compare-agentx-model-kimi-k3"]').should(
        'have.attr',
        'href',
        '/inference/kimi-k3',
      );
      cy.get('[data-testid="compare-agentx-overview-link"]')
        .should('contain.text', 'Overview')
        .and('have.attr', 'href', '/overview');
      cy.get('[data-testid="compare-agentx-dashboard-link"]')
        .should('contain.text', 'Full dashboard')
        .and('have.attr', 'href', '/inference/kimi-k3');
      cy.get('[data-testid="compare-agentx-methodology-link"]').should('not.exist');
    });
    cy.get('[data-testid="compare-model-catalog"]')
      .should('contain.text', 'AgentX and 8K/1K results')
      .and('contain.text', 'Each card identifies its scenario');
    cy.get('[data-testid="compare-index-precision-link"]')
      .should('have.attr', 'href', '/compare-precision')
      .and('contain.text', 'Compare precisions');
    cy.get('[data-testid="compare-index-spec-decode-link"]')
      .should('have.attr', 'href', '/compare-spec-decode')
      .and('contain.text', 'Compare speculative decoding');
    cy.get('#deepseek-v4 a[data-scenario="AgentX"]')
      .first()
      .should('contain.text', 'AgentX')
      .and('have.attr', 'href')
      .and('match', /\/agentic$/u);
    cy.get('#deepseek-r1 a[data-scenario="8K/1K"]')
      .first()
      .should('contain.text', '8K/1K')
      .and('have.attr', 'href')
      .and('match', /\/8k-1k$/u);
    // Vendor logos render beside each hardware label in the pair cards:
    // NVIDIA uses the full-color green mark, AMD its monochrome brand mark.
    cy.get('a[data-scenario] img[src="/logos/nvidia-color.svg"]').should('exist');
    cy.get('a[data-scenario] img[src="/logos/amd.svg"]').should('exist');
  });

  it('ships the same AgentX-first hierarchy on the Simplified Chinese page', () => {
    cy.visit('/zh/compare');
    cy.get('[data-testid="compare-agentx-primary"]').within(() => {
      cy.get('h1').should('have.text', '真实智能体工作负载下的推理性能对比');
      cy.get('[data-testid^="compare-agentx-model-"]').should('have.length', 6);
      cy.get('[data-testid="compare-agentx-model-deepseek-v4"]').should(
        'have.attr',
        'href',
        '/zh/inference/deepseek-v4',
      );
      cy.get('[data-testid="compare-agentx-overview-link"]')
        .should('contain.text', '总览')
        .and('have.attr', 'href', '/zh/overview');
      cy.get('[data-testid="compare-agentx-dashboard-link"]')
        .should('contain.text', '查看完整仪表板')
        .and('have.attr', 'href', '/zh/inference/kimi-k3');
      cy.get('[data-testid="compare-agentx-methodology-link"]').should('not.exist');
    });
    cy.get('[data-testid="compare-model-catalog"]').should(
      'contain.text',
      'AgentX 与 8K/1K 测试结果',
    );
    cy.get('#deepseek-v4 a[data-scenario="AgentX"]')
      .first()
      .should('have.attr', 'href')
      .and('match', /^\/zh\/compare\/.+\/agentic$/u);
    cy.get('a[data-scenario] img[src="/logos/nvidia-color.svg"]').should('exist');
    cy.get('a[data-scenario] img[src="/logos/amd.svg"]').should('exist');
  });

  it('renders the /compare-per-dollar index with precision and spec-decode CTA links', () => {
    cy.visit('/compare-per-dollar');
    cy.get('[data-testid="compare-index-precision-link"]')
      .should('have.attr', 'href', '/compare-precision')
      .and('contain.text', 'Compare precisions');
    cy.get('[data-testid="compare-index-spec-decode-link"]')
      .should('have.attr', 'href', '/compare-spec-decode')
      .and('contain.text', 'Compare speculative decoding');
  });
});

describe('Compare precision index + slug page', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('renders the precision index with a hero title and at least one card', () => {
    cy.visit('/compare-precision');
    cy.contains('h1', /precision/iu).should('be.visible');
    cy.get('a[href^="/compare-precision/"]').should('have.length.greaterThan', 0);
  });

  it('navigates to the first card slug, renders table + hero PNG + JSON-LD', () => {
    cy.visit('/compare-precision');
    cy.get('a[href^="/compare-precision/"]')
      .first()
      .invoke('attr', 'href')
      .then((href) => {
        const slug = (href as string).replace('/compare-precision/', '');

        // Visit the slug page.
        cy.visit(href as string);
        cy.location('pathname').should('eq', href);

        // Interpolated comparison table renders.
        cy.get('[data-testid="compare-interpolated-table"]').should('exist');

        // Both precision labels appear in the table body rows (side labels
        // render in tbody cells, same as GPU labels on /compare/[slug]).
        const parts = slug.split('-vs-');
        const precA = parts[0].split('-').pop()!;
        const precB = parts[1];
        cy.get('[data-testid="compare-interpolated-table"] tbody').should(($tbody) => {
          const text = $tbody.text().toUpperCase();
          expect(text).to.contain(precA.toUpperCase());
          expect(text).to.contain(precB.toUpperCase());
        });

        // Hero PNG image present.
        cy.get('img[src$=".png"]').should('exist');

        // JSON-LD script present.
        cy.get('script[type="application/ld+json"]').should('exist');
      });
  });

  it('redirects a reversed precision slug to canonical order', () => {
    cy.visit('/compare-precision');
    cy.get('a[href^="/compare-precision/"]')
      .first()
      .invoke('attr', 'href')
      .then((href) => {
        const slug = (href as string).replace('/compare-precision/', '');
        // Reverse the precision tokens around '-vs-'.
        const vsIdx = slug.indexOf('-vs-');
        const left = slug.slice(0, vsIdx);
        const right = slug.slice(vsIdx + 4);
        // Extract the precisions (last token of left side, full right side).
        const leftParts = left.split('-');
        const precA = leftParts.pop()!;
        const modelGpu = leftParts.join('-');
        // Build reversed slug: {model}-{gpu}-{right}-vs-{precA}.
        const reversedSlug = `${modelGpu}-${right}-vs-${precA}`;
        cy.visit(`/compare-precision/${reversedSlug}`);
        cy.location('pathname').should('eq', href);
      });
  });
});

describe('Compare precision zh index', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('renders Chinese hero and /zh card hrefs', () => {
    cy.visit('/zh/compare-precision');
    cy.contains('h1', /精度对比/u).should('be.visible');
    cy.get('a[href^="/zh/compare-precision/"]').should('have.length.greaterThan', 0);
  });
});
