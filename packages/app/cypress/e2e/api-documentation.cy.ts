const SITE_URL = 'https://inferencex.semianalysis.com';

describe('API documentation', () => {
  it('exposes the localized reference and its OpenAPI contract', () => {
    cy.visit('/api');

    cy.get('[data-testid="api-reference"]')
      .should('contain.text', 'InferenceX API reference')
      .and('contain.text', 'Quickstart')
      .and('contain.text', 'curl')
      .and('contain.text', '/api/v1/availability')
      .and('contain.text', 'Endpoint reference');
    cy.get('[data-testid="api-openapi-link"]').should('have.attr', 'href', '/api/openapi.json');
    cy.get('[data-testid="api-spec-version"]').should('have.text', 'v1 · OpenAPI 3.1');
    cy.get('[data-testid="api-endpoint-list-benchmarks"]')
      .should('contain.text', 'GET')
      .and('contain.text', '/api/v1/benchmarks');
    cy.get('[data-testid="api-endpoint-get-collectivex-run"]')
      .should('contain.text', 'GET')
      .and('contain.text', '/api/v1/collectivex/runs/{runId}');

    cy.get('link[rel="alternate"][hreflang="en"]').should('have.attr', 'href', `${SITE_URL}/api`);
    cy.get('link[rel="alternate"][hreflang="zh-CN"]').should(
      'have.attr',
      'href',
      `${SITE_URL}/zh/api`,
    );
    cy.get('link[rel="alternate"][hreflang="x-default"]').should(
      'have.attr',
      'href',
      `${SITE_URL}/api`,
    );
    cy.get('[data-testid="language-toggle"]')
      .should('have.attr', 'href', '/zh/api')
      .and('have.attr', 'hreflang', 'zh-CN');
    cy.get('[data-testid="footer-link-api"]')
      .should('have.attr', 'href', '/api')
      .and('have.text', 'API Reference');

    cy.request('/api/openapi.json').then(({ body, headers, status }) => {
      expect(status).to.equal(200);
      expect(headers['content-type']).to.contain('application/json');
      expect(body).to.have.property('openapi', '3.1.0');
      expect(body.paths['/api/v1/benchmarks'].get).to.have.property(
        'operationId',
        'list-benchmarks',
      );
      expect(body.paths['/api/v1/collectivex/runs/{runId}'].get).to.have.property(
        'operationId',
        'get-collectivex-run',
      );
    });

    cy.visit('/zh/api');

    cy.get('[data-testid="api-reference"]')
      .should('contain.text', 'InferenceX API 参考文档')
      .and('contain.text', '快速入门')
      .and('contain.text', '约定')
      .and('contain.text', '端点参考')
      .and('contain.text', 'BenchmarkRow 与指标');
    cy.get('[data-testid="api-openapi-link"]').should('have.attr', 'href', '/api/openapi.json');
    cy.get('link[rel="alternate"][hreflang="en"]').should('have.attr', 'href', `${SITE_URL}/api`);
    cy.get('link[rel="alternate"][hreflang="zh-CN"]').should(
      'have.attr',
      'href',
      `${SITE_URL}/zh/api`,
    );
    cy.get('link[rel="alternate"][hreflang="x-default"]').should(
      'have.attr',
      'href',
      `${SITE_URL}/api`,
    );
    cy.get('[data-testid="language-toggle"]')
      .should('have.attr', 'href', '/api')
      .and('have.attr', 'hreflang', 'en');
    cy.get('[data-testid="footer-link-api"]')
      .should('have.attr', 'href', '/zh/api')
      .and('have.text', 'API 参考文档');
  });
});
