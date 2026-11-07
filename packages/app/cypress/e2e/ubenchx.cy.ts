import { TPC_SKYLINE_RUNS } from '@/components/ubenchx/tpc-skyline-data';

const TPC_SKYLINE_GPU_COUNT = Object.keys(TPC_SKYLINE_RUNS).length;

const dismissModal = {
  onBeforeLoad(win: Cypress.AUTWindow) {
    win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  },
};

describe('ubenchX hub and test routes', () => {
  it('opens /ubx on the mem-bw view with the Beta title badge and test selector', () => {
    cy.visit('/ubx', dismissModal);
    cy.url().should('include', '/ubx/mem-bw');
    cy.contains('h1', 'ubenchX microbenchmarks').should('be.visible');
    cy.get('h1 [data-slot="badge"]').should('have.text', 'Beta');
    cy.get('[data-testid="nav-link-ubenchx"]').should('have.attr', 'href', '/ubx/mem-bw');
    cy.get('[data-testid="ubenchx-test-select"]').should('contain', 'HBM bandwidth');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
    cy.contains('H100 SXM').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').should('contain', 'MBU');
    cy.contains('h2', 'Memory bandwidth utilization').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').click();
    cy.contains('[role="option"]', 'Bandwidth (TB/s)').click();
    cy.contains('h2', 'Bandwidth vs message size').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').should('contain', 'TB/s');
  });

  it('moves old /ubenchx links to /ubx with the query intact', () => {
    cy.visit('/ubenchx/mem-bw?x=1', dismissModal);
    cy.location().should((location) => {
      expect(location.pathname).to.eq('/ubx/mem-bw');
      expect(location.search).to.eq('?x=1');
    });
    cy.get('[data-testid="nav-link-ubenchx"]').should('have.attr', 'aria-current', 'page');
  });

  it('switches to the combined core profiles with the test selector', () => {
    cy.visit('/ubx/mem-bw', dismissModal);
    cy.contains('ubenchX').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').should('be.visible');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
    cy.get('link[rel="alternate"][hreflang="zh-CN"]')
      .invoke('attr', 'href')
      .should('include', '/zh/ubx/mem-bw');

    cy.get('[data-testid="ubenchx-test-select"]').click();
    cy.contains('[role="option"]', 'Core memory-access profiles').click();
    cy.url().should('include', '/ubx/core-memory-profiles');
    cy.get('[data-testid="sm-l2-heatmap"]').should('be.visible');
    cy.get('[data-testid="ubenchx-test-select"]').should('contain', 'Core memory-access profiles');
  });

  it('switches to the TPC Skyline table with the test selector', () => {
    cy.visit('/ubx/mem-bw', dismissModal);
    cy.get('[data-testid="ubenchx-test-select"]').click();
    cy.contains('[role="option"]', 'TPC Skyline').click();
    cy.url().should('include', '/ubx/tpc-skyline');
    cy.contains('h2', 'NVIDIA measured TPC groupings').should('be.visible');
    cy.get('[data-testid="tpc-skyline-table"] th').then(($th) => {
      expect([...$th].map((th) => th.textContent)).to.deep.equal([
        'Product',
        'Measured # of GPCs',
        'Measured # of SMs',
        'Measured TPC groupings',
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

  it('keeps a pinned sm-l2-distance tooltip on its cell while the pointer moves', () => {
    cy.visit('/ubx/sm-l2-distance', dismissModal);
    cy.get('[data-testid="sm-l2-heatmap"]').should('be.visible');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
    cy.get('link[rel="alternate"][hreflang="zh-CN"]')
      .invoke('attr', 'href')
      .should('include', '/zh/ubx/core-memory-profiles');

    cy.get('[data-testid="sm-l2-heatmap"] svg rect').last().as('overlay');
    cy.get('@overlay').click(520, 120, { force: true });
    cy.get('[data-testid="sm-l2-tooltip"]')
      .should('have.css', 'display', 'block')
      .invoke('text')
      .then((pinned) => {
        cy.get('@overlay').trigger('mousemove', 60, 60, { force: true });
        cy.get('[data-testid="sm-l2-tooltip"]')
          .should('have.css', 'display', 'block')
          .and('have.text', pinned);
      });
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
  it('shows Huawei before B200 by default and after restoring all hardware at /', () => {
    cy.visit('/ubx/core-memory-profiles', dismiss);
    cy.get('[data-testid="core-profile-hardware"]').should('contain.text', 'All hardware');
    assertProfileOrder();
    cy.get('[data-testid="core-profile-hardware"]').click();
    cy.get('[role="listbox"] [role="option"]').should(($options) => {
      expect([...$options].map((option) => option.textContent?.trim())).to.deep.eq([
        'All hardware',
        'Huawei 950PR',
        'B200 SXM',
      ]);
    });
    cy.contains('[role="option"]', 'B200 SXM').click();
    cy.get('[data-testid="ascend-core-profiles"]').should('not.exist');
    cy.get('[data-testid="sm-l2-heatmap"]').should('exist');
    cy.get('[data-testid="core-profile-hardware"]').click();
    cy.contains('[role="option"]', 'All hardware').click();
    cy.get('[data-testid="core-profile-hardware"]').should('contain.text', 'All hardware');
    assertProfileOrder();
  });

  it('navigates to all four profiles and inspects actual core IDs by keyboard', () => {
    cy.visit('/ubx/mem-bw', dismiss);
    cy.get('[data-testid="ubenchx-test-select"]').click();
    cy.contains('[role="option"]', 'Core memory-access profiles').click();
    cy.url().should('include', '/ubx/core-memory-profiles');
    cy.contains('SYS_CNT ticks are not clock64 cycles').should('be.visible');
    cy.get('[data-testid="profile-scalar_128MiB_cube_isolated"] svg')
      .focus()
      .trigger('keydown', { key: 'ArrowRight' });
    cy.get('[data-testid="profile-scalar_128MiB_cube_isolated-value"]').should(
      'contain',
      '0 ↔ 2: 15.30 SYS_CNT ticks',
    );
    cy.get('[data-testid="profile-scalar_128MiB_vector_concurrent"] svg').should('exist');
  });
});

it('omits idle selection controls from all core-profile panels on /', () => {
  cy.visit('/ubx/core-memory-profiles', dismiss);
  cy.get('[data-testid="ascend-core-profiles"] output')
    .should('have.length', 4)
    .each(($output) => {
      cy.wrap($output).should('be.empty').and('not.be.visible');
    });
  cy.get('[data-testid="ascend-core-profiles"] button').should('not.exist');
  cy.contains('Hover or focus a heatmap').should('not.exist');
});

it('unpins core-profile cells by repeated click or Enter and clears them outside or with Escape', () => {
  cy.visit('/ubx/core-memory-profiles', dismiss);
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
  cy.contains('h1', 'ubenchX microbenchmarks').click();
  cy.get(value).should('be.empty').and('not.be.visible');
  cy.get(`${panel} svg rect`).eq(1).click();
  cy.get(`${panel} svg`).trigger('keydown', { key: 'Escape' });
  cy.get(value).should('be.empty').and('not.be.visible');
});

it('filters both devices on one page and preserves their API values and units', () => {
  cy.visit('/ubx/core-memory-profiles', dismiss);
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
  cy.visit('/zh/ubx/sm-l2-distance', dismiss);
  cy.location('pathname').should('equal', '/zh/ubx/core-memory-profiles');
  cy.viewport(390, 844);
  cy.get('[data-testid="core-profile-hardware"]').should('contain', '全部硬件');
  cy.get('[data-testid="sm-l2-heatmap"]').should('exist');
  cy.get('[data-testid="ascend-core-profiles"]').should('exist');
});

describe('Huawei copy-bandwidth evidence', () => {
  it('renders Huawei 950PR and qualifies the graph timing in English and Chinese', () => {
    cy.visit('/ubx/mem-bw', dismiss);
    cy.contains('Huawei 950PR').should('be.visible');
    cy.contains('910B3').should('not.exist');
    cy.get('circle.point')
      .filter((_, el) => {
        const d = (el as unknown as { __data__: { gpuKey: string; bytes: number } }).__data__;
        return d.gpuKey === 'Huawei 950PR' && d.bytes < 4096;
      })
      .should('have.length', 9);
    cy.get('[data-testid="ubenchx-metric-select"]').click();
    cy.contains('[role="option"]', 'Bandwidth (TB/s)').click();
    cy.contains('h2', 'Bandwidth vs message size').should('be.visible');
    cy.visit('/zh/ubx/mem-bw', dismiss);
    cy.contains('Huawei 950PR').should('be.visible');
    cy.contains('910B3').should('not.exist');
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
  cy.visit('/ubx/mem-bw', dismiss);
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
      cy.get('#ubenchx-latency [data-testid="d3-chart-svg"]').then(($svg) => {
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
    cy.visit('/ubx/tpc-skyline', dismissModal);
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
    cy.contains('a', 'View measured PR_9579 core profiles').click();
    cy.url().should('include', '/ubx/core-memory-profiles');
    cy.get('[data-testid="ascend-core-profiles"]').should('be.visible');
  });

  it('keeps Chinese mobile configuration columns accessible by scrolling', () => {
    cy.viewport(390, 844);
    cy.visit('/zh/ubx/tpc-skyline', dismissModal);
    cy.get('[data-testid="ubenchx-test-select"]').should('contain', 'TPC Skyline 与 SKU 配置');
    cy.get('[data-testid="huawei-sku-configurations"]').scrollIntoView();
    cy.contains('h2', 'Huawei 950PR SKU 配置').should('be.visible');
    cy.get('[data-sku="PR_957c"]').should('contain', '84').and('contain', '112');
    cy.get('[data-testid="huawei-sku-configurations"] [role="region"]').as('tableRegion');
    cy.get('@tableRegion').then(($region) => {
      expect($region[0].scrollWidth).to.be.greaterThan($region[0].clientWidth);
    });
    cy.get('@tableRegion').scrollTo('right');
    cy.contains('[data-testid="huawei-sku-table"] th', '虚拟化选项').should('be.visible');
    cy.get('@tableRegion').scrollTo('left');
    cy.contains('a', '查看 PR_9579 实测核心访存特征').should(
      'have.attr',
      'href',
      '/zh/ubx/core-memory-profiles',
    );
    cy.viewport(1280, 720);
  });
});
