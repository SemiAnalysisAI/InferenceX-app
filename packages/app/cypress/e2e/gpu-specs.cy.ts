function hoverGpuSpecsPointAndAssertTooltip(
  pointSelector: string,
  tooltipSelector: string,
  expectedTexts: string[],
  attempts = 20,
) {
  cy.get(pointSelector).first().trigger('mouseenter', { force: true });
  cy.document().then((doc) => {
    const tip = doc.querySelector<HTMLElement>(tooltipSelector);
    if (tip && tip.style.display === 'block') {
      for (const text of expectedTexts) {
        expect(tip.textContent, `tooltip ${tooltipSelector}`).to.include(text);
      }
    } else if (attempts > 0) {
      cy.wait(200);
      hoverGpuSpecsPointAndAssertTooltip(
        pointSelector,
        tooltipSelector,
        expectedTexts,
        attempts - 1,
      );
    } else {
      throw new Error(`tooltip ${tooltipSelector} never became visible`);
    }
  });
}

describe('GPU Specs Tab', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/gpu-specs');
    cy.get('h2').contains('Chip Specifications').should('exist');
  });

  it('specs table is visible with all GPUs', () => {
    cy.get('body').then(($body) => {
      if ($body.find('[role="dialog"]').length > 0) {
        cy.get('body').type('{esc}');
        cy.get('[role="dialog"]').should('not.exist');
      }
    });

    cy.get('table').should('exist');

    const gpuNames = [
      'H100 SXM',
      'H200 SXM',
      'B200 SXM',
      'B300 SXM',
      'GB200 NVL72',
      'GB300 NVL72',
      'MI300X',
      'MI325X',
      'MI355X',
    ];

    for (const name of gpuNames) {
      cy.get('table').contains(name).should('exist');
    }

    cy.get('[data-testid="topology-gb200-nvl72"]').should('not.exist');
    cy.get('[data-testid="topology-gb300-nvl72"]').should('not.exist');
  });

  it('matches the public API for installed NVL72 NICs and MI355X fabric', () => {
    cy.request('/api/v1/views/gpu-specs?metric=scaleOutBandwidth').then(({ body }) => {
      for (const [name, nic, bandwidth] of [
        ['GB200 NVL72', 'ConnectX-7 400G', 400],
        ['GB300 NVL72', 'ConnectX-8 800G', 800],
      ] as const) {
        cy.contains('table tr', name)
          .should('contain.text', nic)
          .and('contain.text', `${bandwidth} Gbit/s`);
        const chip = body.chips.find((row: { name: string }) => row.name === name);
        expect(chip.nic).to.equal(nic);
        expect(chip.scaleOutTopology).to.equal(null);
        expect(body.ranking.find((row: { chip: string }) => row.chip === chip.key).value).to.equal(
          bandwidth,
        );
      }
      cy.contains('table tr', 'MI355X').should('contain.text', '4th Gen Infinity Fabric');
    });
  });

  it('preserves the English expand button label and identifies the scale-out SVG', () => {
    cy.get('[data-testid="topology-h200-sxm"] button').should(
      'have.attr',
      'aria-label',
      'Expand H200 SXM topology diagram',
    );
    cy.get('[data-testid="topology-h200-sxm"] svg')
      .should('have.attr', 'aria-label')
      .and('contain', 'H200 SXM 8-rail optimized scale-out topology diagram');
  });

  it('hides scale-out topology logos with the unofficial-domain notice', () => {
    cy.contains('This deployment is not hosted at').should('be.visible');
    cy.get('[data-testid="topology-h200-sxm"] defs pattern[id^="logo-scaleout-"]').should(
      'not.exist',
    );
  });
});

describe('GPU Specs Bar Chart View', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/gpu-specs');
    cy.get('h2').contains('Chip Specifications').should('exist');
    cy.get('body').then(($body) => {
      if ($body.attr('data-scroll-locked')) {
        cy.get('body').type('{esc}', { force: true });
        cy.get('body').should('not.have.attr', 'data-scroll-locked');
      }
    });
  });

  it('table view is active by default', () => {
    cy.get('[data-testid="gpu-specs-table-view-btn"]').should('have.attr', 'aria-selected', 'true');
    cy.get('[data-testid="gpu-specs-chart-view-btn"]').should(
      'have.attr',
      'aria-selected',
      'false',
    );
    cy.get('table').should('exist');
    cy.get('[data-testid="gpu-specs-bar-chart"]').should('not.exist');
  });

  it('clicking Chart button switches to bar chart view', () => {
    cy.get('[data-testid="gpu-specs-chart-view-btn"]').click({ force: true });
    cy.get('[data-testid="gpu-specs-bar-chart"]').should('be.visible');
    cy.get('table').should('not.exist');
    cy.get('[data-testid="gpu-specs-chart-view-btn"]').should('have.attr', 'aria-selected', 'true');
  });

  it('FP4 metric excludes GPUs without FP4 support', () => {
    cy.get('[data-testid="gpu-specs-metric-select"]').click({ force: true });
    cy.get('[data-slot="select-item"]').contains('FP4').click({ force: true });
    cy.get('[data-testid="gpu-specs-bar-chart"] svg .bar').should('have.length', 5);
    cy.get('[data-testid="gpu-specs-bar-chart"]').should('contain.text', 'without FP4 support');
  });

  it('switching back to table view restores the table', () => {
    cy.get('[data-testid="gpu-specs-table-view-btn"]').click({ force: true });
    cy.get('table').should('exist');
    cy.get('[data-testid="gpu-specs-bar-chart"]').should('not.exist');
  });
});

describe('GPU Specs Radar Chart View', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/gpu-specs');
    cy.get('h2').contains('Chip Specifications').should('exist');
    cy.get('body').then(($body) => {
      if ($body.attr('data-scroll-locked')) {
        cy.get('body').type('{esc}', { force: true });
        cy.get('body').should('not.have.attr', 'data-scroll-locked');
      }
    });
  });

  it('clicking Radar button switches to radar chart view', () => {
    cy.get('[data-testid="gpu-specs-radar-view-btn"]').click({ force: true });
    cy.get('[data-testid="gpu-specs-radar-chart"]').should('be.visible');
    cy.get('table').should('not.exist');
    cy.get('[data-testid="gpu-specs-bar-chart"]').should('not.exist');
    cy.get('[data-testid="gpu-specs-radar-view-btn"]').should('have.attr', 'aria-selected', 'true');
  });

  it('toggling a GPU off via sidebar legend removes its polygon', () => {
    cy.get('[data-testid="gpu-specs-radar-chart"] svg .radar-polygon').should('have.length', 9);
    cy.get('[data-testid="gpu-specs-radar-chart"] .sidebar-legend')
      .contains('H100 SXM')
      .click({ force: true });
    cy.get('[data-testid="gpu-specs-radar-chart"] svg .radar-polygon').should('have.length', 8);

    cy.get('[data-testid="gpu-specs-radar-chart"] .sidebar-legend')
      .contains('Reset filter')
      .click({ force: true });
    cy.get('[data-testid="gpu-specs-radar-chart"] svg .radar-polygon').should('have.length', 9);
  });

  it('hides the radar chart logo on unofficial domains', () => {
    cy.contains('This deployment is not hosted at').should('be.visible');
    cy.get('[data-testid="gpu-specs-radar-chart"] defs pattern[id^="logo-pattern"]').should(
      'not.exist',
    );
  });

  it('switching from radar back to table restores table', () => {
    cy.get('[data-testid="gpu-specs-table-view-btn"]').click({ force: true });
    cy.get('table').should('exist');
    cy.get('[data-testid="gpu-specs-radar-chart"]').should('not.exist');
  });
});

describe('GPU Specs Navigation', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
    cy.get('[data-testid="chart-section-tabs"]').should('be.visible');
  });

  it('footer link opens GPU Specs and the tab strip shows no active tab', () => {
    cy.get('[data-testid="tab-trigger-gpu-specs"]').should('not.exist');
    cy.get('[data-testid="footer-link-gpu-specs"]').scrollIntoView().click();
    cy.url().should('include', '/gpu-specs');
    cy.get('h2').should('contain.text', 'Chip Specifications');
    cy.get('[data-testid="chart-section-tabs"] [data-tab-active="true"]').should('not.exist');
  });
});

describe('Topology Dialog Navigation', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/gpu-specs');
    cy.get('h2').contains('Chip Specifications').should('exist');
  });

  it('scale-out topology dialog next button navigates to next GPU', () => {
    cy.get('table').scrollIntoView();
    cy.get('table').contains('button', '8-rail optimized').first().click({ force: true });
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[role="dialog"]').should('contain.text', 'H100 SXM Scale-Out Topology');
    cy.get('[data-testid="topology-nav-next"]').click({ force: true });
    cy.get('[role="dialog"]').should('contain.text', 'H200 SXM Scale-Out Topology');
    cy.get('[role="dialog"]').should('contain.text', '2 / 7');
    cy.get('body').type('{esc}');
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('scale-out topology dialog prev button navigates to previous GPU', () => {
    cy.get('table').scrollIntoView();
    cy.get('table').contains('button', '8-rail optimized').first().click({ force: true });
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[data-testid="topology-nav-prev"]').click({ force: true });
    cy.get('[role="dialog"]').should('contain.text', 'MI355X Scale-Out Topology');
    cy.get('[role="dialog"]').should('contain.text', '7 / 7');
    cy.get('body').type('{esc}');
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('scale-out topology dialog supports keyboard arrow navigation', () => {
    cy.get('table').scrollIntoView();
    cy.get('table').contains('button', '8-rail optimized').first().click({ force: true });
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[role="dialog"]').should('contain.text', 'H100 SXM Scale-Out Topology');
    cy.get('body').type('{rightArrow}');
    cy.get('[role="dialog"]').should('contain.text', 'H200 SXM Scale-Out Topology');
    cy.get('body').type('{leftArrow}');
    cy.get('[role="dialog"]').should('contain.text', 'H100 SXM Scale-Out Topology');
    cy.get('body').type('{esc}');
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('scale-up topology dialog next button navigates to next GPU', () => {
    cy.get('table').scrollIntoView();
    cy.get('table').contains('button', 'Switched 4-rail Optimized').first().click({ force: true });
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[role="dialog"]').should('contain.text', 'H100 SXM Scale-Up Topology');
    cy.get('[data-testid="scaleup-topology-nav-next"]').click({ force: true });
    cy.get('[role="dialog"]').should('contain.text', 'H200 SXM Scale-Up Topology');
    cy.get('[role="dialog"]').should('contain.text', '2 / 9');
    cy.get('body').type('{esc}');
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('scale-up topology dialog supports keyboard arrow navigation', () => {
    cy.get('table').scrollIntoView();
    cy.get('table').contains('button', 'Switched 4-rail Optimized').first().click({ force: true });
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[role="dialog"]').should('contain.text', 'H100 SXM Scale-Up Topology');
    cy.get('body').type('{rightArrow}');
    cy.get('[role="dialog"]').should('contain.text', 'H200 SXM Scale-Up Topology');
    cy.get('body').type('{leftArrow}');
    cy.get('[role="dialog"]').should('contain.text', 'H100 SXM Scale-Up Topology');
    cy.get('body').type('{esc}');
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('scale-up topology dialog wraps around from last to first', () => {
    cy.get('table').scrollIntoView();
    cy.get('table').contains('button', 'Switched 4-rail Optimized').first().click({ force: true });
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[data-testid="scaleup-topology-nav-prev"]').click({ force: true });
    cy.get('[role="dialog"]').should('contain.text', 'MI355X Scale-Up Topology');
    cy.get('[role="dialog"]').should('contain.text', '9 / 9');
    cy.get('[data-testid="scaleup-topology-nav-next"]').click({ force: true });
    cy.get('[role="dialog"]').should('contain.text', 'H100 SXM Scale-Up Topology');
    cy.get('[role="dialog"]').should('contain.text', '1 / 9');
    cy.get('body').type('{esc}');
    cy.get('[role="dialog"]').should('not.exist');
  });
});

describe('GPU Specs Chinese route', () => {
  beforeEach(() => {
    cy.viewport(375, 812);
    cy.visit('/zh/gpu-specs', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="gpu-specs-content"]').should('be.visible');
  });

  it('localizes view accessibility, topology values, SVG labels, and dialogs', () => {
    cy.get('[data-testid="gpu-specs-view-toggle"]').should('have.attr', 'aria-label', '显示模式');
    cy.get('table').contains('button', '8-rail 优化拓扑').should('exist');
    cy.get('[data-testid="topology-h200-sxm"] svg')
      .should('contain.text', '芯片 0')
      .and('have.attr', 'aria-label')
      .and('contain', 'H200 SXM 8-rail 优化拓扑 横向扩展拓扑图');
    cy.get('[data-testid="topology-h200-sxm"] button')
      .should('have.attr', 'aria-label', '展开 H200 SXM 横向扩展拓扑图')
      .click({ force: true });
    cy.get('[role="dialog"]')
      .should('contain.text', 'H200 SXM 横向扩展拓扑')
      .and('contain.text', 'Leaf 交换机：');
    cy.get('[data-testid="topology-nav-next"]').should('have.attr', 'aria-label', '下一款芯片');
    cy.get('[role="dialog"] .overflow-x-auto').then(($scroller) => {
      expect($scroller[0].scrollWidth).to.be.greaterThan($scroller[0].clientWidth);
    });
    cy.get('body').type('{esc}');
  });

  it('localizes chart and radar registries while preserving technical units', () => {
    cy.get('[data-testid="gpu-specs-chart-view-btn"]').click({ force: true });
    cy.get('[data-testid="gpu-specs-bar-chart"]')
      .should('contain.text', '指标：')
      .and('contain.text', '悬停柱形可查看详情');
    cy.get('[data-testid="gpu-specs-bar-d3-chart"] svg').should('contain.text', '显存容量 (GB)');
    hoverGpuSpecsPointAndAssertTooltip(
      '[data-testid="gpu-specs-bar-d3-chart"] svg .bar',
      '[data-chart-tooltip="gpu-specs-bar-chart"]',
      ['显存容量：'],
    );
    cy.get('[data-testid="gpu-specs-radar-view-btn"]').click({ force: true });
    cy.get('[data-testid="gpu-specs-radar-chart"] svg').should('contain.text', '显存容量');
    cy.get('[data-testid="gpu-specs-radar-chart"]').should('contain.text', '归一化');
    hoverGpuSpecsPointAndAssertTooltip(
      '[data-testid="gpu-specs-radar-chart"] svg .radar-dot',
      '[data-chart-tooltip="gpu-radar-chart"]',
      ['显存容量：'],
    );
  });

  it('supports table, topology, chart, and radar navigation at 1440px', () => {
    cy.viewport(1440, 900);
    cy.reload();
    cy.get('[data-testid="gpu-specs-content"]').should('be.visible');
    cy.get('[data-testid="topology-h200-sxm"] button').click({ force: true });
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[data-testid="topology-nav-next"]').click();
    cy.get('body').type('{esc}');
    cy.get('[data-testid="gpu-specs-chart-view-btn"]').click();
    cy.get('[data-testid="gpu-specs-bar-chart"]').should('be.visible');
    cy.get('[data-testid="gpu-specs-radar-view-btn"]').click();
    cy.get('[data-testid="gpu-specs-radar-chart"]').should('be.visible');
  });

  it('keeps wide content internally scrollable and emits hreflang metadata', () => {
    cy.get('table')
      .parents('.overflow-x-auto')
      .first()
      .then(($scroller) => {
        expect($scroller[0].scrollWidth).to.be.greaterThan($scroller[0].clientWidth);
      });
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
    cy.get('link[rel="alternate"][hreflang="en"]')
      .invoke('attr', 'href')
      .should('include', '/gpu-specs');
    cy.get('link[rel="alternate"][hreflang="zh-CN"]')
      .invoke('attr', 'href')
      .should('include', '/zh/gpu-specs');
  });
});

describe('Chinese chip specification copy', () => {
  for (const width of [1280, 390]) {
    it(`preserves ownership pricing and throughput units at ${width}px`, () => {
      cy.viewport(width, 844);
      cy.visit('/zh/chips/b300-vs-b200');
      cy.contains('超大规模云厂商批量采购').should('exist');
      cy.contains('B300 为 $2.26/hr').should('exist');
      cy.contains('每秒 token 数').should('exist');
      cy.get('main').should('not.contain.text', '小时租价');
      cy.contains('B300 为 $2.26/hr').scrollIntoView();
      cy.screenshot(`chip-pricing-zh-${width}`, { capture: 'viewport' });
      cy.visit('/zh/chips/gb300-nvl72');
      cy.contains('ConnectX-8 800G').should('exist');
      cy.contains('72 颗芯片').should('exist');
      cy.contains('显存带宽').should('exist');
      cy.visit('/zh/gpu-specs');
      cy.contains('table tr', 'GB200 NVL72').should('contain.text', 'ConnectX-7 400G');
      cy.contains('table tr', 'GB300 NVL72').should('contain.text', 'ConnectX-8 800G');
      cy.contains('table tr', 'MI355X').should('contain.text', '4th Gen Infinity Fabric');
    });
  }
});
