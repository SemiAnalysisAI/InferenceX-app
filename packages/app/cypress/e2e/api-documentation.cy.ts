import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

const SITE_URL = 'https://inferencex.semianalysis.com';

describe('API documentation', () => {
  it('keeps full requests and response schemas readable on mobile', () => {
    cy.viewport(390, 720);
    cy.visit('/zh/api');
    cy.get('[data-testid="copyable-code-block"]')
      .first()
      .within(() => {
        cy.contains('button', '复制').should('be.visible');
        cy.get('pre').should('have.attr', 'tabindex', '0').and('contain.text', 'curl');
      });
    cy.get('[data-testid="api-endpoint-list-benchmarks"] summary').click();
    cy.get('[data-testid="api-endpoint-list-benchmarks"]').within(() => {
      cy.get('[role="region"][aria-labelledby="list-benchmarks-parameters"]')
        .should('have.attr', 'tabindex', '0')
        .and('contain.text', 'model');
      cy.get('[data-testid="copyable-code-block"]').should(($blocks) => {
        for (const block of $blocks) {
          const bounds = block.getBoundingClientRect();
          expect(bounds.left).to.be.at.least(0);
          expect(bounds.right).to.be.at.most(390);
        }
      });
    });
  });

  it('exposes the localized reference and its OpenAPI contract', () => {
    cy.visit('/api');

    cy.get('[data-testid="api-reference"]')
      .should('contain.text', 'InferenceX API reference')
      .and('contain.text', 'Quickstart')
      .and('contain.text', 'curl')
      .and('contain.text', '/api/v1/availability')
      .and('contain.text', 'Endpoint reference')
      .and('contain.text', 'Measured power')
      .and('contain.text', 'powerValid=strictV2');
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
      const powerValid = body.paths['/api/v1/benchmarks'].get.parameters.find(
        (parameter: { name: string }) => parameter.name === 'powerValid',
      );
      expect(powerValid.required).to.equal(false);
      expect(powerValid.schema).to.deep.equal({ type: 'string', enum: ['strictV2'] });
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
      .and('contain.text', 'BenchmarkRow 与指标')
      .and('contain.text', '实测功率')
      .and('contain.text', 'powerValid=strictV2');
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
      .and('have.text', 'API 文档');
  });

  it('keeps wide schemas locally scrollable without overflowing the Chinese mobile page', () => {
    cy.viewport(375, 844);
    cy.visit('/zh/api');

    cy.get('section[aria-labelledby="api-schemas-heading"] > dl > div')
      .should('be.visible')
      .find('[data-testid="copyable-code-block"] pre[role="region"]')
      .should('have.css', 'overflow-x', 'auto')
      .then(($scrollers) => {
        expect(
          [...$scrollers].some((scroller) => scroller.scrollWidth > scroller.clientWidth),
        ).to.equal(true);
      });
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth,
      );
    });
  });

  it('supports strictV2 power requests while preserving ordinary benchmark requests', () => {
    const url = '/api/v1/benchmarks?model=DeepSeek-R1-0528';
    cy.request<BenchmarkRow[]>(url).then(({ body, status }) => {
      expect(status).to.equal(200);
      expect(body).to.be.an('array');
      expect(body.length).to.be.greaterThan(0);
      const expected = body.filter(
        (row) => row.metrics.power_valid === 1 && row.metrics.power_metric_schema_version === 2,
      );
      cy.request<BenchmarkRow[]>(`${url}&powerValid=strictV2`).then((response) => {
        expect(response.status).to.equal(200);
        expect(response.body).to.deep.equal(expected);
      });
    });

    for (const value of ['1', '0', 'any', 'certified', '']) {
      cy.request({ url: `${url}&powerValid=${value}`, failOnStatusCode: false }).then(
        ({ body, status }) => {
          expect(status).to.equal(400);
          expect(body).to.deep.equal({ error: 'Unknown powerValid filter' });
        },
      );
    }

    const calculatorUrl = `${url}&view=calculator&sequence=8k%2F1k`;
    cy.request<BenchmarkRow[]>(calculatorUrl).then(({ body, status }) => {
      expect(status).to.equal(200);
      expect(body).to.be.an('array');
      expect(body.length).to.be.greaterThan(0);
    });
    cy.request({
      url: `${calculatorUrl}&powerValid=strictV2`,
      failOnStatusCode: false,
    }).then(({ body, status }) => {
      expect(status).to.equal(400);
      expect(body).to.deep.equal({ error: 'powerValid cannot be combined with view=calculator' });
    });
  });
});
