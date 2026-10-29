import { TPC_SKYLINE_RUNS } from '@/components/ubenchx/tpc-skyline-data';

const TPC_SKYLINE_GPU_COUNT = Object.keys(TPC_SKYLINE_RUNS).length;

const dismissModal = {
  onBeforeLoad(win: Cypress.AUTWindow) {
    win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  },
};

describe('ubenchX hub and test routes', () => {
  it('opens /ubenchx on the mem-bw view with the Beta title and test selector', () => {
    cy.visit('/ubenchx', dismissModal);
    cy.url().should('include', '/ubenchx/mem-bw');
    cy.contains('h1', 'ubenchX Microbenchmarks (Beta)').should('be.visible');
    cy.get('[data-testid="nav-link-ubenchx"]').should('have.attr', 'href', '/ubenchx/mem-bw');
    cy.get('[data-testid="ubenchx-test-select"]').should('contain', 'HBM Bandwidth');
    cy.contains('h2', 'HBM Bandwidth').should('be.visible');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
    cy.contains('H100 SXM').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').should('contain', 'MBU');
    cy.contains('h2', 'Memory Bandwidth Utilization').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').click();
    cy.contains('[role="option"]', 'Bandwidth (TB/s)').click();
    cy.contains('h2', 'Bandwidth vs Message Size').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').should('contain', 'TB/s');
  });

  it('switches to the combined core profiles with the test selector', () => {
    cy.visit('/ubenchx/mem-bw', dismissModal);
    cy.contains('ubenchX').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').should('be.visible');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
    cy.get('link[rel="alternate"][hreflang="zh-CN"]')
      .invoke('attr', 'href')
      .should('include', '/zh/ubenchx/mem-bw');

    cy.get('[data-testid="ubenchx-test-select"]').click();
    cy.contains('[role="option"]', 'Core memory-access profiles').click();
    cy.url().should('include', '/ubenchx/core-memory-profiles');
    cy.get('[data-testid="sm-l2-heatmap"]').should('be.visible');
    cy.get('[data-testid="ubenchx-test-select"]').should('contain', 'Core memory-access profiles');
  });

  it('switches to the TPC Skyline table with the test selector', () => {
    cy.visit('/ubenchx/mem-bw', dismissModal);
    cy.get('[data-testid="ubenchx-test-select"]').click();
    cy.contains('[role="option"]', 'TPC Skyline').click();
    cy.url().should('include', '/ubenchx/tpc-skyline');
    cy.contains('h2', 'TPC Skyline').should('be.visible');
    cy.get('[data-testid="tpc-skyline-table"] th').then(($th) => {
      expect([...$th].map((th) => th.textContent)).to.deep.equal([
        'Product',
        'Measured # of GPCs',
        'Measured # of SMs',
        'Measured TPC Groupings',
      ]);
    });
    cy.get('[data-testid="tpc-skyline-table"] tbody tr').should(
      'have.length',
      TPC_SKYLINE_GPU_COUNT,
    );
    cy.contains('[data-testid="tpc-skyline-table"] tr', 'H100 SXM')
      .should('contain', '[9, 9, 8, 8, 8, 8, 8, 4, 1, 1, 1, 1]')
      .find('td')
      .then(($td) => {
        expect($td.eq(1).text()).to.equal('12');
        expect($td.eq(2).text()).to.equal('132');
      });
    cy.contains('[data-testid="tpc-skyline-table"] tr', 'B200 SXM').should(
      'contain',
      '[10, 10, 10, 9, 9, 9, 9, 5, 1, 1, 1]',
    );
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
  });

  it('renders the Chinese TPC Skyline page', () => {
    cy.visit('/zh/ubenchx/tpc-skyline', dismissModal);
    cy.contains('h2', 'TPC Skyline').should('be.visible');
    cy.contains('[data-testid="tpc-skyline-table"] th', '实测 TPC 分组').should('be.visible');
    cy.get('[data-testid="tpc-skyline-table"] tbody tr').should(
      'have.length',
      TPC_SKYLINE_GPU_COUNT,
    );
  });

  it('keeps a pinned sm-l2-distance tooltip on its cell while the pointer moves', () => {
    cy.visit('/ubenchx/sm-l2-distance', dismissModal);
    cy.get('[data-testid="sm-l2-heatmap"]').should('be.visible');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
    cy.get('link[rel="alternate"][hreflang="zh-CN"]')
      .invoke('attr', 'href')
      .should('include', '/zh/ubenchx/core-memory-profiles');

    cy.get('[data-testid="sm-l2-heatmap"] svg rect').last().as('overlay');
    cy.get('@overlay').click(520, 120, { force: true });
    cy.get('[data-testid="sm-l2-tooltip"]')
      .should('be.visible')
      .invoke('text')
      .then((pinned) => {
        cy.get('@overlay').trigger('mousemove', 60, 60, { force: true });
        cy.get('[data-testid="sm-l2-tooltip"]').should('be.visible').and('have.text', pinned);
      });
  });

  it('opens /zh/ubenchx on the Chinese mem-bw view with the Beta title', () => {
    cy.visit('/zh/ubenchx', dismissModal);
    cy.url().should('include', '/zh/ubenchx/mem-bw');
    cy.contains('h1', 'ubenchX 微基准测试（Beta）').should('be.visible');
    cy.get('[data-testid="ubenchx-test-select"]').should('contain', 'HBM 带宽');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
    cy.get('link[rel="alternate"][hreflang="en"]')
      .invoke('attr', 'href')
      .should('include', '/ubenchx/mem-bw');

    cy.contains('h2', 'HBM 带宽').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').should('contain', 'MBU');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
  });

  it('renders the Chinese sm-l2-distance page', () => {
    cy.visit('/zh/ubenchx/sm-l2-distance', dismissModal);
    cy.get('[data-testid="sm-l2-heatmap"]').should('be.visible');
    cy.contains('SM 间 L2 延迟差异').should('be.visible');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
  });
});

const dismiss = {
  onBeforeLoad(win: Cypress.AUTWindow) {
    win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  },
};

function assertProfileOrder() {
  cy.get('[data-testid="ascend-core-profiles"], [data-testid="sm-l2-heatmap"]').should(
    ($profiles) => {
      expect([...$profiles].map((profile) => profile.dataset.testid)).to.deep.eq([
        'ascend-core-profiles',
        'sm-l2-heatmap',
      ]);
    },
  );
}

describe('Ascend core memory-access profiles', () => {
  for (const prefix of ['', '/zh']) {
    it(`shows Huawei before B200 by default and after restoring all hardware at ${prefix || '/'}`, () => {
      const allHardware = prefix ? '全部硬件' : 'All hardware';

      cy.visit(`${prefix}/ubenchx/core-memory-profiles`, dismiss);
      cy.get('[data-testid="core-profile-hardware"]').should('contain.text', allHardware);
      assertProfileOrder();
      cy.get('[data-testid="core-profile-hardware"]').click();
      cy.get('[role="listbox"] [role="option"]').should(($options) => {
        expect([...$options].map((option) => option.textContent?.trim())).to.deep.eq([
          allHardware,
          'Huawei 950PR',
          'B200 SXM',
        ]);
      });
      cy.contains('[role="option"]', 'B200 SXM').click();
      cy.get('[data-testid="ascend-core-profiles"]').should('not.exist');
      cy.get('[data-testid="sm-l2-heatmap"]').should('exist');
      cy.get('[data-testid="core-profile-hardware"]').click();
      cy.contains('[role="option"]', allHardware).click();
      cy.get('[data-testid="core-profile-hardware"]').should('contain.text', allHardware);
      assertProfileOrder();
    });
  }

  it('navigates to all four profiles and inspects actual core IDs by keyboard', () => {
    cy.visit('/ubenchx/mem-bw', dismiss);
    cy.get('[data-testid="ubenchx-test-select"]').click();
    cy.contains('[role="option"]', 'Core memory-access profiles').click();
    cy.url().should('include', '/ubenchx/core-memory-profiles');
    cy.contains('SYS_CNT ticks are not clock64 cycles').should('be.visible');
    cy.get('[data-testid="profile-scalar_128MiB_cube_isolated"] svg')
      .focus()
      .trigger('keydown', { key: 'ArrowRight' });
    cy.get('[data-testid="profile-scalar_128MiB_cube_isolated-value"]').should(
      'contain',
      '0 ↔ 2: 15.30 SYS_CNT ticks',
    );
    cy.get('[data-testid="profile-scalar_128MiB_vector_concurrent"] svg').should('exist');
    cy.screenshot('ascend-core-profiles-en', { capture: 'fullPage' });
    cy.visit('/zh/ubenchx/core-memory-profiles', dismiss);
    cy.contains('h2', '核心访存特征').should('be.visible');
    cy.get('[data-testid="ubenchx-test-select"]').should('contain', '核心访存特征');
    cy.contains('不是核心间通信延迟').should('be.visible');
    cy.contains('没有网格级起始同步屏障').should('be.visible');
    cy.screenshot('ascend-core-profiles-zh', { capture: 'fullPage' });
  });
  it('returns the displayed matrix values and preserves absent GPU measurements', () => {
    cy.request('/api/v1/views/ubenchx?test=all&gpu=Ascend%20950PR_9579').then(({ body }) => {
      const panel = body.coreMemoryProfiles.gpus[0].panels[0];
      expect(panel.coreIds.slice(12, 16)).to.deep.equal([14, 15, 54, 55]);
      expect(panel.matrix[0][14]).to.be.closeTo(96.70648193359, 1e-8);
      expect(panel.unit).to.equal('SYS_CNT ticks');
      expect(body.smL2Distance.gpus).to.deep.equal([]);
    });
  });
});

for (const prefix of ['', '/zh']) {
  it(`omits idle selection controls from all core-profile panels on ${prefix || '/'}`, () => {
    cy.visit(`${prefix}/ubenchx/core-memory-profiles`, dismiss);
    cy.get('[data-testid="ascend-core-profiles"] output')
      .should('have.length', 4)
      .each(($output) => {
        cy.wrap($output).should('be.empty').and('not.be.visible');
      });
    cy.get('[data-testid="ascend-core-profiles"] button').should('not.exist');
    cy.contains('Hover or focus a heatmap').should('not.exist');
    cy.contains('悬停或聚焦热力图').should('not.exist');
  });
}

it('unpins core-profile cells by repeated click or Enter and clears them outside or with Escape', () => {
  cy.visit('/ubenchx/core-memory-profiles', dismiss);
  const panel = '[data-testid="profile-scalar_128MiB_cube_isolated"]';
  const value = '[data-testid="profile-scalar_128MiB_cube_isolated-value"]';
  cy.get(`${panel} svg rect`).eq(1).click();
  cy.get(value).should('contain', 'Pinned core pair: 0 ↔ 1: 19.03');
  cy.get(`${panel} svg rect`).eq(2).click();
  cy.get(value).should('contain', 'Pinned core pair: 0 ↔ 2: 15.30');
  cy.get(`${panel} svg rect`).eq(2).click();
  cy.get(value).should('be.empty').and('not.be.visible');
  cy.get(`${panel} svg`)
    .trigger('keydown', { key: 'ArrowRight' })
    .trigger('keydown', { key: 'Enter' });
  cy.get(value).should('contain', 'Pinned core pair:');
  cy.get(`${panel} svg`).trigger('keydown', { key: 'Enter' });
  cy.get(value).should('be.empty').and('not.be.visible');
  cy.get(`${panel} svg rect`).eq(1).click();
  cy.contains('h2', 'Core memory-access profiles').click();
  cy.get(value).should('be.empty').and('not.be.visible');
  cy.get(`${panel} svg rect`).eq(1).click();
  cy.get(`${panel} svg`).trigger('keydown', { key: 'Escape' });
  cy.get(value).should('be.empty').and('not.be.visible');
});

it('filters both devices on one page and preserves their API values and units', () => {
  cy.visit('/ubenchx/core-memory-profiles', dismiss);
  cy.get('[data-testid="sm-l2-heatmap"]').should('exist');
  cy.get('[data-testid="ascend-core-profiles"]').should('exist');
  cy.get('[data-testid="core-profile-hardware"]').should('contain', 'All hardware').click();
  cy.contains('[role="option"]', 'B200 SXM').click();
  cy.get('[data-testid="sm-l2-heatmap"]').should('be.visible');
  cy.get('[data-testid="ascend-core-profiles"]').should('not.exist');
  cy.request('/api/v1/views/ubenchx?test=core-memory-profiles&gpu=B200%20SXM').then(({ body }) => {
    expect(body.gpus).to.have.length(1);
    expect(body.gpus[0].unit).to.equal('clock64 cycles');
    cy.contains(`${body.gpus[0].stats.crossDieMean.toFixed(1)} cycles`).should('be.visible');
  });
  cy.get('[data-testid="core-profile-hardware"]').click();
  cy.contains('[role="option"]', 'Huawei 950PR').click();
  cy.get('[data-testid="sm-l2-heatmap"]').should('not.exist');
  // Radix returns focus to the trigger after the close animation; focusing the chart earlier blurs it.
  cy.get('[data-testid="core-profile-hardware"]').should('have.focus');
  cy.get('[data-testid="profile-scalar_128MiB_cube_isolated"] svg').focus().should('have.focus');
  cy.get('[data-testid="profile-scalar_128MiB_cube_isolated-value"]').should(
    'contain',
    '0 ↔ 1: 19.03 SYS_CNT ticks',
  );
  cy.get('[data-testid="core-profile-hardware"]').click();
  cy.contains('[role="option"]', 'All hardware').click();
  cy.get('[data-testid="sm-l2-heatmap"]').should('exist');
  cy.get('[data-testid="ascend-core-profiles"]').should('exist');
  cy.screenshot('combined-core-profiles-desktop', { capture: 'fullPage' });
  cy.visit('/zh/ubenchx/sm-l2-distance', dismiss);
  cy.location('pathname').should('equal', '/zh/ubenchx/core-memory-profiles');
  cy.viewport(390, 844);
  cy.get('[data-testid="core-profile-hardware"]').should('contain', '全部硬件');
  cy.contains('不同设备上颜色或数值相同，并不代表延迟相同').should('be.visible');
  cy.get('[data-testid="sm-l2-heatmap"]').should('exist');
  cy.get('[data-testid="ascend-core-profiles"]').should('exist');
  cy.screenshot('combined-core-profiles-mobile-zh', { capture: 'fullPage' });
});

describe('Huawei copy-bandwidth evidence', () => {
  it('renders Huawei 950PR and qualifies the graph timing in English and Chinese', () => {
    cy.visit('/ubenchx/mem-bw', dismiss);
    cy.contains('Huawei 950PR').should('be.visible');
    cy.contains('910B3').should('not.exist');
    cy.contains('Graph time is amortized per copy').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').click();
    cy.contains('[role="option"]', 'Bandwidth (TB/s)').click();
    cy.contains('h2', 'Bandwidth vs Message Size').should('be.visible');
    cy.screenshot('huawei-bandwidth-en', { capture: 'fullPage' });
    cy.visit('/zh/ubenchx/mem-bw', dismiss);
    cy.contains('图执行时间按拷贝次数摊销').should('be.visible');
    cy.contains('910B3').should('not.exist');
    cy.screenshot('huawei-bandwidth-zh', { capture: 'fullPage' });
  });
  it('serves measured endpoints and empty unavailable tests through the public API', () => {
    cy.request('/api/v1/views/ubenchx?test=all&gpu=Huawei%20950PR').then(({ body }) => {
      expect(body.memBw.gpus[0].rows.at(-1).bytes).to.equal(17179869184);
      expect(body.memBw.gpus[0].rows.at(-1).mbuPercent).to.be.closeTo(90.4545974, 0.0001);
      expect(body.smL2Distance.gpus).to.deep.equal([]);
      expect(body.tpcSkyline.gpus).to.deep.equal([]);
    });
  });
});

function assertBandwidthRuler(chart: string) {
  cy.get(`${chart} circle.point`)
    .filter((_, element) => {
      const datum = (
        element as unknown as SVGCircleElement & { __data__: { gpuKey: string; bytes: number } }
      ).__data__;
      return datum.gpuKey === 'H200 SXM' && datum.bytes === 33554432;
    })
    .should('have.length', 1)
    .then(($point) => {
      const x = Number($point.attr('cx')),
        y = Number($point.attr('cy'));
      cy.wrap($point).trigger('mouseenter', { force: true });
      cy.get(`${chart} .horizontal-ruler`).should(($line) => {
        expect(Number($line.attr('y1'))).to.be.closeTo(y, 0.01);
        expect(Number($line.attr('y2'))).to.be.closeTo(y, 0.01);
      });
      cy.get(`${chart} .vertical-ruler`).should(($line) => {
        expect(Number($line.attr('x1'))).to.be.closeTo(x, 0.01);
        expect(Number($line.attr('x2'))).to.be.closeTo(x, 0.01);
      });
    });
}

it('keeps bandwidth hover guides on the rendered point in every metric and after zoom', () => {
  cy.visit('/ubenchx/mem-bw', dismiss);
  assertBandwidthRuler('#ubenchx-mbu');
  for (const [label, chart] of [
    ['Bandwidth (TB/s)', '#ubenchx-bandwidth'],
    ['Latency (ms)', '#ubenchx-latency'],
  ]) {
    cy.get('[data-testid="ubenchx-metric-select"]').click();
    cy.contains('[role="option"]', label).click();
    assertBandwidthRuler(chart);
  }
  cy.get('#ubenchx-latency circle.point')
    .first()
    .then(($point) => {
      const previousX = $point.attr('cx');
      cy.get('#ubenchx-latency svg').then(($svg) => {
        const rect = $svg[0].getBoundingClientRect();
        cy.wrap($svg).trigger('wheel', {
          eventConstructor: 'WheelEvent',
          deltaY: -200,
          shiftKey: true,
          clientX: rect.left + 150,
          clientY: rect.top + 100,
          force: true,
        });
      });
      cy.get('#ubenchx-latency circle.point')
        .first()
        .should(($current) => {
          expect($current.attr('cx')).not.to.equal(previousX);
        });
    });
  assertBandwidthRuler('#ubenchx-latency');
});

describe('Huawei SKU configurations alongside measured TPC groups', () => {
  it('preserves source values and matches the read-only API', () => {
    cy.visit('/ubenchx/tpc-skyline', dismissModal);
    cy.get('[data-testid="huawei-sku-table"] tbody tr').should('have.length', 9);
    cy.request('/api/v1/views/ubenchx?test=tpc-skyline').then(({ body }) => {
      for (const row of body.skuConfigurations) {
        cy.get(`[data-sku="${row.sku}"] td`).then(($cells) => {
          expect([...$cells].map((cell) => cell.textContent)).to.deep.equal(
            [
              row.cubeCores,
              row.vectorCores,
              row.aiCpuCores,
              row.cubeClockMHz,
              row.memoryGiB,
              row.l2MiB,
              row.ddrRate.base,
              row.virtualisationOptions.join(', '),
            ].map(String),
          );
        });
      }
      cy.request(body.skuConfigurations[0].source.url).its('status').should('eq', 200);
    });
    cy.get('[data-sku="PR_9579"]').should('contain', 'Profiled SKU');
    cy.get('[data-testid="huawei-sku-configurations"]').should(
      'contain',
      'not measured TPC or GPC',
    );
    cy.screenshot('tpc-huawei-skus-desktop', { capture: 'fullPage' });
    cy.contains('a', 'View measured PR_9579 core profiles').click();
    cy.url().should('include', '/ubenchx/core-memory-profiles');
    cy.get('[data-testid="ascend-core-profiles"]').should('be.visible');
  });

  it('keeps Chinese mobile configuration columns accessible by scrolling', () => {
    cy.viewport(390, 844);
    cy.visit('/zh/ubenchx/tpc-skyline', dismissModal);
    cy.get('[data-testid="ubenchx-test-select"]').should('contain', 'TPC Skyline 与 SKU 配置');
    cy.get('[data-testid="huawei-sku-configurations"]').scrollIntoView();
    cy.contains('h3', 'Huawei 950PR SKU 配置').should('be.visible');
    cy.get('[data-sku="PR_957c"]').should('contain', '84').and('contain', '112');
    cy.get('[data-testid="huawei-sku-configurations"] [role="region"]').as('tableRegion');
    cy.get('@tableRegion').then(($region) => {
      expect($region[0].scrollWidth).to.be.greaterThan($region[0].clientWidth);
    });
    cy.get('@tableRegion').scrollTo('right');
    cy.contains('[data-testid="huawei-sku-table"] th', '虚拟化选项').should('be.visible');
    cy.get('@tableRegion').scrollTo('left');
    cy.screenshot('tpc-huawei-skus-mobile-zh', { capture: 'fullPage' });
    cy.contains('a', '查看 PR_9579 实测核心访存特征').should(
      'have.attr',
      'href',
      '/zh/ubenchx/core-memory-profiles',
    );
    cy.viewport(1280, 720);
  });
});
