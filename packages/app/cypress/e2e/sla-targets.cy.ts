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
  });
});
