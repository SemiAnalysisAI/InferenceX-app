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
    let releasesSucceed = false;
    cy.intercept('GET', '**/api/v1/latest-images', imageRows);
    cy.intercept('GET', '**/api/v1/framework-releases', (req) => {
      req.reply(
        releasesSucceed
          ? { statusCode: 200, body: { sglang: 'v0.5.2', vllm: 'v0.10.1' } }
          : { statusCode: 500, body: { error: 'release failure' } },
      );
    }).as('frameworkReleases');
    visitCurrentImage();
    cy.wait('@frameworkReleases');
    cy.wait('@frameworkReleases');
    cy.get('[data-testid="current-image-releases-error"]')
      .should('contain.text', '无法加载框架最新版本标签')
      .contains('button', '重试')
      // Keep failures active until the user retries. A request from the previous
      // page must not consume a count-based failure fixture (testIsolation=false).
      .then(($button) => {
        releasesSucceed = true;
        return cy.wrap($button);
      })
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
    let imagesSucceed = false;
    cy.intercept('GET', '**/api/v1/latest-images', (req) => {
      req.reply(
        imagesSucceed
          ? { statusCode: 200, body: imageRows }
          : { statusCode: 500, body: { error: 'sensitive database detail' } },
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
      .then(($button) => {
        imagesSucceed = true;
        return cy.wrap($button);
      })
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
  it('keeps full configuration and long image tags readable while filtering the catalog', () => {
    cy.viewport(1440, 900);
    const longImage =
      'registry.example.com/inferencex/sglang:rocm7.1.1-ubuntu24.04-pytorch2.9-deepseek-r1-fp8-h200-single-node-release-candidate';
    cy.intercept('GET', '**/api/v1/latest-images', [
      { ...imageRows[0], image: longImage, date: '2026-08-20' },
      imageRows[1],
    ]);
    cy.intercept('GET', '**/api/v1/framework-releases', { sglang: 'v0.5.2', vllm: 'v0.10.1' });
    cy.visit('/current-inferencex-image');
    cy.get('[data-testid="current-image-result-count"]').should('contain.text', '2 configurations');
    cy.get('tbody tr')
      .first()
      .within(() => {
        cy.get('th[scope="row"]')
          .should('contain.text', 'DeepSeek-R1')
          .and('contain.text', 'H200')
          .and('contain.text', 'fp8')
          .and('contain.text', 'Spec Decode: Off')
          .and('contain.text', 'Single Node');
        cy.get('code')
          .first()
          .should('have.text', longImage)
          .and(($code) => {
            const el = $code[0];
            expect(el.scrollWidth).to.be.at.most(el.clientWidth);
            expect(el.clientHeight).to.be.greaterThan(40);
          });
        cy.contains('Review image').should('have.attr', 'title').and('include', 'unstable tag');
        cy.get('time').should('have.attr', 'datetime', '2026-08-20').and('have.text', '2026-08-20');
        cy.get('td[title^="Last submission:"]').should('contain.text', '3d');
      });
    cy.get('#image-model-select').click();
    cy.get('[data-slot="select-item"]').contains('DeepSeek-R1').click();
    cy.get('[data-testid="current-image-result-count"]').should('contain.text', '1 configuration');
    cy.get('tbody tr').should('have.length', 1).and('contain.text', longImage);
  });

  it('pairs compact mobile filters and labels the keyboard-accessible version table in Chinese', () => {
    cy.viewport(390, 844);
    cy.intercept('GET', '**/api/v1/latest-images', imageRows);
    cy.intercept('GET', '**/api/v1/framework-releases', {});
    visitCurrentImage();
    cy.get('[data-testid="current-image-filters"] fieldset')
      .first()
      .should('contain.text', '基准测试配置');
    cy.get('[data-testid="current-image-filters"] button[role="combobox"]').each(($button) => {
      expect($button[0].getBoundingClientRect().height).to.be.at.least(44);
    });
    cy.get('#image-precision-select').then(($precision) => {
      cy.get('#image-sequence-select').should(($sequence) => {
        expect($sequence[0].getBoundingClientRect().top).to.be.closeTo(
          $precision[0].getBoundingClientRect().top,
          1,
        );
      });
    });
    cy.get('#current-image-scroll-hint').should('contain.text', '横向滚动');
    cy.get('[role="region"][aria-label="镜像与版本"]')
      .focus()
      .should('be.focused')
      .scrollTo('right');
    cy.get('table').should('contain.text', '暂无信息');
    cy.get('time').first().should('be.visible').and('have.text', today);
    cy.get('#image-sequence-select').click();
    cy.get('[data-slot="select-item"]').contains('智能体').click();
    cy.get('table').should('contain.text', 'AgentX 提交已超过 14 天').and('contain.text', '22 天');
  });
});
