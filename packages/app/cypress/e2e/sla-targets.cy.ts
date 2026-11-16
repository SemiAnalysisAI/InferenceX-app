/**
 * SLA Targets runs on the captured fixture: real AgentX results read from
 * GitHub Actions artifacts (see scripts/capture-sla-targets-fixtures.ts).
 */
const EXPLANATION =
  'Evaluates benchmark results against your service targets. Results apply to the tested workload and conditions; they do not guarantee production SLA compliance.';

function visibleRows() {
  return cy.get('[data-testid="sla-config-row"]');
}

function waitForVerdicts() {
  cy.get('[data-testid="sla-results-table"]').should('be.visible');
  cy.get('[data-testid="sla-config-row"][data-status="loading"]').should('not.exist');
}

describe('SLA Targets', () => {
  beforeEach(() => {
    cy.viewport(1440, 1000);
  });

  it('shows the explanation, the captured-data notice and the example targets', () => {
    cy.visit('/infx/sla-targets');
    cy.contains(EXPLANATION).should('be.visible');
    cy.get('[data-testid="sla-snapshot-note"]')
      .should('contain.text', 'Captured results')
      .and('contain.text', 'Not live data');
    cy.get('[data-testid="sla-ttft-input"]').should('have.value', '1000');
    cy.get('[data-testid="sla-tpot-input"]').should('have.value', '50');
    cy.get('[data-testid="sla-attainment-input"]').should('have.value', '99');
    cy.get('[data-testid="sla-e2e-toggle"]').should('have.attr', 'aria-checked', 'false');
    cy.get('[data-testid="sla-example-note"]').should('be.visible');
    cy.get('head meta[name="robots"]').should('have.attr', 'content').and('include', 'noindex');
  });

  it('finds no qualifying configuration at the example targets and says so', () => {
    cy.visit('/infx/sla-targets');
    waitForVerdicts();
    visibleRows().should('have.length', 6);
    cy.get('[data-testid="sla-config-row"][data-status="meets"]').should('not.exist');
    cy.get('[data-testid="sla-cost-empty"]').should('be.visible');
  });

  it('evaluates a typed target exactly and ranks the configurations that qualify', () => {
    cy.visit('/infx/sla-targets');
    waitForVerdicts();
    cy.get('[data-testid="sla-ttft-input"]').clear().type('10000');
    cy.get('[data-testid="sla-config-row"][data-status="meets"]').should('have.length', 3);
    visibleRows()
      .first()
      .should('contain.text', 'B200')
      .and('contain.text', 'Meets target')
      .and('contain.text', '32 users')
      .and('contain.text', '99.11%')
      .and('contain.text', '$6.16');
    cy.get('[data-testid="sla-cost-list"] li').should('have.length', 3);
    cy.get('[data-testid="sla-example-note"]').should('not.exist');
  });

  it('reads targets that are not round numbers from a share link and evaluates them as given', () => {
    cy.visit('/infx/sla-targets?s_ttft=7321.5&s_tpot=41.25&s_att=98.5');
    cy.get('[data-testid="sla-ttft-input"]').should('have.value', '7321.5');
    cy.get('[data-testid="sla-tpot-input"]').should('have.value', '41.25');
    cy.get('[data-testid="sla-attainment-input"]').should('have.value', '98.5');
    waitForVerdicts();
    cy.get('[data-testid="sla-config-row"][data-status="meets"]').should('have.length.at.least', 1);
  });

  it('rejects text that is not a number without changing the evaluation', () => {
    cy.visit('/infx/sla-targets?s_ttft=10000');
    waitForVerdicts();
    cy.get('[data-testid="sla-ttft-input"]').clear().type('fast');
    cy.get('[data-testid="sla-ttft-input"]').should('have.attr', 'aria-invalid', 'true');
    cy.contains('Enter a number greater than 0').should('be.visible');
    cy.get('[data-testid="sla-config-row"][data-status="meets"]').should('have.length', 3);
    cy.get('[data-testid="sla-ttft-input"]').blur().should('have.value', '10000');
  });

  it('labels a result without a dispatched count as exploratory and never ranks it', () => {
    cy.visit('/infx/sla-targets?s_ttft=3600000&s_tpot=3600000&s_att=50');
    waitForVerdicts();
    cy.contains('[data-testid="sla-config-row"]', 'H200')
      .should('have.attr', 'data-status', 'insufficient_data')
      .and('contain.text', 'Insufficient data')
      .and('contain.text', 'Exploratory')
      .and('contain.text', 'The number of dispatched attempts is not established');
    cy.get('[data-testid="sla-cost-list"]').should('not.contain.text', 'H200');
  });

  it('lists a failed load point with its recorded reason, and the source run', () => {
    cy.visit('/infx/sla-targets?s_ttft=10000');
    waitForVerdicts();
    cy.contains('[data-testid="sla-config-row"]', '16P+8D')
      .find('[data-testid="sla-row-toggle"]')
      .click();
    cy.get('[data-testid="sla-row-details"]:visible').within(() => {
      cy.get('[data-testid="sla-excluded-point"]:visible')
        .should('contain.text', 'Failed: service failure')
        .and('contain.text', '234/2337 profiling requests failed')
        .and('contain.text', '139 http_503');
      cy.get('[data-testid="sla-point-row"]')
        .should('contain.text', '256 users')
        .and('contain.text', 'Every dispatched attempt is accounted for')
        .and('contain.text', '24 cut off in flight');
      cy.get('[data-testid="sla-provenance"]')
        .should('contain.text', '40421997301')
        .and('contain.text', 'configured profiling window')
        .and('contain.text', 'agentx-harness 1.0.12');
    });
  });

  it('adds the end-to-end target only when it is switched on', () => {
    cy.visit('/infx/sla-targets?s_ttft=10000');
    waitForVerdicts();
    cy.get('[data-testid="sla-e2e-input"]').should('not.exist');
    cy.get('[data-testid="sla-e2e-toggle"]').click();
    cy.get('[data-testid="sla-e2e-input"]').should('have.value', '60');
    cy.get('[data-testid="sla-config-row"][data-status="loading"]').should('not.exist');
    // With a 60 s limit the 32-user point drops to 98.43%, so 16 users is the highest passing load.
    cy.contains('[data-testid="sla-config-row"]', '8P+8D')
      .should('contain.text', '16 users')
      .and('contain.text', '99.04%');
  });

  it('switches model and shows a point without request-level data as insufficient', () => {
    cy.visit('/infx/sla-targets?s_model=Kimi-K3.1-Pro&s_ttft=30000&s_tpot=60');
    waitForVerdicts();
    cy.get('[data-testid="sla-model-select"]').should('contain.text', 'Kimi-K3.1-Pro');
    cy.contains('[data-testid="sla-config-row"]', '32P+16D')
      .should('have.attr', 'data-status', 'insufficient_data')
      .and('contain.text', 'No request-level data');
  });

  it('draws both charts with the required attainment line', () => {
    cy.visit('/infx/sla-targets?s_ttft=10000');
    waitForVerdicts();
    cy.get('[data-testid="sla-attainment-chart"] svg').should('contain.text', 'Required 99%');
    cy.get('[data-testid="sla-attainment-chart"] g.sla-marks circle').should('have.length', 29);
    cy.get('[data-testid="sla-goodput-chart"] g.sla-marks circle').should('have.length', 29);
  });

  it('marks a failed load in the charts without drawing it as a value', () => {
    cy.visit('/infx/sla-targets?s_ttft=10000');
    waitForVerdicts();
    for (const chart of ['sla-attainment-chart', 'sla-goodput-chart']) {
      // One load point failed in the captured runs: 256 users on B200 16P+8D, first attempt.
      cy.get(`[data-testid="${chart}"] [data-testid="sla-chart-gap"]`)
        .should('have.length', 1)
        .then(([cross]) => {
          const chartSvg = cross.closest('svg')!;
          const circles = [...chartSvg.querySelectorAll('g.sla-marks circle')];
          const top = Math.min(...circles.map((circle) => circle.getBoundingClientRect().top));
          // Above every measured point, in the margin: it has no place on the value scale.
          expect(cross.getBoundingClientRect().top).to.be.lessThan(top);
        });
      // The failed attempt adds no circle: the 29 measured points are all there is.
      cy.get(`[data-testid="${chart}"] g.sla-marks circle`).should('have.length', 29);
      cy.get(`[data-testid="${chart}"]`).should(
        'contain.text',
        'it has no measurement and is not zero',
      );
    }
  });

  it('names the point behind each headline value when they differ', () => {
    // On B300 with KV offload, 512 users is the highest passing load at 90%, while
    // 384 users has both the highest goodput and the lowest cost.
    cy.visit('/infx/sla-targets?s_ttft=30000&s_att=90');
    waitForVerdicts();
    cy.contains('[data-testid="sla-config-row"]', '8 GPUs · KV offload').as('row');
    cy.get('@row').should('have.attr', 'data-status', 'meets');
    cy.get('@row').find('td').eq(2).should('contain.text', '512 users');
    cy.get('@row').find('td').eq(4).should('contain.text', 'at 384 users');
    cy.get('@row').find('td').eq(5).should('contain.text', 'at 384 users');
    cy.get('@row').find('[data-testid="sla-row-toggle"]').click();
    cy.get('[data-testid="sla-row-details"]:visible').within(() => {
      cy.contains('[data-testid="sla-point-row"]', '512 users')
        .should('contain.text', 'highest passing load')
        .and('not.contain.text', 'highest goodput');
      cy.contains('[data-testid="sla-point-row"]', '384 users')
        .should('contain.text', 'highest goodput')
        .and('contain.text', 'lowest cost')
        .and('not.contain.text', 'highest passing load');
    });
  });

  it('renders the Chinese page with the same results', () => {
    cy.visit('/zh/infx/sla-targets?s_ttft=10000');
    cy.contains('根据你设定的服务目标评估基准测试结果').should('be.visible');
    waitForVerdicts();
    cy.get('[data-testid="sla-config-row"][data-status="meets"]')
      .should('have.length', 3)
      .first()
      .should('contain.text', '达标')
      .and('contain.text', '32 个用户');
    cy.get('[data-testid="sla-snapshot-note"]').should('contain.text', '并非实时数据');
  });

  it('stacks configurations on a phone without horizontal page scroll', () => {
    cy.viewport(390, 844);
    cy.visit('/infx/sla-targets?s_ttft=10000');
    cy.get('[data-testid="sla-results-list"]').should('be.visible');
    cy.get('[data-testid="sla-results-table"]').should('not.be.visible');
    cy.get('[data-testid="sla-results-list"] li[data-status="meets"]').should('have.length', 3);
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });

    // The row without a verdict carries the longest status: a label, "Exploratory" and a
    // reason sentence. It goes under the configuration name, never beside it.
    for (const width of [360, 390, 430]) {
      cy.viewport(width, 844);
      cy.get('[data-testid="sla-results-list"] li[data-status="insufficient_data"]')
        .first()
        .within(() => {
          cy.get('[data-testid="sla-config-name"]').then(([name]) => {
            const box = name.getBoundingClientRect();
            const card = name.closest('li')!.getBoundingClientRect();
            expect(box.width, `name width at ${width}`).to.be.at.least(card.width * 0.8);
            cy.get('[data-testid="sla-row-status"]').then(([status]) => {
              expect(status.getBoundingClientRect().top).to.be.at.least(box.bottom);
            });
          });
        });
    }
    cy.get('[data-testid="sla-results-list"] li[data-status="insufficient_data"]')
      .first()
      .find('button[aria-expanded]')
      .click();
    cy.get('[data-testid="sla-row-details"]:visible').should('contain.text', 'agentic_');
    for (const width of [360, 430]) {
      cy.viewport(width, 844);
      // Retried: the charts redraw to the new width a moment after the viewport changes.
      cy.document()
        .its('documentElement')
        .should((root) => {
          expect(root.scrollWidth, `page width at ${width}`).to.be.at.most(root.clientWidth);
        });
    }
  });
});
