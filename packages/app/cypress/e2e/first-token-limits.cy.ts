/**
 * First-Token Limits (`/first-token`).
 *
 * The page reads *measured* rows: for each time-to-first-token cap, the cheapest
 * configuration per vendor that also clears an interactivity floor. The
 * fixed-sequence overlay fixtures suit it well — every row reports a 0.5 s
 * median TTFT, so a 0.1 s cap empties every slot and a 2 s cap fills them, and
 * the floor decides which concurrency wins.
 *
 * Official data: B300 (tput ×1) and B200 (×0.6), both NVIDIA, so the page shows
 * one vendor series. The unofficial run adds B300 (×1.3) and an overlay-only
 * MI355X (×0.8), which must render as the run's own bar rather than an AMD bar.
 */
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

/**
 * A named cell of the first table row, resolved by header text so a new column
 * cannot silently re-point an assertion at its neighbour.
 */
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

    it('labels the controls and reads the cap ladder from the URL', () => {
      cy.get('label[for="first-token-caps"]').should('contain.text', 'TTFT Caps');
      cy.get('[data-testid="first-token-caps"]').should('have.value', '0.1,2');
      cy.get('label[for="first-token-min-interactivity"]').should(
        'contain.text',
        'Minimum Median Interactivity',
      );
      // Fixed sequences default to the calculator's floor; the field shows it
      // as a placeholder rather than writing the default into the URL.
      cy.get('[data-testid="first-token-min-interactivity"]')
        .should('have.value', '')
        .and('have.attr', 'placeholder', '35');
      cy.get(X_TICKS).should('have.length', 2);
      cy.get(X_TICKS).first().should('have.text', '≤0.1s');
      cy.get(X_TICKS).last().should('have.text', '≤2s');
    });

    it('draws one bar per vendor under a cap the rows clear, and marks the cap they do not', () => {
      cy.get(BARS).should('have.length', 1);
      cy.get(BARS).should('have.attr', 'data-series', 'vendor:NVIDIA');
      cy.get(BARS).should('have.attr', 'data-hw', 'b300_sglang');
      cy.get(EMPTY_MARKS).should('have.length', 1);
      cy.get(SUMMARY).then(($texts) => {
        const labels = [...$texts].map((el) => el.textContent ?? '');
        expect(labels).to.deep.equal(['', 'B300 only']);
      });
    });

    it('picks the cheapest row that clears the interactivity floor, not the cheapest row', () => {
      // At the 35 tok/s floor the 48-concurrency row (10.6 tok/s) is out, so the
      // winner is the next-highest-throughput row: concurrency 8.
      expect(concurrenciesAtOrAbove(35)).to.deep.equal([8, 2, 1]);
      firstRowCell('Concurrency').should('have.text', '8');
      firstRowCell('Configuration').should('contain.text', 'B300');
      firstRowCell('Median TTFT').should('have.text', '0.50');

      // Raising the floor above 111 tok/s leaves only the single-user row.
      cy.get('[data-testid="first-token-min-interactivity"]').clear().type('120').blur();
      firstRowCell('Concurrency').should('have.text', '1');
      cy.get(BARS).should('have.length', 1);

      cy.get('[data-testid="first-token-min-interactivity"]').clear().blur();
      firstRowCell('Concurrency').should('have.text', '8');
    });

    it('re-picks the winner when the legend isolates another chip', () => {
      // Clicking a visible entry while everything is visible solos it, the
      // calculator's legend convention; clicking the lone entry restores all.
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
      // Share-link params are stripped from the address bar on load and carried
      // by the share button instead, so seeding is asserted on the controls.
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
      // The run's cheapest qualifying row is its faster B300, not the overlay-only MI355X.
      cy.get(`${BARS}[data-series="run:0"]`).should('have.attr', 'data-hw', 'b300_sglang');
      cy.get(EMPTY_MARKS).should('have.length', 2);
      cy.get('.sidebar-legend').should('contain.text', OVERLAY_RUN_BRANCH);
      cy.get('.sidebar-legend').should('contain.text', OVERLAY_ONLY_HARDWARE.toUpperCase());
    });

    it('lists the run under the branch name in the table with the official rows above', () => {
      cy.get('[data-testid="first-token-table"] tbody tr').should('have.length', 2);
      cy.get('[data-testid="first-token-table"] tbody').should('contain.text', OVERLAY_RUN_BRANCH);
    });

    it('lets the legend hide hardware inside the run too', () => {
      // Solo the overlay-only MI355X: no official chip is visible, so the vendor
      // bar goes, and the run's bar moves off its (hidden) B300 onto MI355X.
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
