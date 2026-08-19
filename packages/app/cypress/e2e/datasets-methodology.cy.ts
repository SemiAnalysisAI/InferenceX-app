import { unlockAgenticGate } from '../support/e2e';

describe('AgentX dataset methodology', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/datasets', { statusCode: 200, body: [] });
  });

  it('explains the source, replay sequence, controls, and interpretation in English', () => {
    cy.visit('/agentx', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentx-methodology"]').within(() => {
      cy.get('h1').should('have.text', 'AgentX Benchmark Datasets');
      cy.get('[data-testid="agentx-methodology-step"]').should('have.length', 4);
      cy.get('[data-testid="agentx-methodology-step"] h3').then(($headings) => {
        expect([...$headings].map((heading) => heading.textContent)).to.deep.equal([
          'Capture',
          'Transform',
          'Reconstruct',
          'Replay and measure',
        ]);
      });
      cy.contains('393 Claude Code sessions').should('be.visible');
      cy.contains('Claude Code 2.1.139 or newer').should('be.visible');
      cy.contains('SPEED-Bench').should('be.visible');
      cy.contains('Its synthetic payloads do not support model-quality evaluation.').should(
        'be.visible',
      );
      cy.get('[data-testid="agentx-methodology-cta"]')
        .should('contain.text', 'Read the full methodology')
        .and('have.attr', 'href', '/agentx/methodology');
      cy.get('[data-testid="agentx-results-cta"]')
        .should('contain.text', 'View AgentX Performance Results')
        .and('have.attr', 'href', '/overview');
    });
  });

  it('ships the same methodology on the Simplified Chinese page', () => {
    cy.visit('/zh/agentx', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentx-methodology"]').within(() => {
      cy.get('h1').should('have.text', 'AgentX 基准测试数据集');
      cy.get('[data-testid="agentx-methodology-step"]').should('have.length', 4);
      cy.contains('AgentX 如何构建一次回放').should('be.visible');
      cy.contains('回放控制').should('be.visible');
      cy.contains('合成 payload 不适合评估模型回答质量').should('be.visible');
      cy.get('[data-testid="agentx-methodology-cta"]')
        .should('contain.text', '深入了解 AgentX 方法论')
        .and('have.attr', 'href', '/zh/agentx/methodology');
      cy.get('[data-testid="agentx-results-cta"]')
        .should('contain.text', '查看 AgentX 性能结果')
        .and('have.attr', 'href', '/zh/overview');
    });
  });

  it('publishes the full English methodology with sourced figures and locale pairing', () => {
    cy.visit('/agentx/methodology', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentx-methodology-article"]').within(() => {
      cy.get('h1').should('have.text', 'AgentX Methodology');
      cy.contains('393 sessions built on June 21, 2026').should('be.visible');
      cy.contains('directed acyclic graph (DAG)').should('be.visible');
      cy.contains('following one-hour profiling window').should('be.visible');
      cy.contains('capped at 3 TB').should('be.visible');
      cy.get('figure[data-testid^="agentx-methodology-figure-"]').should('have.length', 21);
      cy.get('[data-testid="agentx-methodology-figure-corpus"]')
        .should('contain.text', 'View full-resolution image')
        .parent('a')
        .should('have.attr', 'href', '/images/agentx-methodology/corpus-scale.png')
        .and('have.attr', 'target', '_blank');
      cy.get('[data-testid="agentx-methodology-figure-corpus"] img')
        .invoke('attr', 'src')
        .should('include', 'q=100');
      [
        'requestDistributions256k',
        'subagentDistributions256k',
        'replayJoined',
        'replayFlatspawn',
        'replaySidecars',
      ].forEach((figure) => {
        cy.get(`[data-testid="agentx-methodology-figure-${figure}"] img`)
          .should('be.visible')
          .invoke('attr', 'alt')
          .should('not.be.empty');
      });
      cy.get('a[href="https://arxiv.org/abs/2604.09557"]').should('exist');
      cy.contains('mostly vibe coded').should('not.exist');
      cy.contains('Distillation is bad').should('not.exist');
    });

    cy.get('[data-testid="language-toggle"]').should('have.attr', 'href', '/zh/agentx/methodology');
    cy.get('link[rel="alternate"][hreflang="en"]').should('exist');
    cy.get('link[rel="alternate"][hreflang="zh-CN"]').should('exist');
  });

  it('publishes the natural Simplified Chinese methodology sibling', () => {
    cy.visit('/zh/agentx/methodology', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentx-methodology-article"]').within(() => {
      cy.get('h1').should('have.text', 'AgentX 方法论');
      cy.contains('2026 年 6 月 21 日构建').should('be.visible');
      cy.contains('有向无环图（DAG）').should('be.visible');
      cy.contains('上限为 3 TB').should('be.visible');
      cy.get('figure[data-testid^="agentx-methodology-figure-"]').should('have.length', 21);
      cy.get('[data-testid="agentx-methodology-figure-corpus"]')
        .should('contain.text', '查看原始分辨率图片')
        .parent('a')
        .should('have.attr', 'href', '/images/agentx-methodology/corpus-scale.png');
    });

    cy.get('[data-testid="language-toggle"]').should('have.attr', 'href', '/agentx/methodology');
  });

  it('permanently redirects legacy dataset routes without dropping path or query', () => {
    cy.request({
      url: '/datasets/test-set/conversations/abc?turn=3',
      followRedirect: false,
    }).then((response) => {
      expect(response.status).to.eq(308);
      expect(response.headers.location).to.eq('/agentx/test-set/conversations/abc?turn=3');
    });

    cy.request({ url: '/zh/datasets', followRedirect: false }).then((response) => {
      expect(response.status).to.eq(308);
      expect(response.headers.location).to.eq('/zh/agentx');
    });
  });
});
