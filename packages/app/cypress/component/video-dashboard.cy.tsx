import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import VideoDashboard from '@/components/video-benchmark/VideoDashboard';
import type { VideoHistoryPage } from '@/components/video-benchmark/history';

// Retained H100/H200/B200 C1/C2/C4 observations (cypress/fixtures/api/video-history.json).
function mount(pathname = '/video', search = '') {
  cy.intercept('GET', '/api/video-runs?format=history&page=1*', {
    fixture: 'api/video-history.json',
  }).as('history');
  cy.intercept('GET', '/api/video-runs?page=*', { runs: [], nextPage: null });
  // The Compare panel fetches clips once in view; the component runner publishes none.
  cy.intercept('GET', '/api/video-runs?run=*', { statusCode: 204 });
  cy.window().then((win) =>
    win.history.replaceState(null, '', `${win.location.pathname}${search}`),
  );
  cy.mount(
    <PathnameContext.Provider value={pathname}>
      <VideoDashboard />
    </PathnameContext.Provider>,
  );
  cy.wait('@history');
}
const kpi = (hardware: string) =>
  cy.get(`[data-testid="video-kpi-card"][data-hardware="${hardware}"]`);
const points = () => cy.get('[data-testid="video-hardware-chart"] circle.point');
const lines = () => cy.get('[data-testid="video-hardware-chart"] path.line-path');
const tableRows = () => cy.get('[data-testid="video-points-table"] tbody tr');
// Roster order (HW_REGISTRY sort): the B200 and H100 jobs reserved 8 boards and generated on 4.
const IDLE_NOTE =
  'Per participating GPU: B200 (4 of 8), H100 (4 of 8) reserved more boards than one video uses; the idle boards are not counted.';

describe('Video hardware dashboard (retained fixture)', () => {
  it('shows stored legacy evidence without promoting it to default chart points', () => {
    cy.fixture('api/video-history.json').then((page: VideoHistoryPage) => {
      for (const entry of page.entries) entry.approved = false;
      cy.intercept('GET', '/api/video-runs?format=history&page=1*', page).as('legacy');
    });
    cy.intercept('GET', '/api/video-runs?run=*', { statusCode: 204 });
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoDashboard />
      </PathnameContext.Provider>,
    );
    cy.wait('@legacy');
    points().should('have.length', 0);
    cy.get('[data-testid="video-history-section"] summary').click();
    cy.get('[data-testid="video-history-entry"]').should('have.length', 7);
    cy.get('[data-testid="video-history-publication"]')
      .first()
      .should('contain', 'No matching approval receipt');
  });
  it('switches the cost tier, repricing the cards, the badges and the URL', () => {
    mount();
    cy.get('[data-testid="video-cost-tier"]').click();
    cy.get('[data-testid="video-cost-tier-r"]').click();
    // $2.90/GPU-hr ÷ 5.9732 videos/GPU-hr = 0.48550 → three decimals.
    kpi('h200').should('contain', '$0.485');
    kpi('h100').should('contain', '$0.372');
    kpi('b200').should('contain', '$0.321');
    cy.location('search').should('contain', 'v_tier=r');
    cy.get('[data-testid="video-chart-card"]')
      .should('contain', 'Cost tier: Rent - 3 Year Commit')
      .and('contain', 'Videos per $1 TCO (Rent - 3 Year Commit)');
    cy.get('[data-testid="video-tco-badge"]')
      .first()
      .should('contain', 'B200')
      .and('contain', '3.70');
  });
  it('never plots queued cells, even when a stale URL asks for them', () => {
    // C2/C4 exceed the single replica, so they stay in the evidence panel; the retired
    // v_queue/v_opt/v_frontier/v_basis params change neither what is drawn nor what is billed.
    mount('/video', '?v_queue=1&v_opt=1&v_frontier=1&v_basis=allocated');
    points().should('have.length', 3);
    lines().should('have.length', 0);
    cy.get('[data-testid="video-chart-caption"]').should('not.contain', 'queued');
    kpi('h100').should('contain', '$0.218');
    cy.contains('button', 'Table').click();
    tableRows().should('have.length', 3);
    cy.get('[data-testid="video-points-table"]').should('not.contain', 'queued');
    // Only C1 is scheduled once per replica: every row shows the full 20 / 20 cohort once.
    cy.get('[data-testid="data-table-preset-all"]').click();
    tableRows().each(($row) => expect($row.text()).to.include('20 / 20'));
    cy.get('[data-testid="video-idle-note"]').should('have.text', IDLE_NOTE);
  });
  it('toggles Optimal Only from the legend and restores it from v_optimal', () => {
    mount('/video', '?v_optimal=0');
    cy.get('[data-testid="video-optimal-only"]').should('have.attr', 'aria-checked', 'false');
    // Every fixture deployment is on its hardware's frontier, so the switch changes no point here.
    points().should('have.length', 3);
    cy.get('[data-testid="video-optimal-only"]').click();
    cy.get('[data-testid="video-optimal-only"]').should('have.attr', 'aria-checked', 'true');
    cy.location('search').should('not.contain', 'v_optimal');
    cy.get('[data-testid="video-optimal-only"]').click();
    cy.location('search').should('contain', 'v_optimal=0');
    points().should('have.length', 3);
  });
  it('folds Compare and the evidence by default and opens Compare for compare deep links', () => {
    mount();
    cy.get('[data-testid="video-compare"]').should('not.exist');
    cy.get('[data-testid="video-compare-toggle"]').click();
    cy.get('[data-testid="video-compare"]').should('exist');
    cy.get('[data-testid="video-compare-toggle"]').should('have.attr', 'aria-expanded', 'true');
    cy.get('[data-testid="video-evidence-toggle"]').click();
    cy.get('[data-testid="video-evidence-toggle"]').should('have.attr', 'aria-expanded', 'true');
    cy.contains('h2', 'Performance evidence').should('have.length', 1);
    mount('/video', '?v_cand=h200');
    cy.get('[data-testid="video-compare"]').should('exist');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'H200');
    cy.get('[data-testid="video-evidence-toggle"]').should('have.attr', 'aria-expanded', 'false');
  });
  it('shows placeholders while loading instead of a false "Not measured"', () => {
    cy.intercept('GET', '/api/video-runs?format=history&page=1*', (req) => {
      req.reply({ fixture: 'api/video-history.json', delay: 800 });
    }).as('slowHistory');
    cy.intercept('GET', '/api/video-runs?page=*', { runs: [], nextPage: null });
    cy.intercept('GET', '/api/video-runs?run=*', { statusCode: 204 });
    // The AUT keeps the previous test's v_ params; start from the defaults.
    cy.window().then((win) => win.history.replaceState(null, '', win.location.pathname));
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoDashboard />
      </PathnameContext.Provider>,
    );
    cy.get('[data-testid="video-kpi-skeleton"]').should('have.length', 4);
    cy.get('[data-testid="video-kpi-unavailable"]').should('not.exist');
    cy.get('[data-testid="video-idle-note"]').should('not.exist');
    cy.wait('@slowHistory');
    cy.get('[data-testid="video-kpi-skeleton"]').should('not.exist');
    kpi('h200').should('contain', '$0.204');
    kpi('mi355x').find('[data-testid="video-kpi-unavailable"]').should('exist');
    cy.get('[data-testid="video-idle-note"]').should('have.text', IDLE_NOTE);
  });
  it('keeps unknown allocation readable in cards and history at 1440px', () => {
    cy.viewport(1440, 900);
    cy.fixture('api/video-history.json').then((page: VideoHistoryPage) => {
      for (const entry of page.entries)
        for (const source of entry.sources)
          for (const observation of source.observations) observation.allocated = null;
      cy.intercept('GET', '/api/video-runs?format=history&page=1*', page).as('allocation');
    });
    cy.intercept('GET', '/api/video-runs?page=*', { runs: [], nextPage: null });
    cy.intercept('GET', '/api/video-runs?run=*', { statusCode: 204 });
    cy.window().then((win) =>
      win.history.replaceState(null, '', `${win.location.pathname}?history-hardware=H200`),
    );
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoDashboard />
      </PathnameContext.Provider>,
    );
    cy.wait('@allocation');
    kpi('h200').should('contain', '4 of — GPUs').and('contain', '5.97');
    cy.get('[data-testid="video-idle-note"]').should('not.exist');
    cy.get('[data-testid="video-history-section"]').should('have.attr', 'open');
    cy.get('[data-testid="video-history-observation"]').should('have.length', 3);
    cy.get('[data-testid="video-history"] input').clear().type('71de97b264b0');
    cy.get('[data-testid="video-history-observation"]').should('have.length', 3);
    cy.get('[data-testid="video-history-observation"]').first().should('contain', 'n=4');
    cy.get('[data-testid="video-history-power"]').should('contain', 'Measured');
    cy.get('[data-testid="video-history"]').should(($history) => {
      expect($history[0].getBoundingClientRect().width).to.be.at.most(1440);
    });
  });
  it('states each published source’s GPU power verdict in the history list', () => {
    // Native srt-slurm sources record power_verified; retained supervisor sources do not.
    cy.fixture('api/video-history.json').then((page) => {
      page.entries[0].sources[0].powerVerified = true;
      page.entries[2].sources[0].powerVerified = false;
      cy.intercept('GET', '/api/video-runs?format=history&page=1*', page).as('verdicts');
    });
    cy.intercept('GET', '/api/video-runs?page=*', { runs: [], nextPage: null });
    cy.intercept('GET', '/api/video-runs?run=*', { statusCode: 204 });
    cy.window().then((win) =>
      win.history.replaceState(null, '', `${win.location.pathname}?history-query=`),
    );
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoDashboard />
      </PathnameContext.Provider>,
    );
    cy.wait('@verdicts');
    cy.get('[data-testid="video-history-entry"]').should('have.length', 7);
    cy.get('[data-testid="video-history-publication"]')
      .first()
      .should('contain', 'Approved for dashboard');
    cy.get('[data-testid="video-history-publication"]')
      .eq(4)
      .should('contain', 'No matching approval receipt');
    cy.get('[data-testid="video-history-power"]').should(($verdicts) => {
      expect([...$verdicts].map((el) => el.textContent?.trim())).to.deep.equal([
        '· GPU power: Measured',
        '· GPU power: Not measured',
        // The retained native H200 run records its own verdict.
        '· GPU power: Measured',
      ]);
    });
  });
});
