import { unlockAgenticGate } from '../support/e2e';

describe('AgentX dataset methodology', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/datasets', { statusCode: 200, body: [] });
  });

  it('explains the source, replay sequence, controls, and interpretation in English', () => {
    cy.visit('/datasets', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentx-methodology"]').within(() => {
      cy.get('h1').should('have.text', 'Agentic Benchmark Datasets');
      cy.get('[data-testid="agentx-methodology-step"]').should('have.length', 4);
      cy.get('[data-testid="agentx-methodology-step"] h3').then(($headings) => {
        expect([...$headings].map((heading) => heading.textContent)).to.deep.equal([
          'Capture',
          'Anonymize',
          'Reconstruct',
          'Replay and measure',
        ]);
      });
      cy.contains('393 Claude Code sessions').should('be.visible');
      cy.contains('Claude Code 2.1.139 or newer').should('be.visible');
      cy.contains('SPEED-Bench').should('be.visible');
      cy.contains(
        'Synthetic content preserves workload behavior; AgentX measures serving-system performance, not model answer quality.',
      ).should('be.visible');
    });
  });

  it('ships the same methodology on the Simplified Chinese page', () => {
    cy.visit('/zh/datasets', { onBeforeLoad: unlockAgenticGate });

    cy.get('[data-testid="agentx-methodology"]').within(() => {
      cy.get('h1').should('have.text', 'Agentic 基准测试数据集');
      cy.get('[data-testid="agentx-methodology-step"]').should('have.length', 4);
      cy.contains('AgentX 如何构建一次回放').should('be.visible');
      cy.contains('保证结果可比性的控制措施').should('be.visible');
      cy.contains('推理系统性能，而不是模型回答质量').should('be.visible');
    });
  });
});
