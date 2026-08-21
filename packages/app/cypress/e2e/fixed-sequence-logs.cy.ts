import { unlockAgenticGate } from '../support/e2e';

describe('Fixed-sequence benchmark logs', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/server-log-files*', {
      body: ['watchtower-teal-cn03_decode_w0.out', 'results/benchmark.log'],
    }).as('logFiles');
    cy.intercept({ method: 'GET', pathname: '/api/v1/server-log' }, (request) => {
      const params = new URL(request.url).searchParams;
      const fileName = params.get('file') ?? 'watchtower-teal-cn03_decode_w0.out';
      request.reply({
        body: {
          id: 96255,
          fileName,
          serverLog: fileName.endsWith('.out')
            ? 'INFO decode worker ready\n'
            : 'benchmark complete\n',
          offset: 0,
          nextOffset: null,
        },
      });
    }).as('logContent');
  });

  it('opens all stored .out and .log files on the fixed-sequence detail route', () => {
    cy.visit('/inference/logs/96255', { onBeforeLoad: unlockAgenticGate });
    cy.wait('@logFiles');
    cy.wait('@logContent');

    cy.contains('h1', 'Benchmark logs').should('be.visible');
    cy.get('[data-testid="agentic-server-log-viewer"]')
      .should('have.attr', 'data-log-context', 'fixed-sequence')
      .and('contain.text', 'watchtower-teal-cn03_decode_w0.out');
    cy.get('[data-testid="server-log-content"]').should('contain.text', 'INFO decode worker ready');

    cy.get('#agentic-log-file').click();
    cy.contains('[role="option"]', 'results/benchmark.log').click();
    cy.get('[data-testid="server-log-content"]').should('contain.text', 'benchmark complete');
    cy.get('[data-testid="download-selected-server-log"]')
      .should('have.attr', 'href')
      .and('include', 'id=96255')
      .and('include', 'download=1');
  });

  it('provides the same viewer on the Simplified Chinese route', () => {
    cy.visit('/zh/inference/logs/96255', { onBeforeLoad: unlockAgenticGate });
    cy.wait('@logFiles');
    cy.wait('@logContent');

    cy.contains('h1', '基准测试日志').should('be.visible');
    cy.get('[data-testid="agentic-server-log-viewer"]')
      .should('contain.text', '日志文件')
      .and('contain.text', '搜索所有日志文件');
  });
});
