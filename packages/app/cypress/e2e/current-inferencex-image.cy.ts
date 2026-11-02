function visitCurrentImage() {
  cy.visit('/zh/current-inferencex-image', {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    },
  });
}

function selectFixedSequence() {
  cy.get('#image-sequence-select').click();
  cy.get('[data-slot="select-item"]').contains('8k/1k').click();
}

describe('Current image P90 age history', () => {
  const asOf = '2026-10-13';
  const row = {
    model: 'qwen3.5',
    hardware: 'b200',
    framework: 'sglang',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'agentic_traces',
    isl: null,
    osl: null,
    image: 'lmsysorg/sglang:v0.5.6',
    date: '2026-10-01',
  };
  const ageHistory = Array.from({ length: 90 }, (_, index) => ({
    date: new Date(Date.parse(`${asOf}T00:00:00Z`) - (89 - index) * 86_400_000)
      .toISOString()
      .slice(0, 10),
    p90AgeDays: index < 77 ? null : index - 77,
    configurationCount: index < 77 ? 0 : 1,
  }));
  beforeEach(() => {
    cy.clock(Date.parse(`${asOf}T12:00:00Z`), ['Date']);
    cy.intercept('GET', '**/api/v1/latest-images', {
      body: [
        row,
        { ...row, model: 'unknown-new-model', hardware: 'h200', disagg: true, date: '2026-10-12' },
      ],
    });
    cy.intercept('GET', '**/api/v1/framework-releases', { body: {} });
    cy.intercept('GET', '**/api/v1/views/current-inferencex-image?*', { body: { ageHistory } }).as(
      'ageHistory',
    );
  });

  it('shows p90 and a dated chart, inspects by keyboard, and refetches after model filtering', () => {
    cy.visit('/current-inferencex-image');
    cy.wait('@ageHistory').its('request.query').should('include', {
      includeHistory: 'true',
      asOf,
      sequence: 'agentic-traces',
      nodeType: 'all',
    });
    cy.get('#image-sequence-select').should('contain', 'Agentic');
    cy.get('#image-node-type-select').should('contain', 'All');
    cy.get('tbody tr').should('have.length', 2);
    cy.get('[data-testid="image-age-p90"]').should('have.text', '12d');
    cy.get('[data-testid="image-age-panel"] svg[role="img"]')
      .focus()
      .trigger('keydown', { key: 'ArrowLeft' });
    cy.get('[data-testid="image-age-readout"]').should('contain', '2026-10-12');
    cy.intercept('GET', '**/api/v1/views/current-inferencex-image?*', (request) => {
      if (request.query.model === 'unknown-new-model') request.alias = 'filteredHistory';
      request.reply({ body: { ageHistory } });
    });
    cy.get('#image-model-select').click();
    cy.get('[role="option"]').contains('unknown-new-model').click();
    cy.wait('@filteredHistory').its('request.query.model').should('eq', 'unknown-new-model');
    cy.get('[data-testid="image-age-p90"]').should('have.text', '1d');
  });

  it('keeps the current table and metric available if history fails, with a working retry', () => {
    cy.intercept('GET', '**/api/v1/views/current-inferencex-image?*', {
      statusCode: 503,
      body: {},
    });
    cy.visit('/current-inferencex-image');
    cy.get('[data-testid="image-age-error"]', { timeout: 20000 }).should('be.visible');
    cy.get('[data-testid="image-age-p90"]').should('have.text', '12d');
    cy.get('tbody tr').should('have.length', 2);
    cy.intercept('GET', '**/api/v1/views/current-inferencex-image?*', { body: { ageHistory } }).as(
      'recovered',
    );
    cy.get('[data-testid="image-age-error"]').contains('button', 'Retry').click();
    cy.wait('@recovered');
    cy.get('[data-testid="image-age-panel"] svg[role="img"]').should('be.visible');
  });

  it('shows empty history rather than a zero-valued line and fits a mobile viewport', () => {
    cy.intercept('GET', '**/api/v1/views/current-inferencex-image?*', {
      body: {
        ageHistory: ageHistory.map((p) => ({ ...p, p90AgeDays: null, configurationCount: 0 })),
      },
    });
    cy.viewport(375, 812);
    cy.visit('/current-inferencex-image');
    cy.get('[data-testid="image-age-panel"]').should('contain', 'No historical observations');
    cy.get('[data-testid="image-age-panel"] svg').should('not.exist');
    cy.document().then((doc) => expect(doc.documentElement.scrollWidth).to.be.at.most(375));
  });
});

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
      isl: 8192,
      osl: 1024,
      benchmark_type: 'single_turn',
      image: 'lmsysorg/sglang:v0.5.2',
      date: today,
    },
    {
      model: 'qwen3.8next',
      hardware: 'b200',
      framework: 'vllm',
      precision: 'fp4',
      spec_method: 'mtp',
      disagg: false,
      isl: 8192,
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
      date: '2026-08-01',
    },
  ];
  const releases = {
    sglang: { tag: 'v0.5.2', publishedAt: '2026-08-01T00:00:00Z', commits: {} },
    vllm: { tag: 'v0.10.1', publishedAt: '2026-08-01T00:00:00Z', commits: {} },
  };

  beforeEach(() => {
    cy.clock(fixedNow, ['Date']);
    cy.viewport(390, 844);
    cy.intercept('GET', '**/api/v1/views/current-inferencex-image?*', { body: { ageHistory: [] } });
  });

  it('localizes spec decode, age text and tooltip while preserving image tags', () => {
    cy.intercept('GET', '**/api/v1/latest-images', {
      delay: 250,
      body: imageRows,
    }).as('latestImages');
    cy.intercept('GET', '**/api/v1/framework-releases', releases);
    visitCurrentImage();
    cy.contains('加载中……').should('be.visible');
    cy.wait('@latestImages');
    selectFixedSequence();
    cy.get('table')
      .should('contain.text', '关闭')
      .and('contain.text', '0 天')
      .and('contain.text', 'lmsysorg/sglang:v0.5.2')
      .and('not.contain.text', '0d');
    cy.get('td[title^="上次提交："]').should('have.length.greaterThan', 0);
    cy.contains('label', '节点类型')
      .parent()
      .find('button')
      .trigger('pointerover', { pointerType: 'mouse' });
    cy.get('[role="dialog"]')
      .should('contain.text', '单节点指非分离式推理')
      .and('contain.text', '独立的 prefill/decode 池')
      .and('contain.text', 'MoRI')
      .and('not.contain.text', '=')
      .and(($content) => {
        const rect = $content[0].getBoundingClientRect();
        expect(rect.left, 'help stays inside the phone viewport').to.be.at.least(0);
        expect(rect.right, 'help stays inside the phone viewport').to.be.at.most(
          $content[0].ownerDocument.documentElement.clientWidth,
        );
      });

    cy.viewport(1440, 900);
    cy.intercept('GET', '**/api/v1/latest-images', imageRows);
    cy.intercept('GET', '**/api/v1/framework-releases', releases);
    visitCurrentImage();
    cy.get('#image-model-select').click();
    cy.get('[data-slot="select-item"]').contains('DeepSeek-R1').click();
    cy.get('table').should('contain.text', 'lmsysorg/sglang:v0.5.2');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });

  it('preserves the English status, age, and technical tooltip copy', () => {
    cy.intercept('GET', '**/api/v1/latest-images', imageRows);
    cy.intercept('GET', '**/api/v1/framework-releases', releases);
    cy.visit('/current-inferencex-image');
    selectFixedSequence();
    cy.get('table')
      .should('contain.text', 'Off')
      .and('contain.text', '0d')
      .and('not.contain.text', '关闭');
    cy.get('td[title^="Last submission:"]').should('have.length.greaterThan', 0);
    cy.contains('label', 'Node Type')
      .parent()
      .find('button')
      .trigger('pointerover', { pointerType: 'mouse' });
    cy.get('[role="dialog"]')
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
          ? { statusCode: 200, body: releases }
          : { statusCode: 500, body: { error: 'release failure' } },
      );
    }).as('frameworkReleases');
    visitCurrentImage();
    cy.wait('@frameworkReleases');
    cy.wait('@frameworkReleases');
    cy.get('[data-testid="current-image-releases-error"]')
      .should('contain.text', '无法加载框架最新版本标签')
      .contains('button', '重试')
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
    cy.intercept('GET', '**/api/v1/framework-releases', releases);
    cy.visit('/current-inferencex-image');
    cy.get('#image-sequence-select').click();
    cy.get('[data-slot="select-item"]').should('not.contain.text', 'null/null');
    cy.get('[data-slot="select-item"]').contains('Agentic').click();
    cy.get('table').should('contain.text', '22d');
    cy.get('td[title^="Last submission: 2026-08-01"]')
      .should('have.length', 1)
      .and('have.attr', 'style')
      .and('match', /oklch/u);
  });

  it('lists only model-scenario pairs that are still benchmarked', () => {
    cy.viewport(1440, 900);
    const retiredImage = 'lmsysorg/sglang:v0.4.9-minimax-8k1k-retired';
    const retiredDeepSeekImage = 'vllm/vllm-openai:v0.10.0-dsv4-8k1k-retired';
    const retiredQwenImage = 'vllm/vllm-openai:v0.10.1-qwen35-8k1k-retired';
    const activeQwenImage = 'vllm/vllm-openai:v0.10.1-qwen35-agentic';
    const activeFlashImage = 'lmsysorg/sglang:v0.5.2-minimax-m31flash-agentic';
    const deprecatedModelImage = 'vllm/vllm-openai:v0.9.0-kimi-k2.5';
    cy.intercept('GET', '**/api/v1/latest-images', [
      ...imageRows,
      { ...imageRows[1], model: 'dsv4', image: retiredDeepSeekImage, date: '2026-09-08' },
      { ...imageRows[1], model: 'qwen3.5', image: retiredQwenImage },
      {
        ...imageRows[1],
        model: 'qwen3.5',
        isl: null,
        osl: null,
        benchmark_type: 'agentic_traces',
        image: activeQwenImage,
      },
      {
        ...imageRows[0],
        model: 'minimaxm3',
        framework: 'sglang',
        image: retiredImage,
        date: '2026-08-04',
      },
      {
        ...imageRows[0],
        model: 'minimaxm31flash',
        framework: 'sglang',
        isl: null,
        osl: null,
        benchmark_type: 'agentic_traces',
        image: activeFlashImage,
        date: today,
      },
      { ...imageRows[1], model: 'kimik2.5', image: deprecatedModelImage },
      { ...imageRows[1], isl: 1024, osl: 1024, image: 'vllm/vllm-openai:v0.8.0-1k1k' },
    ]);
    cy.intercept('GET', '**/api/v1/framework-releases', releases);
    cy.visit('/current-inferencex-image');

    cy.get('#image-sequence-select').should('contain.text', 'Agentic');
    cy.get('#image-node-type-select').should('contain.text', 'All');
    selectFixedSequence();
    cy.get('[data-testid="current-image-result-count"]').should('contain.text', '2 configurations');
    cy.get('table')
      .should('contain.text', 'lmsysorg/sglang:v0.5.2')
      .and('contain.text', 'vllm/vllm-openai:v0.10.1')
      .and('not.contain.text', retiredImage)
      .and('not.contain.text', retiredDeepSeekImage)
      .and('not.contain.text', retiredQwenImage)
      .and('not.contain.text', deprecatedModelImage);

    cy.get('#image-sequence-select').click();
    cy.get('[data-slot="select-item"]').should('not.contain.text', '1k/1k');
    cy.get('[data-slot="select-item"]').contains('8k/1k').click();

    cy.get('#image-model-select').click();
    cy.get('[data-slot="select-item"]').should('not.contain.text', 'Kimi-K2.5');
    cy.get('[data-slot="select-item"]').should(($items) => {
      expect([...$items].map((item) => item.textContent?.trim())).not.to.include('MiniMax-M3');
    });
    cy.get('[data-slot="select-item"]').contains('MiniMax-M3.1-Flash').click();

    cy.get('#image-sequence-select').should('contain.text', 'Agentic');
    cy.get('#image-sequence-select').click();
    cy.get('[data-slot="select-item"]').should('have.length', 1).and('contain.text', 'Agentic');
    cy.get('[data-slot="select-item"]').contains('Agentic').click();
    cy.get('[data-testid="current-image-result-count"]').should('contain.text', '1 configuration');
    cy.get('table').should('contain.text', activeFlashImage).and('not.contain.text', retiredImage);

    cy.get('#image-model-select').click();
    cy.get('[data-slot="select-item"]').contains('Qwen-3.5-397B-A17B').click();
    cy.get('#image-sequence-select').should('contain.text', 'Agentic').click();
    cy.get('[data-slot="select-item"]').should('have.length', 1).and('contain.text', 'Agentic');
    cy.get('[data-slot="select-item"]').contains('Agentic').click();
    cy.get('[data-testid="current-image-result-count"]').should('contain.text', '1 configuration');
    cy.get('table')
      .should('contain.text', activeQwenImage)
      .and('not.contain.text', retiredQwenImage);
  });
  it('keeps full configuration and long image tags readable while filtering the catalog', () => {
    cy.viewport(1440, 900);
    const longImage =
      'registry.example.com/inferencex/sglang:v0.5.1-rocm7.1.1-ubuntu24.04-pytorch2.9-deepseek-r1-fp8-h200-single-node-release-candidate';
    cy.intercept('GET', '**/api/v1/latest-images', [
      { ...imageRows[0], image: longImage, date: '2026-08-20' },
      imageRows[1],
    ]);
    cy.intercept('GET', '**/api/v1/framework-releases', releases);
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
        cy.contains('Review image').should('have.attr', 'title').and('include', 'predates');
        cy.get('time').should('have.attr', 'datetime', '2026-08-20').and('have.text', '2026-08-20');
        cy.get('td[title^="Last submission:"]').should('contain.text', '3d');
      });
    cy.get('#image-model-select').click();
    cy.get('[data-slot="select-item"]').contains('DeepSeek-R1').click();
    cy.get('[data-testid="current-image-result-count"]').should('contain.text', '1 configuration');
    cy.get('tbody tr').should('have.length', 1).and('contain.text', longImage);
  });

  it('pairs compact mobile filters and labels the keyboard-accessible version table in Chinese', () => {
    cy.viewport(375, 812);
    cy.intercept('GET', '**/api/v1/latest-images', imageRows);
    cy.intercept('GET', '**/api/v1/framework-releases', {});
    visitCurrentImage();
    cy.get('table').should('contain.text', '关闭').and('not.contain.text', 'Off');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });

    cy.viewport(390, 844);
    cy.intercept('GET', '**/api/v1/latest-images', imageRows);
    cy.intercept('GET', '**/api/v1/framework-releases', {});
    visitCurrentImage();
    selectFixedSequence();
    cy.get('[data-testid="current-image-filters"] fieldset legend')
      .first()
      .should('have.text', '配置');
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
