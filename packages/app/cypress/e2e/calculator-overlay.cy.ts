import {
  ALT_SEQUENCE_LABEL,
  interceptOverlayRun,
  interceptCalculatorMultiRunOverlay,
  interceptCalculatorOverlayRun,
  OVERLAY_ONLY_HARDWARE,
  OVERLAY_RUN_BRANCH,
  OVERLAY_ONLY_SEQUENCE_LABEL,
  OVERLAY_RUN_ID,
  SECOND_OFFICIAL_HARDWARE,
  SECOND_OVERLAY_RUN_BRANCH,
  SECOND_OVERLAY_RUN_ID,
} from '../support/overlay-fixtures';

const TOTAL_BARS = 4;
const OVERLAY_BARS = 2;

const SEQUENCE = '1k/1k';
const SEQUENCE_LABEL = '1K / 1K';
const BARS = '[data-testid="calculator-bar-chart"] svg .bar';
const Y_TICKS = '[data-testid="calculator-bar-chart"] svg .y-axis .tick text';

const selectSequence = (label: string) => {
  cy.get('[data-testid="calc-sequence-selector"]').click('right');
  cy.contains('[data-select-option]', label).click();
};

const visitCalculatorWithOverlay = () => {
  interceptCalculatorOverlayRun();
  cy.visit(`/calculator?unofficialrun=${OVERLAY_RUN_ID}&i_seq=${encodeURIComponent(SEQUENCE)}`, {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    },
  });
  cy.wait('@unofficialRun');
  cy.get(BARS).should('have.length.at.least', 1);
};

describe('TCO calculator — unofficial run overlay', () => {
  describe('agentic trace overlay', () => {
    it('renders official and unofficial DeepSeek V4 agentic calculations separately', () => {
      interceptOverlayRun();
      cy.visit(
        `/calculator?unofficialrun=${OVERLAY_RUN_ID}&i_seq=${encodeURIComponent(
          'agentic-traces',
        )}&i_prec=fp4`,
        {
          onBeforeLoad(win) {
            win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          },
        },
      );
      cy.wait('@unofficialRun');

      cy.get('[data-testid="calc-percentile-selector"]').should('not.exist');
      cy.get(BARS).should('have.length', 2);
      cy.get(Y_TICKS).should('contain.text', OVERLAY_RUN_BRANCH);
      cy.get('[data-testid="calculator-chart-section"] h2')
        .first()
        .should('contain.text', 'P90 Interactivity');
    });
  });

  describe('rendering', () => {
    before(visitCalculatorWithOverlay);

    it('renders overlay bars alongside the official bar', () => {
      cy.get(BARS).should('have.length', TOTAL_BARS);
      cy.get(Y_TICKS).should('contain.text', OVERLAY_RUN_BRANCH);
    });

    it('paints the overlay bar with the run palette color, not the hardware color', () => {
      cy.get(Y_TICKS).then(($ticks) => {
        const labels = [...$ticks].map((el) => el.textContent ?? '');
        expect(labels.filter((l) => l.includes('✕'))).to.have.length(OVERLAY_BARS);
        expect(labels.filter((l) => !l.includes('✕'))).to.have.length(TOTAL_BARS - OVERLAY_BARS);
      });

      cy.get(BARS).then(($bars) => {
        const fills = [...$bars].map((el) => el.getAttribute('fill') ?? '');
        expect(fills.filter((f) => f.includes('overlay-run-0'))).to.have.length(OVERLAY_BARS);
        expect(fills.filter((f) => !f.includes('overlay-run-'))).to.have.length(
          TOTAL_BARS - OVERLAY_BARS,
        );
      });
    });
  });

  describe('hardware visibility', () => {
    beforeEach(visitCalculatorWithOverlay);

    it('brings hidden overlay bars back when the available hardware changes', () => {
      cy.get('.sidebar-legend label').contains(OVERLAY_ONLY_HARDWARE.toUpperCase()).click();
      cy.get(BARS).should('have.length', 1);
      cy.get(Y_TICKS).should('not.contain.text', 'B300');

      selectSequence(ALT_SEQUENCE_LABEL);
      cy.get(BARS).should('have.length', 1);
      selectSequence(SEQUENCE_LABEL);

      cy.get(BARS).should('have.length', TOTAL_BARS);
    });

    it('does not offer a hide control on the run legend entry', () => {
      cy.get(`[aria-label="Hide B300 (SGLang)"]`).should('exist');
      cy.get(`[aria-label="Hide ✕ ${OVERLAY_RUN_BRANCH}"]`).should('not.exist');
    });

    it('restores every bar via reset filter', () => {
      cy.get('.sidebar-legend label').contains(OVERLAY_ONLY_HARDWARE.toUpperCase()).click();
      cy.get(BARS).should('have.length', 1);
      cy.contains('button', 'Reset filter').click();
      cy.get(BARS).should('have.length', TOTAL_BARS);
    });
  });

  describe('late overlay arrival', () => {
    it('keeps a GPU filter the user set before the run landed', () => {
      interceptCalculatorOverlayRun({ runDelayMs: 2000 });
      cy.visit(
        `/calculator?unofficialrun=${OVERLAY_RUN_ID}&i_seq=${encodeURIComponent(SEQUENCE)}`,
        {
          onBeforeLoad(win) {
            win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          },
        },
      );

      cy.get(BARS).should('have.length', 2);
      cy.get('.sidebar-legend label').contains('B300').click();
      cy.get(BARS).should('have.length', 1);

      cy.wait('@unofficialRun');
      cy.get(BARS).should('have.length', 3);
      cy.get(Y_TICKS).should('not.contain.text', SECOND_OFFICIAL_HARDWARE.toUpperCase());
    });
  });

  describe('sequence covered only by the run', () => {
    beforeEach(visitCalculatorWithOverlay);

    it('drops stale official hardware from the legend selection', () => {
      selectSequence(OVERLAY_ONLY_SEQUENCE_LABEL);
      cy.get(BARS).should('have.length', 2);
      cy.get(Y_TICKS).should('not.contain.text', SECOND_OFFICIAL_HARDWARE.toUpperCase());

      cy.get('.sidebar-legend label').contains('B300').click();
      cy.get(BARS).should('have.length', 1);
      cy.get(Y_TICKS).should('contain.text', 'B300');
      cy.get(Y_TICKS).should('not.contain.text', OVERLAY_ONLY_HARDWARE.toUpperCase());
    });
  });

  describe('dismissing one of several runs on an overlay-only sequence', () => {
    it('keeps the surviving run visible instead of blanking the chart', () => {
      interceptCalculatorMultiRunOverlay();
      cy.visit(
        `/calculator?unofficialruns=${OVERLAY_RUN_ID},${SECOND_OVERLAY_RUN_ID}` +
          `&i_seq=${encodeURIComponent('1k/8k')}`,
        {
          onBeforeLoad(win) {
            win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          },
        },
      );
      cy.wait('@unofficialRun');

      cy.get(BARS).should('have.length', 2);

      cy.get('.sidebar-legend label').contains('B300').click();
      cy.get(BARS).should('have.length', 1);

      cy.get(`[aria-label="Dismiss ${OVERLAY_RUN_BRANCH}"]`).click();
      cy.get(BARS).should('have.length', 1);
      cy.get(Y_TICKS).should('contain.text', SECOND_OVERLAY_RUN_BRANCH);
    });
  });

  describe('official-only surfaces', () => {
    before(visitCalculatorWithOverlay);

    it('excludes overlay rows from the table view', () => {
      cy.get('[data-testid="calculator-table-view-btn"]').click();
      cy.get('[data-testid="calculator-bar-chart"]').should('not.exist');
      cy.get('table').should('not.contain.text', '✕');
      cy.get('table').should('not.contain.text', OVERLAY_RUN_BRANCH);
      cy.get('table').should('not.contain.text', OVERLAY_ONLY_HARDWARE.toUpperCase());
    });
  });

  describe('Chinese page', () => {
    before(() => {
      interceptCalculatorOverlayRun();
      cy.visit(
        `/zh/calculator?unofficialrun=${OVERLAY_RUN_ID}&i_seq=${encodeURIComponent(SEQUENCE)}`,
        {
          onBeforeLoad(win) {
            win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          },
        },
      );
      cy.wait('@unofficialRun');
      cy.get(BARS).should('have.length', TOTAL_BARS);
    });

    it('renders the overlay legend strings in Chinese', () => {
      cy.get('.sidebar-legend').should('contain.text', OVERLAY_RUN_BRANCH);
      cy.get('.sidebar-legend').should('not.contain.text', 'UNOFFICIAL RUN');
    });
  });

  describe('dismissal', () => {
    before(visitCalculatorWithOverlay);

    it('removes the overlay bar when the run is dismissed from the banner', () => {
      cy.get(BARS).should('have.length', TOTAL_BARS);
      cy.get(`[aria-label="Dismiss ${OVERLAY_RUN_BRANCH}"]`).click();
      cy.get(BARS).should('have.length', TOTAL_BARS - OVERLAY_BARS);
      cy.get(Y_TICKS).should('not.contain.text', OVERLAY_RUN_BRANCH);
      cy.url().should('not.include', 'unofficialrun');
    });
  });
});
