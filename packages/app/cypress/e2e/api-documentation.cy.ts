import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';
import PUBLISHED_SKILL from '../../src/lib/api/published-inferencex-skills.json';

const SITE_URL = 'https://inferencex.semianalysis.com';

describe('API documentation', () => {
  it('publishes exact model architecture facts and rejects unsupported selection controls', () => {
    const endpoint = '/api/v1/views/model-architectures';
    cy.request(`${endpoint}?model=kimi-k3`).then(({ body, status }) => {
      expect(status).to.equal(200);
      expect(body.params).to.deep.equal({ model: 'Kimi-K3' });
      expect(body.models).to.have.length(1);
      expect(body.models[0].slug).to.equal('kimi-k3');
      expect(body.models[0].architecture).to.include({
        numLayers: 93,
        hiddenSize: 7168,
        numExperts: 898,
        activeExperts: 16,
        routedExpertHiddenSize: 3584,
      });
      cy.request(`${endpoint}?model=Kimi-K3`).its('body').should('deep.equal', body);
    });
    cy.request(endpoint).then(({ body }) => {
      expect(body.params.model).to.equal(null);
      expect(
        body.models.find((entry: { slug: string }) => entry.slug === 'muse-spark-open'),
      ).to.have.nested.property('architecture.totalParams', 816);
    });
    cy.request('/api/openapi.json').then(({ body }) => {
      const operation = body.paths[endpoint].get;
      expect(operation.parameters.map((item: { name: string }) => item.name)).to.deep.equal([
        'model',
      ]);
      expect(
        body.components.schemas.ModelArchitecturesView.properties.models.items.properties,
      ).to.have.keys('slug', 'architecture');
    });
    for (const locale of ['/api', '/zh/api']) {
      cy.visit(locale);
      cy.get('[data-testid="api-endpoint-get-model-architectures-view"] summary').click();
      cy.get('[data-testid="api-endpoint-get-model-architectures-view"]').should(
        'contain.text',
        endpoint,
      );
    }
  });

  it('exposes Pareto boundaries without promoting legacy fixtures or chart share params', () => {
    const query =
      '/api/v1/pareto?model=DeepSeek-R1-0528&rawModel=dsr1&sequence=1k%2F1k&xMetric=median_intvty&yMetric=output_tput_per_gpu&xDirection=max&yDirection=max';
    cy.request<BenchmarkRow[]>('/api/v1/benchmarks?model=DeepSeek-R1-0528').then(
      ({ body: rows }) => {
        expect(rows.length).to.be.greaterThan(0);
        expect(
          rows.some((row) => row.benchmark_type !== undefined && row.benchmark_type !== null),
        ).to.equal(false);
        cy.request(query).then(({ body, status }) => {
          expect(status).to.equal(200);
          expect(body.counts).to.deep.equal({
            returned: rows.length,
            selected: 0,
            eligible: 0,
            missing_or_nonfinite: 0,
          });
          expect(body.frontier).to.deep.equal([]);
          expect(body.hinterland).to.deep.equal([]);
        });
      },
    );
    cy.request(`${query}&hardware=not-a-hardware`).then(({ body }) => {
      expect(body.frontier).to.deep.equal([]);
      expect(body.hinterland).to.deep.equal([]);
      expect(body.counts.selected).to.equal(0);
    });
    for (const locale of ['/api', '/zh/api']) {
      cy.visit(locale);
      cy.get('[data-testid="api-endpoint-get-pareto"] summary').click();
      cy.get('[data-testid="api-endpoint-get-pareto"]').should('contain.text', '/api/v1/pareto');
    }
  });
  for (const locale of [
    {
      path: '/api',
      missing: 'Keep missing metrics unavailable and genuine zeros unchanged',
      context: 'request URL, retrieval time, package version, local filters',
      excluded: 'Explain why rows were excluded and list missing requested metrics',
      copy: 'Copy',
      copied: 'Copied',
    },
    {
      path: '/zh/api',
      missing: '缺失指标保持不可用，真实零值保持为零',
      context: '请求 URL、提取时间、包版本、本地筛选条件',
      excluded: '说明数据行被排除的原因，并列出所请求指标的缺失项',
      copy: '复制',
      copied: '已复制',
    },
  ]) {
    it(`guides ${locale.path} visitors from a pinned public install to a traceable export`, () => {
      cy.visit(locale.path, {
        onBeforeLoad(win) {
          cy.stub(win.navigator.clipboard, 'writeText').as('copyAgentExample').resolves();
        },
      });
      cy.get('[data-testid="theme-toggle"]')
        .should('have.attr', 'aria-label')
        .and('contain', 'currently');

      cy.get('[data-testid="copyable-code-block"]')
        .first()
        .find('code')
        .should('contain.text', 'curl');
      cy.then(() => {
        const manifest = PUBLISHED_SKILL;
        cy.get('[data-testid="api-agent-skill"]')
          .should('contain.text', manifest.version)
          .and('contain.text', manifest.name);

        for (const target of ['codex', 'claude']) {
          const command = `npm exec --yes --package ${manifest.name}@${manifest.version} -- inferencex-skills install --target ${target}`;
          cy.get(`[data-testid="api-agent-install-${target}"]`).within(() => {
            cy.get('code').should('have.text', command);
            cy.contains('button', locale.copy).click();
            cy.contains('button', locale.copied).should('be.visible');
          });
          cy.get('@copyAgentExample').should('have.been.calledWithExactly', command);
        }
      });

      cy.get('[data-testid="api-agent-upgrade"]').should('contain.text', '--force');
      cy.get('[data-testid="api-agent-status"]').should('contain.text', '--target');
      cy.get('[data-testid="api-agent-examples"]').should(
        'have.attr',
        'href',
        'https://github.com/SemiAnalysisAI/InferenceX-app/blob/master/docs/inferencex-api-examples.md',
      );

      cy.get('[data-testid="api-agent-prompt"]').within(() => {
        cy.get('code')
          .should('contain.text', 'inferencex-api')
          .and('contain.text', 'DeepSeek-V4-Pro')
          .and('contain.text', '8192')
          .and('contain.text', '1024')
          .and('contain.text', 'strictV2')
          .and('contain.text', 'powerx export')
          .and('contain.text', 'result.csv')
          .and('contain.text', 'result.json')
          .and('contain.text', 'manifest.json')
          .and('contain.text', locale.missing)
          .and('contain.text', locale.context)
          .and('contain.text', locale.excluded)
          .invoke('text')
          .then((prompt) => {
            cy.contains('button', locale.copy).click();
            cy.get('@copyAgentExample').should('have.been.calledWithExactly', prompt);
          });
      });

      cy.get('#api-powerx-cookbook').should('not.have.attr', 'open');
      cy.get('#api-powerx-cookbook summary').click();
      cy.get('#api-powerx-cookbook')
        .should(($details) => expect($details).to.have.attr('open'))
        .and('contain.text', '.agents/skills/inferencex-api/references/powerx.md')
        .and('contain.text', '.claude/skills/inferencex-api/references/powerx.md')
        .and('contain.text', 'avg_power_w')
        .and('contain.text', '--format json --output-dir evidence/powerx-json')
        .and('contain.text', 'result.csv')
        .and('contain.text', 'result.json')
        .and('contain.text', 'manifest.json')
        .and('contain.text', 'responses/')
        .within(() => {
          cy.get('pre code')
            .should('contain.text', 'mkdir -p evidence')
            .and(
              'contain.text',
              'node .agents/skills/inferencex-api/scripts/inferencex.mjs powerx export',
            )
            .and('contain.text', '--model DeepSeek-V4-Pro --isl 8192 --osl 1024')
            .and('contain.text', '--format csv --output-dir evidence/powerx-csv')
            .and(
              'contain.text',
              'node .agents/skills/inferencex-api/scripts/inferencex.mjs verify evidence/powerx-csv',
            )
            .invoke('text')
            .then((command) => {
              cy.contains('button', locale.copy).click();
              cy.get('@copyAgentExample').should('have.been.calledWithExactly', command);
            });
          cy.get('a').should('not.exist');
        });
    });
  }

  it('keeps full requests and response schemas readable on mobile', () => {
    cy.viewport(390, 720);
    cy.visit('/zh/api');
    cy.get('[data-testid="copyable-code-block"]')
      .first()
      .within(() => {
        cy.contains('button', '复制').should('be.visible');
        cy.get('pre').should('have.attr', 'tabindex', '0').and('contain.text', 'curl');
      });
    for (const target of ['codex', 'claude']) {
      cy.get(`[data-testid="api-agent-install-${target}"]`).within(() => {
        cy.contains('button', '复制').should('be.visible');
        cy.get('pre')
          .should('have.attr', 'tabindex', '0')
          .and('have.css', 'overflow-x', 'auto')
          .and('contain.text', 'npm exec --yes --package @semianalysisai/inferencex-skills@')
          .and('contain.text', `--target ${target}`)
          .should(($pre) => {
            expect($pre[0].scrollWidth).to.be.greaterThan($pre[0].clientWidth);
            const bounds = $pre[0].getBoundingClientRect();
            expect(bounds.left).to.be.at.least(0);
            expect(bounds.right).to.be.at.most(390);
          });
      });
    }
    cy.get('#api-powerx-cookbook summary').click();
    cy.get('#api-powerx-cookbook pre')
      .should('have.attr', 'tabindex', '0')
      .and('have.css', 'overflow-x', 'auto')
      .and('contain.text', 'inferencex.mjs powerx export')
      .and('contain.text', '--output-dir evidence/powerx-csv')
      .should(($pre) => {
        const bounds = $pre[0].getBoundingClientRect();
        expect(bounds.left).to.be.at.least(0);
        expect(bounds.right).to.be.at.most(390);
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
      .should('contain.text', 'curl')
      .and('contain.text', '/api/v1/availability')
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
    cy.get('[data-testid="footer-link-api"]').should('have.attr', 'href', '/api');

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

    cy.get('[data-testid="api-reference"]').should('contain.text', 'powerValid=strictV2');
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
    cy.get('[data-testid="footer-link-api"]').should('have.attr', 'href', '/zh/api');

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
});
