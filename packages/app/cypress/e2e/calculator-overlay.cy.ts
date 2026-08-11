/**
 * Unofficial-run overlays in the TCO calculator.
 *
 * A run loaded via `?unofficialrun=<id>` contributes an extra bar per hardware
 * config, interpolated separately from the official data so official bars keep
 * their own Pareto frontier. The table view, CSV export, and fleet planner stay
 * official-only by design — mixing unmerged-branch numbers into an exported
 * sheet or a fleet projection would be silently misleading.
 *
 * Most fixtures are fixed-sequence (1k/1k) to cover sequence switching and
 * overlay-only hardware. A dedicated agentic case verifies trace-replay rows
 * follow the same separate-frontier overlay path.
 */
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

/** Official data covers B300 + B200; the run adds a B300 bar and an MI355X bar. */
const TOTAL_BARS = 4;
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

      // Gate locked here, so the percentile control is absent; the chart still
      // computes on the P90 default, asserted on the heading below.
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

    it('does not offer a hide control on the run legend entry', () => {
      // Run entries are labels, not series: they must not render the hide "×"
      // (it would call removeGpu with an overlay-run-* key and do nothing) nor
      // count toward the guard that stops the user emptying the chart.
      // Sanity-check the selector against a real GPU entry, so a markup change
      // can't turn the assertion below into a no-op.
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
      // Regression: the reset effect keyed on the MERGED official+overlay
      // hardware list. The unofficial run is fetched separately and usually
      // resolves after the benchmarks, so when it landed and added
      // overlay-only hardware the legend reseeded and wiped filters the user
      // had already set. Reseeding on a user-driven model/sequence change is
      // intentional; reseeding on async overlay arrival is not.
      interceptCalculatorOverlayRun({ runDelayMs: 2000 });
      cy.visit(
        `/calculator?unofficialrun=${OVERLAY_RUN_ID}&i_seq=${encodeURIComponent(SEQUENCE)}`,
        {
          onBeforeLoad(win) {
            win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
          },
        },
      );

      // Official data only, for now: B300 + B200.
      cy.get(BARS).should('have.length', 2);
      cy.get('.sidebar-legend label').contains('B300').click(); // solo B300
      cy.get(BARS).should('have.length', 1);

      cy.wait('@unofficialRun');
      // The run adds its own B300 bar and the overlay-only MI355X bar, but the
      // hidden B200 must stay hidden.
      cy.get(BARS).should('have.length', 3);
      cy.get(Y_TICKS).should('not.contain.text', SECOND_OFFICIAL_HARDWARE.toUpperCase());
    });
  });

  describe('sequence covered only by the run', () => {
    beforeEach(visitCalculatorWithOverlay);

    it('drops stale official hardware from the legend selection', () => {
      // Regression: the reset effect bailed out when the official hardware list
      // was empty, treating "no official data for this selection" as "still
      // loading". The previous selection's official keys stayed in
      // `visibleHwKeys`, so the solo/show-all arithmetic in the toggle counted
      // hardware that is not on the chart.
      selectSequence(OVERLAY_ONLY_SEQUENCE_LABEL);
      cy.get(BARS).should('have.length', 2); // both overlay-only, no official data
      cy.get(Y_TICKS).should('not.contain.text', SECOND_OFFICIAL_HARDWARE.toUpperCase());

      // With a clean selection this solos B300. With stale official keys still
      // counted, `allVisible` is false and the same click REMOVES B300 instead,
      // leaving MI355X — one bar either way, but the wrong one.
      cy.get('.sidebar-legend label').contains('B300').click();
      cy.get(BARS).should('have.length', 1);
      cy.get(Y_TICKS).should('contain.text', 'B300');
      cy.get(Y_TICKS).should('not.contain.text', OVERLAY_ONLY_HARDWARE.toUpperCase());
    });
  });

  describe('dismissing one of several runs on an overlay-only sequence', () => {
    it('keeps the surviving run visible instead of blanking the chart', () => {
      // Regression: when the additive overlay effect cleared the last visible
      // key it fell back to the OFFICIAL hardware list — which is empty on an
      // overlay-only sequence, so the chart went blank even though the other
      // run still had data. The official-list reset cannot recover it either:
      // that list stays empty across the change, so it never reseeds.
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

      // One bar per run, no official data on this sequence.
      cy.get(BARS).should('have.length', 2);

      // Solo the GPU that belongs to the first run.
      cy.get('.sidebar-legend label').contains('B300').click();
      cy.get(BARS).should('have.length', 1);

      // Dismissing that run empties the visible set — the fallback has to reach
      // for the surviving run's hardware, not the (empty) official list.
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
