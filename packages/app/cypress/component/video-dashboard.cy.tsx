import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import VideoDashboard from '@/components/video-benchmark/VideoDashboard';

// Retained H100/H200/B200 C1/C2/C4 observations (cypress/fixtures/api/video-history.json).
function mount(pathname = '/video', search = '') {
  cy.intercept('GET', '/api/video-runs?format=history&page=1', {
    fixture: 'api/video-history.json',
  }).as('history');
  cy.intercept('GET', '/api/video-runs?page=*', { runs: [], nextPage: null });
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
const hull = () => cy.get('[data-testid="video-hardware-chart"] path.roofline-path');

describe('Video hardware dashboard (retained fixture)', () => {
  it('plots one C1 point per measured hardware and lists MI355X as unavailable', () => {
    mount();
    points().should('have.length', 3);
    lines().should('have.length', 0);
    hull().should('have.length', 0);
    cy.get('[data-testid="video-chart-caption"]').should(
      'contain',
      'One deployment measured per hardware so far (4 GPU · TP2 × Ulysses 2)',
    );
    cy.get('[data-testid="video-config-bar"]').should('contain', '4 GPU · TP2 × Ulysses 2');
    cy.get('[data-testid="video-kpi-card"]').should('have.length', 4);
    kpi('mi355x').find('[data-testid="video-kpi-unavailable"]').should('contain', 'Not measured');
    kpi('h200').should('contain', '$0.204').and('contain', '150.6').and('contain', '97.4');
    kpi('b200').should('contain', '$0.150');
    kpi('h100').should('contain', '$0.218').and('contain', '4 of 8 GPUs · TP2 × Ulysses 2');
    cy.get('[data-testid="video-config-bar"]').should(
      'contain',
      '1344 × 768 · 8 s · 24 fps · 50 steps',
    );
    cy.get('[data-testid="video-chart-card"]').should(
      'contain',
      'MiniMaxAI/MiniMax-H3 @ 42ed227ee7df',
    );
  });
  it('switches cost tier and GPU basis, reflecting both in the URL and the cards', () => {
    mount();
    cy.get('[role="combobox"][aria-label="Cost tier"]').click();
    cy.contains('[role="option"]', 'Rent - 3 Year Commit').click();
    // 2.9 $/hr ÷ 5.9732 videos/GPU-hr = 0.48550 → rounds down at three decimals.
    kpi('h200').should('contain', '$0.485');
    cy.location('search').should('contain', 'v_tier=r');
    cy.get('[data-testid="video-tco-badge"]')
      .first()
      .should('contain', 'B200')
      .and('contain', '3.70');
    cy.get('[role="combobox"][aria-label="GPU basis"]').click();
    cy.contains('[role="option"]', 'Allocated GPUs').click();
    kpi('h100').should('contain', '$0.744');
    cy.location('search').should('contain', 'v_basis=allocated');
  });
  it('plots queued cells as unjoined markers and never draws a curve through them', () => {
    mount();
    cy.get('[data-testid="video-queue"]').click();
    points().should('have.length', 9);
    lines().should('have.length', 0);
    cy.get('[data-testid="video-chart-caption"]').should('contain', 'never joined into a curve');
    cy.location('search').should('contain', 'v_queue=1');
    cy.contains('button', 'Table').click();
    cy.get('[data-testid="video-points-table"] tbody tr').should('have.length', 9);
    cy.get('[data-testid="video-points-table"]').should('contain', '2 · queued');
    cy.contains('button', 'Chart').click();
    // Optimal-only keeps every hardware's single deployment and hides the queued cells.
    cy.get('[data-testid="video-optimal"]').click();
    points().should('have.length', 3);
    cy.location('search').should('contain', 'v_opt=1');
  });
  it('explains the cross-hardware frontier switch when one hardware dominates', () => {
    mount();
    cy.get('[data-testid="video-frontier"]').click();
    cy.location('search').should('contain', 'v_frontier=1');
    hull().should('have.length', 0);
    cy.get('[data-testid="video-chart-caption"]').should('contain', 'one hardware dominates');
  });
  it('hides a hardware from the legend and shows the table view', () => {
    mount();
    cy.contains('[data-testid="video-legend"] li', 'H100').click();
    points().should('have.length', 2);
    cy.contains('button', 'Table').click();
    cy.get('[data-testid="video-points-table"] tbody tr').should('have.length', 2);
    cy.get('[data-testid="video-points-table"]')
      .should('contain', 'H200')
      .and('contain', 'B200')
      .and('not.contain', 'H100');
    cy.location('search').should('contain', 'v_view=table');
    cy.get('[data-testid="video-runs-section"]').should('not.have.attr', 'open');
  });
  it('restores v_ params from the URL and opens the runs section for run deep links', () => {
    mount('/video', '?v_y=kjPerVideo&v_x=genSpeed&v_queue=1&view=history');
    points().should('have.length', 9);
    cy.get('[data-testid="video-chart-card"]').should('contain', 'GPU-board energy per video (kJ)');
    cy.get('[data-testid="video-runs-section"]').should('have.attr', 'open');
    cy.get('[data-testid="video-ci-runs"]').should('exist');
  });
  it('reprices the API reference, updating the cards, the table and the URL', () => {
    mount();
    // 0.034 $/video-s × 8 s clip = $0.272; 5.9732 videos/GPU-hr × $0.272 − $1.22 = $0.40 profit.
    kpi('h200').should('contain', 'API $/video').and('contain', '$0.272').and('contain', '$0.40');
    // H100 on the participating basis: 5.3741 × $0.272 − $1.17 = $0.29.
    kpi('h100').should('contain', '$0.29');
    cy.get('[data-testid="video-api-reference-caption"]')
      .should('contain', 'Reference $0.034/video-s')
      .and('contain', '$0.034–$0.047')
      .and('contain', 'captured 2026-09-19')
      .and('contain', 'MiniMax Design');
    cy.get('[data-testid="video-api-price"]').clear().type('0.05');
    // $0.400 per clip; 5.9732 × $0.400 − $1.22 = $1.17 profit.
    kpi('h200').should('contain', '$0.400').and('contain', '$1.17');
    cy.location('search').should('contain', 'v_api=0.05');
    cy.contains('button', 'Table').click();
    cy.get('[data-testid="data-table-preset-all"]').click();
    cy.get('[data-testid="video-points-table"] thead')
      .should('contain', 'Revenue per GPU-hour at API list price')
      .and('contain', 'API list price ÷ TCO cost per video (Owning at Large Hyperscaler Volume)');
    // H200 row: revenue 5.9732 × $0.400 = $2.39; multiple $0.400 ÷ $0.2042 = 1.96.
    cy.contains('[data-testid="video-points-table"] tbody tr', 'H200')
      .should('contain', '$2.39')
      .and('contain', '1.96');
    cy.get('[data-testid="video-api-price-reset"]').click();
    cy.contains('[data-testid="video-points-table"] tbody tr', 'H200').should('contain', '$1.62');
    cy.location('search').should('not.contain', 'v_api');
  });
  it('keeps negative profit per GPU-hour on the canvas on the allocated basis', () => {
    mount('/video', '?v_y=profitPerGpuHour&v_basis=allocated');
    // H100 (−$0.44) and B200 (−$0.16) bill idle boards; only H200 (+$0.40) stays positive.
    points().should('have.length', 3);
    cy.get('[data-testid="video-hardware-chart"] .y-axis .tick text').should(($ticks) => {
      const labels = [...$ticks].map((el) => el.textContent ?? '');
      expect(labels.some((label) => /^[-−]/u.test(label))).to.equal(true);
    });
    cy.get('[data-testid="video-chart-card"]').should(
      'contain',
      'Profit per GPU-hour, API list price − TCO (Owning at Large Hyperscaler Volume)',
    );
    kpi('h100').should('contain', '-$0.44');
    kpi('b200').should('contain', '-$0.16');
  });
  it('caps the y axis at break-even when every hardware loses money at the rental tier', () => {
    mount('/video', '?v_y=profitPerGpuHour&v_tier=r');
    // $0.034/video-s on the participating basis against $2.00/$2.90/$3.70 GPU-hr: H100 −$0.54, H200 −$1.28, B200 −$0.56.
    points().should('have.length', 3);
    kpi('h100').should('contain', '-$0.54');
    kpi('h200').should('contain', '-$1.28');
    kpi('b200').should('contain', '-$0.56');
    cy.get('[data-testid="video-hardware-chart"] .y-axis .tick text').should(($ticks) => {
      const values = [...$ticks].map((el) => Number((el.textContent ?? '').replace('−', '-')));
      // Regression: a zero ceiling used to fall back to 1, leaving the top half of the canvas empty.
      expect(Math.max(...values)).to.equal(0);
      expect(Math.min(...values)).to.be.below(-1.2);
    });
  });
  it('shows placeholders while loading instead of a false "Not measured"', () => {
    cy.intercept('GET', '/api/video-runs?format=history&page=1', (req) => {
      req.reply({ fixture: 'api/video-history.json', delay: 800 });
    }).as('slowHistory');
    cy.intercept('GET', '/api/video-runs?page=*', { runs: [], nextPage: null });
    // The AUT keeps the previous test's v_ params; start from the defaults.
    cy.window().then((win) => win.history.replaceState(null, '', win.location.pathname));
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoDashboard />
      </PathnameContext.Provider>,
    );
    cy.get('[data-testid="video-kpi-skeleton"]').should('have.length', 4);
    cy.get('[data-testid="video-kpi-unavailable"]').should('not.exist');
    cy.wait('@slowHistory');
    cy.get('[data-testid="video-kpi-skeleton"]').should('not.exist');
    kpi('h200').should('contain', '$0.204');
    kpi('mi355x').find('[data-testid="video-kpi-unavailable"]').should('exist');
  });
  it('renders Chinese copy on /zh/video', () => {
    mount('/zh/video');
    cy.get('[data-testid="video-chart-card"]').should(
      'contain',
      '每 1 美元 TCO 生成视频数（Hyperscaler 自有设备）',
    );
    kpi('mi355x').should('contain', '未测得');
    kpi('h200').should('contain', 'API 标价 / 条视频').and('contain', '利润 / GPU 小时');
    cy.get('[data-testid="video-config-bar"]')
      .should('contain', '成本档位')
      .and('contain', 'API 价格参考（$/视频秒）')
      .and('contain', '采集于 2026-09-19');
  });
});
