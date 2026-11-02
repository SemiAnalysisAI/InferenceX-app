import {
  interceptCalculatorOverlayRun,
  OVERLAY_ONLY_HARDWARE,
  OVERLAY_RUN_BRANCH,
  OVERLAY_RUN_ID,
  SINGLE_TURN_CONFIGS,
} from '../support/overlay-fixtures';

const SEQUENCE = '1k/1k';
const BARS = '[data-testid="first-token-chart"] svg .ft-bar';
const EMPTY_MARKS = '[data-testid="first-token-chart"] svg .ft-empty';
const X_TICKS = '[data-testid="first-token-chart"] svg .x-axis .tick text';
const SUMMARY = '[data-testid="first-token-chart"] svg .ft-summary-who';

const concurrenciesAtOrAbove = (floor: number) =>
  SINGLE_TURN_CONFIGS.filter(([, intvty]) => intvty >= floor).map(([conc]) => conc);

const dismissNudges = (win: Cypress.AUTWindow) => {
  win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  win.sessionStorage.setItem('inferencex-reproducibility-nudge-shown', '1');
};

const firstRowCell = (header: string) =>
  cy.get('[data-testid="first-token-table"] thead th').then(($ths) => {
    const index = $ths.toArray().findIndex((th) => (th.textContent ?? '').includes(header));
    expect(index, `a column headed "${header}"`).to.be.greaterThan(-1);
    return cy.get('[data-testid="first-token-table"] tbody tr').first().find('td').eq(index);
  });

describe('First-Token Limits', () => {
  describe('official rows only', () => {
    before(() => {
      interceptCalculatorOverlayRun();
      cy.visit(`/first-token?i_seq=${encodeURIComponent(SEQUENCE)}&c_ttft=0.1,2`, {
        onBeforeLoad: dismissNudges,
      });
      cy.wait('@benchmarks');
      cy.get('[data-testid="first-token-figure"]').should('exist');
    });

    it('picks the cheapest row that clears the interactivity floor, not the cheapest row', () => {
      cy.get('label[for="first-token-caps"]').should('contain.text', 'TTFT Caps');
      cy.get('[data-testid="first-token-caps"]').should('have.value', '0.1,2');
      cy.get('label[for="first-token-min-interactivity"]').should(
        'contain.text',
        'Minimum Median Interactivity',
      );
      cy.get('[data-testid="first-token-min-interactivity"]')
        .should('have.value', '')
        .and('have.attr', 'placeholder', '35');
      cy.get(X_TICKS).should('have.length', 2);
      cy.get(X_TICKS).first().should('have.text', '≤0.1s');
      cy.get(X_TICKS).last().should('have.text', '≤2s');

      cy.get(BARS).should('have.length', 1);
      cy.get(BARS).should('have.attr', 'data-series', 'vendor:NVIDIA');
      cy.get(BARS).should('have.attr', 'data-hw', 'b300_sglang');
      cy.get(EMPTY_MARKS).should('have.length', 1);
      cy.get(SUMMARY).then(($texts) => {
        const labels = [...$texts].map((el) => el.textContent ?? '');
        expect(labels).to.deep.equal(['', 'B300 only']);
      });

      expect(concurrenciesAtOrAbove(35)).to.deep.equal([8, 2, 1]);
      firstRowCell('Concurrency').should('have.text', '8');
      firstRowCell('Configuration').should('contain.text', 'B300');
      firstRowCell('Median TTFT').should('have.text', '0.50');

      cy.get('[data-testid="first-token-min-interactivity"]').clear().type('120').blur();
      firstRowCell('Concurrency').should('have.text', '1');
      cy.get(BARS).should('have.length', 1);

      cy.get('[data-testid="first-token-min-interactivity"]').clear().blur();
      firstRowCell('Concurrency').should('have.text', '8');
    });

    it('repositions calculator titles and summaries in fixed-ratio PNG exports', () => {
      let downloads = 0;
      let failure: unknown;
      cy.window().then((win) => {
        cy.stub(win.HTMLAnchorElement.prototype, 'click').callsFake(
          function (this: HTMLAnchorElement) {
            if (!this.download.endsWith('.png')) return;
            try {
              const root = win.document.querySelector('#first-token-limits-export')!;
              const svg = root.querySelector('svg[data-testid="d3-chart-svg"]')!;
              const plot = svg.querySelector('.grid .border-right')!;
              const width = Number(plot.getAttribute('x1'));
              const height = Number(plot.getAttribute('y2'));
              expect(Number(svg.querySelector('.ft-x-title')!.getAttribute('x'))).to.eq(width / 2);
              expect(Number(svg.querySelector('.ft-x-title')!.getAttribute('y'))).to.eq(
                height + 82,
              );
              for (const summary of svg.querySelectorAll('.ft-summary-who')) {
                expect(Number(summary.getAttribute('y'))).to.eq(height + 40);
              }
              const bounds = svg.getBoundingClientRect();
              expect(bounds.bottom).to.be.at.most(root.getBoundingClientRect().bottom);
              downloads++;
            } catch (error) {
              failure = error;
            }
          },
        );
      });
      (['16:9', '1:1'] as const).forEach((ratio, index) => {
        cy.get('[data-testid="first-token-figure"] [data-testid="export-button"]').click();
        cy.get('[data-testid="png-aspect-ratio"]').select(ratio);
        cy.get('[data-testid="export-png-button"]').click();
        cy.wrap(null, { timeout: 30000 }).should(() => {
          if (failure) throw failure;
          expect(downloads).to.eq(index + 1);
        });
      });
    });

    it('re-picks the winner when the legend isolates another chip', () => {
      cy.get('.sidebar-legend label').contains('B200').click();
      cy.get(BARS).should('have.attr', 'data-hw', 'b200_sglang');
      cy.get(SUMMARY).last().should('have.text', 'B200 only');
      cy.get('.sidebar-legend label').contains('B200').click();
      cy.get(BARS).should('have.attr', 'data-hw', 'b300_sglang');
    });

    it('normalizes a typed ladder into the field and the axis', () => {
      cy.get('[data-testid="first-token-caps"]').clear().type('5, 1,junk,1').blur();
      cy.get('[data-testid="first-token-caps"]').should('have.value', '1,5');
      cy.get(X_TICKS).should('have.length', 2);
      cy.get(X_TICKS).first().should('have.text', '≤1s');
      cy.get(BARS).should('have.length', 2);
      cy.get('[data-testid="first-token-caps"]').clear().type('0.1,2').blur();
      cy.get(BARS).should('have.length', 1);
    });
  });

  describe('empty states', () => {
    it('blames the cap ladder, not the floor, when rows qualify but none clears a cap', () => {
      interceptCalculatorOverlayRun();
      cy.visit(`/first-token?i_seq=${encodeURIComponent(SEQUENCE)}&c_ttft=0.01`, {
        onBeforeLoad: dismissNudges,
      });
      cy.wait('@benchmarks');
      cy.get('[data-testid="first-token-none-qualify"]')
        .should('contain.text', 'largest cap on this ladder (≤0.01s)')
        .and('not.contain.text', 'Lower the floor');
      cy.get(BARS).should('not.exist');
    });

    it('blames the floor when nothing reaches the requested interactivity', () => {
      interceptCalculatorOverlayRun();
      cy.visit(`/first-token?i_seq=${encodeURIComponent(SEQUENCE)}&c_ivmin=100000`, {
        onBeforeLoad: dismissNudges,
      });
      cy.wait('@benchmarks');
      cy.get('[data-testid="first-token-none-qualify"]').should('contain.text', 'Lower the floor');
    });
  });

  describe('share-link seeding', () => {
    it('reads the interactivity floor and cap ladder from the URL', () => {
      interceptCalculatorOverlayRun();
      cy.visit(`/first-token?i_seq=${encodeURIComponent(SEQUENCE)}&c_ivmin=120&c_ttft=1`, {
        onBeforeLoad: dismissNudges,
      });
      cy.wait('@benchmarks');
      cy.get('[data-testid="first-token-min-interactivity"]').should('have.value', '120');
      cy.get('[data-testid="first-token-caps"]').should('have.value', '1');
      cy.get(X_TICKS).should('have.length', 1);
      firstRowCell('Concurrency').should('have.text', '1');
    });
  });

  describe('unofficial-run overlay', () => {
    before(() => {
      interceptCalculatorOverlayRun();
      cy.visit(
        `/first-token?unofficialrun=${OVERLAY_RUN_ID}&i_seq=${encodeURIComponent(SEQUENCE)}&c_ttft=0.1,2`,
        { onBeforeLoad: dismissNudges },
      );
      cy.wait('@unofficialRun');
      cy.get(BARS).should('have.length', 2);
    });

    it('adds the run as its own series in the palette color, never as a vendor bar', () => {
      cy.get(BARS).then(($bars) => {
        const series = [...$bars].map((el) => el.dataset.series);
        expect(series).to.deep.equal(['vendor:NVIDIA', 'run:0']);
        const fills = [...$bars].map((el) => el.getAttribute('fill') ?? '');
        expect(fills.filter((f) => f.includes('overlay-run-0'))).to.have.length(1);
      });
      cy.get(`${BARS}[data-series="run:0"]`).should('have.attr', 'data-hw', 'b300_sglang');
      cy.get(EMPTY_MARKS).should('have.length', 2);
      cy.get('.sidebar-legend').should('contain.text', OVERLAY_RUN_BRANCH);
      cy.get('.sidebar-legend').should('contain.text', OVERLAY_ONLY_HARDWARE.toUpperCase());

      cy.get('[data-testid="first-token-table"] tbody tr').should('have.length', 2);
      cy.get('[data-testid="first-token-table"] tbody').should('contain.text', OVERLAY_RUN_BRANCH);
    });

    it('lets the legend hide hardware inside the run too', () => {
      cy.get('.sidebar-legend label').contains(OVERLAY_ONLY_HARDWARE.toUpperCase()).click();
      cy.get(BARS).should('have.length', 1);
      cy.get(BARS)
        .should('have.attr', 'data-series', 'run:0')
        .and('have.attr', 'data-hw', `${OVERLAY_ONLY_HARDWARE}_sglang`);
      cy.get('.sidebar-legend label').contains(OVERLAY_ONLY_HARDWARE.toUpperCase()).click();
      cy.get(BARS).should('have.length', 2);
      cy.get(`${BARS}[data-series="run:0"]`).should('have.attr', 'data-hw', 'b300_sglang');
    });
  });

  describe('Chinese page', () => {
    it('renders the intro and Chinese control labels', () => {
      interceptCalculatorOverlayRun();
      cy.visit(`/zh/first-token?i_seq=${encodeURIComponent(SEQUENCE)}`, {
        onBeforeLoad: dismissNudges,
      });
      cy.wait('@benchmarks');
      cy.get('[data-testid="zh-tab-intro"]').should('contain.text', '首 token 延迟约束');
      cy.get('label[for="first-token-caps"]').should('contain.text', 'TTFT 上限');
      cy.get('label[for="first-token-min-interactivity"]').should('contain.text', '交互性');
      cy.get('[data-testid="first-token-figure"]').should('exist');
      cy.get(SUMMARY).last().should('have.text', '仅 B300');
    });
  });
});
