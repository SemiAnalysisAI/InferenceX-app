// Runs against the E2E_FIXTURES=1 server, which serves the retained
// H100/H200/B200 C1/C2/C4 observations from cypress/fixtures/api/video-history.json.
// Lead (C1) cells, per participating GPU: H100 5.37 videos/GPU-hr at $1.17/GPU-hr,
// H200 5.97 at $1.22, B200 11.53 at $1.73. Every clip is 8 s, so the $0.034/video-s
// API reference lists at $0.272 per video.
describe('Video hardware dashboard (E2E fixtures)', () => {
  beforeEach(() => {
    // The Compare panel fetches two published artifacts once in view; keep the spec offline.
    cy.intercept('GET', '/api/video-runs?run=*', { statusCode: 204 }).as('media');
  });
  it('leads with the cross-hardware chart and restores v_ params from the URL', () => {
    cy.visit('/video?v_y=kjPerVideo&v_tier=r');
    // One measured deployment per hardware: three points, no frontier line, and the
    // queued C2/C4 cells never reach the chart.
    cy.get('[data-testid="video-hardware-chart"] circle.point').should('have.length', 3);
    cy.get('[data-testid="video-hardware-chart"] path.line-path').should('have.length', 0);
    cy.get('[data-testid="video-chart-caption"]').should(
      'contain',
      'One deployment measured per hardware',
    );
    cy.get('[data-testid="video-chart-card"]')
      .should('contain', 'GPU-board energy per video (kJ)')
      .and('contain', 'Rent - 3 Year Commit');
    cy.get('[data-testid="video-idle-note"]').should(
      'have.text',
      'Per participating GPU: B200 (4 of 8), H100 (4 of 8) reserved more boards than one video uses; the idle boards are not counted.',
    );
    cy.get('[data-testid="video-tco-badge"]').first().should('contain', 'B200');
    cy.get('[data-testid="video-replay"]').should('be.visible');
    // The campaign is frozen: model, workload and deployment are facts; only axes and tier select.
    cy.get('[data-testid="video-config-fact"]').should('have.length', 3);
    cy.get('[data-testid="video-config-fact"]')
      .eq(0)
      .should('contain', 'Model')
      .and('contain', 'MiniMaxAI/MiniMax-H3 @ 42ed227ee7df');
    cy.get('[data-testid="video-config-fact"]')
      .eq(1)
      .should('contain', 'Workload')
      .and('contain', '1344 × 768 · 8 s · 24 fps · 50 steps');
    cy.get('[data-testid="video-config-fact"]')
      .eq(2)
      .should('contain', 'Deployment')
      .and('contain', '4 GPU · TP2 × Ulysses 2');
    cy.get('[data-testid="video-config-bar"] [role="combobox"]').should('have.length', 3);
    cy.get('[data-testid="video-config-bar"] [role="combobox"]')
      .eq(0)
      .should('contain', 'P90 time to video (s)');
    cy.get('[data-testid="video-config-bar"] [role="combobox"]')
      .eq(1)
      .should('contain', 'GPU-board energy per video (kJ)');
    cy.get('[data-testid="video-config-bar"] [role="combobox"]')
      .eq(2)
      .should('contain', 'Rent - 3 Year Commit');
    cy.get('[data-testid="video-config-bar"]').should('not.contain', 'GPU basis');
    cy.get('[data-testid="video-legend"]').should('contain', 'MI355X · not measured');
    cy.get('[data-testid="video-legend"] [role="switch"]').should('not.exist');
    // KPI cards read each hardware's lead deployment at the selected tier (Rent - 3 Year Commit:
    // $2 / $2.9 / $3.7 per GPU-hour); the API list price sits beside the TCO cost.
    cy.get('[data-testid="video-kpi-card"]').should('have.length', 4);
    cy.get('[data-testid="video-kpi-card"][data-hardware="b200"]')
      .should('contain', '4 of 8 GPUs · TP2 × Ulysses 2')
      .and('contain', 'P50 time to video (s)')
      .and('contain', '77.9')
      .and('contain', 'P90 78.3')
      .and('contain', 'Videos / GPU-hr')
      .and('contain', '11.53')
      .and('contain', 'TCO / video')
      .and('contain', '$0.321')
      .and('contain', 'API list $0.272')
      .and('contain', 'kJ / video')
      .and('contain', '301.1')
      .and('not.contain', 'Profit');
    cy.get('[data-testid="video-kpi-card"][data-hardware="h200"]')
      .should('contain', '4 of 4 GPUs')
      .and('contain', '$0.485');
    cy.get('[data-testid="video-kpi-card"][data-hardware="h100"]')
      .should('contain', '4 of 8 GPUs')
      .and('contain', '$0.372');
    cy.get('[data-testid="video-runs-section"]').should('not.have.attr', 'open');
    cy.get('[data-testid="video-ci-runs"]').should('not.exist');
  });
  it('lists only the measured deployments in the table view, without a concurrency column', () => {
    cy.visit('/video?v_view=table');
    cy.get('[data-testid="video-hardware-chart"]').should('not.exist');
    // One row per hardware: the queued C2/C4 cells stay out, so the C4-only H100 run never appears.
    cy.get('[data-testid="video-points-table"] tbody tr').should('have.length', 3);
    cy.get('[data-testid="video-points-table"]').should('not.contain', '#34344378350');
    cy.get('[data-testid="data-table-preset-all"]').click();
    cy.get('[data-testid="video-points-table"] thead th').should(($headers) => {
      expect([...$headers].map((th) => th.textContent?.trim())).to.deep.equal([
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
      ]);
    });
    cy.contains('[data-testid="video-points-table"] tbody tr', 'B200')
      .should('contain', '4 GPU · TP2 × Ulysses 2')
      .and('contain', '20 / 20')
      .and('contain', '77.9')
      .and('contain', '78.3')
      .and('contain', '11.53')
      .and('contain', '6.66')
      .and('contain', '$0.150')
      .and('contain', '$0.272')
      .and('contain', '301.1')
      .and('contain', '96.4')
      .and('contain', '3,856')
      .and('contain', '#34341996789');
    cy.contains('[data-testid="video-points-table"] tbody tr', 'H200')
      .should('contain', '150.6')
      .and('contain', '5.97')
      .and('contain', '4.9')
      .and('contain', '$0.204')
      .and('contain', '411')
      .and('contain', '97.4')
      .and('contain', '2,727')
      .and('contain', '#34342452354');
    cy.contains('[data-testid="video-points-table"] tbody tr', 'H100')
      .should('contain', '167.3')
      .and('contain', '5.37')
      .and('contain', '4.59')
      .and('contain', '$0.218')
      .and('contain', '431.1')
      .and('contain', '91.9')
      .and('contain', '2,575')
      .and('contain', '#34336635063');
  });
  it('prices the API list reference from v_api and resets it to the dated default', () => {
    cy.visit('/video?v_api=0.05');
    cy.get('[data-testid="video-api-price"]').should('have.value', '0.05');
    cy.get('[data-testid="video-chart-card"]').should('contain', 'API reference: $0.050/video-s');
    // 8 s clips: $0.05/video-s lists at $0.400 per video on every hardware.
    cy.get('[data-testid="video-kpi-card"][data-hardware="b200"]').should(
      'contain',
      'API list $0.400',
    );
    cy.get('[data-testid="video-kpi-card"][data-hardware="h100"]').should(
      'contain',
      'API list $0.400',
    );
    cy.get('[data-testid="video-api-price-reset"]').click();
    cy.get('[data-testid="video-api-price"]').should('have.value', '0.034');
    cy.get('[data-testid="video-kpi-card"][data-hardware="b200"]').should(
      'contain',
      'API list $0.272',
    );
    cy.location('search').should('not.contain', 'v_api');
    // A non-positive price never prices at 0: the dated reference stays in force.
    cy.visit('/video?v_api=0');
    cy.get('[data-testid="video-api-price"]').should('have.value', '0.034');
    cy.get('[data-testid="video-kpi-card"][data-hardware="h200"]').should(
      'contain',
      'API list $0.272',
    );
    cy.get('[data-testid="video-api-reference-caption"]').should('contain', 'captured 2026-09-19');
  });
  it('compares the slowest lead deployment against the fastest with time, cost and energy deltas', () => {
    cy.visit('/video');
    cy.get('[data-testid="video-compare"]').scrollIntoView();
    cy.wait('@media');
    // Default pair: slowest C1 P50 (H100) as baseline, fastest (B200) as candidate. Two hardware
    // selects and nothing else to pick: no case dropdown, no blind mode.
    cy.get('[data-testid="video-compare-baseline"]').should('contain', 'H100');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'B200');
    cy.get('[data-testid="video-compare"] [role="combobox"]').should('have.length', 2);
    cy.get('[data-testid="video-compare-clips"]').should(
      'contain',
      'Clips are not published for one of these runs',
    );
    cy.get('[data-testid="video-compare-table"] tbody tr').should(($rows) => {
      expect([...$rows].map((row) => row.dataset.metric)).to.deep.equal([
        'p50Latency',
        'dollarsPerVideo',
        'kjPerVideo',
      ]);
    });
    cy.get('[data-testid="video-compare-table"] tr[data-metric="p50Latency"]')
      .should('contain', '167.3')
      .and('contain', '77.9')
      .and('contain', '-53.4%')
      .and('contain', '×0.47')
      .find('[data-tone]')
      .should('have.attr', 'data-tone', 'better');
    cy.get('[data-testid="video-compare-table"] tr[data-metric="dollarsPerVideo"]')
      .should('contain', '$0.218')
      .and('contain', '$0.150')
      .and('contain', '-31.1%')
      .find('[data-tone]')
      .should('have.attr', 'data-tone', 'better');
    cy.get('[data-testid="video-compare-table"] tr[data-metric="kjPerVideo"]')
      .should('contain', '431.1')
      .and('contain', '301.1')
      .and('contain', '-30.2%')
      .find('[data-tone]')
      .should('have.attr', 'data-tone', 'better');
    cy.get('[data-testid="video-compare"]').should(
      'contain',
      'Cost tier: Owning at Large Hyperscaler Volume.',
    );
    // Swapping sides flips the deltas and records the pair in the URL.
    cy.get('[data-testid="video-compare-swap"]').click();
    cy.get('[data-testid="video-compare-baseline"]').should('contain', 'B200');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'H100');
    cy.get('[data-testid="video-compare-table"] tr[data-metric="p50Latency"]')
      .should('contain', '+114.7%')
      .find('[data-tone]')
      .should('have.attr', 'data-tone', 'worse');
    cy.location('search').should('contain', 'v_base=b200').and('contain', 'v_cand=h100');
  });
  it('opens the runs section for history deep links and renders the Chinese dashboard', () => {
    cy.visit('/video?view=history');
    cy.get('[data-testid="video-runs-section"]').should('have.attr', 'open');
    cy.get('[data-testid="video-history"] h1').should('contain', 'Performance history');
    cy.visit('/zh/video');
    cy.get('[data-testid="video-hardware-chart"] circle.point').should('have.length', 3);
    cy.get('[data-testid="video-chart-card"]').should(
      'contain',
      '每 1 美元 TCO 生成视频数（Hyperscaler 自有设备）',
    );
    cy.get('[data-testid="video-idle-note"]').should(
      'have.text',
      '按参与计算的 GPU 计：B200（4 / 8 张）、H100（4 / 8 张）预留的板卡多于单条视频所需，空闲板卡未计入。',
    );
    cy.get('[data-testid="video-config-bar"]')
      .should('contain', '模型')
      .and('contain', '工作负载')
      .and('contain', '4 张 GPU · TP2 × Ulysses 2')
      .and('contain', 'X 轴指标')
      .and('contain', '成本档位');
    cy.get('[data-testid="video-kpi-card"][data-hardware="b200"]')
      .should('contain', 'TCO / 条视频')
      .and('contain', '$0.150')
      .and('contain', 'API 标价 $0.272');
    cy.get('[data-testid="video-kpi-card"][data-hardware="mi355x"]').should('contain', '未测得');
  });
  it('fits a phone viewport without horizontal page scroll in both locales', () => {
    cy.viewport(390, 844);
    for (const path of ['/video', '/zh/video']) {
      cy.visit(path);
      cy.get('[data-testid="video-hardware-chart"] circle.point').should('have.length', 3);
      cy.get('[data-testid="video-kpi-card"]').should('have.length', 4);
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth, `${path} page width`).to.be.at.most(
          doc.documentElement.clientWidth,
        );
      });
      cy.screenshot(`video-dashboard-390${path.startsWith('/zh') ? '-zh' : '-en'}`, {
        capture: 'fullPage',
        overwrite: true,
      });
    }
  });
});
