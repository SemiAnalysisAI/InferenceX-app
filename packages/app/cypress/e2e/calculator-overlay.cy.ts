/**
 * Unofficial-run overlays in the TCO calculator.
 *
 * A run loaded via `?unofficialrun=<id>` contributes an extra bar per hardware
 * config, interpolated separately from the official data so official bars keep
 * their own Pareto frontier. The table view, CSV export, and fleet planner stay
 * official-only by design — mixing unmerged-branch numbers into an exported
 * sheet or a fleet projection would be silently misleading.
 *
 * Fixtures are fixed-sequence (1k/1k): the calculator resolves the selected
 * sequence through `sequenceToIslOsl` and filters rows on isl/osl, so the
 * agentic overlay fixtures used by the inference specs never reach it.
 */
import {
  ALT_SEQUENCE_LABEL,
  interceptCalculatorOverlayRun,
  OVERLAY_ONLY_HARDWARE,
  OVERLAY_RUN_BRANCH,
  OVERLAY_RUN_ID,
} from '../support/overlay-fixtures';

/** Official data covers B300 only; the run adds a B300 bar and an MI355X bar. */
const TOTAL_BARS = 3;
const OVERLAY_BARS = 2;

const SEQUENCE = '1k/1k';
const SEQUENCE_LABEL = '1K / 1K';
const BARS = '[data-testid="calculator-bar-chart"] svg .bar';
const Y_TICKS = '[data-testid="calculator-bar-chart"] svg .y-axis .tick text';

const selectSequence = (label: string) => {
  cy.get('[data-testid="calc-sequence-selector"]').click();
  cy.get('[role="option"]').contains(label).click();
};

/**
 * `i_seq` is pinned because the global default sequence is 8k/1k, which the
 * fixtures also cover (with different hardware) — without pinning, the default
 * view would be the alt sequence rather than the overlay-carrying 1k/1k one.
 */
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
  describe('rendering', () => {
    before(visitCalculatorWithOverlay);

    it('renders overlay bars alongside the official bar', () => {
      cy.get(BARS).should('have.length', TOTAL_BARS);
      cy.get(Y_TICKS).should('contain.text', OVERLAY_RUN_BRANCH);
    });

    it('labels the overlay bar with ✕ and the branch, leaving the official bar unmarked', () => {
      cy.get(Y_TICKS).then(($ticks) => {
        const labels = [...$ticks].map((el) => el.textContent ?? '');
        expect(labels.filter((l) => l.includes('✕'))).to.have.length(OVERLAY_BARS);
        expect(labels.filter((l) => !l.includes('✕'))).to.have.length(TOTAL_BARS - OVERLAY_BARS);
      });
    });

    it('paints the overlay bar with the run palette color, not the hardware color', () => {
      cy.get(BARS).then(($bars) => {
        const fills = [...$bars].map((el) => el.getAttribute('fill') ?? '');
        expect(fills.filter((f) => f.includes('overlay-run-0'))).to.have.length(OVERLAY_BARS);
        expect(fills.filter((f) => !f.includes('overlay-run-'))).to.have.length(
          TOTAL_BARS - OVERLAY_BARS,
        );
      });
    });

    it('drops overlay rows belonging to a model the calculator is not showing', () => {
      // The run payload also carries glm5 rows at 5x throughput. If model
      // filtering regressed they'd render as extra bars far off the scale.
      cy.get(BARS).should('have.length', TOTAL_BARS);
    });

    it('shows the run in the legend with its palette swatch', () => {
      cy.get('.sidebar-legend').should('contain.text', OVERLAY_RUN_BRANCH);
    });
  });

  describe('hardware visibility', () => {
    beforeEach(visitCalculatorWithOverlay);

    it('lists overlay-only hardware in the legend', () => {
      // MI355X exists only in the run — without the legend merge there'd be no
      // way to hide its bar.
      cy.get('.sidebar-legend').should('contain.text', OVERLAY_ONLY_HARDWARE.toUpperCase());
    });

    it('hides a GPU official and overlay bar together when another GPU is soloed', () => {
      // Clicking one entry while all are visible solos it.
      cy.get('.sidebar-legend label').contains(OVERLAY_ONLY_HARDWARE.toUpperCase()).click();
      // Only the MI355X overlay bar survives — both B300 bars (official AND
      // overlay) are gone, proving one legend entry governs both series.
      cy.get(BARS).should('have.length', 1);
      cy.get(Y_TICKS).should('not.contain.text', 'B300');
    });

    it('brings hidden overlay bars back when the available hardware changes', () => {
      // Regression: overlay visibility used to live in a second, provider-shared
      // set that the legend reset did not reseed. Hiding a GPU, then changing
      // the selection, left the legend showing it as active while its overlay
      // bar stayed hidden by the earlier filter.
      cy.get('.sidebar-legend label').contains(OVERLAY_ONLY_HARDWARE.toUpperCase()).click();
      cy.get(BARS).should('have.length', 1);

      // 8k/1k covers different hardware, so switching there and back reseeds
      // the legend's available set.
      selectSequence(ALT_SEQUENCE_LABEL);
      cy.get(BARS).should('have.length', 1); // H100 only, no overlay data
      selectSequence(SEQUENCE_LABEL);

      cy.get(BARS).should('have.length', TOTAL_BARS);
    });

    it('restores every bar via reset filter', () => {
      cy.get('.sidebar-legend label').contains(OVERLAY_ONLY_HARDWARE.toUpperCase()).click();
      cy.get(BARS).should('have.length', 1);
      cy.contains('button', 'Reset filter').click();
      cy.get(BARS).should('have.length', TOTAL_BARS);
    });
  });

  describe('official-only surfaces', () => {
    before(visitCalculatorWithOverlay);

    it('excludes overlay rows from the table view', () => {
      cy.get('[data-testid="calculator-table-view-btn"]').click();
      cy.get('[data-testid="calculator-bar-chart"]').should('not.exist');
      cy.get('table').should('not.contain.text', '✕');
      cy.get('table').should('not.contain.text', OVERLAY_RUN_BRANCH);
      // MI355X has no official data, so it must not appear in the table either.
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
      // The branch name itself stays English (it is an identifier); the
      // surrounding chrome must not.
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
