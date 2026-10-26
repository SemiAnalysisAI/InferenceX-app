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

describe('Ascend core memory-access profiles', () => {
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

it('unpins core-profile cells by repeated click or Enter and clears them outside or by button', () => {
  cy.visit('/ubenchx/core-memory-profiles', dismiss);
  const panel = '[data-testid="profile-scalar_128MiB_cube_isolated"]';
  const value = '[data-testid="profile-scalar_128MiB_cube_isolated-value"]';
  const clear = '[data-testid="profile-scalar_128MiB_cube_isolated-clear"]';
  cy.get(`${panel} svg rect`).eq(1).click();
  cy.get(value).should('contain', 'Pinned core pair: 0 ↔ 1: 19.03');
  cy.get(`${panel} svg rect`).eq(2).click();
  cy.get(value).should('contain', 'Pinned core pair: 0 ↔ 2: 15.30');
  cy.get(`${panel} svg rect`).eq(2).click();
  cy.get(value).should('not.contain', 'core pair:');
  cy.get(clear).should('be.disabled');
  cy.get(`${panel} svg`)
    .trigger('keydown', { key: 'ArrowRight' })
    .trigger('keydown', { key: 'Enter' });
  cy.get(value).should('contain', 'Pinned core pair:');
  cy.get(`${panel} svg`).trigger('keydown', { key: 'Enter' });
  cy.get(clear).should('be.disabled');
  cy.get(`${panel} svg rect`).eq(1).click();
  cy.contains('h2', 'Core memory-access profiles').click();
  cy.get(clear).should('be.disabled');
  cy.get(`${panel} svg rect`).eq(1).click();
  cy.get(clear).click();
  cy.get(clear).should('be.disabled');
  cy.get(`${panel} svg rect`).eq(1).click();
  cy.get(`${panel} svg`).trigger('keydown', { key: 'Escape' });
  cy.get(clear).should('be.disabled');
});
