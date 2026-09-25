import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import VideoDashboard from '@/components/video-benchmark/VideoDashboard';

// Retained H100/H200/B200 C1/C2/C4 observations (cypress/fixtures/api/video-history.json).
function mount(pathname = '/video', search = '') {
  cy.intercept('GET', '/api/video-runs?format=history&page=1', {
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
const headers = () => cy.get('[data-testid="video-points-table"] thead th');
// Roster order (HW_REGISTRY sort): the B200 and H100 jobs reserved 8 boards and generated on 4.
const IDLE_NOTE =
  'Per participating GPU: B200 (4 of 8), H100 (4 of 8) reserved more boards than one video uses; the idle boards are not counted.';
const IDLE_NOTE_ZH =
  '按参与计算的 GPU 计：B200（4 / 8 张）、H100（4 / 8 张）预留的板卡多于单条视频所需，空闲板卡未计入。';
const ALL_COLUMNS = [
  'Hardware',
  'Deployment',
  'Valid / scheduled',
  'P50 time to video (s)',
  'P90 time to video (s)',
  'Videos per GPU-hour',
  'Videos per $1 TCO (Owning at Large Hyperscaler Volume)',
  'TCO cost per video (Owning at Large Hyperscaler Volume)',
  'API list price per video',
  'GPU-board energy per video (kJ)',
  'Mean board power / enforced limit (%)',
  'Board power (W)',
  'CI run',
];

describe('Video hardware dashboard (retained fixture)', () => {
  it('plots one C1 point per measured hardware and lists MI355X as unavailable', () => {
    mount();
    points().should('have.length', 3);
    lines().should('have.length', 0);
    cy.get('[data-testid="video-hardware-chart"] path.roofline-path').should('not.exist');
    cy.get('[data-testid="video-chart-caption"]').should(
      'contain',
      'One deployment measured per hardware so far (4 GPU · TP2 × Ulysses 2)',
    );
    cy.get('[data-testid="video-chart-card"]')
      .should(
        'contain',
        'MiniMaxAI/MiniMax-H3 @ 42ed227ee7df · Videos per $1 TCO (Owning at Large Hyperscaler Volume) vs. P90 time to video (s)',
      )
      .and('contain', 'Cost tier: Owning at Large Hyperscaler Volume');
    cy.get('[data-testid="video-kpi-card"]').should('have.length', 4);
    kpi('mi355x').find('[data-testid="video-kpi-unavailable"]').should('contain', 'Not measured');
    // H200: 20 valid ÷ (3013.4 s × 4 participating GPUs) = 5.97 videos/GPU-hr; $1.22 ÷ 5.9732 = $0.204.
    kpi('h200')
      .should('contain', '4 of 4 GPUs · TP2 × Ulysses 2')
      .and('contain', '150.6')
      .and('contain', 'P90 151.1')
      .and('contain', '5.97')
      .and('contain', '$0.204')
      .and('contain', '411');
    kpi('b200').should('contain', '11.53').and('contain', '$0.150').and('contain', '301.1');
    // H100 divides by the 4 boards that generated, not the 8 the job reserved: $1.17 ÷ 5.3741.
    kpi('h100')
      .should('contain', '4 of 8 GPUs · TP2 × Ulysses 2')
      .and('contain', '5.37')
      .and('contain', '$0.218')
      .and('contain', '431.1');
    kpi('h100').should('not.contain', 'Profit').and('not.contain', 'Board power');
  });
  it('states model, workload and deployment as facts; the legend offers only Optimal Only', () => {
    mount();
    cy.get('[data-testid="video-config-fact"]').should(($facts) => {
      expect([...$facts].map((el) => el.textContent)).to.deep.equal([
        'ModelMiniMaxAI/MiniMax-H3 @ 42ed227ee7df',
        'Workload1344 × 768 · 8 s · 24 fps · 50 steps',
        'Deployment4 GPU · TP2 × Ulysses 2',
      ]);
    });
    cy.get('[data-testid="video-config-bar"] [role="combobox"]').should(($boxes) => {
      expect([...$boxes].map((el) => el.getAttribute('aria-label'))).to.deep.equal([
        'X-axis metric',
        'Y-axis metric',
      ]);
    });
    cy.get('[role="combobox"][aria-label="GPU basis"]').should('not.exist');
    // Same chrome as /inference: title, description and Share in one card above the panels,
    // the cost tier picked in the chart caption, Compare and the evidence folded away.
    cy.get('[data-testid="video-dashboard"] h1').should(
      'contain',
      'VideoGenX · MiniMax-H3 across hardware',
    );
    cy.get('[data-testid="share-button"]').should('exist');
    cy.get('[data-testid="video-config-bar"]').should('not.contain', 'Cost tier');
    cy.get('[data-testid="video-cost-tier"]').should(
      'contain',
      'Owning at Large Hyperscaler Volume',
    );
    cy.get('[data-testid="video-compare"]').should('not.exist');
    cy.get('[data-testid="video-compare-toggle"]').should('have.attr', 'aria-expanded', 'false');
    cy.get('[data-testid="video-evidence-toggle"]').should('have.attr', 'aria-expanded', 'false');
    cy.contains('[data-testid="video-dashboard"] h2', 'Compare');
    cy.contains('[data-testid="video-dashboard"] h2', 'Compute-bound evidence');
    cy.get('[data-testid="video-legend"]').should('contain', 'H100').and('contain', 'MI355X');
    cy.get('[data-testid="video-legend"] [role="switch"]').should('have.length', 1);
    cy.get('[data-testid="video-optimal-only"]').should('have.attr', 'aria-checked', 'true');
    cy.get('[data-testid="video-legend"]').should('contain', 'Optimal Only');
    for (const id of ['video-queue', 'video-optimal', 'video-frontier'])
      cy.get(`[data-testid="${id}"]`).should('not.exist');
    cy.get('[data-testid="video-idle-note"]').should('have.text', IDLE_NOTE);
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
  it('lists the plotted cells with the full column set on demand and no concurrency column', () => {
    mount('/video', '?v_view=table');
    cy.get('[data-testid="video-hardware-chart"]').should('not.exist');
    tableRows().should('have.length', 3);
    headers().should(($ths) => {
      expect([...$ths].map((el) => el.textContent?.trim())).to.deep.equal([
        ...ALL_COLUMNS.slice(0, 2),
        ALL_COLUMNS[3],
        ALL_COLUMNS[6],
      ]);
    });
    cy.get('[data-testid="data-table-preset-all"]').click();
    headers().should(($ths) => {
      expect([...$ths].map((el) => el.textContent?.trim())).to.deep.equal(ALL_COLUMNS);
    });
    cy.contains('[data-testid="video-points-table"] tbody tr', 'B200').should(($row) => {
      const cells = [...$row.find('td')].map((el) => el.textContent?.trim());
      expect(cells.slice(0, 12)).to.deep.equal([
        'B200',
        '4 GPU · TP2 × Ulysses 2',
        '20 / 20',
        '77.9',
        '78.3',
        '11.53',
        '6.66',
        '$0.150',
        '$0.640',
        '301.1',
        '96.4',
        '3,856',
      ]);
      expect(cells[12]).to.equal('#34341996789');
    });
  });
  it('hides a hardware from the legend and shows the table view', () => {
    mount();
    cy.contains('[data-testid="video-legend"] li', 'H100').click();
    points().should('have.length', 2);
    cy.contains('button', 'Table').click();
    tableRows().should('have.length', 2);
    cy.get('[data-testid="video-points-table"]')
      .should('contain', 'H200')
      .and('contain', 'B200')
      .and('not.contain', 'H100');
    cy.location('search').should('contain', 'v_view=table');
    cy.get('[data-testid="video-history-section"]').should('not.have.attr', 'open');
  });
  it('restores v_ params from the URL and opens the history section for history deep links', () => {
    mount('/video', '?v_y=kjPerVideo&v_x=p50Latency&v_tier=r&history-hardware=H200');
    points().should('have.length', 3);
    cy.get('[data-testid="video-chart-card"]')
      .should('contain', 'GPU-board energy per video (kJ) vs. P50 time to video (s)')
      .and('contain', 'Cost tier: Rent - 3 Year Commit');
    kpi('h200').should('contain', '$0.485');
    cy.get('[data-testid="video-history-section"]').should('have.attr', 'open');
    cy.get('[data-testid="video-history"] h1').should('contain', 'Performance history');
  });
  it('reprices the API list price beside the TCO cost, in the cards, the table and the URL', () => {
    mount();
    // 0.08 $/video-s × 8 s clip = $0.640, read beside each hardware's TCO cost per video.
    kpi('h200').should('contain', 'API list $0.640').and('contain', '$0.204');
    kpi('h100').should('contain', 'API list $0.640');
    kpi('b200').should('contain', 'API list $0.640');
    cy.get('[data-testid="video-chart-card"]').should(
      'contain',
      'API reference: $0.080/video-s (2026-09-24)',
    );
    cy.get('[data-testid="video-api-reference-caption"]')
      .should('contain', 'Reference $0.080/video-s')
      .and('contain', '$0.080–$0.130')
      .and('contain', 'captured 2026-09-24')
      .and('contain', 'MiniMax platform');
    cy.get('[data-testid="video-api-price"]').clear().type('0.05');
    // $0.400 per 8 s clip; the TCO cost itself does not move.
    kpi('h200').should('contain', 'API list $0.400').and('contain', '$0.204');
    kpi('h200').should('not.contain', '$0.640');
    cy.location('search').should('contain', 'v_api=0.05');
    cy.contains('button', 'Table').click();
    cy.get('[data-testid="data-table-preset-all"]').click();
    cy.get('[data-testid="video-points-table"] thead')
      .should('contain', 'API list price per video')
      .and('contain', 'TCO cost per video (Owning at Large Hyperscaler Volume)')
      .and('not.contain', 'Revenue')
      .and('not.contain', 'Profit');
    cy.contains('[data-testid="video-points-table"] tbody tr', 'H200')
      .should('contain', '$0.400')
      .and('contain', '$0.204');
    cy.get('[data-testid="video-api-price-reset"]').click();
    cy.contains('[data-testid="video-points-table"] tbody tr', 'H200').should('contain', '$0.640');
    kpi('h200').should('contain', 'API list $0.640');
    cy.location('search').should('not.contain', 'v_api');
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
    cy.contains('h2', 'Compute-bound evidence').should('have.length', 1);
    mount('/video', '?v_cand=h200');
    cy.get('[data-testid="video-compare"]').should('exist');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'H200');
    cy.get('[data-testid="video-evidence-toggle"]').should('have.attr', 'aria-expanded', 'false');
  });
  it('shows placeholders while loading instead of a false "Not measured"', () => {
    cy.intercept('GET', '/api/video-runs?format=history&page=1', (req) => {
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
  it('renders Chinese copy on /zh/video', () => {
    mount('/zh/video');
    cy.get('[data-testid="video-chart-card"]')
      .should('contain', '每 1 美元 TCO 生成视频数（Hyperscaler 自有设备）')
      .and('contain', '成本档位: Hyperscaler 自有设备');
    cy.get('[data-testid="video-chart-caption"]').should(
      'contain',
      '目前每种硬件只测得一种部署（4 张 GPU · TP2 × Ulysses 2）',
    );
    cy.get('[data-testid="video-idle-note"]').should('have.text', IDLE_NOTE_ZH);
    kpi('mi355x').should('contain', '未测得');
    kpi('h200')
      .should('contain', '4 / 4 张 GPU')
      .and('contain', 'P50 出片时间（s）')
      .and('contain', '视频数 / GPU 小时')
      .and('contain', 'TCO / 条视频')
      .and('contain', 'API 标价 $0.640')
      .and('contain', 'kJ / 条视频');
    cy.get('[data-testid="video-config-fact"]').should(($facts) => {
      expect([...$facts].map((el) => el.textContent)).to.deep.equal([
        '模型MiniMaxAI/MiniMax-H3 @ 42ed227ee7df',
        '工作负载1344 × 768 · 8 s · 24 fps · 50 steps',
        '部署4 张 GPU · TP2 × Ulysses 2',
      ]);
    });
    cy.get('[data-testid="video-cost-tier"]').should('contain', 'Hyperscaler 自有设备');
    cy.get('[data-testid="video-legend"]').should('contain', '仅最优');
    cy.contains('[data-testid="video-dashboard"] h2', '对比');
    cy.contains('[data-testid="video-dashboard"] h2', '算力受限（compute-bound）的证据');
    cy.get('[data-testid="video-config-bar"]')
      .should('contain', 'X 轴指标')
      .and('contain', 'Y 轴指标')
      .and('not.contain', '成本档位')
      .and('contain', 'API 参考价（$/video-s）')
      .and('contain', '采集于 2026-09-24');
    cy.contains('button', '表格').click();
    headers().should(($ths) => {
      expect([...$ths].map((el) => el.textContent?.trim())).to.deep.equal([
        '硬件',
        '部署',
        'P50 出片时间（s）',
        '每 1 美元 TCO 生成视频数（Hyperscaler 自有设备）',
      ]);
    });
  });
});
