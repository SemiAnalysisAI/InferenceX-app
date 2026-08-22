/**
 * First-visit coach mark on the agentic inference chart.
 *
 * The affordance it teaches is invisible: clicking an agentic scatter point
 * pins its tooltip, and the pinned tooltip carries a "View charts" link to the
 * per-point server metrics and logs. The callout draws a pointer to a real,
 * currently-visible point and goes away for good once the user either
 * dismisses it or clicks a point.
 */
import {
  interceptDerivedAgenticMetrics,
  keepAgenticCoachMark,
  unlockAgenticGate,
} from '../support/e2e';
import { plotBounds } from '@/lib/d3-chart/plot-bounds';
import { OVERLAY_RUN_ID, interceptOverlayRun } from '../support/overlay-fixtures';

// This spec owns coach-mark state, so it opts out of the global suppression in
// cypress/support/e2e.ts rather than fighting it on every visit (that hook also
// runs on cy.reload(), where onBeforeLoad cannot reach).
keepAgenticCoachMark();

const STORAGE_KEY = 'inferencex-agentic-point-coach-mark-dismissed';
const COACH_MARK = '[data-testid="agentic-point-coach-mark"]';
const AGENTIC_POINTS =
  '[data-testid="scatter-graph"] .dot-group[data-benchmark-type="agentic_traces"]';
// The pointer targets the marker inside the group, not the group's
// label-inflated bounding box.
const AGENTIC_MARKERS = `${AGENTIC_POINTS} .visible-shape`;

/**
 * Competing dashboard toasts land bottom-right, in the *overlay* slot rather
 * than the coach mark's own slot — suppressed anyway so nothing else is
 * animating while positions are measured.
 */
function freshCoachMarkState(win: Cypress.AUTWindow) {
  unlockAgenticGate(win);
  win.localStorage.removeItem(STORAGE_KEY);
  win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  win.sessionStorage.setItem('inferencex-reproducibility-nudge-shown', '1');
  win.sessionStorage.setItem('inferencex-star-nudge-shown', '1');
  win.localStorage.setItem('inferencex-filter-hint-nudge-dismissed', '1');
}

/**
 * The callout only appears once there is a point on screen to point at, and at
 * this viewport the chart starts below the fold — so bring it into view, the
 * same thing a real first-time visitor does before they can see any of this.
 */
function visitAgenticChart(url = '/inference?i_seq=agentic-traces') {
  interceptOverlayRun();
  interceptDerivedAgenticMetrics();
  cy.visit(url, { onBeforeLoad: freshCoachMarkState });
  cy.get(AGENTIC_POINTS).should('have.length.greaterThan', 0);
  cy.get('[data-testid="scatter-graph"]').scrollIntoView();
}

function centreOf(element: Element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

beforeEach(() => {
  cy.clearAllLocalStorage();
  cy.clearAllSessionStorage();
  cy.intercept('GET', '/api/v1/trace-availability?ids=*', (request) => {
    const ids = new URL(request.url).searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
    request.reply({
      body: Object.fromEntries(ids.map((id) => [id, true])),
    });
  });
});
describe('Agentic point coach mark', () => {
  it('points at a real, visible agentic point on the first visit', () => {
    visitAgenticChart();

    cy.get(COACH_MARK)
      .should('be.visible')
      .and('contain.text', 'Every point has a story')
      .and('contain.text', 'Click any point to view server metrics and logs');

    // Non-modal by construction: a focus trap or a scrim would block the very
    // click the tip is asking for.
    cy.get(COACH_MARK).should('have.attr', 'role', 'dialog');
    cy.get(COACH_MARK).should('have.attr', 'aria-modal', 'false');
    cy.get('[data-testid="agentic-point-coach-mark-layer"]').should(
      'have.css',
      'pointer-events',
      'none',
    );

    // The callout must target an actual point, not empty plot area. The
    // highlight ring sits exactly on the anchor (the pointer line deliberately
    // stops short so its arrowhead doesn't cover the dot).
    cy.get('[data-testid="agentic-point-coach-mark-pointer"]').should('exist');
    cy.get('[data-testid="agentic-point-coach-mark-target"]').then(($ring) => {
      const tipX = Number($ring.attr('cx'));
      const tipY = Number($ring.attr('cy'));

      cy.get(AGENTIC_MARKERS).then(($points) => {
        const hit = [...$points].some((point) => {
          const { x, y } = centreOf(point);
          return Math.abs(x - tipX) < 1 && Math.abs(y - tipY) < 1;
        });
        expect(hit, 'pointer ends on an agentic point').to.eq(true);
      });
    });
  });

  it('waits for the chart to be on screen before pointing at anything', () => {
    interceptOverlayRun();
    interceptDerivedAgenticMetrics();
    cy.visit('/inference?i_seq=agentic-traces', { onBeforeLoad: freshCoachMarkState });
    cy.get(AGENTIC_POINTS).should('have.length.greaterThan', 0);

    // Chart below the fold: no anchor, so no stranded arrow — and no dismissal
    // burned either, since the tip has not been shown.
    cy.window().its('scrollY').should('eq', 0);
    cy.wait(2500);
    cy.get(COACH_MARK).should('not.exist');
    cy.window().then((win) => {
      expect(win.localStorage.getItem(STORAGE_KEY)).to.eq(null);
    });

    cy.get('[data-testid="scatter-graph"]').scrollIntoView();
    cy.get(COACH_MARK).should('be.visible');
  });

  it('targets the clipped plot area, not the axis gutters', () => {
    // `plotBounds` reconstructs the clip region from the live chart DOM. If the
    // skeleton it reads ever changes shape it returns null and the resolver
    // silently falls back to the SVG box — which includes the 60px axis
    // gutters, where a zoomed point is invisible. Assert against the real DOM
    // so that fallback cannot go unnoticed.
    visitAgenticChart();
    cy.get(COACH_MARK).should('be.visible');

    cy.get('[data-testid="scatter-graph"] [data-testid="d3-chart-svg"]').then(($svg) => {
      const svg = $svg[0];
      const bounds = plotBounds(svg);
      expect(bounds, 'clip region resolves against the real chart').to.not.eq(null);

      const box = svg.getBoundingClientRect();
      expect(bounds!.left, 'left gutter excluded').to.be.greaterThan(box.left);
      expect(bounds!.bottom, 'bottom gutter excluded').to.be.lessThan(box.bottom);

      cy.get('[data-testid="agentic-point-coach-mark-target"]').then(($ring) => {
        const cx = Number($ring.attr('cx'));
        const cy = Number($ring.attr('cy'));
        expect(cx).to.be.within(bounds!.left, bounds!.right);
        expect(cy).to.be.within(bounds!.top, bounds!.bottom);
      });
    });
  });

  it('keeps the card fully on screen', () => {
    visitAgenticChart();
    cy.get(COACH_MARK).should('be.visible');

    cy.window().then((win) => {
      const rect = win.document.querySelector(COACH_MARK)!.getBoundingClientRect();
      const { clientWidth, clientHeight } = win.document.documentElement;
      expect(rect.left, 'left edge').to.be.at.least(0);
      expect(rect.top, 'top edge').to.be.at.least(0);
      expect(rect.right, 'right edge').to.be.at.most(clientWidth);
      expect(rect.bottom, 'bottom edge').to.be.at.most(clientHeight);
    });
  });

  it('follows its point when the chart is zoomed', () => {
    visitAgenticChart();
    cy.get('[data-testid="agentic-point-coach-mark-target"]').should('exist');

    // Shift+wheel is the chart's zoom gesture (see the chart instructions).
    cy.get('[data-testid="d3-chart-svg"]')
      .first()
      .trigger('wheel', { deltaY: -400, shiftKey: true, bubbles: true });

    cy.get('[data-testid="agentic-point-coach-mark-target"]').should(($ring) => {
      const tipX = Number($ring.attr('cx'));
      const tipY = Number($ring.attr('cy'));
      // Wherever the point ended up, the callout is still on top of one —
      // no stranded arrow pointing at empty plot area.
      const points = Cypress.$(AGENTIC_MARKERS)
        .filter((_i, el) => getComputedStyle(el.parentElement!).opacity !== '0')
        .toArray();
      const hit = points.some((point) => {
        const { x, y } = centreOf(point);
        return Math.abs(x - tipX) < 1.5 && Math.abs(y - tipY) < 1.5;
      });
      expect(hit, 'callout still targets an agentic point after zoom').to.eq(true);
    });
  });

  it('dismisses from the close button and stays gone after reload', () => {
    visitAgenticChart();
    cy.get(COACH_MARK).should('be.visible');

    cy.get('[data-testid="agentic-point-coach-mark-dismiss"]').click();
    cy.get(COACH_MARK).should('not.exist');
    cy.window().then((win) => {
      expect(win.localStorage.getItem(STORAGE_KEY)).to.eq('1');
    });

    interceptOverlayRun();
    interceptDerivedAgenticMetrics();
    cy.reload();
    cy.get(AGENTIC_POINTS).should('have.length.greaterThan', 0);
    cy.wait(1500);
    cy.get(COACH_MARK).should('not.exist');
  });

  it('dismisses when the user actually clicks a point', () => {
    visitAgenticChart();
    cy.get(COACH_MARK).should('be.visible');

    cy.get(AGENTIC_POINTS).first().find('.visible-shape').click({ force: true });

    cy.get(COACH_MARK).should('not.exist');
    // Clicking a point is engagement, so it persists the dismissal too.
    cy.window().then((win) => {
      expect(win.localStorage.getItem(STORAGE_KEY)).to.eq('1');
    });
    // …and the interaction it was teaching still happened.
    cy.get('[data-chart-tooltip]:visible').should('have.length', 1);
  });

  it('is dismissable from the keyboard', () => {
    visitAgenticChart();
    cy.get(COACH_MARK).should('be.visible');

    cy.get('body').type('{esc}');
    cy.get(COACH_MARK).should('not.exist');
    cy.window().then((win) => {
      expect(win.localStorage.getItem(STORAGE_KEY)).to.eq('1');
    });
  });

  it('never anchors to an unofficial-run overlay marker', () => {
    // Overlay runs have no stored trace, so their tooltip offers no
    // "View charts" link — anchoring there would teach a dead end.
    visitAgenticChart(`/inference?unofficialrun=${OVERLAY_RUN_ID}&i_seq=agentic-traces`);
    cy.wait('@unofficialRun');
    cy.get('[data-testid="scatter-graph"] .unofficial-overlay-pt').should(
      'have.length.greaterThan',
      0,
    );

    cy.get(COACH_MARK).should('be.visible');
    cy.get('[data-testid="agentic-point-coach-mark-target"]').then(($ring) => {
      const tipX = Number($ring.attr('cx'));
      const tipY = Number($ring.attr('cy'));
      const onPoint = (element: Element) => {
        const { x, y } = centreOf(element);
        return Math.abs(x - tipX) < 1 && Math.abs(y - tipY) < 1;
      };

      cy.get('[data-testid="scatter-graph"] .unofficial-overlay-pt').then(($overlay) => {
        expect([...$overlay].some(onPoint), 'pointer avoids overlay markers').to.eq(false);
      });
      cy.get(AGENTIC_MARKERS).then(($official) => {
        expect([...$official].some(onPoint), 'pointer lands on an official point').to.eq(true);
      });
    });
  });

  it('does not appear on the agentic detail page it links to', () => {
    cy.visit('/inference/agentic/206885', {
      onBeforeLoad: freshCoachMarkState,
      failOnStatusCode: false,
    });
    cy.wait(2000);
    cy.get(COACH_MARK).should('not.exist');
  });

  it('renders Simplified Chinese copy on /zh', () => {
    visitAgenticChart('/zh/inference?i_seq=agentic-traces');

    cy.get(COACH_MARK)
      .should('be.visible')
      .and('contain.text', '每个数据点背后都有细节')
      .and('contain.text', '点击任意数据点即可查看服务端指标与日志');
    cy.get('[data-testid="agentic-point-coach-mark-dismiss"]').should(
      'have.attr',
      'aria-label',
      '关闭提示',
    );
  });
});
