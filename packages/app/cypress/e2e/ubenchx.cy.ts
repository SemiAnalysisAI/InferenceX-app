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
    cy.get('[data-testid="nav-link-ubenchx"]').should('have.attr', 'href', '/ubenchx');
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

  it('switches to sm-l2-distance with the test selector', () => {
    cy.visit('/ubenchx/mem-bw', dismissModal);
    cy.contains('ubenchX').should('be.visible');
    cy.get('[data-testid="ubenchx-metric-select"]').should('be.visible');
    cy.get('meta[name="robots"]').should('have.attr', 'content').and('contain', 'noindex');
    cy.get('link[rel="alternate"][hreflang="zh-CN"]')
      .invoke('attr', 'href')
      .should('include', '/zh/ubenchx/mem-bw');

    cy.get('[data-testid="ubenchx-test-select"]').click();
    cy.contains('[role="option"]', 'SM-SM L2 Latency Difference').click();
    cy.url().should('include', '/ubenchx/sm-l2-distance');
    cy.get('[data-testid="sm-l2-heatmap"]').should('be.visible');
    cy.get('[data-testid="ubenchx-test-select"]').should('contain', 'SM-SM L2 Latency Difference');
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
      .should('include', '/zh/ubenchx/sm-l2-distance');

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
