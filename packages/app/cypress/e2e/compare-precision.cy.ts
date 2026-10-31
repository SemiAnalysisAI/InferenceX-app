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
      cy.get('[data-testid^="compare-agentx-model-"]').should('have.length', 8);
      cy.get('[data-testid="compare-agentx-model-kimi-k3"]').should(
        'have.attr',
        'href',
        '/inference/kimi-k3',
      );
      cy.get('[data-testid="compare-agentx-revenue-calculator-link"]')
        .should('contain.text', 'Token Revenue Calculator')
        .and('have.attr', 'href', '/profit-estimator-per-gigawatt');
      cy.get('[data-testid="compare-agentx-dashboard-link"]')
        .should('have.text', 'Dashboard')
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
      .and('match', /^\/compare\/deepseek-v4-[^/?]+$/u);
    cy.get('#deepseek-r1 a[data-scenario="8K/1K"]')
      .first()
      .should('contain.text', '8K/1K')
      .and('have.attr', 'href')
      .and('match', /^\/compare\/deepseek-r1-[^/?]+$/u);
    cy.get('a[data-scenario] img[src="/logos/nvidia-color.svg"]').should('exist');
    cy.get('a[data-scenario] img[src="/logos/amd.svg"]').should('exist');
  });

  it('ships the same AgentX-first hierarchy on the Simplified Chinese page', () => {
    cy.visit('/zh/compare');
    cy.get('[data-testid="compare-agentx-primary"]').within(() => {
      cy.get('h1').should('have.text', '真实智能体工作负载下的推理性能对比');
      cy.get('[data-testid^="compare-agentx-model-"]').should('have.length', 8);
      cy.get('[data-testid="compare-agentx-model-deepseek-v4"]').should(
        'have.attr',
        'href',
        '/zh/inference/deepseek-v4',
      );
      cy.get('[data-testid="compare-agentx-revenue-calculator-link"]')
        .should('contain.text', 'Token 收入计算器')
        .and('have.attr', 'href', '/zh/profit-estimator-per-gigawatt');
      cy.get('[data-testid="compare-agentx-dashboard-link"]')
        .should('have.text', '仪表板')
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
      .and('match', /^\/zh\/compare\/deepseek-v4-[^/?]+$/u);
    cy.get('a[data-scenario] img[src="/logos/nvidia-color.svg"]').should('exist');
    cy.get('a[data-scenario] img[src="/logos/amd.svg"]').should('exist');
  });
});

describe('Compare precision index + slug page', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
  });

  it('navigates to the first card slug, renders table + hero PNG + JSON-LD', () => {
    cy.visit('/compare-precision');
    cy.get('a[href^="/compare-precision/"]')
      .first()
      .invoke('attr', 'href')
      .then((href) => {
        const slug = (href as string).replace('/compare-precision/', '');

        cy.visit(href as string);
        cy.location('pathname').should('eq', href);

        cy.get('[data-testid="compare-interpolated-table"]').should('exist');

        const parts = slug.split('-vs-');
        const precA = parts[0].split('-').pop()!;
        const precB = parts[1];
        cy.get('[data-testid="compare-interpolated-table"] tbody').should(($tbody) => {
          const text = $tbody.text().toUpperCase();
          expect(text).to.contain(precA.toUpperCase());
          expect(text).to.contain(precB.toUpperCase());
        });

        cy.get('img[src$=".png"]').should('exist');

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
        const vsIdx = slug.indexOf('-vs-');
        const left = slug.slice(0, vsIdx);
        const right = slug.slice(vsIdx + 4);
        const leftParts = left.split('-');
        const precA = leftParts.pop()!;
        const modelGpu = leftParts.join('-');
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
