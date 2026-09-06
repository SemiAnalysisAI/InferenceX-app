import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';
// The website advertises the verified public release, which can lag the source candidate.
import PUBLISHED_SKILL from '../../src/lib/published-inferencex-skills.json';

const SITE_URL = 'https://inferencex.semianalysis.com';

describe('API documentation', () => {
  for (const locale of [
    {
      path: '/api',
      heading: 'Use the API with your agent',
      version: 'Skill version',
      scope: 'benchmarks, provenance, datasets, CollectiveX, and diagnostics',
      example: 'First example: measured PowerX',
      missing: 'Keep missing metrics unavailable and genuine zeros unchanged',
      context: 'request URL, retrieval time, package version, local filters',
      excluded: 'Explain why rows were excluded and list missing requested metrics',
      copy: 'Copy',
      copied: 'Copied',
      upgrade: 'replace the version in the installation command',
      status: 'replace install with status',
      examples: 'Usage examples',
    },
    {
      path: '/zh/api',
      heading: '通过智能体使用 API',
      version: '技能版本',
      scope: '基准测试、溯源、数据集、CollectiveX 和诊断接口',
      example: '首个示例：实测 PowerX 数据',
      missing: '缺失指标保持不可用，真实零值保持为零',
      context: '请求 URL、提取时间、包版本、本地筛选条件',
      excluded: '说明数据行被排除的原因，并列出所请求指标的缺失项',
      copy: '复制',
      copied: '已复制',
      upgrade: '新的已发布版本',
      status: 'install 改为 status',
      examples: '使用示例（英文）',
    },
  ]) {
    it(`guides ${locale.path} visitors from a pinned public install to a traceable export`, () => {
      cy.visit(locale.path, {
        onBeforeLoad(win) {
          cy.stub(win.navigator.clipboard, 'writeText').as('copyAgentExample').resolves();
        },
      });
      // The reference is server-rendered; wait for the shell's client mount before copying.
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
          .should('contain.text', locale.heading)
          .and('contain.text', `${locale.version} · ${manifest.version}`)
          .and('contain.text', manifest.name)
          .and('contain.text', locale.scope)
          .and('contain.text', 'Node 24');

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

      cy.get('[data-testid="api-agent-upgrade"]')
        .should('contain.text', locale.upgrade)
        .and('contain.text', '--force');
      cy.get('[data-testid="api-agent-status"]')
        .should('contain.text', locale.status)
        .and('contain.text', '--target')
        .and('contain.text', 'Installer version')
        .and('contain.text', 'Installed version')
        .and('contain.text', 'unknown');
      cy.get('[data-testid="api-agent-examples"]')
        .should('have.text', locale.examples)
        .and(
          'have.attr',
          'href',
          'https://github.com/SemiAnalysisAI/InferenceX-app/blob/master/docs/inferencex-api-examples.md',
        );

      cy.get('[data-testid="api-agent-prompt"]').within(() => {
        cy.contains(locale.example).should('be.visible');
        cy.get('code')
          .should('contain.text', 'inferencex-api')
          .and('contain.text', 'DeepSeek-V4-Pro')
          .and('contain.text', '8192')
          .and('contain.text', '1024')
          .and('contain.text', 'strictV2')
          .and('contain.text', 'powerx.csv')
          .and('contain.text', 'powerx.json')
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
        .and('contain.text', '--format json --output powerx.json')
        .within(() => {
          cy.get('pre code')
            .should('contain.text', 'node .agents/skills/inferencex-api/scripts/export-powerx.mjs')
            .and('contain.text', '--model DeepSeek-V4-Pro --isl 8192 --osl 1024')
            .and('contain.text', '--format csv --output powerx.csv 2> powerx-report.log')
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
