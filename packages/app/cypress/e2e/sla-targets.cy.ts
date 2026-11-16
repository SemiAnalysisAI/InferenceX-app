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

/** Words the default view leaves to the details: it speaks in plain terms. */
const JARGON = /attainment|goodput|exploratory|accounting|compliant/iu;

function openCompare() {
  cy.get('[data-testid="sla-compare-toggle"]').click();
  cy.get('[data-testid="sla-compare"]').should('be.visible');
}

describe('SLA Targets', () => {
  beforeEach(() => {
    cy.viewport(1440, 1000);
  });

  it('says what the page does in one sentence, with the explanation and the example targets', () => {
    cy.visit('/infx/sla-targets');
    cy.contains(
      'Type the latency you need. See which setups deliver it, how many users each carries, and what it costs.',
    ).should('be.visible');
    cy.contains(EXPLANATION).should('be.visible');
    cy.get('[data-testid="sla-ttft-input"]').should('have.value', '1000');
    cy.get('[data-testid="sla-tpot-input"]').should('have.value', '50');
    cy.get('[data-testid="sla-attainment-input"]').should('have.value', '99');
    // The targets read as one sentence, units included.
    cy.get('[data-testid="sla-controls"]')
      .invoke('text')
      .should(
        'match',
        /First token within\s*ms\s*each token within\s*ms\s*for at least\s*% of requests/u,
      );
    cy.get('[data-testid="sla-e2e-input"]').should('not.exist');
    cy.get('[data-testid="sla-example-note"]').should('be.visible');
    cy.get('[data-testid="sla-snapshot-note"]')
      .should('contain.text', 'Captured results')
      .and('contain.text', 'Not live data');
    cy.get('head meta[name="robots"]').should('have.attr', 'content').and('include', 'noindex');
  });

  it('answers in one line when no setup meets the example targets', () => {
    cy.visit('/infx/sla-targets');
    waitForVerdicts();
    visibleRows().should('have.length', 6);
    cy.get('[data-testid="sla-config-row"][data-status="meets"]').should('not.exist');
    cy.get('[data-testid="sla-summary"]')
      .should('contain.text', 'No setup meets your targets')
      .and('contain.text', 'Closest: B200 · Dynamo SGLang · FP4 · MTP · 8P+8D · KV offload')
      .and('contain.text', '87.79% of requests within target at 8 users (need 99%)');
  });

  it('shows three answers per setup for a typed target, cheapest first, in plain words', () => {
    cy.visit('/infx/sla-targets');
    waitForVerdicts();
    cy.get('[data-testid="sla-ttft-input"]').clear().type('10000');
    cy.get('[data-testid="sla-config-row"][data-status="meets"]').should('have.length', 3);
    cy.get('[data-testid="sla-summary"]')
      .should('contain.text', '3 of 6 setups meet your targets')
      .and('contain.text', 'Cheapest: B200 · Dynamo SGLang · FP4 · MTP · 8P+8D · KV offload')
      .and('contain.text', '$6.16 per 1,000 good requests');
    visibleRows()
      .first()
      .within(() => {
        cy.get('[data-testid="sla-config-name"]').should('contain.text', 'B200');
        cy.get('[data-testid="sla-row-status"]').should('have.text', 'Meets target');
        cy.get('[data-testid="sla-row-line"]').should(
          'have.text',
          '99.11% of requests within target at 32 users (need 99%)',
        );
        cy.get('[data-testid="sla-row-load"]').should('have.text', '32 users');
        cy.get('[data-testid="sla-row-cost"]').should('have.text', '$6.16');
      });
    // Meets first, cheapest first; then misses; then setups without a verdict.
    visibleRows().then((rows) => {
      expect([...rows].map((row) => row.dataset.status)).to.deep.equal([
        'meets',
        'meets',
        'meets',
        'misses',
        'misses',
        'insufficient_data',
      ]);
    });
    cy.get('[data-testid="sla-config-row"][data-status="meets"] [data-testid="sla-row-cost"]').then(
      (cells) => {
        const costs = [...cells].map((cell) => Number(cell.textContent!.replace('$', '')));
        expect(costs).to.deep.equal(costs.toSorted((a, b) => a - b));
      },
    );
    cy.get('[data-testid="sla-config-row"][data-status="misses"] [data-testid="sla-row-line"]')
      .first()
      .should('have.text', 'Best: 88.75% of requests within target at 256 users (need 99%)');
    cy.get('[data-testid="sla-config-row"][data-status="misses"] [data-testid="sla-row-load"]')
      .first()
      .should('have.text', '—');
    cy.get('[data-testid="sla-results-table"]').invoke('text').should('not.match', JARGON);
    cy.get('[data-testid="sla-row-details"]').should('not.exist');
    cy.get('[data-testid="sla-example-note"]').should('not.exist');
  });

  it('reads targets that are not round numbers from a share link and evaluates them as given', () => {
    cy.visit('/infx/sla-targets?s_ttft=7321.5&s_tpot=41.25&s_att=98.5');
    cy.get('[data-testid="sla-ttft-input"]').should('have.value', '7321.5');
    cy.get('[data-testid="sla-tpot-input"]').should('have.value', '41.25');
    cy.get('[data-testid="sla-attainment-input"]').should('have.value', '98.5');
    waitForVerdicts();
    cy.get('[data-testid="sla-config-row"][data-status="meets"]').should('have.length.at.least', 1);
    cy.get('[data-testid="sla-row-line"]').first().should('contain.text', '(need 98.5%)');
  });

  it('rejects text that is not a number without changing the evaluation', () => {
    cy.visit('/infx/sla-targets?s_ttft=10000');
    waitForVerdicts();
    cy.get('[data-testid="sla-ttft-input"]').clear().type('fast');
    cy.get('[data-testid="sla-ttft-input"]').should('have.attr', 'aria-invalid', 'true');
    cy.contains('Enter a number greater than 0').should('be.visible');
    cy.get('[data-testid="sla-config-row"][data-status="meets"]').should('have.length', 3);
    cy.get('[data-testid="sla-ttft-input"]').blur().should('have.value', '10000');
    cy.get('[data-testid="sla-attainment-input"]').clear().type('20');
    cy.contains('Enter a number from 50 to 99.99').should('be.visible');
    cy.get('[data-testid="sla-attainment-input"]').blur().should('have.value', '99');
  });

  it('shows a result without a dispatched count as insufficient data, with the reason in the details', () => {
    cy.visit('/infx/sla-targets?s_ttft=3600000&s_tpot=3600000&s_att=50');
    waitForVerdicts();
    cy.contains('[data-testid="sla-config-row"]', 'H200').as('row');
    cy.get('@row')
      .should('have.attr', 'data-status', 'insufficient_data')
      .and('not.contain.text', 'Exploratory');
    cy.get('@row').find('[data-testid="sla-row-status"]').should('have.text', 'Insufficient data');
    cy.get('@row')
      .find('[data-testid="sla-row-line"]')
      .should('have.text', 'The run did not record how many requests it sent');
    cy.get('@row').find('[data-testid="sla-row-load"]').should('have.text', '—');
    cy.get('@row').find('[data-testid="sla-row-cost"]').should('have.text', '—');
    // Every other setup meets these targets; the one without a verdict is never counted.
    cy.get('[data-testid="sla-summary"]').should('contain.text', '5 of 6 setups meet');
    cy.get('@row').find('[data-testid="sla-row-toggle"]').click();
    cy.get('[data-testid="sla-row-details"]')
      .should('contain.text', 'Exploratory: The number of dispatched attempts is not established')
      .and('contain.text', 'Best observed attainment');
  });

  it('keeps the measurement behind "How this was measured", closed until asked for', () => {
    cy.visit('/infx/sla-targets?s_ttft=10000');
    waitForVerdicts();
    cy.contains('[data-testid="sla-config-row"]', '16P+8D')
      .find('[data-testid="sla-row-toggle"]')
      .as('toggle');
    cy.get('@toggle')
      .should('contain.text', 'How this was measured')
      .and('have.attr', 'aria-expanded', 'false');
    cy.get('@toggle').click();
    cy.get('@toggle')
      .should('have.attr', 'aria-expanded', 'true')
      .invoke('attr', 'aria-controls')
      .then((id) => {
        cy.get(`[id="${id}"]`)
          .should('have.length', 1)
          .and('be.visible')
          .and('have.attr', 'data-testid', 'sla-row-details');
      });
    cy.get('[data-testid="sla-row-details"]:visible').within(() => {
      cy.get('[data-testid="sla-selections"]')
        .should('contain.text', 'No tested load qualifies.')
        .and('contain.text', 'Best observed attainment: 88.75% at 256 users');
      cy.get('[data-testid="sla-excluded-point"]:visible')
        .should('contain.text', 'Failed: service failure')
        .and('contain.text', '234/2337 profiling requests failed')
        .and('contain.text', '139 http_503');
      cy.get('[data-testid="sla-point-row"]')
        .should('contain.text', '256 users')
        .and('contain.text', 'Every dispatched attempt is accounted for')
        .and('contain.text', '24 cut off in flight')
        .and('contain.text', '88.82% without attempts cut off in flight');
      cy.get('[data-testid="sla-provenance"]')
        .should('contain.text', '40421997301')
        .and('contain.text', 'configured profiling window')
        .and('contain.text', 'agentx-harness 1.0.12')
        .and('contain.text', '$1.73 per GPU-hour × 24 GPUs');
      cy.get('[data-testid="sla-definitions"]')
        .should('contain.text', 'A load point needs at least 100 attempts')
        .and('contain.text', 'Targets are checked per request, not per session')
        .and('contain.text', 'Passing attempts per second of the configured profiling window');
    });
    cy.get('@toggle').click().should('have.attr', 'aria-expanded', 'false');
    cy.get('[data-testid="sla-row-details"]').should('not.exist');
  });

  it('keeps the end-to-end limit under More and shows it as active when collapsed', () => {
    cy.visit('/infx/sla-targets?s_ttft=10000');
    waitForVerdicts();
    cy.get('[data-testid="sla-more-toggle"]')
      .should('have.attr', 'aria-expanded', 'false')
      .and('have.text', 'More')
      .click();
    cy.get('[data-testid="sla-e2e-input"]')
      .should('have.value', '')
      .and('have.attr', 'placeholder', 'no limit')
      .type('60');
    cy.get('[data-testid="sla-config-row"][data-status="loading"]').should('not.exist');
    // With a 60 s limit the 32-user point drops to 98.43%, so 16 users is the highest passing load.
    cy.contains('[data-testid="sla-config-row"]', '8P+8D').within(() => {
      cy.get('[data-testid="sla-row-load"]').should('have.text', '16 users');
      cy.get('[data-testid="sla-row-line"]').should('contain.text', '99.04%');
    });
    cy.get('[data-testid="sla-more-toggle"]').click();
    cy.get('[data-testid="sla-e2e-input"]').should('not.exist');
    cy.get('[data-testid="sla-more-active"]').should('contain.text', 'whole response within 60 s');
    // Emptying the field removes the limit.
    cy.get('[data-testid="sla-more-toggle"]').click();
    cy.get('[data-testid="sla-e2e-input"]').should('have.value', '60').clear();
    cy.contains('[data-testid="sla-config-row"]', '8P+8D')
      .find('[data-testid="sla-row-load"]')
      .should('have.text', '32 users');
    cy.get('[data-testid="sla-more-toggle"]').click();
    cy.get('[data-testid="sla-more-active"]').should('not.exist');
  });

  it('shows a limit from a share link as active without opening More', () => {
    cy.visit('/infx/sla-targets?s_ttft=10000&s_e2e=45.5');
    cy.get('[data-testid="sla-more-toggle"]').should('have.attr', 'aria-expanded', 'false');
    cy.get('[data-testid="sla-more-active"]').should(
      'contain.text',
      'whole response within 45.5 s',
    );
  });

  it('switches model and shows a point without request-level data as insufficient', () => {
    cy.visit('/infx/sla-targets?s_model=Kimi-K3.1-Pro&s_ttft=30000&s_tpot=60');
    waitForVerdicts();
    cy.get('[data-testid="sla-model-select"]').should('contain.text', 'Kimi-K3.1-Pro');
    cy.contains('[data-testid="sla-config-row"]', '32P+16D')
      .should('have.attr', 'data-status', 'insufficient_data')
      .and('contain.text', 'No per-request data for this run');
  });

  it('draws both charts with the required share line once the comparison is opened', () => {
    cy.visit('/infx/sla-targets?s_ttft=10000');
    waitForVerdicts();
    cy.get('[data-testid="sla-attainment-chart"]').should('not.exist');
    cy.get('[data-testid="sla-compare-toggle"]').should('have.attr', 'aria-expanded', 'false');
    openCompare();
    cy.get('[data-testid="sla-compare-toggle"]').should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid="sla-compare"] li').should('have.length', 6);
    cy.get('[data-testid="sla-attainment-chart"] svg').should('contain.text', 'Required 99%');
    cy.get('[data-testid="sla-attainment-chart"] g.sla-marks circle').should('have.length', 29);
    cy.get('[data-testid="sla-goodput-chart"] g.sla-marks circle').should('have.length', 29);
  });

  it('marks a failed load in the charts without drawing it as a value', () => {
    cy.visit('/infx/sla-targets?s_ttft=10000');
    waitForVerdicts();
    openCompare();
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
    cy.get('@row').find('[data-testid="sla-row-load"]').should('have.text', '512 users');
    cy.get('@row').find('[data-testid="sla-row-cost"]').should('contain.text', 'at 384 users');
    cy.get('@row').find('[data-testid="sla-row-toggle"]').click();
    cy.get('[data-testid="sla-row-details"]:visible').within(() => {
      cy.get('[data-testid="sla-selection-load"]')
        .should('contain.text', 'Highest tested passing load')
        .and('contain.text', '512 users');
      cy.get('[data-testid="sla-selection-goodput"]')
        .should('contain.text', 'Highest goodput among qualifying loads')
        .and('contain.text', 'at 384 users');
      cy.get('[data-testid="sla-selection-cost"]')
        .should('contain.text', 'Lowest est. cost per 1,000 compliant requests')
        .and('contain.text', 'at 384 users');
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
    cy.contains('填入你需要的延迟').should('be.visible');
    cy.contains('根据你设定的服务目标评估基准测试结果').should('be.visible');
    waitForVerdicts();
    cy.get('[data-testid="sla-summary"]').should('contain.text', '6 个配置中有 3 个达标');
    cy.get('[data-testid="sla-config-row"][data-status="meets"]')
      .should('have.length', 3)
      .first()
      .within(() => {
        cy.get('[data-testid="sla-row-status"]').should('have.text', '达标');
        cy.get('[data-testid="sla-row-load"]').should('have.text', '32 个用户');
        cy.get('[data-testid="sla-row-cost"]').should('have.text', '$6.16');
        cy.get('[data-testid="sla-row-toggle"]').should('contain.text', '测量方式').click();
      });
    cy.get('[data-testid="sla-row-details"]').should('contain.text', '达标的最高已测负载');
    cy.get('[data-testid="sla-more-toggle"]').should('contain.text', '更多');
    cy.get('[data-testid="sla-snapshot-note"]').should('contain.text', '并非实时数据');
  });

  it('turns setups into cards on a phone, with the same three answers and no sideways scroll', () => {
    cy.viewport(390, 844);
    cy.visit('/infx/sla-targets?s_ttft=10000');
    cy.get('[data-testid="sla-results-list"]').should('be.visible');
    cy.get('[data-testid="sla-results-table"]').should('not.be.visible');
    cy.get('[data-testid="sla-results-list"] li[data-status="meets"]').should('have.length', 3);
    cy.get('[data-testid="sla-results-list"] li[data-status="meets"]')
      .first()
      .within(() => {
        cy.get('[data-testid="sla-row-status"]').should('have.text', 'Meets target');
        cy.get('[data-testid="sla-row-load"]').should('have.text', '32 users');
        cy.get('[data-testid="sla-row-cost"]').should('have.text', '$6.16');
      });
    cy.get('[data-testid="sla-row-details"]').should('not.exist');

    for (const width of [360, 390, 430]) {
      cy.viewport(width, 844);
      cy.document()
        .its('documentElement')
        .should((root) => {
          expect(root.scrollWidth, `page width at ${width}`).to.be.at.most(root.clientWidth);
        });
      // No label is squeezed into a column of single words: every status and every
      // target clause stays on one line.
      cy.get('[data-testid="sla-results-list"] [data-testid="sla-row-status"]').each(([status]) => {
        expect(status.getClientRects(), `status lines at ${width}`).to.have.length(1);
      });
      cy.get('[data-testid="sla-controls"] label').each(([label]) => {
        const lineHeight = Number.parseFloat(getComputedStyle(label).lineHeight);
        expect(label.getBoundingClientRect().height, `label at ${width}`).to.be.below(
          lineHeight * 1.5,
        );
      });
    }

    cy.get('[data-testid="sla-results-list"] li[data-status="insufficient_data"]')
      .first()
      .find('button[aria-expanded]')
      .click();
    cy.get('[data-testid="sla-row-details"]:visible').should('contain.text', 'agentic_');
    for (const width of [360, 430]) {
      cy.viewport(width, 844);
      cy.document()
        .its('documentElement')
        .should((root) => {
          expect(root.scrollWidth, `page width at ${width}`).to.be.at.most(root.clientWidth);
        });
    }
  });
});
