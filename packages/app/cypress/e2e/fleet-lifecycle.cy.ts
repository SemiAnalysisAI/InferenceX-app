import {
  availability as agenticAvailability,
  b300Rows as agenticB300Rows,
} from '../support/overlay-fixtures';
import { unlockAgenticGate } from '../support/e2e';

type CsvCaptureWindow = Cypress.AUTWindow & {
  __capturedLifecycleCsvBlob?: Blob;
  __capturedLifecyclePngUrl?: string;
  __capturedLifecyclePngAxis?: string[];
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

const exportMenu = () =>
  cy.get('[data-testid="calculator-lifecycle-figure"]').find('[data-testid="export-button"]');

const showTable = () => cy.get('[data-testid="calculator-lifecycle-table-view-btn"]').click();

const showChart = () => cy.get('[data-testid="calculator-lifecycle-chart-view-btn"]').click();

function assertFleetControlLabels(locale: 'en' | 'zh' = 'en') {
  for (const [id, label] of [
    ['fleet-cost', locale === 'zh' ? '计价方式' : 'Cost Provider'],
    ['fleet-cost-type', locale === 'zh' ? 'Token 类型' : 'Token Type'],
  ]) {
    cy.get(`label[for="${id}"]`).should('have.text', label).click();
    cy.get(`button#${id}`).should('have.attr', 'aria-expanded', 'true');
    cy.get('body').type('{esc}');
    cy.get(`button#${id}`).should('have.attr', 'aria-expanded', 'false').and('be.focused');
  }
  cy.get('label[for="fleet-target"]')
    .invoke('text')
    .then((label) => {
      cy.get('[data-testid="fleet-controls"] input[type="number"]').should(
        'have.attr',
        'aria-label',
        label,
      );
    });
}

const resetToChart = () =>
  cy.get('body').then(($body) => {
    if ($body.find('[data-testid="calculator-lifecycle-chart-view-btn"]').length > 0) showChart();
  });

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

const xAxisTicks = () =>
  cy.get('[data-testid="calculator-lifecycle-chart-svg"] .x-axis .tick text').invoke('text');

const xAxisLayout = () =>
  cy.get('[data-testid="calculator-lifecycle-chart-svg"] .x-axis').invoke('html');

const assertReadableChineseAxis = () =>
  cy.get('[data-testid="calculator-lifecycle-chart-svg"] .x-axis .tick text').should(($ticks) => {
    const bounds = $ticks.toArray().map((tick) => {
      expect(tick.textContent).to.match(/^\d{4}年\d{1,2}月$/u);
      return tick.getBoundingClientRect();
    });
    for (let i = 1; i < bounds.length; i += 1) {
      expect(
        bounds[i]!.left - bounds[i - 1]!.right,
        'gap between Chinese date labels',
      ).to.be.at.least(4);
    }
  });

const plotOverlay = () =>
  cy.get('[data-testid="calculator-lifecycle-chart-svg"] .proximity-overlay');

const hoverPlot = (fraction: number) =>
  plotOverlay().then(($rect) => {
    const width = $rect[0]!.getBoundingClientRect().width;
    plotOverlay().trigger('mousemove', width * fraction, 40);
  });

const clickPlot = (fraction: number) =>
  plotOverlay().then(($rect) => {
    const width = $rect[0]!.getBoundingClientRect().width;
    plotOverlay().click(width * fraction, 40);
  });

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

const readout = () => cy.get('[data-chart-tooltip="fleet-lifecycle"]');

const money = (text: string): number => {
  const match = /^(?<sign>-?)\$(?<value>[\d.]+)(?<suffix>[kMB])?/u.exec(text.trim());
  if (!match?.groups) throw new Error(`not a money cell: ${text}`);
  const scale = { k: 1e3, M: 1e6, B: 1e9 }[match.groups.suffix ?? ''] ?? 1;
  return Number(match.groups.value) * scale * (match.groups.sign ? -1 : 1);
};

const chartText = () => cy.get('[data-testid="calculator-lifecycle-chart-svg"]').invoke('text');

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
      win.sessionStorage.setItem('inferencex-reproducibility-nudge-shown', '1');
    });
    cy.visit('/fleet');
    cy.get('[data-testid="calculator-lifecycle-section"]').should('exist');
  });

  beforeEach(resetToChart);

  it('keeps benchmark and chart controls inside their panels on phones and desktops', () => {
    for (const width of [375, 1440]) {
      cy.viewport(width, 900);
      cy.get('[data-testid="fleet-benchmark-panel"]').within(() => {
        cy.get('legend').should('have.text', 'Benchmark Config');
        cy.get('#fleet-model').should('exist');
        cy.get('#fleet-sequence').should('exist');
        cy.get('#fleet-precision').should('exist');
      });
      cy.get('[data-testid="fleet-chart-panel"]').within(() => {
        cy.get('legend').should('have.text', 'Chart Config');
        cy.get('#fleet-cost').should('exist');
        cy.get('#fleet-cost-type').should('exist');
        cy.get('#fleet-target').should('exist');
      });
      cy.get('[data-testid="fleet-controls"] fieldset').should(($panels) => {
        for (const panel of $panels) {
          const bounds = panel.getBoundingClientRect();
          expect(bounds.left).to.be.at.least(0);
          expect(bounds.right).to.be.at.most(width);
          for (const control of panel.querySelectorAll('input, button[role="combobox"]')) {
            const rect = control.getBoundingClientRect();
            expect(rect.left, `${control.id} left`).to.be.at.least(bounds.left);
            expect(rect.right, `${control.id} right`).to.be.at.most(bounds.right);
          }
        }
      });
      assertFleetControlLabels();
    }
  });

  it('the default MW budget drives the lifecycle table', () => {
    assertFleetControlLabels();
    cy.get('[data-testid="calculator-lifecycle-section"]')
      .should('be.visible')
      .and('contain.text', 'Fleet Lifecycle');
    cy.get('[data-testid="calc-fleet-mw-input"]').should('have.value', '10');
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('be.visible');
    cy.get('[data-testid="calculator-lifecycle-empty"]').should('not.exist');

    cy.get('[data-testid="calculator-lifecycle-figure"]').should('be.visible');
    cy.get('[data-testid="calculator-lifecycle-table"]').should('not.exist');
    showTable();
    cy.get('[data-testid="calculator-lifecycle-table"]').should('be.visible');
    cy.get('[data-testid="calculator-lifecycle-table"]').within(() => {
      cy.contains('th', 'Config Now').should('exist');
      cy.contains('th', 'First Run').should('exist');
      cy.contains('th', 'Latest Best').should('exist');
      cy.contains('th', 'Improvements').should('exist');
      cy.contains('th', 'Chips').should('exist');
      cy.contains('th', 'Concurrent Users now').should('exist');
      cy.contains('th', 'Margin $/day').should('exist');
      cy.contains('th', 'Payback').should('exist');
      cy.contains('th', 'Cumulative Margin').should('exist');
      cy.get('tbody tr').should('have.length.greaterThan', 0);
    });
    cy.get('[data-testid="calculator-lifecycle-empty"]').should('not.exist');
    cy.get('[data-testid="calculator-lifecycle-table"] input[type="text"]').should('not.exist');
    cy.get('[data-testid="calc-lifecycle-cache-input"]').should('not.exist');
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

    cy.get('[data-testid="calc-lifecycle-price-input"]')
      .invoke('val')
      .should('match', /^\d+(?:\.\d+)?$/u);
    cy.get('[data-testid="calc-lifecycle-price-input"]')
      .invoke('val')
      .then((val) => expect(Number(val)).to.be.greaterThan(0));
    showTable();
    cy.get('[data-testid="calculator-lifecycle-table"]').should('contain.text', 'Never');
  });

  it('quotes both token prices in the caption, and tracks the fields', () => {
    cy.get('[data-testid="calc-lifecycle-price-input"]').clear().type('12');
    cy.get('[data-testid="calc-lifecycle-output-price-input"]').clear().type('48');
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('not.contain', '$12.0000');
    cy.get('[data-testid="calculator-lifecycle-figure"]').within(() => {
      cy.contains('$12 in / $48 out per M tok').should('be.visible');
      cy.contains('MW').should('be.visible');
    });

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

    cy.get('[data-testid="calc-lifecycle-price-reset"]').click();
    cy.get('[data-testid="calc-lifecycle-price-input"]')
      .invoke('val')
      .then((seeded) => {
        const trimmed = String(seeded).includes('.')
          ? String(seeded).replace(/\.?0+$/u, '')
          : String(seeded);
        cy.get('[data-testid="calculator-lifecycle-figure"]').should('contain', `$${trimmed} in /`);
      });

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

    cy.get('[data-testid="calculator-lifecycle-section"]')
      .should('contain.text', 'Power and $/chip/hr are today')
      .and('contain.text', 'Unofficial runs loaded via a run link are not shown here');
    cy.get('[data-testid="calculator-lifecycle-section"]').should(
      'contain.text',
      'SemiAnalysis Datacenter Industry Model',
    );

    exportMenu().should('be.visible').click();
    cy.get('[data-testid="export-csv-button"]').should('be.visible');
    cy.get('[data-testid="export-png-button"]').should('not.have.attr', 'aria-disabled', 'true');
    cy.get('body').type('{esc}');

    showTable();
    exportMenu().click();
    cy.get('[data-testid="export-png-button"]').should('have.attr', 'aria-disabled', 'true');
    cy.get('[data-testid="export-csv-button"]').should('be.visible');
    cy.get('body').type('{esc}');
  });

  it('raising the price above break-even turns margin positive and produces a payback', () => {
    cy.get('[data-testid="calc-lifecycle-price-input"]').clear();
    cy.get('[data-testid="calc-lifecycle-price-input"]').type('50');
    firstRowCell('Margin $/day').invoke('text').should('match', /^\$/u);
    firstRowCell('Payback')
      .invoke('text')
      .should('match', /\d+(?:\.\d+)? mo/u);

    cy.get('[data-testid="calc-lifecycle-price-reset"]').should('be.visible').click();
    cy.get('[data-testid="calc-lifecycle-price-input"]')
      .invoke('val')
      .then((val) => expect(Number(val)).to.be.lessThan(50));
  });

  it('bills the two streams apart — the output price alone moves margin', () => {
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
            expect(Number(output)).to.be.closeTo(Number(input) * 3, Number(input) * 0.01);
          });
      });
  });

  it('names each line with its chip at the right edge', () => {
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] path.line-path').then((lines) => {
      cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-series-label').should(
        'have.length',
        lines.length,
      );
    });
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
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] path.line-path').then((lines) => {
      hoverPlot(0.9);
      cy.get('[data-testid="calculator-lifecycle-chart-svg"] .ruler-group').should(
        'have.css',
        'display',
        'block',
      );
      cy.get('[data-testid="calculator-lifecycle-chart-svg"] .vertical-ruler').should('exist');
      readout()
        .should('have.css', 'display', 'block')
        .and('contain.text', '$')
        .invoke('text')
        .should('match', /\d{2} \w{3} \d{4}/u);
      readout().find('tbody tr').should('have.length', lines.length);
    });
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
        const frozenDate = /\d{2} \w{3} \d{4}/u.exec(hovered)?.[0];
        expect(frozenDate, 'a date in the hover readout').to.be.a('string');
        clickPlot(0.4);
        readout()
          .should('have.css', 'pointer-events', 'auto')
          .and('contain.text', String(frozenDate));
        hoverPlot(0.7);
        readout().should('contain.text', String(frozenDate));
        clickPlot(0.7);
        readout().should('have.css', 'display', 'none');
      });
  });

  it('keeps config detail out of the hover readout, showing it only once frozen', () => {
    stepX().then((x) => {
      plotOverlay().trigger('mousemove', x, 40);
      readout().should('have.css', 'display', 'block').and('not.contain.text', 'Config');
      plotOverlay().click(x, 40);
      readout().should('contain.text', 'Config');
      plotOverlay().click(x, 40);
    });
  });

  it('links the run behind any step, not just the first and last', () => {
    stepX().then((x) => {
      plotOverlay().click(x, 40);
    });
    readout()
      .find('a')
      .should('have.length.greaterThan', 0)
      .first()
      .should('have.attr', 'href')
      .and('match', /^https?:\/\//u);
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
      xAxisTicks().should('not.equal', before);
      cy.get('[data-testid="calculator-lifecycle-chart-svg"]').dblclick();
      xAxisTicks().should('equal', before);
      cy.wait(900);
    });
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] path.line-path').then((lines) => {
      cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-series-label').should(
        'have.length',
        lines.length,
      );
    });
  });

  it('switches the y axis between margin and revenue', () => {
    chartText().should('contain', 'Margin ($/day)');
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-zero-rule').should('exist');

    cy.get('[data-testid="calc-lifecycle-metric-revenue"]').click();
    chartText().should('contain', 'Revenue ($/day)');
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-zero-rule').should(
      'not.exist',
    );
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .y-axis').should(
      'not.contain.text',
      '-$',
    );

    cy.get('[data-testid="calc-lifecycle-metric-cumulative-revenue"]').click();
    chartText().should('contain', 'Cumulative Revenue ($)');
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-zero-rule').should(
      'not.exist',
    );

    cy.get('[data-testid="calc-lifecycle-metric-margin"]').click();
    chartText().should('contain', 'Margin ($/day)');
    cy.get('[data-testid="calculator-lifecycle-chart-svg"] .lifecycle-zero-rule').should('exist');

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
    cy.get('[data-testid="calculator-lifecycle-table"] tbody tr').then(($rows) => {
      const improvements = [...$rows].map((row) =>
        Number.parseInt(row.querySelectorAll('td')[4]!.textContent ?? '0', 10),
      );
      expect(Math.max(...improvements)).to.be.greaterThan(0);
    });
    firstRowCell('Gain')
      .invoke('text')
      .should('match', /^\d+(?:\.\d+)?×$/u);

    firstRowCell('First Run')
      .invoke('text')
      .should('match', /\d{4}-\d{2}-\d{2}/u);
    firstRowCell('Latest Best')
      .invoke('text')
      .should('match', /\d{4}-\d{2}-\d{2}/u);
  });

  it('rolls each config out over the ramp instead of stepping instantly', () => {
    cy.get('[data-testid="calc-lifecycle-ramp-input"]')
      .should('have.value', '0.5')
      .and('have.attr', 'step', '0.25');
    lineVertices().then((curved) => {
      expect(curved).to.be.greaterThan(20);
      firstRowCell('Cumulative Margin')
        .invoke('text')
        .then((short) => {
          cy.get('[data-testid="calc-lifecycle-ramp-input"]').clear();
          cy.get('[data-testid="calc-lifecycle-ramp-input"]').type('18');
          firstRowCell('Cumulative Margin')
            .invoke('text')
            .should((long) => expect(money(long)).to.be.lessThan(money(short)));
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

  it('draws one row per chip, pooling its software configs', () => {
    showTable();
    cy.get('[data-testid="calculator-lifecycle-table"] tbody tr').then(($rows) => {
      const chips = [...$rows].map((row) => row.querySelectorAll('td')[0]!.textContent?.trim());
      expect(chips.length).to.be.greaterThan(0);
      expect(new Set(chips).size).to.equal(chips.length);
    });
    firstRowCell('Config Now').invoke('text').should('not.be.empty');
  });

  it('follows legend visibility', () => {
    showTable();
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
      expect(csv).to.contain('TCO basis internal');
      const dataLines = csv.split('\n').filter((line) => line && !line.startsWith('#'));
      for (const line of dataLines.slice(1)) {
        expect(line.split(',').length, 'CSV row matches header width').to.equal(
          header!.split(',').length,
        );
      }
      expect(header, 'lifecycle CSV header').to.equal(
        'Chip,Config Now,First Run,Latest Best,Improvements,Gain,Chips,tok/s/MW now,Concurrent Users now,Revenue $/day,Cost $/day,Margin $/day,Payback,Cumulative Margin,Availability',
      );
    });
    cy.get('[data-testid="tco-basis-toggle"]').should('not.exist');
  });
});

describe('Fleet — Fleet Lifecycle with agentic traces', () => {
  const LATER_DATE = '2026-07-26';
  const historyRows = () => {
    const day1 = agenticB300Rows(null).map((row) => ({
      ...row,
      metrics: { ...row.metrics, server_gpu_cache_hit_rate: 0.9 } as Record<string, number>,
    }));
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
    cy.get('button[data-testid="fleet-sequence-selector"]')
      .should('be.visible')
      .and('have.text', 'Agentic')
      .and('be.disabled');
    cy.get('button[data-testid="fleet-precision-selector"]')
      .should('have.text', 'FP4')
      .and('be.disabled');
    cy.get('[data-testid="calc-fleet-mw-input"]').should('have.value', '10');
    cy.wait('@agenticHistory');
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('be.visible');
    showTable();
    cy.get('[data-testid="calculator-lifecycle-table"]').should('be.visible');
  });

  it('names the cached tier in the caption, since most input bills at it', () => {
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('contain', ', cached 10%');
    cy.get('[data-testid="calc-lifecycle-cache-input"]').clear().type('35');
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('contain', ', cached 35%');
    cy.get('[data-testid="calc-lifecycle-cache-input"]').clear().type('10');
  });

  it('raises the break-even price it seeds, because fewer tokens are billable', () => {
    assertFleetControlLabels();
    cy.get('[data-testid="calculator-lifecycle-unsupported"]').should('not.exist');
    cy.get('[data-testid="calculator-lifecycle-table"] tbody tr').should(
      'have.length.greaterThan',
      0,
    );

    cy.get('[data-testid="calc-lifecycle-cache-input"]').should('have.value', '10');
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
        win.sessionStorage.setItem('inferencex-reproducibility-nudge-shown', '1');
      },
    });
    cy.get('[data-testid="calculator-lifecycle-section"]').should('exist');
  });

  it('keeps token-type headers and exported assumptions in Chinese as selections change', () => {
    assertFleetControlLabels('zh');
    cy.get('[data-testid="fleet-benchmark-panel"] legend').should('have.text', '基准测试配置');
    cy.get('[data-testid="fleet-chart-panel"] legend').should('have.text', '图表配置');
    cy.get('[data-testid="calculator-lifecycle-section"]')
      .should('contain.text', '集群生命周期')
      .and('contain.text', '设施功率 (MW)');
    cy.get('[data-testid="calc-fleet-mw-input"]').should('have.value', '10');
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('be.visible');
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('contain', '每百万 token');
    cy.get('[data-testid="calculator-lifecycle-figure"]').should('contain', '输入 $');
    showTable();
    cy.get('[data-testid="calculator-lifecycle-table"]').should('be.visible');
    cy.get('[data-testid="calculator-lifecycle-section"]')
      .should('contain.text', 'Token 价格')
      .and('contain.text', '每 MW 收入')
      .and('contain.text', '当前配置')
      .and('contain.text', '首次运行')
      .and('contain.text', '累计利润')
      .and('contain.text', '来源：');
    cy.get('[data-testid="calculator-lifecycle-section"]')
      .should('not.contain.text', 'Enter a facility power budget')
      .and('not.contain.text', 'Cumulative Margin')
      .and('not.contain.text', 'First Run');

    showTable();
    cy.window().then(captureLifecycleCsvDownloads);
    for (const [testId, value] of [
      ['calc-lifecycle-price-input', '1.25'],
      ['calc-lifecycle-output-price-input', '3.5'],
      ['calc-lifecycle-ramp-input', '2'],
      ['calc-lifecycle-mtbi-input', '12'],
      ['calc-lifecycle-recovery-input', '6'],
      ['calc-lifecycle-horizon-input', '18'],
      ['calc-fleet-mw-input', '4'],
    ]) {
      cy.get(`[data-testid="${testId}"]`).clear().type(value);
    }

    for (const [option, header] of [
      ['输入 Token', '当前输入 tok/s/MW'],
      ['输出 Token', '当前输出 tok/s/MW'],
      ['总 Token', '当前 tok/s/MW'],
    ]) {
      cy.get('[data-testid="fleet-cost-type-selector"]').click();
      cy.contains('[role="option"]', option).click();
      cy.get('[data-testid="calculator-lifecycle-table"] thead').should('contain.text', header);
      exportMenu().click();
      cy.get('[data-testid="export-csv-button"]').click();
      readCapturedLifecycleCsv().then((csv) => {
        expect(csv.split('\n').find((line) => line.startsWith('芯片,'))).to.contain(header);
        expect(csv.split('\n').find((line) => line.startsWith('# 假设：'))).to.equal(
          '# 假设：输入价格 $1.25/M tok，输出价格 $3.5/M tok，爬坡期 2 个月，平均中断间隔（MTBI）12 天，恢复时间 6 小时，测算期 18 个月，设施功率 4 MW，TCO 口径：内部',
        );
        expect(csv).not.to.contain('# Assumptions:');
      });
    }
  });

  it('uses the selected cost tier’s Chinese label in the assumptions footer', () => {
    for (const [option, label] of [
      ['租赁 - 3 年承诺', '租赁设备 · 3 年承诺'],
      ['自有 · 超大规模云厂商批量采购', '自有设备 · 超大规模云厂商批量采购'],
    ]) {
      cy.get('[data-testid="fleet-cost-selector"]').click();
      cy.contains('[role="option"]', option).click();
      cy.contains('[data-testid="calculator-lifecycle-section"] p', '成本 = 芯片数')
        .should('contain.text', label)
        .and('not.contain.text', 'Owning -')
        .and('not.contain.text', 'Renting -');
    }
  });

  for (const [width, height] of [
    [1280, 900],
    [390, 844],
  ]) {
    it(`keeps Chinese axis and pinned dates when zooming at ${width}px`, () => {
      cy.viewport(width, height);
      showChart();
      assertReadableChineseAxis();
      hoverPlot(0.4);
      readout()
        .should('have.css', 'display', 'block')
        .find('.font-semibold')
        .invoke('text')
        .should('match', /^\d{4}年\d{1,2}月\d{1,2}日$/u)
        .then((date) => {
          clickPlot(0.4);
          hoverPlot(0.7);
          readout().should('have.css', 'pointer-events', 'auto').and('contain.text', date);
          clickPlot(0.7);
          readout().should('have.css', 'display', 'none');
        });
      xAxisLayout().then((before) => {
        plotOverlay().then(($overlay) => {
          const bounds = $overlay[0]!.getBoundingClientRect();
          plotOverlay().trigger('wheel', {
            deltaY: -400,
            shiftKey: true,
            clientX: bounds.left + bounds.width / 2,
            clientY: bounds.top + 40,
            bubbles: true,
          });
        });
        xAxisLayout().should('not.equal', before);
        assertReadableChineseAxis();
        cy.get(
          '[data-testid="calculator-lifecycle-figure"] [data-testid="zoom-reset-button"]',
        ).click();
        xAxisLayout().should('equal', before);
        cy.wait(900);
      });

      if (width === 1280) {
        cy.window().then((win) => {
          const capture = win as CsvCaptureWindow;
          capture.__capturedLifecyclePngUrl = undefined;
          capture.__capturedLifecyclePngAxis = undefined;
          win.HTMLAnchorElement.prototype.click = function () {
            if (this.download.endsWith('.png')) {
              capture.__capturedLifecyclePngUrl = this.href;
              capture.__capturedLifecyclePngAxis = Array.from(
                win.document.querySelectorAll('#fleet-lifecycle-export .x-axis .tick text'),
                (tick) => tick.textContent ?? '',
              );
            }
          };
        });
        exportMenu().click();
        cy.get('[data-testid="export-png-button"]').click();
        cy.window()
          .should((win) => {
            expect((win as CsvCaptureWindow).__capturedLifecyclePngUrl).to.match(
              /^data:image\/png;base64,/u,
            );
          })
          .then((win) => {
            const image = (win as CsvCaptureWindow).__capturedLifecyclePngUrl!;
            const labels = (win as CsvCaptureWindow).__capturedLifecyclePngAxis!;
            expect(labels.length, 'date labels in the exported clone').to.be.greaterThan(0);
            labels.forEach((label) => expect(label).to.match(/^\d{4}年\d{1,2}月$/u));
            cy.writeFile('cypress/downloads/fleet-lifecycle-zh.png', image.split(',')[1], 'base64');
            cy.then(
              () =>
                new Cypress.Promise<void>((resolve, reject) => {
                  const png = new win.Image();
                  png.addEventListener('load', () => {
                    expect(png.naturalWidth).to.be.greaterThan(600);
                    expect(png.naturalHeight).to.be.greaterThan(400);
                    resolve();
                  });
                  png.addEventListener('error', () =>
                    reject(new Error('Exported PNG did not decode')),
                  );
                  png.src = image;
                }),
            );
          });
      }
    });
  }
});
