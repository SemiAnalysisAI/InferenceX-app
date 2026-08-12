import {
  availability as agenticAvailability,
  b300Rows as agenticB300Rows,
} from '../support/overlay-fixtures';
import { unlockAgenticGate } from '../support/e2e';

// Fleet Lifecycle section on /calculator. The distinguishing behaviours, all
// worth locking down:
//  - it reads the FULL run history, so a row's operating point can come from an
//    earlier date than the caption's run date — and must say which;
//  - clamped (never-measured-at-target) reads are excluded rather than clamped,
//    so chips can legitimately be absent and must be explained, not dropped;
//  - the token price defaults to the cheapest visible chip's break-even;
//  - agentic traces have no ISL/OSL, so the section is genuinely unsupported.

/** Nth cell of the first lifecycle table row. */
const firstRowCell = (index: number) =>
  cy.get('[data-testid="calculator-lifecycle-table"] tbody tr').first().find('td').eq(index);

/** The time-axis tick labels, as one string — changes when the x domain moves. */
const xAxisTicks = () =>
  cy.get('[data-testid="calculator-lifecycle-chart-svg"] .x-axis .tick text').invoke('text');

/** All text in the chart SVG, including the axis labels. */
const chartText = () => cy.get('[data-testid="calculator-lifecycle-chart-svg"]').invoke('text');

/** Vertex count of the first plotted line — a sampled rollout curve has many. */
const lineVertices = () =>
  cy
    .get('[data-testid="calculator-lifecycle-chart-svg"] path.line-path')
    .first()
    .invoke('attr', 'd')
    .then((d) => (d ?? '').split('L').length);

describe('Calculator — Fleet Lifecycle', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/calculator');
    cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
  });

  it('renders the section with a prompt for a power budget, and fetches nothing yet', () => {
    cy.get('[data-testid="calculator-lifecycle-section"]')
      .should('be.visible')
      .and('contain.text', 'Fleet Lifecycle');
    cy.get('[data-testid="calculator-lifecycle-empty"]')
      .should('be.visible')
      .and('contain.text', 'Enter a facility power budget');
    // The history payload is multi-MB, so it must not be requested until the
    // section can produce something.
    cy.get('[data-testid="calculator-lifecycle-table"]').should('not.exist');
  });

  it('entering a MW budget in the fleet planner drives the lifecycle table', () => {
    // One budget, one `c_mw` param, both sections.
    cy.get('[data-testid="calc-fleet-mw-input"]').type('10');
    cy.get('[data-testid="calculator-lifecycle-table"]', { timeout: 30_000 }).should('be.visible');
    cy.get('[data-testid="calculator-lifecycle-table"]').within(() => {
      cy.contains('th', 'Config Now').should('exist');
      cy.contains('th', 'First Run').should('exist');
      cy.contains('th', 'Latest Best').should('exist');
      cy.contains('th', 'Improvements').should('exist');
      cy.contains('th', 'Margin $/day').should('exist');
      cy.contains('th', 'Payback').should('exist');
      cy.contains('th', 'Cumulative Margin').should('exist');
      cy.get('tbody tr').should('have.length.greaterThan', 0);
    });
    cy.get('[data-testid="calculator-lifecycle-empty"]').should('not.exist');
  });

  it('every row is traceable to the dated run it came from', () => {
    // The caption's run date no longer describes these numbers, so each row
    // carries its own date and links its run.
    firstRowCell(2)
      .invoke('text')
      .should('match', /\d{4}-\d{2}-\d{2}/u);
    firstRowCell(3)
      .invoke('text')
      .should('match', /\d{4}-\d{2}-\d{2}/u);
  });

  it('defaults the token price to a break-even figure', () => {
    cy.get('[data-testid="calc-lifecycle-price-input"]')
      .invoke('val')
      .should('match', /^\d+(?:\.\d+)?$/u);
    cy.get('[data-testid="calc-lifecycle-price-input"]')
      .invoke('val')
      .then((val) => expect(Number(val)).to.be.greaterThan(0));
    // Break-even means the cheapest chip earns nothing: some row is at/near zero
    // margin, and none of the visible fleet is comfortably profitable there.
    cy.get('[data-testid="calculator-lifecycle-table"]').should('contain.text', 'Never');
  });

  it('raising the price above break-even turns margin positive and produces a payback', () => {
    cy.get('[data-testid="calc-lifecycle-price-input"]').clear();
    cy.get('[data-testid="calc-lifecycle-price-input"]').type('50');
    // Margin $/day column: positive, so no leading minus.
    firstRowCell(9).invoke('text').should('match', /^\$/u);
    firstRowCell(10)
      .invoke('text')
      .should('match', /\d+(?:\.\d+)? mo/u);
  });

  it('editing the price offers a reset back to break-even', () => {
    cy.get('[data-testid="calc-lifecycle-price-reset"]').should('be.visible').click();
    cy.get('[data-testid="calc-lifecycle-price-input"]')
      .invoke('val')
      .then((val) => expect(Number(val)).to.be.lessThan(50));
  });

  it('renders the lifecycle chart with one line per visible chip', () => {
    cy.get('[data-testid="calculator-lifecycle-chart-svg"]').should('be.visible');
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] path.line-path').should(
      'have.length.greaterThan',
      0,
    );
    // The break-even rule is what makes the sign of the margin readable.
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-zero-rule').should('exist');
  });

  it('names each line with its chip at the right edge', () => {
    // One label per line, so a series is identifiable without the legend.
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] path.line-path').then((lines) => {
      cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-series-label').should(
        'have.length',
        lines.length,
      );
    });
    // The label text is a chip name, matching the table's first column.
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-series-label')
      .first()
      .invoke('text')
      .should('match', /\S/u)
      .then((label) => {
        cy.get('[data-testid="calculator-lifecycle-table"]').should('contain', String(label));
      });
  });

  it('links the run behind any step, not just the first and last', () => {
    // The table links only the opening and closing sweeps. Intermediate rungs are
    // exactly where an anomalous run that was never purged would sit, so pinning
    // one has to expose its run — otherwise that rung is auditable nowhere.
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .dot-group').last().click();
    cy.get('[data-chart-tooltip] a')
      .should('have.length.greaterThan', 0)
      .first()
      .should('have.attr', 'href')
      .and('match', /^https?:\/\//u);
    // The pin is left in place: the next test's zoom dismisses it, and the
    // tooltip is a portal outside the SVG so it does not disturb what follows.
  });

  it('zooms the time axis, as its own instructions promise', () => {
    xAxisTicks().then((before) => {
      cy.get('[data-testid="calculator-lifecycle-chart-svg"]').trigger('wheel', {
        deltaY: -400,
        shiftKey: true,
        clientX: 700,
        clientY: 300,
        bubbles: true,
      });
      // The axis has to actually move: the chart advertises shift+scroll zoom in
      // its caption, and for a while it advertised it without wiring it up.
      xAxisTicks().should('not.equal', before);
      // Double-click resets, as the same caption promises. Also leaves the chart
      // unzoomed for the tests that follow — they share this page.
      cy.get('[data-testid="calculator-lifecycle-chart-svg"]').dblclick();
      xAxisTicks().should('equal', before);
      // d3's reset is a ~750ms transition whose trailing events repaint the axes
      // from the scales captured when it started. Let it finish before the next
      // test changes the metric, or that repaint lands on top of the new axis.
      cy.wait(900);
    });
    // The chip labels survive the zoom, one per line, still inside the SVG.
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] path.line-path').then((lines) => {
      cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-series-label').should(
        'have.length',
        lines.length,
      );
    });
  });

  it('switches the y axis between margin and revenue', () => {
    chartText().should('contain', 'Margin ($/day)');
    // Break-even is meaningful on a margin axis, so the rule is drawn.
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-zero-rule').should('exist');

    cy.get('[data-testid="calc-lifecycle-metric-revenue"]').click();
    chartText().should('contain', 'Revenue ($/day)');
    // Zero is not break-even on a revenue axis — each chip breaks even at its own
    // cost line — so the rule must not be drawn claiming otherwise.
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-zero-rule').should(
      'not.exist',
    );
    // Revenue drops the cost term, so nothing plotted can be negative.
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .y-axis').should(
      'not.contain.text',
      '-$',
    );

    cy.get('[data-testid="calc-lifecycle-metric-margin"]').click();
    chartText().should('contain', 'Margin ($/day)');
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-zero-rule').should('exist');
  });

  it('a longer horizon increases cumulative margin', () => {
    cy.get('[data-testid="calc-lifecycle-horizon-input"]').clear();
    cy.get('[data-testid="calc-lifecycle-horizon-input"]').type('24');
    firstRowCell(11)
      .invoke('text')
      .then((short) => {
        cy.get('[data-testid="calc-lifecycle-horizon-input"]').clear();
        cy.get('[data-testid="calc-lifecycle-horizon-input"]').type('96');
        firstRowCell(11)
          .invoke('text')
          .should((long) => expect(long).to.not.equal(short));
      });
  });

  it('tracks measured config improvements as steps, not one flat plateau', () => {
    // The point of the section: a chip's revenue follows its optimisation
    // history, so at least one chip must show more than zero improvements.
    cy.get('[data-testid="calculator-lifecycle-table"] tbody tr').then(($rows) => {
      const improvements = [...$rows].map((row) =>
        Number.parseInt(row.querySelectorAll('td')[4]!.textContent ?? '0', 10),
      );
      expect(Math.max(...improvements)).to.be.greaterThan(0);
    });
    // Gain over the opening config is reported as a multiple.
    firstRowCell(5)
      .invoke('text')
      .should('match', /^\d+(?:\.\d+)?×$/u);
  });

  it('rolls each config out over the ramp instead of stepping instantly', () => {
    cy.get('[data-testid="calc-lifecycle-ramp-input"]').should('have.value', '3');
    lineVertices().then((curved) => {
      // Rollouts are sampled into curves, so the line cannot be a bare staircase.
      expect(curved).to.be.greaterThan(20);
      // A longer ramp reaches each config's numbers later, so it earns less.
      firstRowCell(11)
        .invoke('text')
        .then((short) => {
          cy.get('[data-testid="calc-lifecycle-ramp-input"]').clear();
          cy.get('[data-testid="calc-lifecycle-ramp-input"]').type('18');
          firstRowCell(11)
            .invoke('text')
            .should((long) => expect(long).to.not.equal(short));
          // Ramp 0 means configs take effect instantly — a pure staircase, which
          // needs far fewer vertices than the sampled curves.
          cy.get('[data-testid="calc-lifecycle-ramp-input"]').clear();
          cy.get('[data-testid="calc-lifecycle-ramp-input"]').type('0');
          lineVertices().should((stepped) => expect(stepped).to.be.lessThan(curved));
        });
    });
  });

  it('a shorter MTBI lowers availability', () => {
    cy.get('[data-testid="calc-lifecycle-mtbi-input"]').clear();
    cy.get('[data-testid="calc-lifecycle-mtbi-input"]').type('60');
    firstRowCell(12)
      .invoke('text')
      .then((high) => {
        cy.get('[data-testid="calc-lifecycle-mtbi-input"]').clear();
        cy.get('[data-testid="calc-lifecycle-mtbi-input"]').type('2');
        firstRowCell(12)
          .invoke('text')
          .should((low) => {
            expect(Number.parseFloat(low)).to.be.lessThan(Number.parseFloat(high));
          });
      });
  });

  it('states the hybrid basis and the unofficial-run exclusion', () => {
    // Today's TCO rates on a dated operating point, and no overlay support.
    cy.get('[data-testid="calculator-lifecycle-section"]')
      .should('contain.text', 'Power and $/chip/hr are today')
      .and('contain.text', 'Unofficial runs loaded via a run link are not shown here');
    cy.get('[data-testid="calculator-lifecycle-section"]').should(
      'contain.text',
      'SemiAnalysis Datacenter Industry Model',
    );
  });

  it('draws one row per chip, pooling its software configs', () => {
    // The history holds many hwKeys per chip (b200_sglang, b200_trtllm, …) and
    // they are one piece of silicon, so the chip must not repeat down the table.
    cy.get('[data-testid="calculator-lifecycle-table"] tbody tr').then(($rows) => {
      const chips = [...$rows].map((row) => row.querySelectorAll('td')[0]!.textContent?.trim());
      expect(chips.length).to.be.greaterThan(0);
      expect(new Set(chips).size).to.equal(chips.length);
    });
    // And each row names the config it ended up on, since that changes along the line.
    firstRowCell(1).invoke('text').should('not.be.empty');
  });

  it('follows legend visibility', () => {
    // Legend entries are configs and clicking one isolates it. Configs sit one
    // level below the lines now, so isolating a single config leaves at most one
    // chip — and none at all when that config was never measured at the target,
    // which is a legitimate state rather than a broken chart.
    cy.get('[data-testid="calculator-lifecycle-table"] tbody tr').then(($rows) => {
      const fullCount = $rows.length;
      expect(fullCount).to.be.greaterThan(1);
      cy.get('.sidebar-legend label').first().click();
      cy.get('[data-testid="calculator-lifecycle-table"] tbody tr').should(
        'have.length.at.most',
        1,
      );
      cy.get('.sidebar-legend label').first().click();
      cy.get('[data-testid="calculator-lifecycle-table"] tbody tr').should(
        'have.length',
        fullCount,
      );
    });
  });

  it('explains chips that were never measured at an extreme target instead of dropping them', () => {
    // Pushing the target to the top of the range leaves chips outside their
    // measured interactivity; the honest answer is to say so, with the range.
    cy.get('[data-testid="calculator-controls"] input[type="range"]')
      .invoke('attr', 'max')
      .then((max) => {
        cy.get('[data-testid="calculator-controls"] input[type="number"]').clear();
        cy.get('[data-testid="calculator-controls"] input[type="number"]').type(`${max}{enter}`);
      });
    cy.get('[data-testid="calculator-lifecycle-section"]').should(
      'contain.text',
      'Not measured at this interactivity',
    );
    cy.get('[data-testid="calculator-lifecycle-unmeasured"]').should('contain.text', 'measured');
  });

  it('clearing the MW budget restores the empty state', () => {
    cy.get('[data-testid="calc-fleet-mw-input"]').clear();
    cy.get('[data-testid="calculator-lifecycle-empty"]').should('be.visible');
    cy.get('[data-testid="calculator-lifecycle-table"]').should('not.exist');
  });
});

describe('Calculator — Fleet Lifecycle with agentic traces', () => {
  before(() => {
    // Agentic rows have null ISL/OSL, which the default fixture model has none
    // of — so serve them the same way the main calculator spec does.
    const b300Rows = agenticB300Rows(null);
    const b200Rows = b300Rows.map((row) => ({ ...row, hardware: 'b200' }));
    cy.intercept('GET', '/api/v1/availability', {
      body: [
        ...agenticAvailability,
        ...agenticAvailability.map((row) => ({ ...row, hardware: 'b200' })),
      ],
    });
    cy.intercept('GET', '/api/v1/benchmarks*', { body: [...b300Rows, ...b200Rows] }).as(
      'agenticBenchmarks',
    );
    cy.visit('/calculator?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_prec=fp4', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.wait('@agenticBenchmarks');
    cy.get('[data-testid="calc-sequence-selector"]').should('contain.text', 'Agentic Traces');
  });

  it('states that history cannot be keyed for agentic traces', () => {
    // Not an empty card: the reason is structural and the user needs it.
    cy.get('[data-testid="calculator-lifecycle-unsupported"]')
      .should('be.visible')
      .and('contain.text', 'Agentic Traces');
    cy.get('[data-testid="calculator-lifecycle-table"]').should('not.exist');
  });
});

describe('Calculator — Fleet Lifecycle in Chinese', () => {
  before(() => {
    cy.visit('/zh/calculator', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    cy.get('[data-testid="calculator-bar-chart"] svg .bar').should('have.length.greaterThan', 0);
  });

  it('translates the section, including the table headers and notes', () => {
    cy.get('[data-testid="calculator-lifecycle-section"]')
      .should('contain.text', '集群生命周期')
      .and('contain.text', '设施功率预算');
    cy.get('[data-testid="calc-fleet-mw-input"]').type('10');
    cy.get('[data-testid="calculator-lifecycle-table"]', { timeout: 30_000 }).should('be.visible');
    cy.get('[data-testid="calculator-lifecycle-section"]')
      .should('contain.text', 'Token 价格')
      .and('contain.text', '当前配置')
      .and('contain.text', '首次运行')
      .and('contain.text', '累计利润')
      .and('contain.text', '来源：');
    // Nothing from the English table leaks through.
    cy.get('[data-testid="calculator-lifecycle-section"]')
      .should('not.contain.text', 'Enter a facility power budget')
      .and('not.contain.text', 'Cumulative Margin')
      .and('not.contain.text', 'First Run');
  });
});
