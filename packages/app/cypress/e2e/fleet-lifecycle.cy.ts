import {
  availability as agenticAvailability,
  b300Rows as agenticB300Rows,
} from '../support/overlay-fixtures';
import { unlockAgenticGate } from '../support/e2e';

type CsvCaptureWindow = Cypress.AUTWindow & {
  __capturedLifecycleCsvBlob?: Blob;
};

function captureLifecycleCsvDownloads(win: Cypress.AUTWindow): void {
  const captureWindow = win as CsvCaptureWindow;
  win.URL.createObjectURL = (object: Blob | MediaSource) => {
    if (object instanceof win.Blob) captureWindow.__capturedLifecycleCsvBlob = object;
    return 'blob:calculator-lifecycle-csv-test';
  };
  win.HTMLAnchorElement.prototype.click = () => {};
}

function readCapturedLifecycleCsv(): Cypress.Chainable<string> {
  return cy.window().then((win) => {
    const blob = (win as CsvCaptureWindow).__capturedLifecycleCsvBlob;
    expect(blob, 'captured lifecycle CSV Blob').to.be.instanceOf(win.Blob);
    return blob!.text();
  });
}

// Fleet Lifecycle section on its own /fleet page. The distinguishing behaviours, all
// worth locking down:
//  - it reads the FULL run history, so a row's operating point can come from an
//    earlier date than the caption's run date — and must say which;
//  - clamped (never-measured-at-target) reads are excluded rather than clamped,
//    so chips can legitimately be absent and must be explained, not dropped;
//  - the token price defaults to the cheapest visible chip's break-even;
//  - agentic traces have no ISL/OSL, so history is keyed on benchmark_type
//    instead, and their cached input tokens bill at a discount.

/**
 * This figure's export menu button. Scoped: the bar chart above has its own, and
 * `export-button` is not unique across the page.
 */
const exportMenu = () =>
  cy.get('[data-testid="calculator-lifecycle-figure"]').find('[data-testid="export-button"]');

/** Switch the section to the table tab. Idempotent — clicking the active tab is a no-op. */
const showTable = () => cy.get('[data-testid="calculator-lifecycle-table-view-btn"]').click();

/** Switch the section back to the chart tab. */
const showChart = () => cy.get('[data-testid="calculator-lifecycle-chart-view-btn"]').click();

/**
 * Put the section back on the chart tab if it has one rendered.
 *
 * `testIsolation` is false, so all of these tests share one page and one tab
 * state. Without this, a test that reads the table leaves the next one looking
 * for a chart that is not mounted — an ordering coupling that fails in whichever
 * order the file happens to be written in. Tolerant of the tab not existing yet:
 * when the power budget is cleared there is no figure at all.
 */
const resetToChart = () =>
  cy.get('body').then(($body) => {
    if ($body.find('[data-testid="calculator-lifecycle-chart-view-btn"]').length > 0) showChart();
  });

/**
 * A named cell of the first lifecycle table row. Switches to the table tab first:
 * the section opens on the chart, and these assertions are about the numbers.
 *
 * Resolved by header text rather than by position on purpose — these were once
 * bare indices, and inserting a column silently re-pointed nine assertions at
 * their neighbours, each of which then failed on a value that was correct.
 */
const firstRowCell = (header: string) => {
  showTable();
  return cy.get('[data-testid="calculator-lifecycle-table"] thead th').then(($ths) => {
    const index = $ths.toArray().findIndex((th) => (th.textContent ?? '').includes(header));
    expect(index, `a column headed "${header}"`).to.be.greaterThan(-1);
    return cy
      .get('[data-testid="calculator-lifecycle-table"] tbody tr')
      .first()
      .find('td')
      .eq(index);
  });
};

/** The time-axis tick labels, as one string — changes when the x domain moves. */
const xAxisTicks = () =>
  cy.get('[data-testid="calculator-lifecycle-chart-svg"] .x-axis .tick text').invoke('text');

/** The rect that owns hover for the whole plot area. */
const plotOverlay = () =>
  cy.get('[data-testid="calculator-lifecycle-chart-svg"] .proximity-overlay');

/** Move the cursor to a fraction of the way across the plot. */
const hoverPlot = (fraction: number) =>
  plotOverlay().then(($rect) => {
    const width = $rect[0]!.getBoundingClientRect().width;
    plotOverlay().trigger('mousemove', width * fraction, 40);
  });

/** Click at a fraction of the way across the plot. */
const clickPlot = (fraction: number) =>
  plotOverlay().then(($rect) => {
    const width = $rect[0]!.getBoundingClientRect().width;
    plotOverlay().click(width * fraction, 40);
  });

/**
 * Plot x of the last step dot. Steps are matched to hover positions by proximity,
 * so this is the x a reader points at to ask about a measured config.
 */
const stepX = () =>
  cy
    .get('[data-testid="calculator-lifecycle-chart-svg"] .dot-group')
    .last()
    .invoke('attr', 'transform')
    .then((transform) => {
      const x = Number(/translate\((?<x>[-\d.]+)/u.exec(String(transform))?.groups?.x);
      expect(x, 'a numeric dot x').to.be.a('number');
      return x;
    });

/** This chart's tooltip: a portal on <body>, keyed by chart id. */
const readout = () => cy.get('[data-chart-tooltip="fleet-lifecycle"]');

/**
 * A table money cell as a number. Cells are compact ($1.2M, -$430k), so comparing
 * their text lexically is meaningless — these have to be parsed to be compared.
 */
const money = (text: string): number => {
  const match = /^(?<sign>-?)\$(?<value>[\d.]+)(?<suffix>[kMB])?/u.exec(text.trim());
  if (!match?.groups) throw new Error(`not a money cell: ${text}`);
  const scale = { k: 1e3, M: 1e6, B: 1e9 }[match.groups.suffix ?? ''] ?? 1;
  return Number(match.groups.value) * scale * (match.groups.sign ? -1 : 1);
};

/** All text in the chart SVG, including the axis labels. */
const chartText = () => cy.get('[data-testid="calculator-lifecycle-chart-svg"]').invoke('text');

/** Vertex count of the first plotted line — a sampled rollout curve has many. */
const lineVertices = () =>
  cy
    .get('[data-testid="calculator-lifecycle-chart-svg"] path.line-path')
    .first()
    .invoke('attr', 'd')
    .then((d) => (d ?? '').split('L').length);

describe('Fleet — Fleet Lifecycle', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      // The reproducibility nudge is on a 1.5s timer, and showing a toast
      // re-renders the chart tree — which rewrites the portal tooltip's inline
      // styles and wipes an open hover readout. That is app-wide behaviour, not
      // something this section can fix, so suppress the nudge rather than race it.
      win.sessionStorage.setItem('inferencex-reproducibility-nudge-shown', '1');
    });
    cy.visit('/fleet');
    // Readiness: the lifecycle section only mounts once run data has loaded.
    cy.get('[data-testid="calculator-lifecycle-section"]').should('exist');
  });

  beforeEach(resetToChart);

  it('defaults the power budget to 10 MW and renders the lifecycle', () => {
    cy.get('[data-testid="calculator-lifecycle-section"]')
      .should('be.visible')
      .and('contain.text', 'Fleet Lifecycle');
    cy.get('[data-testid="calc-fleet-mw-input"]').should('have.value', '10');
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('be.visible');
    cy.get('[data-testid="calculator-lifecycle-empty"]').should('not.exist');
  });

  it('keeps fleet economics inputs together in the assumptions group', () => {
    cy.viewport(1280, 900);
    cy.get('[data-testid="calculator-lifecycle-section"] fieldset').should('have.length', 2);
    cy.contains(
      '[data-testid="calculator-lifecycle-section"] fieldset',
      'Fleet economics & assumptions',
    ).within(() => {
      cy.get('[data-testid="calc-lifecycle-price-input"]').should('be.visible');
      cy.get('[data-testid="calc-lifecycle-output-price-input"]').should('be.visible');
      cy.get('[data-testid="calc-lifecycle-horizon-input"]').should('be.visible');
      cy.contains('Fleet economics & assumptions').should('be.visible');
    });
  });

  it('the default MW budget drives the lifecycle table', () => {
    // The figure opens on the chart; the table is the other tab.
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('be.visible');
    cy.get('[data-testid="calculator-lifecycle-table"]').should('not.exist');
    showTable();
    cy.get('[data-testid="calculator-lifecycle-table"]').should('be.visible');
    cy.get('[data-testid="calculator-lifecycle-table"]').within(() => {
      cy.contains('th', 'Config Now').should('exist');
      cy.contains('th', 'First Run').should('exist');
      cy.contains('th', 'Latest Best').should('exist');
      cy.contains('th', 'Improvements').should('exist');
      // Absorbed from the old Fleet Projection table: the physical sizing the
      // economics rest on, on the same row as the economics.
      cy.contains('th', 'Chips').should('exist');
      cy.contains('th', 'Concurrent Users now').should('exist');
      cy.contains('th', 'Margin $/day').should('exist');
      cy.contains('th', 'Payback').should('exist');
      cy.contains('th', 'Cumulative Margin').should('exist');
      cy.get('tbody tr').should('have.length.greaterThan', 0);
    });
    cy.get('[data-testid="calculator-lifecycle-empty"]').should('not.exist');
    // No search box over one row per chip — every one of them is named in the
    // legend and on the chart already.
    cy.get('[data-testid="calculator-lifecycle-table"] input[type="text"]').should('not.exist');
    // No cached-input assumption on a fixed sequence: those runs record no cache
    // hits at all, so the control would be a knob that moves nothing.
    cy.get('[data-testid="calc-lifecycle-cache-input"]').should('not.exist');
    // Both prices are seeded as a pair, output at 4x input — roughly where the
    // major vendors price. Asserted here, on a page nothing has edited yet: the
    // spec shares one page across tests, so a later assertion would be reading
    // whatever ratio an earlier test happened to leave behind.
    cy.get('[data-testid="calc-lifecycle-price-input"]')
      .invoke('val')
      .then((input) => {
        expect(Number(input)).to.be.greaterThan(0);
        cy.get('[data-testid="calc-lifecycle-output-price-input"]')
          .invoke('val')
          .should((output) => {
            expect(Number(output)).to.be.closeTo(Number(input) * 4, Number(input) * 0.01);
          });
      });
  });

  it('quotes both token prices in the caption, and tracks the fields', () => {
    // Every margin plotted is linear in these two, and on the margin metrics they
    // are seeded from break-even rather than typed — so without them in the
    // caption two screenshots of different scenarios are indistinguishable.
    cy.get('[data-testid="calc-lifecycle-price-input"]').clear().type('12');
    cy.get('[data-testid="calc-lifecycle-output-price-input"]').clear().type('48');
    // A whole-dollar price reads as `$12`, not `$12.0000` — the fields pad for
    // typing, the caption is prose. Cents survive; trailing zeros do not.
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('not.contain', '$12.0000');
    cy.get('[data-testid="calculator-lifecycle-figure"]').within(() => {
      cy.contains('$12 in / $48 out per M tok').should('be.visible');
      // Beside the MW figure, not instead of it.
      cy.contains('MW').should('be.visible');
    });

    // It is the figure's caption, so it survives the tab switch with the rest.
    showTable();
    cy.get('[data-testid="calculator-lifecycle-figure"]').should(
      'contain',
      '$12 in / $48 out per M tok',
    );
    showChart();

    cy.get('[data-testid="calc-lifecycle-price-input"]').clear().type('7.25');
    cy.get('[data-testid="calculator-lifecycle-figure"]').within(() => {
      cy.contains('$7.25 in / $48 out per M tok').should('be.visible');
    });

    cy.get('[data-testid="calc-lifecycle-price-input"]').clear().type('7');
    cy.get('[data-testid="calculator-lifecycle-figure"]').within(() => {
      cy.contains('$7 in / $48 out per M tok').should('be.visible');
      cy.contains('$12 in').should('not.exist');
    });

    // `testIsolation: false`, so hand the prices back to break-even before
    // leaving — later tests read the seeded values and a stale 7 makes them fail
    // for a reason that has nothing to do with what they assert. The caption
    // following the reset is the last thing worth checking anyway.
    cy.get('[data-testid="calc-lifecycle-price-reset"]').click();
    cy.get('[data-testid="calc-lifecycle-price-input"]')
      .invoke('val')
      .then((seeded) => {
        // The field pads to four decimals; the caption drops trailing zeros, so
        // the expectation has to apply the same trim rather than echo the field.
        const trimmed = String(seeded).includes('.')
          ? String(seeded).replace(/\.?0+$/u, '')
          : String(seeded);
        cy.get('[data-testid="calculator-lifecycle-figure"]').should('contain', `$${trimmed} in /`);
      });
  });

  it('puts the chart and the table on their own tabs, with a header on both', () => {
    // The header is the figure's own caption, so it survives the switch — a reader
    // on the table tab still sees what model, scenario and target they are reading.
    cy.get('[data-testid="calculator-lifecycle-figure"]').within(() => {
      cy.contains('h2', 'Fleet Lifecycle').should('be.visible');
      cy.contains('tok/s/user').should('be.visible');
    });
    cy.get('[data-testid="calculator-lifecycle-chart-svg"]').should('be.visible');
    cy.get('[data-testid="calculator-lifecycle-table"]').should('not.exist');

    showTable();
    cy.get('[data-testid="calculator-lifecycle-table"]').should('be.visible');
    cy.get('[data-testid="calculator-lifecycle-chart-svg"]').should('not.exist');
    cy.get('[data-testid="calculator-lifecycle-figure"]').within(() => {
      cy.contains('h2', 'Fleet Lifecycle').should('be.visible');
    });

    showChart();
    cy.get('[data-testid="calculator-lifecycle-chart-svg"]').should('be.visible');
  });

  it('offers a download, and disables the PNG where a PNG is meaningless', () => {
    exportMenu().should('be.visible').click();
    cy.get('[data-testid="export-csv-button"]').should('be.visible');
    // On the chart a PNG is a real artefact.
    cy.get('[data-testid="export-png-button"]').should('not.have.attr', 'aria-disabled', 'true');
    cy.get('body').type('{esc}');

    showTable();
    exportMenu().click();
    // A PNG of a paginated HTML table is not; the CSV is the export for that view.
    cy.get('[data-testid="export-png-button"]').should('have.attr', 'aria-disabled', 'true');
    cy.get('[data-testid="export-csv-button"]').should('be.visible');
    cy.get('body').type('{esc}');
  });

  it('every row is traceable to the dated run it came from', () => {
    // The caption's run date no longer describes these numbers, so each row
    // carries its own date and links its run.
    firstRowCell('First Run')
      .invoke('text')
      .should('match', /\d{4}-\d{2}-\d{2}/u);
    firstRowCell('Latest Best')
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
    showTable();
    cy.get('[data-testid="calculator-lifecycle-table"]').should('contain.text', 'Never');
  });

  it('raising the price above break-even turns margin positive and produces a payback', () => {
    cy.get('[data-testid="calc-lifecycle-price-input"]').clear();
    cy.get('[data-testid="calc-lifecycle-price-input"]').type('50');
    // Margin $/day column: positive, so no leading minus.
    firstRowCell('Margin $/day').invoke('text').should('match', /^\$/u);
    firstRowCell('Payback')
      .invoke('text')
      .should('match', /\d+(?:\.\d+)? mo/u);
  });

  it('editing the price offers a reset back to break-even', () => {
    cy.get('[data-testid="calc-lifecycle-price-reset"]').should('be.visible').click();
    cy.get('[data-testid="calc-lifecycle-price-input"]')
      .invoke('val')
      .then((val) => expect(Number(val)).to.be.lessThan(50));
  });

  it('bills the two streams apart — the output price alone moves margin', () => {
    // On 8k/1k output is a ninth of the tokens, so a blended single price could
    // not respond to this at all.
    cy.get('[data-testid="calc-lifecycle-price-input"]').clear().type('10');
    cy.get('[data-testid="calc-lifecycle-output-price-input"]').clear().type('10');
    firstRowCell('Margin $/day')
      .invoke('text')
      .then((before) => {
        cy.get('[data-testid="calc-lifecycle-output-price-input"]').clear().type('500');
        firstRowCell('Margin $/day')
          .invoke('text')
          .should((after) => {
            expect(money(after)).to.be.greaterThan(money(before));
          });
      });
  });

  it('resets both prices together, keeping the ratio the user set', () => {
    // Break-even with two prices is a line, so the reset has to pick a point on
    // it: the one that preserves the ratio currently in the fields.
    cy.get('[data-testid="calc-lifecycle-price-input"]').clear().type('10');
    cy.get('[data-testid="calc-lifecycle-output-price-input"]').clear().type('30');
    cy.get('[data-testid="calc-lifecycle-price-reset"]').click();
    cy.get('[data-testid="calc-lifecycle-price-input"]')
      .invoke('val')
      .then((input) => {
        expect(Number(input)).to.be.greaterThan(0);
        cy.get('[data-testid="calc-lifecycle-output-price-input"]')
          .invoke('val')
          .should((output) => {
            // 3x in, 3x out — not the 4x default, and not one field left behind.
            expect(Number(output)).to.be.closeTo(Number(input) * 3, Number(input) * 0.01);
          });
      });
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
        showTable();
        cy.get('[data-testid="calculator-lifecycle-table"]').should('contain', String(label));
      });
  });

  it('reads every plotted chip at the hovered date, not just one point', () => {
    // Hovering anywhere in the plot has to answer "what is each chip doing here?".
    // Per-point tooltips could not: comparing two chips at one date meant hovering
    // twice and holding the first number in your head.
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] path.line-path').then((lines) => {
      // Late in the window, where every chip has been measured — a chip first
      // measured mid-window has no line, and so no row, before that.
      hoverPlot(0.9);
      cy.get('[data-testid="calculator-lifecycle-chart-svg"] .ruler-group').should(
        'have.css',
        'display',
        'block',
      );
      cy.get('[data-testid="calculator-lifecycle-chart-svg"] .vertical-ruler').should('exist');
      // One row per line, each with a money figure, under the hovered date.
      // Not `:visible` — Cypress treats a fixed-position element as hidden when
      // something else answers elementFromPoint at its centre, and an unfrozen
      // readout sets pointer-events: none, so the plot answers instead.
      readout()
        .should('have.css', 'display', 'block')
        .and('contain.text', '$')
        .invoke('text')
        .should('match', /\d{2} \w{3} \d{4}/u);
      readout().find('tbody tr').should('have.length', lines.length);
    });
    // Earlier than the newest chip's first measurement, that chip has no number
    // to give, and the readout says nothing rather than inventing one.
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] path.line-path').then((lines) => {
      hoverPlot(0.05);
      readout()
        .find('tbody tr')
        .should('have.length.greaterThan', 0)
        .and('have.length.lessThan', lines.length);
    });
  });

  it('freezes the readout on click, and releases it on the next click', () => {
    hoverPlot(0.4);
    readout()
      .invoke('text')
      .then((hovered) => {
        // The date is what identifies a readout; the rest of the text legitimately
        // changes on freeze, since freezing adds any step's config detail.
        const frozenDate = /\d{2} \w{3} \d{4}/u.exec(hovered)?.[0];
        expect(frozenDate, 'a date in the hover readout').to.be.a('string');
        clickPlot(0.4);
        readout()
          .should('have.css', 'pointer-events', 'auto')
          .and('contain.text', String(frozenDate));
        // Frozen means frozen: moving the cursor elsewhere must not re-read.
        hoverPlot(0.7);
        readout().should('contain.text', String(frozenDate));
        // The same gesture releases it, so the reader is never stuck with a
        // stale readout pinned over the lines.
        clickPlot(0.7);
        readout().should('have.css', 'display', 'none');
      });
  });

  it('keeps config detail out of the hover readout, showing it only once frozen', () => {
    // Hovering is for scanning: the popup keeps one shape wherever the cursor is.
    // A step block appearing as the cursor crosses a dot reflows the rows under
    // the reader and buries the comparison they came for.
    stepX().then((x) => {
      plotOverlay().trigger('mousemove', x, 40);
      readout().should('have.css', 'display', 'block').and('not.contain.text', 'Config');
      plotOverlay().click(x, 40);
      readout().should('contain.text', 'Config');
      // Leave nothing frozen for the next test.
      plotOverlay().click(x, 40);
    });
  });

  it('links the run behind any step, not just the first and last', () => {
    // The table links only the opening and closing sweeps. Intermediate rungs are
    // exactly where an anomalous run that was never purged would sit, so freezing
    // one has to expose its run — otherwise that rung is auditable nowhere.
    // The hover grid never lands exactly on a step's instant, so steps match by
    // proximity; this asserts that freezing works from a dot's own x.
    stepX().then((x) => {
      plotOverlay().click(x, 40);
    });
    readout()
      .find('a')
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

    // Cumulative revenue is a running total in $, not a rate in $/day. Zero is
    // where every chip starts rather than a threshold anything crosses, so the
    // break-even rule stays off here too. (The axis does carry one negative tick:
    // the domain is padded 5% below its floor, which on a tens-of-millions span
    // rounds to a visible one. That is scale padding, not plotted data.)
    cy.get('[data-testid="calc-lifecycle-metric-cumulative-revenue"]').click();
    chartText().should('contain', 'Cumulative Revenue ($)');
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-zero-rule').should(
      'not.exist',
    );

    cy.get('[data-testid="calc-lifecycle-metric-margin"]').click();
    chartText().should('contain', 'Margin ($/day)');
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-zero-rule').should('exist');

    // Margin per MW is the same quantity in the unit a power-constrained plan is
    // written in, so it is a positive rescale: zero is still break-even and the
    // rule stays. The axis ticks must differ from the $/day ones captured just
    // above — the fleet is several MW, so a metric that was relabelled but never
    // divided would reproduce them exactly. Comparing against any other metric's
    // axis would pass without the division ever happening.
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .y-axis')
      .invoke('text')
      .then((perDay) => {
        cy.get('[data-testid="calc-lifecycle-metric-margin-per-mw"]').click();
        chartText().should('contain', 'Margin ($/MW/day)');
        cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-zero-rule').should(
          'exist',
        );
        cy.get('[data-testid="calculator-lifecycle-chart-svg"] .y-axis')
          .invoke('text')
          .should((perMw) => {
            expect(perMw, 'the per-MW axis is not the $/day axis relabelled').to.not.equal(perDay);
          });
      });

    cy.get('[data-testid="calc-lifecycle-metric-margin"]').click();
    chartText().should('contain', 'Margin ($/day)');
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-zero-rule').should('exist');
  });

  it('a longer horizon accumulates more of whatever the daily margin is', () => {
    // Direction, not just difference: a regression that moved this the wrong way
    // would satisfy a bare `not.equal` while inverting the finding. The direction
    // is not "up" — the price defaults to the cheapest chip's break-even, so the
    // first row is typically losing money, and more months of a negative rate is a
    // deeper hole. Reading the sign off the $/day column keeps the assertion true
    // of the physics rather than of one fixture's profitability.
    cy.get('[data-testid="calc-lifecycle-horizon-input"]').clear();
    cy.get('[data-testid="calc-lifecycle-horizon-input"]').type('24');
    firstRowCell('Margin $/day')
      .invoke('text')
      .then((perDay) => {
        const sign = Math.sign(money(perDay));
        expect(sign, 'a non-zero daily margin to accumulate').to.not.equal(0);
        firstRowCell('Cumulative Margin')
          .invoke('text')
          .then((short) => {
            cy.get('[data-testid="calc-lifecycle-horizon-input"]').clear();
            cy.get('[data-testid="calc-lifecycle-horizon-input"]').type('96');
            firstRowCell('Cumulative Margin')
              .invoke('text')
              .should((long) => {
                const delta = (money(long) - money(short)) * sign;
                expect(delta, 'cumulative margin moves with the daily rate').to.be.greaterThan(0);
              });
          });
      });
  });

  it('tracks measured config improvements as steps, not one flat plateau', () => {
    showTable();
    // The point of the section: a chip's revenue follows its optimisation
    // history, so at least one chip must show more than zero improvements.
    cy.get('[data-testid="calculator-lifecycle-table"] tbody tr').then(($rows) => {
      const improvements = [...$rows].map((row) =>
        Number.parseInt(row.querySelectorAll('td')[4]!.textContent ?? '0', 10),
      );
      expect(Math.max(...improvements)).to.be.greaterThan(0);
    });
    // Gain over the opening config is reported as a multiple.
    firstRowCell('Gain')
      .invoke('text')
      .should('match', /^\d+(?:\.\d+)?×$/u);
  });

  it('rolls each config out over the ramp instead of stepping instantly', () => {
    // Reads both views, so it switches deliberately: `firstRowCell` moves to the
    // table, and the vertex counts are only meaningful on the chart.
    cy.get('[data-testid="calc-lifecycle-ramp-input"]')
      .should('have.value', '0.5')
      .and('have.attr', 'step', '0.25');
    lineVertices().then((curved) => {
      // Rollouts are sampled into curves, so the line cannot be a bare staircase.
      expect(curved).to.be.greaterThan(20);
      // A longer ramp reaches each config's numbers later, so it earns less.
      firstRowCell('Cumulative Margin')
        .invoke('text')
        .then((short) => {
          cy.get('[data-testid="calc-lifecycle-ramp-input"]').clear();
          cy.get('[data-testid="calc-lifecycle-ramp-input"]').type('18');
          // "Earns less" is the claim, so assert less — not merely different.
          firstRowCell('Cumulative Margin')
            .invoke('text')
            .should((long) => expect(money(long)).to.be.lessThan(money(short)));
          // Ramp 0 means configs take effect instantly — a pure staircase, which
          // needs far fewer vertices than the sampled curves.
          cy.get('[data-testid="calc-lifecycle-ramp-input"]').clear();
          cy.get('[data-testid="calc-lifecycle-ramp-input"]').type('0');
          showChart();
          lineVertices().should((stepped) => expect(stepped).to.be.lessThan(curved));
        });
    });
  });

  it('a shorter MTBI lowers availability', () => {
    cy.get('[data-testid="calc-lifecycle-mtbi-input"]').clear();
    cy.get('[data-testid="calc-lifecycle-mtbi-input"]').type('60');
    firstRowCell('Availability')
      .invoke('text')
      .then((high) => {
        cy.get('[data-testid="calc-lifecycle-mtbi-input"]').clear();
        cy.get('[data-testid="calc-lifecycle-mtbi-input"]').type('2');
        firstRowCell('Availability')
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
    showTable();
    // The history holds many hwKeys per chip (b200_sglang, b200_trtllm, …) and
    // they are one piece of silicon, so the chip must not repeat down the table.
    cy.get('[data-testid="calculator-lifecycle-table"] tbody tr').then(($rows) => {
      const chips = [...$rows].map((row) => row.querySelectorAll('td')[0]!.textContent?.trim());
      expect(chips.length).to.be.greaterThan(0);
      expect(new Set(chips).size).to.equal(chips.length);
    });
    // And each row names the config it ended up on, since that changes along the line.
    firstRowCell('Config Now').invoke('text').should('not.be.empty');
  });

  it('follows legend visibility', () => {
    // The legend lives in the controls card, outside the figure, so it stays
    // reachable from the table view and even when nothing is plottable.
    showTable();
    // Legend entries are configs and clicking one isolates it. Configs sit one
    // level below the lines now, so isolating a single config leaves at most one
    // chip — and none at all when that config was never measured at the target,
    // which is a legitimate state rather than a broken chart. The section-level
    // assertion covers both: the table shows at most one row, or is absent
    // entirely in favour of the explanatory message.
    cy.get('[data-testid="calculator-lifecycle-table"] tbody tr').then(($rows) => {
      const fullCount = $rows.length;
      expect(fullCount).to.be.greaterThan(1);
      cy.get('[data-testid="fleet-legend"] ul label').first().click();
      cy.get('[data-testid="calculator-lifecycle-section"]').should(($section) => {
        expect(
          $section.find('[data-testid="calculator-lifecycle-table"] tbody tr').length,
        ).to.be.at.most(1);
      });
      cy.get('[data-testid="fleet-legend"] ul label').first().click();
      cy.get('[data-testid="calculator-lifecycle-table"] tbody tr').should(
        'have.length',
        fullCount,
      );
    });
  });

  it('explains chips that were never measured at an extreme target instead of dropping them', () => {
    // Pushing the target to the top of the range leaves chips outside their
    // measured interactivity; the honest answer is to say so, with the range.
    cy.get('[data-testid="fleet-controls"] input[type="range"]')
      .invoke('attr', 'max')
      .then((max) => {
        cy.get('[data-testid="fleet-controls"] input[type="number"]').clear();
        cy.get('[data-testid="fleet-controls"] input[type="number"]').type(`${max}{enter}`);
      });
    cy.get('[data-testid="calculator-lifecycle-section"]').should(
      'contain.text',
      'Not measured at this interactivity',
    );
    cy.get('[data-testid="calculator-lifecycle-unmeasured"]').should('contain.text', 'measured');
  });

  it('names the budget, not the slider, when a budget is too small to size a fleet', () => {
    // The two ways to have nothing to plot need different fixes, so they must not
    // share a message: this one is the budget, and blaming the interactivity
    // slider would send the reader to the wrong control.
    //
    // The previous test leaves the target at the top of the range, where nothing
    // is measured — which is the *other* cause, and would make `noneMeasured`
    // the correct answer. So put the target back in a measured range first, or
    // this asserts nothing about the budget at all.
    cy.get('[data-testid="fleet-controls"] input[type="number"]').clear();
    cy.get('[data-testid="fleet-controls"] input[type="number"]').type('35{enter}');
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('be.visible');

    cy.get('[data-testid="calc-fleet-mw-input"]').clear();
    cy.get('[data-testid="calc-fleet-mw-input"]').type('0.0001');
    cy.get('[data-testid="calculator-lifecycle-none"]')
      .should('be.visible')
      .and('contain.text', 'too small to power a single chip');
  });

  it('clearing the MW budget restores the empty state, and the input survives it', () => {
    cy.get('[data-testid="calc-fleet-mw-input"]').clear();
    cy.get('[data-testid="calculator-lifecycle-empty"]').should('be.visible');
    cy.get('[data-testid="calculator-lifecycle-table"]').should('not.exist');
    // The one control that must never vanish with the body it gates.
    cy.get('[data-testid="calc-fleet-mw-input"]').should('be.visible');
  });
});

describe('Fleet — self-contained lifecycle regressions', () => {
  before(() => {
    const rows = agenticB300Rows(null);
    cy.intercept('GET', '/api/v1/availability', { body: agenticAvailability });
    cy.intercept('GET', '/api/v1/benchmarks/history*', { body: rows }).as('legacyPriceHistory');
    cy.intercept('GET', '/api/v1/benchmarks*', { body: rows }).as('legacyPriceBenchmarks');
    cy.visit('/fleet?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_prec=fp4&c_mw=10&c_price=7', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.sessionStorage.setItem('inferencex-reproducibility-nudge-shown', '1');
        unlockAgenticGate(win);
      },
    });
    cy.wait('@legacyPriceBenchmarks');
    cy.wait('@legacyPriceHistory');
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('be.visible');
  });

  it('preserves c_price and derives a non-zero output price', () => {
    cy.get('[data-testid="calc-lifecycle-price-input"]').should('have.value', '7');
    cy.get('[data-testid="calc-lifecycle-output-price-input"]')
      .invoke('val')
      .should((output) => {
        expect(Number(output)).to.equal(28);
      });
  });

  it('plots revenue per MW as a real normalized y-axis metric', () => {
    cy.get('[data-testid="calc-lifecycle-metric-revenue"]').click();
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .y-axis')
      .invoke('text')
      .then((revenuePerDay) => {
        cy.get('[data-testid="calc-lifecycle-metric-revenue-per-mw"]').click();
        chartText().should('contain', 'Revenue ($/MW/day)');
        cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-zero-rule').should(
          'not.exist',
        );
        cy.get('[data-testid="calculator-lifecycle-chart-svg"] .y-axis')
          .invoke('text')
          .should((revenuePerMw) => {
            expect(revenuePerMw, 'Revenue/MW is not Revenue/day relabelled').to.not.equal(
              revenuePerDay,
            );
          });
      });
    cy.get('[data-testid="calc-lifecycle-metric-margin"]').click();
  });

  it('exports the physical fleet sizing alongside its economics', () => {
    showTable();
    cy.window().then(captureLifecycleCsvDownloads);
    exportMenu().click();
    cy.get('[data-testid="export-csv-button"]').click();

    readCapturedLifecycleCsv().then((csv) => {
      const header = csv.split('\n').find((line) => line.startsWith('Chip,'));
      expect(header, 'lifecycle CSV header').to.equal(
        'Chip,Config Now,First Run,Latest Best,Improvements,Gain,Chips,tok/s/MW now,Concurrent Users now,Revenue $/day,Cost $/day,Margin $/day,Payback,Cumulative Margin,Availability',
      );
    });
  });
});

describe('Fleet — Fleet Lifecycle with agentic traces', () => {
  // Two run dates so the staircase has a step in it, and a measured cache hit
  // rate on every row so the cached-input discount has something to apply to.
  // The shared history fixture carries ZERO agentic rows, so this spec serves
  // its own — the pattern gpu-compare-agentic-detail.cy.ts uses.
  const LATER_DATE = '2026-07-26';
  const historyRows = () => {
    const day1 = agenticB300Rows(null).map((row) => ({
      ...row,
      metrics: { ...row.metrics, server_gpu_cache_hit_rate: 0.9 } as Record<string, number>,
    }));
    // A later, faster sweep: the improvement the section exists to show.
    const day2 = day1.map((row) => ({
      ...row,
      id: row.id + 5000,
      date: LATER_DATE,
      metrics: {
        ...row.metrics,
        tput_per_gpu: row.metrics.tput_per_gpu * 1.4,
        output_tput_per_gpu: row.metrics.output_tput_per_gpu * 1.4,
        input_tput_per_gpu: row.metrics.input_tput_per_gpu * 1.4,
      },
    }));
    const b300 = [...day1, ...day2];
    return [...b300, ...b300.map((row) => ({ ...row, id: row.id + 20000, hardware: 'b200' }))];
  };

  before(() => {
    // Agentic rows have null ISL/OSL, which the default fixture model has none
    // of — so serve them the same way the main calculator spec does.
    const b300Rows = agenticB300Rows(null);
    const b200Rows = b300Rows.map((row) => ({ ...row, hardware: 'b200' }));
    cy.intercept('GET', '/api/v1/availability', {
      body: [
        ...agenticAvailability,
        ...agenticAvailability.map((row) => ({ ...row, hardware: 'b200' })),
        ...agenticAvailability.map((row) => ({ ...row, date: LATER_DATE })),
      ],
    });
    cy.intercept('GET', '/api/v1/benchmarks/history*', { body: historyRows() }).as(
      'agenticHistory',
    );
    cy.intercept('GET', '/api/v1/benchmarks*', { body: [...b300Rows, ...b200Rows] }).as(
      'agenticBenchmarks',
    );
    cy.visit('/fleet?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_prec=fp4', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        unlockAgenticGate(win);
      },
    });
    cy.wait('@agenticBenchmarks');
    // The agentic fixture exposes a single scenario, so the scenario
    // control disappears entirely — no dropdown, no static readout.
    cy.get('[data-testid="scenario-static-value"]').should('not.exist');
    cy.get('[data-testid="calc-fleet-mw-input"]').should('have.value', '10');
    cy.wait('@agenticHistory');
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('be.visible');
    showTable();
    cy.get('[data-testid="calculator-lifecycle-table"]').should('be.visible');
  });

  it('projects a lifecycle from history that has no ISL/OSL to key on', () => {
    // The section used to refuse this outright. The endpoint keys agentic
    // history on benchmark_type instead, so there is a real projection here.
    cy.get('[data-testid="calculator-lifecycle-unsupported"]').should('not.exist');
    cy.get('[data-testid="calculator-lifecycle-table"] tbody tr').should(
      'have.length.greaterThan',
      0,
    );
  });

  it('names the cached tier in the caption, since most input bills at it', () => {
    // On agentic the input price beside it is not what most tokens actually cost:
    // the measured hit rate is ~0.9 here, so quoting the input price alone would
    // overstate what a reader thinks the fleet charges.
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('contain', ', cached 10%');
    cy.get('[data-testid="calc-lifecycle-cache-input"]').clear().type('35');
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('contain', ', cached 35%');
    cy.get('[data-testid="calc-lifecycle-cache-input"]').clear().type('10');
  });

  it('raises the break-even price it seeds, because fewer tokens are billable', () => {
    cy.get('[data-testid="calc-lifecycle-cache-input"]').should('have.value', '10');
    // While the price is still auto-seeded, the discount does NOT move margin —
    // break-even re-solves to keep the cheapest fleet at zero either way. What it
    // moves is the price you need to charge, which is the economically
    // interesting statement: discounting 90% of a 133:1 input mix means asking
    // materially more per token to stand still.
    cy.get('[data-testid="calc-lifecycle-price-input"]')
      .invoke('val')
      .then((discountedPrice) => {
        cy.get('[data-testid="calc-lifecycle-cache-input"]').clear().type('100');
        cy.get('[data-testid="calc-lifecycle-price-input"]')
          .invoke('val')
          .should((fullPrice) => {
            expect(Number(discountedPrice)).to.be.greaterThan(Number(fullPrice));
          });
      });
  });

  it('lowers margin at a fixed price, where the discount has nowhere to hide', () => {
    // Take the price over so it stops re-seeding; now the cached-token discount
    // lands where a reader would expect it — on the margin.
    cy.get('[data-testid="calc-lifecycle-cache-input"]').clear().type('100');
    cy.get('[data-testid="calc-lifecycle-price-input"]').clear().type('500');
    firstRowCell('Margin $/day')
      .invoke('text')
      .then((full) => {
        cy.get('[data-testid="calc-lifecycle-cache-input"]').clear().type('10');
        firstRowCell('Margin $/day')
          .invoke('text')
          .should((discounted) => {
            expect(money(discounted)).to.be.lessThan(money(full));
          });
      });
  });
});

describe('Fleet — Fleet Lifecycle in Chinese', () => {
  before(() => {
    cy.visit('/zh/fleet', {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    });
    // Readiness: the lifecycle section only mounts once run data has loaded.
    cy.get('[data-testid="calculator-lifecycle-section"]').should('exist');
  });

  it('translates the section, including the table headers and notes', () => {
    cy.get('[data-testid="calculator-lifecycle-section"]')
      .should('contain.text', '集群生命周期')
      .and('contain.text', '设施功率 (MW)');
    cy.get('[data-testid="calc-fleet-mw-input"]').should('have.value', '10');
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('be.visible');
    // The caption's price line is translated too, units and all.
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('contain', '每百万 token');
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('contain', '输入 $');
    // The table headers this test checks are on the other tab now.
    showTable();
    cy.get('[data-testid="calculator-lifecycle-table"]').should('be.visible');
    cy.get('[data-testid="calculator-lifecycle-section"]')
      .should('contain.text', 'Token 价格')
      .and('contain.text', '每 MW 收入')
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
