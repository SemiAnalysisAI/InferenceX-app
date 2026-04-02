describe('GPU Specs Tab', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/gpu-specs');
    // Wait for GPU Specs tab content to be present in the DOM
    cy.get('h2').contains('GPU Specifications').should('exist');
  });

  it('tab renders with correct title', () => {
    cy.get('h2').should('contain.text', 'GPU Specifications');
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
    cy.get('th').eq(0).should('contain.text', 'GPU');
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
        cy.contains('GPU 0').should('exist');
        cy.contains('GPU 7').should('exist');
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
        cy.contains('GPU 0').should('exist');
        cy.contains('NVSwitch').should('exist');
      });
  });

  it('AMD scale-up topology shows mesh layout', () => {
    cy.get('[data-testid="scaleup-topology-mi300x"] svg')
      .should('exist')
      .within(() => {
        cy.contains('GPU 0').should('exist');
        cy.contains('GPU 7').should('exist');
      });
  });

  it('scale up topology column cells are clickable', () => {
    cy.get('table').scrollIntoView();
    cy.get('table').contains('button', 'Switched 4-rail Optimized').first().click({ force: true });
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[role="dialog"]').should('contain.text', 'Scale-Up Topology');
    cy.get('body').type('{esc}');
  });

  it('scale-out topology diagrams have logo watermark', () => {
    cy.get('[data-testid="topology-h200-sxm"] svg')
      .should('exist')
      .within(() => {
        cy.get('defs pattern[id^="logo-scaleout-"]').should('exist');
        cy.get('defs pattern[id^="logo-scaleout-"] image')
          .should('have.attr', 'href', '/brand/logo-color.webp')
          .and('have.attr', 'opacity', '0.1');
      });
  });

  it('scale-up switched topology diagrams have logo watermark', () => {
    cy.get('[data-testid="scaleup-topology-h200-sxm"] svg')
      .should('exist')
      .within(() => {
        cy.get('defs pattern[id^="logo-scaleup-sw-"]').should('exist');
        cy.get('defs pattern[id^="logo-scaleup-sw-"] image')
          .should('have.attr', 'href', '/brand/logo-color.webp')
          .and('have.attr', 'opacity', '0.1');
      });
  });

  it('scale-up mesh topology diagrams have logo watermark', () => {
    cy.get('[data-testid="scaleup-topology-mi300x"] svg')
      .should('exist')
      .within(() => {
        cy.get('defs pattern[id^="logo-scaleup-mesh-"]').should('exist');
        cy.get('defs pattern[id^="logo-scaleup-mesh-"] image')
          .should('have.attr', 'href', '/brand/logo-color.webp')
          .and('have.attr', 'opacity', '0.1');
      });
  });

  it('scale-up NVL72 topology diagrams have logo watermark', () => {
    cy.get('[data-testid="scaleup-topology-gb200-nvl72"] svg')
      .should('exist')
      .within(() => {
        cy.get('defs pattern[id^="logo-scaleup-nvl72-"]').should('exist');
        cy.get('defs pattern[id^="logo-scaleup-nvl72-"] image')
          .should('have.attr', 'href', '/brand/logo-color.webp')
          .and('have.attr', 'opacity', '0.1');
      });
  });
});

describe('GPU Specs Bar Chart View', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/gpu-specs');
    cy.get('h2').contains('GPU Specifications').should('exist');
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
    cy.get('h2').contains('GPU Specifications').should('exist');
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

  it('radar chart has logo watermark', () => {
    cy.get('[data-testid="gpu-specs-radar-chart"] svg')
      .first()
      .within(() => {
        cy.get('defs pattern#logo-pattern').should('exist');
        cy.get('defs pattern#logo-pattern image')
          .should('have.attr', 'href', '/brand/logo-color.webp')
          .and('have.attr', 'opacity', '0.1');
      });
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
    cy.get('h2').should('contain.text', 'GPU Specifications');
  });
});

describe('Topology Dialog Navigation', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/gpu-specs');
    cy.get('h2').contains('GPU Specifications').should('exist');
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
