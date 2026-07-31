/**
 * Intentional cost/TTFT clipping must read as a deliberate chart boundary,
 * not as a mysteriously truncated benchmark line. Covers both official rows
 * and the mandatory `?unofficialrun=` overlay path.
 */
const MODEL_DISPLAY = 'DeepSeek-V4-Pro';
const MODEL_DB = 'dsv4';
const RUN_DATE = '2026-07-30';
const OVERLAY_RUN_ID = '99900000055';
const OVERLAY_BRANCH = 'test/chart-overflow-continuation';
const OVERLAY_RUN_URL = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${OVERLAY_RUN_ID}`;

const metrics = (interactivity: number, ttft: number, tputPerGpu: number) => ({
  median_intvty: interactivity,
  median_itl: 1 / interactivity,
  median_ttft: ttft,
  p99_ttft: ttft * 1.1,
  median_e2el: ttft + 20,
  p99_e2el: ttft + 25,
  median_tpot: 1 / interactivity,
  p99_tpot: 1 / interactivity,
  tput_per_gpu: tputPerGpu,
  input_tput_per_gpu: tputPerGpu * 0.8,
  output_tput_per_gpu: tputPerGpu * 0.2,
});

const row = (
  id: number,
  conc: number,
  interactivity: number,
  ttft: number,
  tputPerGpu: number,
  runUrl: string | null,
) => ({
  id: runUrl ? 0 : id,
  hardware: 'b200',
  framework: 'vllm',
  model: MODEL_DB,
  precision: 'fp4',
  spec_method: 'none',
  disagg: false,
  is_multinode: false,
  prefill_tp: 8,
  decode_tp: 8,
  num_prefill_gpu: 8,
  num_decode_gpu: 8,
  isl: 8192,
  osl: 1024,
  conc,
  offload_mode: 'off',
  benchmark_type: 'single_turn',
  image: 'vllm/vllm-openai:test',
  metrics: metrics(interactivity, ttft, tputPerGpu),
  workers: null,
  date: RUN_DATE,
  run_url: runUrl,
});

// C=1 and C=2 exceed $5/M, C=1024 exceeds 60s TTFT, while C=256
// and C=512 stay in bounds. The complete lower-left cost frontier crosses the
// visible region on both sides, so the chart should draw two continuations.
const rows = (runUrl: string | null) => [
  row(910001, 1, 162.6, 0.35, 80, runUrl),
  row(910004, 2, 140, 0.6, 85, runUrl),
  row(910005, 256, 70, 30, 2708, runUrl),
  row(910002, 512, 55.7, 36.28, 3887, runUrl),
  row(910003, 1024, 41.45, 69.65, 4486, runUrl),
];

const availability = [
  {
    model: MODEL_DB,
    isl: 8192,
    osl: 1024,
    precision: 'fp4',
    hardware: 'b200',
    framework: 'vllm',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'single_turn',
    date: RUN_DATE,
  },
];

const visitOverflowChart = (withOverlay: boolean) => {
  cy.intercept('GET', '/api/v1/availability', { body: availability }).as('availability');
  cy.intercept('GET', '/api/v1/benchmarks*', { body: rows(null) }).as('benchmarks');
  if (withOverlay) {
    cy.intercept('GET', '/api/unofficial-run*', {
      body: {
        runInfos: [
          {
            id: Number(OVERLAY_RUN_ID),
            name: OVERLAY_BRANCH,
            branch: OVERLAY_BRANCH,
            sha: 'abc055',
            createdAt: `${RUN_DATE}T00:00:00Z`,
            url: OVERLAY_RUN_URL,
            conclusion: 'success',
            status: 'completed',
            isNonMainBranch: true,
          },
        ],
        benchmarks: rows(OVERLAY_RUN_URL),
        evaluations: [],
      },
    }).as('unofficialRun');
  }

  const overlayParam = withOverlay ? `&unofficialrun=${OVERLAY_RUN_ID}` : '';
  cy.visit(
    `/inference?g_model=${MODEL_DISPLAY}&g_rundate=${RUN_DATE}&i_seq=8k%2F1k&i_metric=y_costh&i_xmode=ttft&i_optimal=0${overlayParam}`,
    {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
      },
    },
  );
  cy.wait('@benchmarks');
  if (withOverlay) cy.wait('@unofficialRun');
  cy.get('[data-testid="scatter-graph"]').should('be.visible');
};

describe('Chart overflow continuations', () => {
  it('keeps the original domain and interpolates labeled paths toward clipped points', () => {
    visitOverflowChart(false);

    cy.get('.x-axis .tick text').then(($ticks) => {
      const values = [...$ticks].map((tick) => Number(tick.textContent));
      expect(Math.max(...values)).to.eq(40);
    });

    cy.get('[data-testid="official-overflow-continuation"]')
      .should('have.length', 2)
      .each(($continuation) => {
        cy.wrap($continuation)
          .find('.overflow-continuation-line')
          .should(($path) => {
            expect($path).to.have.attr('clip-path');
            expect($path).to.have.attr('fill', 'none');
            expect($path).to.have.attr('stroke-dasharray');
            expect(($path[0] as unknown as SVGPathElement).getTotalLength()).to.be.greaterThan(0);
            if ($continuation.attr('data-clip-reasons') === 'cost') {
              expect($path.attr('d')).to.include('C');
            }
          });
        cy.wrap($continuation)
          .find('.overflow-continuation-clip path')
          .should(($clip) => {
            const radius = Number(
              /A(?<radius>[^,]+),/u.exec($clip.attr('d') ?? '')?.groups?.radius,
            );
            expect(radius).to.be.at.most(96.1);
          });
        cy.wrap($continuation)
          .find('.overflow-continuation-arrow')
          .then(($arrow) => {
            const transform = $arrow.attr('transform') ?? '';
            const arrowY = Number(/translate\([^,]+,(?<y>[^)]+)\)/u.exec(transform)?.groups?.y);
            cy.wrap($continuation)
              .find('[data-testid="overflow-continuation-label"]')
              .should(($label) => {
                const offset = Number($label.attr('y')) - arrowY;
                expect(
                  Math.abs(offset - 18) < 0.01 || Math.abs(offset + 12) < 0.01,
                  'label is below the arrow or uses the above-arrow bottom-edge fallback',
                ).to.equal(true);
              });
          });
        cy.wrap($continuation)
          .find('[data-testid="overflow-continuation-label"]')
          .should('be.visible');
      });

    cy.get('[data-testid="official-overflow-continuation"]')
      .first()
      .then(($continuation) => {
        const svg = ($continuation[0] as unknown as SVGGElement).ownerSVGElement!;
        const overflowLayer = svg.querySelector('.overflow-continuations-layer')!;
        const rooflinesLayer = svg.querySelector('.rooflines-layer')!;
        expect(
          overflowLayer.compareDocumentPosition(rooflinesLayer) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).to.be.greaterThan(0);
      });

    cy.get('[data-testid="overflow-continuation-label"]')
      .should('have.length', 2)
      .then(($labels) => {
        const labels = [...$labels].map((label) => label.textContent);
        expect(labels).to.have.members(['2 points > $5/Mtok', '1 point > 60s TTFT']);
      });

    cy.document().then((document) => {
      const background = getComputedStyle(document.documentElement)
        .getPropertyValue('--background')
        .trim();
      cy.get('[data-testid="overflow-continuation-label"]')
        .first()
        .should('have.attr', 'stroke', background);
    });
    cy.get('button[aria-label^="Switch theme"]').click();
    cy.document().then((document) => {
      const background = getComputedStyle(document.documentElement)
        .getPropertyValue('--background')
        .trim();
      cy.get('[data-testid="overflow-continuation-label"]')
        .first()
        .should('have.attr', 'stroke', background);
    });
    cy.get('[data-testid="chart-overflow-notice"]').should('not.exist');
  });
  it('keeps spline paths rendered through panning and zooming', () => {
    visitOverflowChart(false);

    cy.get('[data-testid="scatter-graph"] svg').then(($svg) => {
      const svg = $svg[0];
      const bounds = svg.getBoundingClientRect();
      const startX = bounds.x + bounds.width / 2;
      const startY = bounds.y + bounds.height / 2;
      svg.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: startX,
          clientY: startY,
          button: 0,
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      );
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: startX + 300,
          clientY: startY,
          buttons: 1,
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      );
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          clientX: startX + 300,
          clientY: startY,
          button: 0,
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      );
      for (let index = 0; index < 3; index++) {
        svg.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: -240,
            clientX: startX,
            clientY: startY,
            shiftKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    });

    cy.get('[data-testid="official-overflow-continuation"]').each(($continuation) => {
      expect($continuation.attr('display')).not.to.eq('none');
      cy.wrap($continuation)
        .find('.overflow-continuation-line')
        .should('have.attr', 'd')
        .and('not.be.empty');
    });
  });

  it('draws overlay continuations and removes them when that run is dismissed', () => {
    visitOverflowChart(true);

    cy.get('[data-testid="overlay-overflow-continuation"]').should('have.length', 2);
    cy.get('[data-testid="overflow-continuation-label"]').should('have.length', 4);

    cy.get(`[aria-label="Dismiss ${OVERLAY_BRANCH}"]`).click();
    cy.get('[data-testid="overlay-overflow-continuation"]').should('not.exist');
    cy.get('[data-testid="official-overflow-continuation"]').should('have.length', 2);
    cy.get('[data-testid="overflow-continuation-label"]').should('have.length', 2);
  });
});
