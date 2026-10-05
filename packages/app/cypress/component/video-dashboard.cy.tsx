import { wanServingFixture } from '../../src/components/video-benchmark/serving.fixture';
import { QUALITY_METRIC_IDS } from '../../src/components/video-benchmark/quality';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import VideoDashboard from '@/components/video-benchmark/VideoDashboard';
import { videoHistoryEntry, type VideoHistoryPage } from '@/components/video-benchmark/history';

// Retained H100/H200/B200 C1/C2/C4 observations (cypress/fixtures/api/video-history.json).
function mount(pathname = '/video', search = '', history?: VideoHistoryPage) {
  cy.intercept(
    'GET',
    '/api/video-runs?format=history&page=1',
    history
      ? { body: history }
      : {
          fixture: 'api/video-history.json',
        },
  ).as('history');
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
  'Prompt adherence (0–4)',
  'Board power (W)',
  'CI run',
  'Details',
];

describe('Video hardware dashboard (retained fixture)', () => {
  for (const [width, pathname, toggle] of [
    [1280, '/video', 'Show or hide serving evidence'],
    [390, '/zh/video', '展开或收起服务结果记录'],
  ] as const) {
    it(`retains serving outcomes when quality filters empty the chart at ${width}px`, () => {
      cy.viewport(width, 844);
      cy.fixture('api/video-history.json').then((page: VideoHistoryPage) => {
        // Controlled accounting fixture; no fabricated ratings enter the retained replay.
        const source = page.entries
          .flatMap((entry) => entry.sources)
          .find((s) => s.hardware === 'H200')!;
        source.serving = [
          {
            cell: 'c1',
            concurrency: 1,
            status: 'complete',
            workloadKey: null,
            mode: 'closed_loop',
            scheduled: 20,
            attempted: 20,
            completed: 20,
            failed: 0,
            timedOut: 0,
            notStarted: 0,
            valid: 20,
            unjudged: 20,
            legacyFailedSlots: 0,
            unfinished: 0,
            deliveryDeadlineSeconds: null,
            qualitySloGoodput: null,
            provenance: 'request-ledger',
          },
        ];
        page.entries[0].sources.push({
          ...source,
          id: 'amd-not-started',
          hardware: 'MI355X',
          observations: [],
          serving: [
            {
              ...source.serving[0],
              status: 'failed',
              attempted: 0,
              completed: 0,
              valid: 0,
              unjudged: 0,
              notStarted: 20,
              legacyFailedSlots: 20,
            },
          ],
        });
        mount(pathname, '?v_y=quality&v_qmin=4&v_hidden=h200,mi355x', page);
      });
      points().should('not.exist');
      cy.get(`[aria-label="${toggle}"]`).click();
      cy.get('[data-testid="video-serving-evidence"]').within(() => {
        cy.get('[data-source="amd-not-started"]').within(() => {
          cy.get('[data-testid="video-serving-scheduled"]').should('have.text', '20');
          cy.get('[data-testid="video-serving-attempted"]').should('have.text', '0');
          cy.get('[data-testid="video-serving-failed"]').should('have.text', '0');
          cy.get('[data-testid="video-serving-notStarted"]').should('have.text', '20');
          cy.get('[data-testid="video-serving-qualitySloGoodput"]').should('have.text', '—');
          cy.get('a').should('have.attr', 'href').and('include', 'source=amd-not-started');
        });
        cy.contains('[data-testid="video-serving-row"]', 'H200').within(() => {
          cy.get('[data-testid="video-serving-valid"]').should('have.text', '20');
          cy.get('[data-testid="video-serving-unjudged"]').should('have.text', '20');
        });
        cy.get('[role="region"]').should(($region) => {
          const region = $region[0];
          expect(region.getBoundingClientRect().width).to.be.at.most(width);
          expect(region.scrollWidth).to.be.at.least(region.clientWidth);
        });
      });
      cy.document().should((doc) => {
        expect(doc.documentElement.scrollWidth).to.be.at.most(width);
      });
      cy.get(`[aria-label="${toggle}"]`).click();
      cy.get('[data-testid="video-serving-evidence"]').should('not.exist');
    });
  }
  for (const width of [1280, 390]) {
    it(`keeps six deployment labels inside the plot without overlap at ${width}px`, () => {
      cy.viewport(width, 844);
      cy.fixture('api/video-history.json').then((page: VideoHistoryPage) => {
        // Synthetic near-neighbor frontiers exercise layout only, not measured claims.
        for (const entry of page.entries)
          for (const source of entry.sources) {
            const base = source.observations.find((o) => o.concurrency === 1);
            source.observations =
              base && (base.hardware.includes('B200') || base.hardware.includes('H200'))
                ? [2, 4, 8].map((gpus, index) => {
                    const b200 = base.hardware.includes('B200');
                    const rate = [6.67, 6, 5.29][index] + (b200 ? 0.15 : 0);
                    return {
                      ...base,
                      id: `${base.id}-${gpus}g`,
                      participating: gpus,
                      allocated: gpus,
                      server: { ...base.server, tp: 2, ulysses: gpus / 2, attention: null },
                      p90: [290, 150, 85][index] - (b200 ? 5 : 0),
                      wallSeconds: (20 * 3600) / (gpus * rate),
                    };
                  })
                : [];
          }
        mount('/video', '?v_y=videosPerGpuHour', page);
      });
      points().should('have.length', 6);
      lines().should('have.length', 2);
      cy.get<SVGTextElement>('[data-testid="video-hardware-chart"] text.video-point-label')
        .should('have.length', 6)
        .should(($labels) => {
          const clip = $labels[0].ownerSVGElement!.querySelector<SVGRectElement>(
            '#clip-video-hardware rect',
          )!;
          const plotWidth = clip.width.baseVal.value;
          const plotHeight = clip.height.baseVal.value;
          const boxes = [...$labels].map((label) => label.getBBox());
          boxes.forEach((box, index) => {
            expect(box.width, `label ${index} width`).to.be.greaterThan(0);
            expect(box.x, `label ${index} left`).to.be.at.least(-0.1);
            expect(box.y, `label ${index} top`).to.be.at.least(-0.1);
            expect(box.x + box.width, `label ${index} right`).to.be.at.most(plotWidth + 0.1);
            expect(box.y + box.height, `label ${index} bottom`).to.be.at.most(plotHeight + 0.1);
            for (const other of boxes.slice(index + 1))
              expect(
                box.x < other.x + other.width &&
                  box.x + box.width > other.x &&
                  box.y < other.y + other.height &&
                  box.y + box.height > other.y,
                `label ${index} overlaps another label`,
              ).to.equal(false);
          });
        });
    });
  }
  it('keeps unjudged quality empty before dominance and restores the performance view', () => {
    mount('/video', '?v_y=quality&v_quality=audio_quality&v_qmin=4&v_optimal=0');
    points().should('not.exist');
    cy.get('[data-testid="video-quality-summary"]')
      .should('contain', 'Audio quality')
      .and('contain', 'No calibrated quality results');
    cy.get('[data-testid="video-hardware-chart"]').should('contain', 'Unjudged or uncalibrated');
    cy.contains('button', 'Table').click();
    tableRows().should('not.exist');
    cy.get('[aria-label="Quality threshold (minimum)"]').click();
    cy.contains('[role="option"]', 'Off — descriptive performance').click();
    cy.get('[aria-label="Y-axis metric"]').click();
    cy.contains('[role="option"]', 'Videos per GPU-hour').click();
    tableRows().should('have.length', 3);
    cy.location('search').should('not.contain', 'v_qmin');
    cy.contains('button', 'Details').first().click();
    cy.get('[data-testid="video-point-details"]')
      .should('contain', '20 / 20 / 20 / 0')
      .and('contain', 'SHA256 / commit');
  });
  it('plots only synthetic calibrated quality and filters it at the reader threshold', () => {
    // This fabricated judgment tests behavior only; never saved to the measured replay.
    cy.fixture('api/video-history.json').then((page: VideoHistoryPage) => {
      for (const entry of page.entries)
        for (const source of entry.sources)
          for (const o of source.observations) {
            if (!o.hardware.includes('B200') || o.concurrency !== 1) continue;
            o.quality = {
              scale: 'ordinal_0_to_4',
              contractId: 'synthetic-only',
              contractSha256: 'a'.repeat(64),
              rubricVersion: 'test-v1',
              rubricSha256: 'b'.repeat(64),
              metrics: Object.fromEntries(
                QUALITY_METRIC_IDS.map((id) => [
                  id,
                  {
                    value: 3,
                    status: 'pass',
                    direction: 'higher',
                    evaluatorId: 'synthetic-reviewer',
                    evaluatorVersion: 'test-v1',
                    evaluatorSha256: 'c'.repeat(64),
                    samples: o.samples,
                    total: o.samples,
                    calibration: {
                      status: 'calibrated',
                      cohortId: 'synthetic-only',
                      threshold: 3,
                      provenance: 'fixture://rule',
                      frozenAt: '2026-09-01T00:00:00Z',
                    },
                  },
                ]),
              ),
            };
          }
      mount('/video', '?v_y=quality', page);
      points().should('have.length', 1);
      lines().should('not.exist');
      cy.get('[data-testid="video-quality-summary"]')
        .should('contain', 'synthetic-reviewer@test-v1')
        .and('contain', '20/20');
      cy.viewport(390, 844);
      cy.contains('button', 'Table').click();
      headers().should(($ths) => {
        expect([...$ths].map((el) => el.textContent?.trim())).to.deep.equal([
          'Hardware',
          'Deployment',
          'P90 time to video (s)',
          'Prompt adherence (0–4)',
          'Details',
        ]);
      });
      tableRows().should('have.length', 1).find('td').eq(2).should('have.text', '78.3');
      tableRows().find('td').eq(3).should('have.text', '3');
      cy.contains('button', 'Chart').click();
      cy.get('[aria-label="Quality threshold (minimum)"]').click();
      cy.contains('[role="option"]', '≥ 4 / 4').click();
      points().should('not.exist');
      cy.location('search').should('contain', 'v_qmin=4');
    });
  });
  it('plots one C1 point per measured hardware and lists MI355X as unavailable', () => {
    mount();
    points().should('have.length', 3);
    lines().should('have.length', 0);
    cy.get('[data-testid="video-hardware-chart"] path.roofline-path').should('not.exist');
    cy.get('[data-testid="video-chart-caption"]').should(
      'have.text',
      'Measured observations are shown as separate points (4 GPU · TP2 × Ulysses 2). A frontier line requires distinct measured deployments for the same hardware within a comparable cohort.',
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
  it('selects the model while workload and deployment stay measured facts; the legend offers only Optimal Only', () => {
    mount();
    cy.get('[data-testid="video-config-fact"]').should(($facts) => {
      expect([...$facts].map((el) => el.textContent)).to.deep.equal([
        'Workload1344 × 768 · 8 s · 24 fps · 50 steps',
        'Deployment4 GPU · TP2 × Ulysses 2',
      ]);
    });
    cy.get('[data-testid="video-config-bar"] [role="combobox"]').should(($boxes) => {
      expect([...$boxes].map((el) => el.getAttribute('aria-label'))).to.deep.equal([
        'Model',
        'X-axis metric',
        'Y-axis metric',
        'Quality dimension',
        'Quality threshold (minimum)',
      ]);
    });
    cy.get('[role="combobox"][aria-label="GPU basis"]').should('not.exist');
    // Same chrome as /inference: title, description and Share in one card above the panels,
    // the cost tier picked in the chart caption, Compare and the evidence folded away.
    cy.get('[data-testid="video-dashboard"] h1').should('contain', 'VideoGenX · MiniMax-H3');
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
    cy.contains('[data-testid="video-dashboard"] h2', 'Performance evidence');
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
  it('keeps the selected P90 and GPU-hour metrics in the compact table at phone width', () => {
    cy.viewport(390, 844);
    mount('/video', '?v_view=table&v_y=videosPerGpuHour');
    headers().should(($ths) => {
      expect([...$ths].map((el) => el.textContent?.trim())).to.deep.equal([
        'Hardware',
        'Deployment',
        'P90 time to video (s)',
        'Videos per GPU-hour',
        'Details',
      ]);
    });
    cy.contains('[data-testid="video-points-table"] tbody tr', 'B200').should(($row) => {
      expect([...$row.find('td')].map((el) => el.textContent?.trim())).to.deep.equal([
        'B200',
        '4 GPU · TP2 × Ulysses 2',
        '78.3',
        '11.53',
        'Details',
      ]);
    });
  });
  it('lists the plotted cells with the full column set on demand and no concurrency column', () => {
    mount('/video', '?v_view=table');
    cy.get('[data-testid="video-hardware-chart"]').should('not.exist');
    tableRows().should('have.length', 3);
    headers().should(($ths) => {
      expect([...$ths].map((el) => el.textContent?.trim())).to.deep.equal([
        ...ALL_COLUMNS.slice(0, 2),
        ALL_COLUMNS[4],
        ALL_COLUMNS[6],
        'Details',
      ]);
    });
    cy.get('[data-testid="data-table-preset-all"]').click();
    headers().should(($ths) => {
      expect([...$ths].map((el) => el.textContent?.trim())).to.deep.equal(ALL_COLUMNS);
    });
    cy.contains('[data-testid="video-points-table"] tbody tr', 'B200').should(($row) => {
      const cells = [...$row.find('td')].map((el) => el.textContent?.trim());
      expect(cells.slice(0, 13)).to.deep.equal([
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
        '—',
        '3,856',
      ]);
      expect(cells[13]).to.equal('#34341996789');
    });
  });
  it('hides a hardware from the legend and shows the table view', () => {
    mount();
    cy.contains('[data-testid="video-legend"] li', 'H100').click();
    points().should('have.length', 2);
    cy.location('search').should('contain', 'v_hidden=h100');
    cy.contains('button', 'Table').click();
    tableRows().should('have.length', 2);
    cy.get('[data-testid="video-points-table"]')
      .should('contain', 'H200')
      .and('contain', 'B200')
      .and('not.contain', 'H100');
    cy.location('search').should('contain', 'v_view=table');
    cy.get('[data-testid="video-history-section"]').should('not.have.attr', 'open');
  });
  it('restores hidden hardware from a shared table URL', () => {
    mount('/video', '?v_hidden=h100&v_view=table');
    tableRows().should('have.length', 2);
    cy.get('[data-testid="video-points-table"]').should('not.contain', 'H100');
    cy.contains('[data-testid="video-legend"] li', 'H100').click();
    tableRows().should('have.length', 3);
    cy.location('search').should('not.contain', 'v_hidden=');
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
    cy.contains('h2', 'Performance evidence').should('have.length', 1);
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
      'have.text',
      '实测观测以独立散点展示（4 张 GPU · TP2 × Ulysses 2）。前沿连线需要同一硬件、同一可比组内不同部署的实测结果。',
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
        '工作负载1344 × 768 · 8 s · 24 fps · 50 steps',
        '部署4 张 GPU · TP2 × Ulysses 2',
      ]);
    });
    cy.get('[data-testid="video-cost-tier"]').should('contain', 'Hyperscaler 自有设备');
    cy.get('[data-testid="video-legend"]').should('contain', '仅最优');
    cy.contains('[data-testid="video-dashboard"] h2', '对比');
    cy.contains('[data-testid="video-dashboard"] h2', '性能测量证据');
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
        'P90 出片时间（s）',
        '每 1 美元 TCO 生成视频数（Hyperscaler 自有设备）',
        '详情',
      ]);
    });
  });
});

describe('Wan model evidence isolation', () => {
  it('keeps a zero-observation failed source visible without borrowing H3 results', () => {
    cy.fixture('api/video-history.json').then((page: VideoHistoryPage) => {
      // Synthetic identity and failure for a rendering regression, not a measurement.
      const source = structuredClone(page.entries[0].sources[0]);
      source.id = 'wan-failure';
      source.model = 'Wan-AI/Wan2.2-T2V-A14B';
      source.observations = [];
      source.serving = [];
      source.error = 'Generation did not start';
      page.entries[0].sources.push(source);
      mount('/video', '?v_model=wan22', page);
    });
    cy.get('[data-testid="video-model-empty"]').should('be.visible');
    cy.get('[aria-label="Quality dimension"]').should('not.exist');
    cy.get('[aria-label="Show or hide serving evidence"]').click();
    cy.get('[data-testid="video-serving-row"]')
      .should('have.length', 1)
      .and('have.attr', 'data-source', 'wan-failure');
    cy.get('[data-testid="video-serving-qualitySloGoodput"]').should('have.text', '—');
    points().should('not.exist');
  });
});

describe('Generic video-only producer (synthetic contract)', () => {
  for (const [width, pathname, toggle] of [
    [1280, '/video', 'Show or hide serving evidence'],
    [390, '/zh/video', '展开或收起服务结果记录'],
  ] as const) {
    it(`retains canonical Wan success and preflight outcomes at ${width}px`, () => {
      cy.viewport(width, 844);
      const producer = wanServingFixture();
      producer.documents.set('manifest.json', producer.manifest);
      producer.documents.set('ci.json', producer.ci);
      producer.checksums.set('manifest.json', 'a'.repeat(64));
      const entry = () =>
        videoHistoryEntry(
          {
            storageVersion: 1,
            runId: '123',
            artifact: { id: 40, name: 'video-serving-123-1', expired: false, size_in_bytes: 100 },
            sources: [
              {
                id: '123',
                documents: [...producer.documents],
                checksums: [...producer.checksums],
                assets: [],
                texts: [],
              },
            ],
          },
          null,
        );
      mount(pathname, '?v_model=wan22', { schemaVersion: 1, entries: [entry()], nextPage: null });
      // The default Pareto view retains only C1; all three planned cells remain in serving.
      points().should('have.length', 1);
      cy.get(`[aria-label="${toggle}"]`).click();
      cy.get('[data-testid="video-serving-row"]').should('have.length', 3);
      cy.get('[data-testid="video-serving-row"]')
        .first()
        .within(() => {
          cy.get('[data-testid="video-serving-valid"]').should('have.text', '20');
          cy.get('[data-testid="video-serving-unjudged"]').should('have.text', '20');
          cy.get('[data-testid="video-serving-qualitySloGoodput"]').should('have.text', '—');
        });
      cy.get('[data-testid="video-serving-evidence"] [role="region"]').should(($region) => {
        expect($region[0].getBoundingClientRect().width).to.be.at.most(width);
      });
      cy.document().its('documentElement.scrollWidth').should('be.lte', width);
      // No GPU evidence is fabricated for this preflight failure.
      cy.then(() => {
        Object.assign(producer.documents.get('serving-smoke.json')!, {
          gpu_uuids: [],
          cells: [
            {
              concurrency: 1,
              status: 'failed',
              verified: false,
              completion: {
                scheduled: 20,
                attempted: 0,
                completed: 0,
                valid: 0,
                failed: 20,
                not_started: 20,
              },
            },
          ],
        });
        mount(pathname, '?v_model=wan22', { schemaVersion: 1, entries: [entry()], nextPage: null });
      });
      points().should('not.exist');
      cy.get(`[aria-label="${toggle}"]`).click();
      cy.get('[data-testid="video-serving-row"]')
        .should('have.length', 1)
        .within(() => {
          cy.get('[data-testid="video-serving-scheduled"]').should('have.text', '20');
          cy.get('[data-testid="video-serving-attempted"]').should('have.text', '0');
          cy.get('[data-testid="video-serving-notStarted"]').should('have.text', '20');
          cy.get('[data-testid="video-serving-failed"]').should('have.text', '0');
        });
      cy.document().its('documentElement.scrollWidth').should('be.lte', width);
    });
  }
});
