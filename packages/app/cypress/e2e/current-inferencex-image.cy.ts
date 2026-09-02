function visitCurrentImage() {
  cy.visit('/zh/current-inferencex-image', {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    },
  });
}

describe('Current InferenceX Image localized routes', () => {
  const fixedNow = Date.parse('2026-08-23T12:00:00Z');
  const today = '2026-08-23';
  const imageRows = [
    {
      model: 'dsr1',
      hardware: 'h200',
      framework: 'mori-sglang',
      precision: 'fp8',
      spec_method: 'none',
      disagg: false,
      isl: 1024,
      osl: 1024,
      benchmark_type: 'single_turn',
      image: 'lmsysorg/sglang:v0.5.2',
      date: today,
    },
    {
      model: 'gptoss',
      hardware: 'b200',
      framework: 'vllm',
      precision: 'fp4',
      spec_method: 'mtp',
      disagg: false,
      isl: 1024,
      osl: 1024,
      benchmark_type: 'single_turn',
      image: 'vllm/vllm-openai:v0.10.1',
      date: today,
    },
    {
      model: 'dsr1',
      hardware: 'h200',
      framework: 'sglang',
      precision: 'fp8',
      spec_method: 'none',
      disagg: false,
      isl: null,
      osl: null,
      benchmark_type: 'agentic_traces',
      image: 'lmsysorg/sglang:v0.5.2',
      date: '2026-08-01', // 22 days before fixedNow — past the 14-day AgentX budget.
    },
  ];

  beforeEach(() => {
    cy.clock(fixedNow, ['Date']);
    cy.viewport(390, 844);
  });

  it('shows the localized loading state', () => {
    cy.intercept('GET', '**/api/v1/latest-images', {
      delay: 250,
      body: imageRows,
    });
    cy.intercept('GET', '**/api/v1/framework-releases', {});
    visitCurrentImage();
    cy.contains('加载中……').should('be.visible');
    cy.get('table').should('contain.text', 'lmsysorg/sglang:v0.5.2');
  });

  it('localizes spec decode, age text and tooltip while preserving image tags', () => {
    cy.intercept('GET', '**/api/v1/latest-images', imageRows).as('latestImages');
    cy.intercept('GET', '**/api/v1/framework-releases', {
      sglang: 'v0.5.2',
      vllm: 'v0.10.1',
    });
    visitCurrentImage();
    cy.wait('@latestImages');
    cy.get('table')
      .should('contain.text', '关闭')
      .and('contain.text', '0 天')
      .and('contain.text', 'lmsysorg/sglang:v0.5.2')
      .and('not.contain.text', '0d');
    cy.get('td[title^="上次提交："]').should('have.length.greaterThan', 0);
    cy.contains('label', '节点类型').parent().find('svg.cursor-help').trigger('pointermove');
    cy.get('[role="tooltip"]')
      .should('contain.text', '单节点指非分离式推理')
      .and('contain.text', '独立的 prefill/decode 池')
      .and('contain.text', 'MoRI')
      .and('not.contain.text', '=');
  });

  it('preserves the English status, age, and technical tooltip copy', () => {
    cy.intercept('GET', '**/api/v1/latest-images', imageRows);
    cy.intercept('GET', '**/api/v1/framework-releases', {
      sglang: 'v0.5.2',
      vllm: 'v0.10.1',
    });
    cy.visit('/current-inferencex-image');
    cy.get('table')
      .should('contain.text', 'Off')
      .and('contain.text', '0d')
      .and('not.contain.text', '关闭');
    cy.get('td[title^="Last submission:"]').should('have.length.greaterThan', 0);
    cy.contains('label', 'Node Type').parent().find('svg.cursor-help').trigger('pointermove');
    cy.get('[role="tooltip"]')
      .should('contain.text', 'Single node = non-disaggregated serving.')
      .and('contain.text', 'Mori')
      .and('not.contain.text', 'MoRI');
  });

  it('keeps rows available when release lookup fails and retries independently', () => {
    let releaseAttempts = 0;
    cy.intercept('GET', '**/api/v1/latest-images', imageRows);
    cy.intercept('GET', '**/api/v1/framework-releases', (req) => {
      releaseAttempts += 1;
      req.reply(
        releaseAttempts <= 2
          ? { statusCode: 500, body: { error: 'release failure' } }
          : { statusCode: 200, body: { sglang: 'v0.5.2', vllm: 'v0.10.1' } },
      );
    }).as('frameworkReleases');
    visitCurrentImage();
    cy.wait('@frameworkReleases');
    cy.wait('@frameworkReleases');
    cy.get('[data-testid="current-image-releases-error"]')
      .should('contain.text', '无法加载框架最新版本标签')
      .contains('button', '重试')
      .click();
    cy.get('table').should('contain.text', 'lmsysorg/sglang:v0.5.2');
    cy.wait('@frameworkReleases');
    cy.get('[data-testid="current-image-releases-error"]').should('not.exist');
  });

  it('shows a natural empty-filter message', () => {
    cy.intercept('GET', '**/api/v1/latest-images', imageRows);
    cy.intercept('GET', '**/api/v1/framework-releases', {});
    visitCurrentImage();
    cy.get('#image-precision-select').click();
    cy.get('[data-slot="select-item"]').contains('FP8').click();
    cy.get('#image-hardware-select').click();
    cy.get('[data-slot="select-item"]').contains('B200').click();
    cy.contains('当前筛选组合没有镜像记录，请调整一个或多个筛选条件。').should('be.visible');
  });

  it('hides primary API details, retries, and keeps the table internally scrollable', () => {
    let attempts = 0;
    cy.intercept('GET', '**/api/v1/latest-images', (req) => {
      attempts += 1;
      req.reply(
        attempts <= 2
          ? { statusCode: 500, body: { error: 'sensitive database detail' } }
          : { statusCode: 200, body: imageRows },
      );
    }).as('latestImagesRetry');
    cy.intercept('GET', '**/api/v1/framework-releases', {});
    visitCurrentImage();
    cy.wait('@latestImagesRetry');
    cy.wait('@latestImagesRetry');
    cy.get('[data-testid="current-image-error"]')
      .should('contain.text', '无法加载镜像数据。')
      .and('not.contain.text', 'sensitive database detail')
      .contains('button', '重试')
      .click();
    cy.wait('@latestImagesRetry');
    cy.get('table')
      .parents('.overflow-x-auto')
      .then(($scroller) => {
        expect($scroller[0].scrollWidth).to.be.greaterThan($scroller[0].clientWidth);
      });
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
    cy.get('link[rel="alternate"][hreflang="en"]')
      .invoke('attr', 'href')
      .should('include', '/current-inferencex-image');
    cy.get('link[rel="alternate"][hreflang="zh-CN"]')
      .invoke('attr', 'href')
      .should('include', '/zh/current-inferencex-image');
  });

  it('labels agentic rows as Agentic (never null/null) and flags stale AgentX submissions', () => {
    cy.intercept('GET', '**/api/v1/latest-images', imageRows);
    cy.intercept('GET', '**/api/v1/framework-releases', {
      sglang: 'v0.5.2',
      vllm: 'v0.10.1',
    });
    cy.visit('/current-inferencex-image');
    cy.get('#image-sequence-select').click();
    cy.get('[data-slot="select-item"]').should('not.contain.text', 'null/null');
    cy.get('[data-slot="select-item"]').contains('Agentic').click();
    // The AgentX row is 22 days old — past the two-week budget — so it must be
    // tinted stale even though its image tag matches the latest release.
    cy.get('table').should('contain.text', '22d');
    cy.get('td[title^="Last submission: 2026-08-01"]')
      .should('have.length', 1)
      .and('have.attr', 'style')
      .and('match', /oklch/u);
  });

  it('labels agentic rows with the reviewed Chinese scenario copy', () => {
    cy.intercept('GET', '**/api/v1/latest-images', imageRows);
    cy.intercept('GET', '**/api/v1/framework-releases', {});
    visitCurrentImage();
    cy.get('#image-sequence-select').click();
    cy.get('[data-slot="select-item"]').should('not.contain.text', 'null/null');
    cy.get('[data-slot="select-item"]').contains('智能体').should('be.visible');
  });

  it('supports the filter-to-table path at 1440px', () => {
    cy.viewport(1440, 900);
    cy.intercept('GET', '**/api/v1/latest-images', imageRows);
    cy.intercept('GET', '**/api/v1/framework-releases', {
      sglang: 'v0.5.2',
      vllm: 'v0.10.1',
    });
    visitCurrentImage();
    cy.get('#image-model-select').click();
    cy.get('[data-slot="select-item"]').contains('DeepSeek-R1').click();
    cy.get('table').should('contain.text', 'lmsysorg/sglang:v0.5.2');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });

  it('keeps localized filters and table contained at 375px', () => {
    cy.viewport(375, 812);
    cy.intercept('GET', '**/api/v1/latest-images', imageRows);
    cy.intercept('GET', '**/api/v1/framework-releases', {});
    visitCurrentImage();
    cy.get('table').should('contain.text', '关闭').and('not.contain.text', 'Off');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });
});
