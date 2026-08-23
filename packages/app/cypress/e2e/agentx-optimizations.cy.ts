import { unlockAgenticGate } from '../support/e2e';

const FRAMEWORK_SLUGS = [
  'vllm',
  'sglang',
  'tensorrt-llm',
  'atom',
  'aiter',
  'dynamo',
  'lmcache',
  'mooncake',
];

describe('AgentX optimizations', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/datasets', { statusCode: 200, body: [] });
  });

  it('links from /agentx to the optimizations index and to each project', () => {
    cy.visit('/agentx', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentx-optimizations-callout"]').within(() => {
      cy.contains('h2', 'Optimizations for Agentic Workloads').should('be.visible');
      cy.contains('50+ upstream pull requests').should('be.visible');
      cy.get('[data-testid="agentx-optimizations-framework-link"]').should(
        'have.length',
        FRAMEWORK_SLUGS.length,
      );
      // Direct route into one project, for a reader who knows which engine they run.
      cy.get('[data-testid="agentx-optimizations-framework-link"][data-framework="sglang"]').should(
        'have.attr',
        'href',
        '/agentx/optimizations/sglang',
      );
      cy.get('[data-testid="agentx-optimizations-cta"]')
        .should('contain.text', 'Read the optimizations')
        .click();
    });

    cy.location('pathname').should('eq', '/agentx/optimizations');
  });

  it('publishes the index with the ecosystem primer, every project, and sourced PRs', () => {
    cy.visit('/agentx/optimizations', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentx-optimizations-index"]').within(() => {
      cy.get('h1').should('have.text', 'Optimizations for Agentic Workloads');
      cy.get('[data-testid="agentx-optimizations-card"]').should(
        'have.length',
        FRAMEWORK_SLUGS.length,
      );
      cy.get('[data-testid="agentx-optimizations-section-ecosystem"]').should(
        'contain.text',
        'A brief introduction to the distributed inference ecosystem',
      );
      cy.get('[data-testid="agentx-optimizations-figure-servingStack"] img').should('be.visible');
      // The day-zero section keeps its own upstream references.
      cy.get('[data-testid="agentx-optimizations-section-other"]')
        .find('[data-testid="agentx-optimizations-pr"]')
        .first()
        .should('have.attr', 'href')
        .and('match', /^https:\/\/github\.com\/vllm-project\/vllm\/pull\/\d+$/u);
      cy.get('[data-testid="agentx-optimizations-card"][data-framework="vllm"]').click();
    });

    cy.location('pathname').should('eq', '/agentx/optimizations/vllm');
  });

  it('renders a project page with its measurements, figures, and PR links', () => {
    cy.visit('/agentx/optimizations/vllm', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentx-optimizations-article"]')
      .should('have.attr', 'data-framework', 'vllm')
      .within(() => {
        cy.get('h1').should('have.text', 'vLLM');
        cy.contains('prefix-cache hit rate above 95%').should('be.visible');
        cy.contains('81.7% higher output throughput').should('be.visible');
        cy.get('[data-testid="agentx-optimizations-figure-vllmSelectiveRetention"] img').should(
          'be.visible',
        );
        cy.get('[data-testid="agentx-optimizations-pr"]')
          .should('have.length.greaterThan', 20)
          .first()
          .should('have.attr', 'href', 'https://github.com/vllm-project/vllm/pull/43447')
          .and('contain.text', 'vLLM #43447');
        // Sibling projects stay one click away.
        cy.get('[data-testid="agentx-optimizations-card"]').should(
          'have.length',
          FRAMEWORK_SLUGS.length - 1,
        );
      });
  });

  it('serves every project page and pairs each with its Chinese sibling', () => {
    for (const slug of FRAMEWORK_SLUGS) {
      cy.request(`/agentx/optimizations/${slug}`).its('status').should('eq', 200);
      cy.request(`/zh/agentx/optimizations/${slug}`).its('status').should('eq', 200);
    }
  });

  it('returns 404 for a project that does not exist', () => {
    cy.request({ url: '/agentx/optimizations/not-a-framework', failOnStatusCode: false })
      .its('status')
      .should('eq', 404);
  });

  it('ships the Simplified Chinese index and project pages', () => {
    cy.visit('/zh/agentx', { onBeforeLoad: unlockAgenticGate });
    cy.get('[data-testid="agentx-optimizations-callout"]').within(() => {
      cy.contains('h2', '面向智能体负载的优化').should('be.visible');
      cy.get('[data-testid="agentx-optimizations-cta"]')
        .should('contain.text', '查看优化详情')
        .and('have.attr', 'href', '/zh/agentx/optimizations');
    });

    cy.visit('/zh/agentx/optimizations', { onBeforeLoad: unlockAgenticGate });
    cy.get('[data-testid="agentx-optimizations-index"]').within(() => {
      cy.get('h1').should('have.text', '面向智能体负载的优化');
      cy.contains('分布式推理生态简介').should('be.visible');
      cy.get('[data-testid="agentx-optimizations-card"]').should(
        'have.length',
        FRAMEWORK_SLUGS.length,
      );
      cy.get('[data-testid="agentx-optimizations-card"][data-framework="lmcache"]').should(
        'have.attr',
        'href',
        '/zh/agentx/optimizations/lmcache',
      );
    });
    cy.get('link[rel="alternate"][hreflang="en"]').should(
      'have.attr',
      'href',
      'https://inferencex.semianalysis.com/agentx/optimizations',
    );

    cy.visit('/zh/agentx/optimizations/sglang', { onBeforeLoad: unlockAgenticGate });
    cy.get('[data-testid="agentx-optimizations-article"]').within(() => {
      // Product names stay English; the prose around them is translated.
      cy.get('h1').should('have.text', 'SGLang');
      cy.contains('HiCache offload').should('be.visible');
      cy.contains('并发 384 下输出吞吐量提升 26.75%').should('be.visible');
      cy.get('[data-testid="agentx-optimizations-pr"]')
        .first()
        .should('have.attr', 'href')
        .and('match', /^https:\/\/github\.com\/sgl-project\/sglang\/pull\/\d+$/u);
    });
    cy.get('link[rel="alternate"][hreflang="en"]').should(
      'have.attr',
      'href',
      'https://inferencex.semianalysis.com/agentx/optimizations/sglang',
    );
    cy.get('link[rel="alternate"][hreflang="zh-CN"]').should(
      'have.attr',
      'href',
      'https://inferencex.semianalysis.com/zh/agentx/optimizations/sglang',
    );
  });
});
