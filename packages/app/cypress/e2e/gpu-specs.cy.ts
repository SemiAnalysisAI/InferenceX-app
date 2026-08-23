describe('GPU Specs Tab', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/gpu-specs');
    // Wait for GPU Specs tab content to be present in the DOM
    cy.get('h2').contains('Chip Specifications').should('exist');
  });

  it('tab renders with correct title', () => {
    cy.get('h2').should('contain.text', 'Chip Specifications');
  });

  it('specs table is visible with all GPUs', () => {
    // Dismiss any open dialogs first
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
  });

  it('table has correct column headers', () => {
    cy.get('th').eq(0).should('contain.text', 'Chip');
    cy.get('th').eq(1).should('contain.text', 'Memory');
    cy.get('th').eq(2).should('contain.text', 'Mem BW');
    cy.get('th').eq(3).should('contain.text', 'FP4');
    cy.get('th').eq(4).should('contain.text', 'FP8');
    cy.get('th').eq(5).should('contain.text', 'BF16');
  });

  it('NVIDIA and AMD vendor badges are displayed', () => {
    cy.get('table').scrollIntoView();
    cy.get('table').within(() => {
      cy.contains('NVIDIA').should('exist');
      cy.contains('AMD').should('exist');
    });
  });

  it('footnote about dense TFLOPS is visible', () => {
    cy.contains('Dense tensor core peak TFLOP/s').should('be.visible');
  });

  it('scale-out topology diagrams section is visible', () => {
    cy.contains('Scale-Out Topology Diagrams').scrollIntoView().should('be.visible');
  });

  it('topology diagrams render for GPUs with scale-out', () => {
    const gpusWithTopology = [
      'h100-sxm',
      'h200-sxm',
      'b200-sxm',
      'b300-sxm',
      'mi300x',
      'mi325x',
      'mi355x',
    ];

    for (const gpu of gpusWithTopology) {
      cy.get(`[data-testid="topology-${gpu}"]`).should('exist');
    }
  });

  it('NVL72 GPUs do not have topology diagrams', () => {
    cy.get('[data-testid="topology-gb200-nvl72"]').should('not.exist');
    cy.get('[data-testid="topology-gb300-nvl72"]').should('not.exist');
  });

  it('topology diagram SVGs contain GPU, switch, and server labels', () => {
    cy.get('[data-testid="topology-h200-sxm"] svg')
      .should('exist')
      .within(() => {
        cy.contains('Chip 0').should('exist');
        cy.contains('Chip 7').should('exist');
        cy.contains('L0').should('exist');
        cy.contains('S0').should('exist');
        cy.contains('Server 1').should('exist');
      });
  });

  it('B200 topology shows multiple pods', () => {
    cy.get('[data-testid="topology-b200-sxm"] svg')
      .should('exist')
      .within(() => {
        cy.contains('Pod 1').should('exist');
        cy.contains('Pod 2').should('exist');
      });
  });

  it('scale out topology column cells are clickable', () => {
    cy.get('table').scrollIntoView();
    cy.get('table').contains('button', '8-rail optimized').first().click({ force: true });
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('body').type('{esc}');
  });

  it('scale-up topology diagrams section is visible', () => {
    cy.contains('Scale-Up Topology Diagrams').scrollIntoView().should('be.visible');
  });

  it('scale-up topology diagrams render for all GPUs', () => {
    const allGpus = [
      'h100-sxm',
      'h200-sxm',
      'b200-sxm',
      'b300-sxm',
      'gb200-nvl72',
      'gb300-nvl72',
      'mi300x',
      'mi325x',
      'mi355x',
    ];

    for (const gpu of allGpus) {
      cy.get(`[data-testid="scaleup-topology-${gpu}"]`).should('exist');
    }
  });

  it('scale-up topology diagram SVGs contain GPU labels', () => {
    cy.get('[data-testid="scaleup-topology-h200-sxm"] svg')
      .should('exist')
      .within(() => {
        cy.contains('Chip 0').should('exist');
        cy.contains('NVSwitch').should('exist');
      });
  });

  it('AMD scale-up topology shows mesh layout', () => {
    cy.get('[data-testid="scaleup-topology-mi300x"] svg')
      .should('exist')
      .within(() => {
        cy.contains('Chip 0').should('exist');
        cy.contains('Chip 7').should('exist');
      });
  });

  it('scale up topology column cells are clickable', () => {
    cy.get('table').scrollIntoView();
    cy.get('table').contains('button', 'Switched 4-rail Optimized').first().click({ force: true });
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[role="dialog"]').should('contain.text', 'Scale-Up Topology');
    cy.get('body').type('{esc}');
  });

  it('hides scale-out topology logos with the unofficial-domain notice', () => {
    cy.contains('This deployment is not hosted at').should('be.visible');
    cy.get('[data-testid="topology-h200-sxm"] defs pattern[id^="logo-scaleout-"]').should(
      'not.exist',
    );
  });

  it('hides switched scale-up topology logos on unofficial domains', () => {
    cy.get('[data-testid="scaleup-topology-h200-sxm"] defs pattern[id^="logo-scaleup-sw-"]').should(
      'not.exist',
    );
  });

  it('hides mesh scale-up topology logos on unofficial domains', () => {
    cy.get('[data-testid="scaleup-topology-mi300x"] defs pattern[id^="logo-scaleup-mesh-"]').should(
      'not.exist',
    );
  });

  it('hides NVL72 scale-up topology logos on unofficial domains', () => {
    cy.get(
      '[data-testid="scaleup-topology-gb200-nvl72"] defs pattern[id^="logo-scaleup-nvl72-"]',
    ).should('not.exist');
  });
});

describe('GPU Specs Bar Chart View', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/gpu-specs');
    cy.get('h2').contains('Chip Specifications').should('exist');
    // Dismiss any Radix Dialog scroll locks from topology diagram components
    cy.get('body').then(($body) => {
      if ($body.attr('data-scroll-locked')) {
        cy.get('body').type('{esc}', { force: true });
        cy.get('body').should('not.have.attr', 'data-scroll-locked');
      }
    });
  });

  it('view toggle is visible with Table, Chart, and Radar options', () => {
    cy.get('[data-testid="gpu-specs-view-toggle"]').should('be.visible');
    cy.get('[data-testid="gpu-specs-table-view-btn"]').should('contain.text', 'Table');
    cy.get('[data-testid="gpu-specs-chart-view-btn"]').should('contain.text', 'Chart');
    cy.get('[data-testid="gpu-specs-radar-view-btn"]').should('contain.text', 'Radar');
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

  it('bar chart renders SVG with bars', () => {
    // Already in chart view from previous test
    cy.get('[data-testid="gpu-specs-bar-chart"] svg').should('exist');
    cy.get('[data-testid="gpu-specs-bar-chart"] svg .bar').should('have.length.at.least', 5);
  });

  it('metric selector is visible in chart view', () => {
    cy.get('[data-testid="gpu-specs-metric-select"]').should('be.visible');
  });

  it('vendor legend is visible in chart view', () => {
    cy.get('[data-testid="gpu-specs-bar-chart"]').within(() => {
      cy.contains('NVIDIA').should('be.visible');
      cy.contains('AMD').should('be.visible');
    });
  });

  it('FP4 metric excludes GPUs without FP4 support', () => {
    // Change metric to FP4
    cy.get('[data-testid="gpu-specs-metric-select"]').click({ force: true });
    cy.get('[data-slot="select-item"]').contains('FP4').click({ force: true });
    // FP4 should show fewer bars (H100, H200, MI300X, MI325X excluded)
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

  it('radar chart renders SVG with polygons and dots', () => {
    cy.get('[data-testid="gpu-specs-radar-chart"] svg').should('exist');
    cy.get('[data-testid="gpu-specs-radar-chart"] svg .radar-polygon').should(
      'have.length.at.least',
      5,
    );
    cy.get('[data-testid="gpu-specs-radar-chart"] svg .radar-dot').should(
      'have.length.at.least',
      20,
    );
  });

  it('sidebar legend with GPU items is visible', () => {
    cy.get('[data-testid="gpu-specs-radar-chart"] .sidebar-legend').should('exist');
    cy.get('[data-testid="gpu-specs-radar-chart"] .sidebar-legend').should(
      'contain.text',
      'H100 SXM',
    );
    cy.get('[data-testid="gpu-specs-radar-chart"] .sidebar-legend').should(
      'contain.text',
      'MI355X',
    );
  });

  it('toggling a GPU off via sidebar legend removes its polygon', () => {
    // Count initial polygons (all 9 GPUs)
    cy.get('[data-testid="gpu-specs-radar-chart"] svg .radar-polygon').should('have.length', 9);
    // Toggle off H100 SXM by clicking its legend label
    cy.get('[data-testid="gpu-specs-radar-chart"] .sidebar-legend')
      .contains('H100 SXM')
      .click({ force: true });
    cy.get('[data-testid="gpu-specs-radar-chart"] svg .radar-polygon').should('have.length', 8);
  });

  it('Reset filter restores all GPUs', () => {
    // GPU already toggled off from previous test
    cy.get('[data-testid="gpu-specs-radar-chart"] .sidebar-legend')
      .contains('Reset filter')
      .click({ force: true });
    cy.get('[data-testid="gpu-specs-radar-chart"] svg .radar-polygon').should('have.length', 9);
  });

  it('sidebar legend shows GPU names without vendor grouping', () => {
    cy.get('[data-testid="gpu-specs-radar-chart"] .sidebar-legend').within(() => {
      // No vendor group titles should be present
      cy.get('.gpu-legend-title').should('not.exist');
      // GPU names should be listed directly
      cy.contains('H100 SXM').should('exist');
      cy.contains('MI355X').should('exist');
    });
  });

  it('hides the radar chart logo on unofficial domains', () => {
    cy.contains('This deployment is not hosted at').should('be.visible');
    cy.get('[data-testid="gpu-specs-radar-chart"] defs pattern[id^="logo-pattern"]').should(
      'not.exist',
    );
  });

  it('normalization note is visible', () => {
    cy.get('[data-testid="gpu-specs-radar-chart"]').should('contain.text', 'Values are normalized');
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

  it('tab switcher activates GPU Specs', () => {
    cy.get('[data-testid="tab-trigger-gpu-specs"]').click();
    cy.url().should('include', '/gpu-specs');
    cy.get('h2').should('contain.text', 'Chip Specifications');
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

  it('scale-out topology dialog has navigation arrows', () => {
    cy.get('table').scrollIntoView();
    cy.get('table').contains('button', '8-rail optimized').first().click({ force: true });
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[data-testid="topology-nav-prev"]').should('be.visible');
    cy.get('[data-testid="topology-nav-next"]').should('be.visible');
    cy.get('[role="dialog"]').should('contain.text', '/ 7');
    cy.get('body').type('{esc}');
    cy.get('[role="dialog"]').should('not.exist');
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

  it('scale-up topology dialog has navigation arrows', () => {
    cy.get('table').scrollIntoView();
    cy.get('table').contains('button', 'Switched 4-rail Optimized').first().click({ force: true });
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[data-testid="scaleup-topology-nav-prev"]').should('be.visible');
    cy.get('[data-testid="scaleup-topology-nav-next"]').should('be.visible');
    cy.get('[role="dialog"]').should('contain.text', '/ 9');
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
    cy.get('[data-testid="topology-h200-sxm"] svg').should('contain.text', '芯片 0');
    cy.get('[data-testid="topology-h200-sxm"] button').click({ force: true });
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
    cy.get('[data-testid="gpu-specs-bar-d3-chart"] svg .bar')
      .first()
      .trigger('mouseenter', { force: true });
    cy.get('[data-chart-tooltip]:visible').should('contain.text', '显存容量：');
    cy.get('[data-testid="gpu-specs-radar-view-btn"]').click({ force: true });
    cy.get('[data-testid="gpu-specs-radar-chart"] svg').should('contain.text', '显存容量');
    cy.get('[data-testid="gpu-specs-radar-chart"]').should('contain.text', '归一化');
    cy.get('[data-testid="gpu-specs-radar-chart"] svg .radar-dot')
      .first()
      .trigger('mouseenter', { force: true });
    cy.get('[data-chart-tooltip]:visible').should('contain.text', '显存容量：');
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

  it('keeps the localized table contained at 390px', () => {
    cy.viewport(390, 844);
    cy.get('[data-testid="gpu-specs-view-toggle"]').should('have.attr', 'aria-label', '显示模式');
    cy.get('table').parents('.overflow-x-auto').first().should('have.css', 'overflow-x', 'auto');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });
});
