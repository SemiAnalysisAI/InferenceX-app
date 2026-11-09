import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import VideoDashboard from '@/components/video-benchmark/VideoDashboard';
import type {
  VideoHistoryObservation,
  VideoHistoryPage,
} from '@/components/video-benchmark/history';
import { videoPoints } from '@/components/video-benchmark/points';
import { parseResultsState } from '@/components/video-benchmark/results';
import type { ResultsEvidence } from '@/components/video-benchmark/results-evidence';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { verifiedQuality } from '@/components/video-benchmark/reference-quality';
import { referenceQualityFixture } from '@/components/video-benchmark/reference-quality.fixture';
import { servingArtifact } from '../support/video-artifacts';
import { readOnlyVideoRequests, resultHistory } from '../support/video-results';

function assertResultsFit() {
  cy.document().should((document) => {
    const width = document.documentElement.clientWidth;
    const overflowing = [...document.querySelectorAll('[data-testid="video-results"] *')]
      .filter((element) => element.getBoundingClientRect().right > width + 1)
      .slice(0, 8)
      .map((element) => `${element.tagName}.${element.className}`)
      .join(', ');
    expect(
      document.documentElement.scrollWidth,
      `no horizontal page overflow (${overflowing})`,
    ).to.be.at.most(document.documentElement.clientWidth);
  });
}

function mount({
  pathname = '/vgx',
  search = '?r_y=videosPerGpuHour',
  edit,
  editPage,
}: {
  pathname?: string;
  search?: string;
  edit?: (observation: VideoHistoryObservation) => void;
  editPage?: (page: VideoHistoryPage) => void;
} = {}) {
  readOnlyVideoRequests();
  resultHistory(edit).then((page) => {
    editPage?.(page);
    cy.intercept('GET', '/api/video-runs?format=history&page=1*', page).as('history');
  });
  cy.window().then((win) =>
    win.history.replaceState(null, '', `${win.location.pathname}${search}`),
  );
  cy.mount(
    <PathnameContext.Provider value={pathname}>
      <VideoDashboard />
    </PathnameContext.Provider>,
  );
  cy.wait('@history');
  cy.get('[data-testid="video-results"]').should('be.visible');
}

const points = (selector = '') =>
  cy.get(`[data-testid="video-results-chart"] .dot-group${selector}`);
const hardwarePoints = (hardware: string) => points(`[data-hardware="${hardware}"]`);
const openPoint = (hardware: string, overlay = false) => {
  hardwarePoints(hardware)
    .filter(`[data-overlay="${overlay}"]`)
    .find('.visible-shape')
    .click({ force: true });
  cy.get('[data-testid="point-details-panel"] [data-action="view-telemetry"]').click();
};
const playing = () => points('[data-clip-role="playing"]');
const stagePill = (side: 'a' | 'b') =>
  cy.get(`[data-side="${side}"] [data-testid="video-results-pill"]`);
/** The stage and its transport sit fully inside the viewport. */
const stageInView = () =>
  cy.get('#comparison-stage').should(($stage) => {
    const rect = $stage[0].getBoundingClientRect();
    expect(rect.top, 'stage top').to.be.at.least(0);
    expect(rect.bottom, 'stage bottom').to.be.at.most(Cypress.config('viewportHeight') + 1);
  });
const toggleHardware = (hardware: string) => cy.get(`label[for="checkbox-${hardware}"]`).click();
const chooseEngine = (label: string) =>
  cy.get('[data-testid="results-engine"]').contains('button', label).click();
const searchParam = (key: string) =>
  cy.location('search').then((search) => new URLSearchParams(search).get(key));
const plottedY = (hardware: string) =>
  points(`[data-hardware="${hardware}"][data-overlay="false"]`).then(
    ($group) => ($group[0] as unknown as { __data__: { y: number } }).__data__.y,
  );

const evidence = (observation: VideoHistoryObservation): ResultsEvidence => ({
  workloadHash: 'a'.repeat(64),
  manifestHash: observation.id.split(':')[0],
  verified: true,
  engine: 'sglang',
  mode: 't2v',
  attempted: 20,
  notStarted: 0,
  latencies: Array.from({ length: 20 }, (_, index) => 70 + index * 0.5),
  clientP50: 75,
  powerValid: true,
  powerSeries: [
    { seconds: 0, watts: 3800 },
    { seconds: 1, watts: 3900 },
  ],
  peakPowerW: 3900,
  gpuMemoryMiB: null,
  warmupSeconds: 38.2,
  failures: { timeout: 0, oom: 0, engine: 0, transport: 0, other: 0 },
});

/** The streamed dashboard replaces the pending shell, so an edit made in it would be lost. */
const focusFirstControl = (focusable: boolean) =>
  cy
    .get('[data-testid="video-results"] button')
    .first()
    .should(($button) => {
      $button[0].focus();
      expect($button[0].ownerDocument.activeElement === $button[0]).to.equal(focusable);
    });

const engines = () =>
  hardwarePoints('b200').then(($groups) => [
    ...new Set([...$groups].map((group) => group.dataset.engine)),
  ]);

describe('VideoGenX results', () => {
  it('shows the loading state without reading History while the server streams the cohort', () => {
    readOnlyVideoRequests();
    cy.intercept('GET', '/api/video-runs?format=history&page=*', {
      schemaVersion: 1,
      entries: [],
      nextPage: null,
    }).as('history');
    const initialData = { state: parseResultsState('?r_tier=r'), history: null, sides: {} };
    cy.mount(
      <PathnameContext.Provider value="/vgx">
        <VideoDashboard initialData={initialData} pending />
      </PathnameContext.Provider>,
    );
    cy.get('[role="status"]').should('contain', 'Loading video results');
    cy.get('[data-testid="video-results"]').should('be.visible');
    cy.get('@history.all').should('have.length', 0);
    focusFirstControl(false);
    cy.mount(
      <PathnameContext.Provider value="/vgx">
        <VideoDashboard initialData={initialData} />
      </PathnameContext.Provider>,
    );
    cy.wait('@history');
    focusFirstControl(true);
  });

  for (const pathname of ['/zh/vgx']) {
    it(`retains publication approval and source power verdicts in ${pathname} History`, () => {
      const zh = pathname.startsWith('/zh');
      mount({
        pathname,
        editPage: (page) => {
          page.entries[0].sources[0].powerVerified = true;
          page.entries[2].sources[0].powerVerified = false;
        },
      });
      cy.contains('summary', zh ? '性能历史' : 'Performance history').click();
      cy.get('[data-testid="video-history-entry"]').should('have.length', 7);
      cy.get('[data-testid="video-history-publication"]')
        .first()
        .should('contain', zh ? '已批准用于仪表板' : 'Approved for dashboard');
      cy.get('[data-testid="video-history-publication"]')
        .eq(4)
        .should('contain', zh ? '未找到匹配的发布批准回执' : 'No matching approval receipt');
      cy.get('[data-testid="video-history-power"]').should(($verdicts) => {
        expect([...$verdicts].map((el) => el.textContent?.trim())).to.deep.equal(
          zh
            ? ['· GPU 功率: 已测得', '· GPU 功率: 未测得', '· GPU 功率: 已测得']
            : ['· GPU power: Measured', '· GPU power: Not measured', '· GPU power: Measured'],
        );
      });
    });
  }

  it('ignores retired controls and plots every named-run GPU count on either X axis', () => {
    mount({
      search:
        '?unofficialrun=34341996789&r_gpus=3&r_basis=allocated&r_x=p90&r_y=videosPerGpuHour&r_optimal=0',
      editPage: (page) => {
        const entry = page.entries.find((item) => item.runId === '34341996789')!;
        entry.approved = false;
        const source = entry.sources[0];
        const fourGpu = source.observations.find((observation) => observation.cell === 'c1')!;
        source.observations.push({
          ...structuredClone(fourGpu),
          id: 'two-gpu:c1',
          participating: 2,
          allocated: 2,
        });
      },
    });
    cy.window().then((win) => cy.spy(win.console, 'error').as('consoleError'));
    const overlay = '[data-hardware="b200"][data-overlay="true"]';
    cy.get('[data-testid="results-table"]').should('not.exist');
    cy.get('[data-testid="results-gpus"]').should('not.exist');
    cy.get('[data-testid="results-cost-basis"]').should('not.exist');
    cy.get('[data-testid="video-results-chart"] .x-axis-label').should('contain', 'P90');
    points(overlay).should('have.length', 2);
    // Same latency on half the boards doubles videos per GPU-hour, so the 4-GPU cell is dominated.
    points(`${overlay}[data-optimal="false"]`).should('have.length', 1);
    points(overlay).then(($points) => {
      const values = [...$points]
        .map((point) => (point as unknown as { __data__: { y: number } }).__data__.y)
        .sort((a, b) => a - b);
      expect(values[1]).to.be.closeTo(values[0] * 2, 1e-9);
    });
    cy.get('[data-testid="results-x-metric"]').click();
    cy.get('[data-testid="results-x-unmeasured"]')
      .should('contain', 'Quality loss vs lossless (LPIPS)')
      .and('contain', 'Peak GPU memory');
    cy.contains('[data-select-option]', 'GPUs per deployment').click();
    searchParam('r_x').should('equal', 'gpus');
    cy.get('#video-results-chart-title').should('contain', 'vs. GPUs per deployment');
    cy.get('[data-testid="video-results-chart"] .x-axis-label').should(
      'have.text',
      'GPUs per deployment',
    );
    points(overlay).should(($points) => {
      const xs = [...$points].map(
        (point) => (point as unknown as { __data__: { x: number } }).__data__.x,
      );
      expect(xs.toSorted()).to.deep.equal([2, 4]);
    });
    points(`${overlay}[data-optimal="false"]`).should('have.length', 1);
    points().find('.point-label').should('not.exist');
    cy.get('@consoleError').should('not.be.calledWithMatch', /Cannot update a component/);
    cy.get('label[for="video-results-optimal"]').click();
    points(overlay).should('have.length', 1).and('have.attr', 'data-optimal', 'true');
    searchParam('r_optimal').should('equal', '1');
    for (const key of ['r_gpus', 'r_basis']) searchParam(key).should('equal', null);
    points(overlay).trigger('mouseenter', { force: true });
    cy.get('[data-chart-tooltip="video-results-chart"] [data-hover-notice]').should(
      'have.text',
      '✕ #34341996789',
    );
    cy.get('[data-chart-tooltip="video-results-chart"]').should('contain', 'Median s');
    points(overlay).trigger('mouseleave', { force: true });
    toggleHardware('b200');
    hardwarePoints('b200').should('not.exist');
    points(overlay).should('not.exist');
  });

  it('names the latency in the zh hover card, where the GPU axis title does not', () => {
    mount({ pathname: '/zh/vgx', search: '?r_x=gpus&r_y=videosPerGpuHour' });
    hardwarePoints('b200').first().trigger('mouseenter', { force: true });
    cy.get('[data-chart-tooltip="video-results-chart"]').should('contain', '中位延迟 (s)');
  });

  it('shows a named unapproved run without an approved cohort and clears it without promotion', () => {
    mount({
      search: '?unofficialrun=34341996789&r_y=videosPerGpuHour&r_view=side',
      editPage: (page) => {
        for (const entry of page.entries) entry.approved = false;
      },
    });
    hardwarePoints('b200').should('have.attr', 'data-overlay', 'true');
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"]').should(
      'contain',
      'Unofficial run',
    );
    cy.get('[data-testid="video-results-sources"] summary').click();
    cy.get('[data-testid="video-results-sources"]').should('contain', 'No matching receipt');
    points('[data-overlay="false"]').should('not.exist');
    cy.get('@history.all')
      .its('length')
      .then((requestCount) => {
        cy.get('[data-testid="results-overlay-dismiss"]').click();
        cy.get('@history.all').should('have.length', requestCount);
      });
    cy.get('[data-testid="results-overlay"]').should('not.exist');
    points().should('not.exist');
    cy.get('[data-testid="video-results-stage"]').should('not.exist');
    // Rewriting the results keys keeps the clip stage's own keys.
    searchParam('r_view').should('equal', 'side');
    cy.contains('summary', 'Performance history').click();
    cy.get('[data-testid="video-history-entry"]').should('have.length', 7);
    cy.get('[data-testid="video-history-publication"]').each(($entry) => {
      expect($entry).to.contain('No matching approval receipt');
    });
  });

  it('shows a lossy named run’s clip, which leads no card, in the overlay color', () => {
    mount({
      search: '?unofficialrun=34341996789&r_y=videosPerGpuHour',
      editPage: (page) => {
        for (const entry of page.entries) {
          const named = entry.runId === '34341996789';
          if (named) entry.approved = false;
          for (const observation of entry.sources[0].observations)
            observation.results = {
              ...evidence(observation),
              optimizations: named ? ['first-block-cache'] : [],
            };
        }
      },
    });
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"]')
      .should('contain', 'Unofficial run')
      .find('[data-testid="video-results-pill"] .rounded-full')
      .should('have.attr', 'style')
      .and('contain', overlayRunColor(0));
  });

  it('restores the approved workload after dismissing an explicitly selected named-only workload', () => {
    mount({
      search: '?unofficialrun=34341996789&r_y=videosPerGpuHour',
      editPage: (page) => {
        const entry = page.entries.find((item) => item.runId === '34341996789')!;
        entry.approved = false;
        for (const source of entry.sources)
          for (const observation of source.observations) {
            const workload = JSON.parse(observation.workloadKey!);
            workload.plan.cases[0].seed += 1;
            observation.workloadKey = JSON.stringify(workload);
            if (observation.concurrency === 1) cy.wrap(observation.id).as('namedWorkload');
          }
      },
    });
    hardwarePoints('h200').should('exist');
    cy.get<string>('@namedWorkload').then((sourceId) => {
      cy.window().then((win) => {
        win.history.pushState(
          null,
          '',
          `${win.location.pathname}${win.location.search}&r_workload=${sourceId}`,
        );
        win.dispatchEvent(new PopStateEvent('popstate'));
      });
    });
    hardwarePoints('b200').should('have.attr', 'data-overlay', 'true');
    hardwarePoints('h200').should('not.exist');
    cy.get('[data-testid="results-overlay-dismiss"]').click();
    hardwarePoints('h200').should('have.attr', 'data-overlay', 'false');
    hardwarePoints('b200').should('not.exist');
    cy.location('search').should('not.contain', 'r_workload=').and('not.contain', 'unofficialrun');
  });

  it('opens the named re-export, not the official cell, when both share an observation ID', () => {
    const namedRun = '90000000001';
    mount({
      editPage: (page) => {
        const original = page.entries.find((entry) => entry.runId === '34341996789')!;
        const reexport = structuredClone(original);
        reexport.runId = namedRun;
        reexport.artifact.id = 99991;
        reexport.approved = false;
        page.entries.unshift(reexport);
        const point = videoPoints([page]).find(
          (item) => item.hardwareKey === 'b200' && item.concurrency === 1,
        )!;
        const saved = servingArtifact(Number(point.runId), point.artifactId, 'NVIDIA B200');
        saved.sources[0].checksums = saved.sources[0].checksums.map(([path, sha]) => [
          path,
          path === 'manifest.json' ? point.id.split(':')[0] : sha,
        ]);
        cy.intercept('GET', 'https://media.test/**', {
          fixture: 'video-results/candidate.mp4',
          headers: { 'Content-Type': 'video/mp4' },
        });
        cy.intercept(
          'GET',
          `/api/video-runs?run=${point.runId}&artifact=${point.artifactId}&format=published`,
          saved,
        ).as('approvedMedia');
        cy.intercept('GET', `/api/video-runs?run=${namedRun}&artifact=99991&format=published`, {
          statusCode: 204,
        }).as('namedMedia');
      },
    });
    cy.wait('@approvedMedia');
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"] video').should('exist');
    cy.window().then((win) => {
      win.history.replaceState(
        null,
        '',
        `${win.location.pathname}?unofficialrun=${namedRun}&r_y=videosPerGpuHour`,
      );
      win.dispatchEvent(new win.PopStateEvent('popstate'));
    });
    hardwarePoints('b200').should('have.length', 2);
    cy.wait('@namedMedia');
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"] video').should('not.exist');
    openPoint('b200', true);
    searchParam('r_point').should('match', new RegExp(`^${namedRun}:`, 'u'));
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'B200');
    cy.get('[data-testid="video-results-detail"]').should('contain', `Unofficial run #${namedRun}`);
    cy.get('[data-testid="results-detail-tab-sources"]').click();
    cy.get('[data-testid="video-results-detail"]')
      .should('contain', namedRun)
      .and('contain', '99991')
      .and('contain', 'No matching approval receipt');
    cy.get('[data-testid="results-detail-back"]').click();
    openPoint('b200');
    cy.get('[data-testid="results-detail-tab-sources"]').click();
    cy.get('[data-testid="video-results-detail"]')
      .should('contain', '34341996789')
      .and('not.contain', namedRun);
    cy.get('[data-testid="results-detail-back"]').click();
    toggleHardware('b200');
    hardwarePoints('b200').should('not.exist');
    toggleHardware('b200');
    hardwarePoints('b200').should('have.length', 2);
    cy.get('[data-testid="results-overlay-dismiss"]').click();
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"] video').should('exist');
    cy.get('@approvedMedia.all').should('have.length', 1);
    hardwarePoints('b200').should('have.length', 1).and('have.attr', 'data-overlay', 'false');
  });

  it('applies the sample floor, preserves unknown allocation and drops every planned placeholder', () => {
    mount({
      edit: (observation) => {
        if (observation.hardware.includes('H100')) {
          observation.samples = 9;
          observation.valid = 9;
        }
        if (observation.hardware.includes('H200')) observation.allocated = null;
      },
    });
    cy.get('[data-testid="results-how-to-read"] h2').should(
      'have.text',
      'How to read these results',
    );
    cy.get('[data-testid="results-profit"] h3').should('have.text', 'Profit estimator');
    cy.get('[data-testid="results-advanced"]').should('not.have.attr', 'open');
    cy.get('details[data-testid^="results-"] > summary h2').should(($titles) => {
      expect([...$titles].map((title) => title.textContent)).to.deep.equal([
        'Advanced',
        'Performance history',
      ]);
    });
    cy.get('[data-testid="results-not-measured"]').should('contain', 'LoRA switch time');
    cy.get('[data-testid="results-empty"][data-state="planned"]').should('not.exist');
    points().should('have.length', 2);
    hardwarePoints('h100').should('not.exist');
    cy.get('#checkbox-h100').should('not.exist');
    points('[data-hardware="h200"] .visible-shape').click({ force: true });
    cy.get('[data-testid="point-details-panel"]').should('contain', '4 / —');
    cy.get('[data-testid="results-tco-table"]')
      .should('contain', 'B200')
      .and('not.contain', 'MI355X');
    cy.get('[data-testid="results-tco-rate"]').first().should('have.text', '1.73');
    cy.get('[data-testid="results-cost-tier"]').click();
    cy.contains('[data-select-option]', 'Rent – 3-year commit').click();
    searchParam('r_tier').should('equal', 'r');
    cy.get('[data-testid="results-tco-rate"]').first().should('have.text', '3.70');
  });

  it('views results as of an earlier run and compares a chip config over time', () => {
    mount({
      search: '?r_y=videosPerGpuHour',
      // Retained projections predate the output-seconds rate that prices a video-second.
      edit: (observation) => {
        observation.videoSecondsPerHour = 400;
      },
      editPage: (page) => {
        for (const entry of page.entries)
          if (entry.runId === '34341996789') entry.publishedAt = '2026-11-01T00:00:00.000Z';
      },
    });
    cy.get('#run-select').should('contain', 'Run 3/3');
    points().should('have.length', 3);
    cy.get('[data-testid="results-run-context"] button[aria-label="Previous run"]').click();
    cy.get('#run-select').should('contain', 'Run 2/3');
    searchParam('r_run').should('equal', '34341996789');
    points('[data-hardware="h200"]').should('not.exist');
    points().should('have.length', 2);
    cy.get('[data-testid="results-run-context"] button[aria-label="Next run"]').click();
    cy.get('#run-select').should('contain', 'Run 3/3');
    points().should('have.length', 3);
    cy.get('[data-testid="results-chip-config"]').click();
    cy.contains('[role="option"]', 'B200 · 4 GPU · TP2 × Ulysses 2').click();
    searchParam('r_configs').should('equal', 'b200:na:4g:tp2:u2');
    points().should('have.length', 1);
    points('[data-hardware="b200"]').should('contain', '2026-09-09');
    cy.get('[data-testid="results-compare-history"]').should('contain', 'Comparison date range');
    // Run 1/3 predates B200, so its history point lies outside the as-of cells yet still opens.
    cy.get('[data-testid="results-run-context"] button[aria-label="Previous run"]').click();
    cy.get('[data-testid="results-run-context"] button[aria-label="Previous run"]').click();
    cy.get('#run-select').should('contain', 'Run 1/3');
    points('[data-hardware="b200"] .visible-shape').click({ force: true });
    // The stage plays that history point, and its TCO comes from the history cell too.
    searchParam('r_clip').should('match', /^34341996789:/u);
    cy.get('[data-testid="video-results-readout"] [data-metric="cost"] dd')
      .first()
      .should(($value) => expect($value.text(), 'history point TCO').to.match(/^\$\d/u));
    cy.get('[data-testid="point-details-panel"] [data-action="view-telemetry"]').click();
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'B200');
    searchParam('r_point').should('match', /^34341996789:/u);
  });

  it('applies explicit scenario prices and utilisation to profit', () => {
    // Synthetic additive evidence exercises controls absent from retained public
    // projections. It is never written to the committed history fixture.
    mount({
      edit: (observation) => {
        observation.videoSecondsPerHour = 400;
        observation.results = evidence(observation);
      },
    });
    cy.get('[data-testid="results-advanced"]').should('not.have.attr', 'open');
    cy.get('[data-testid="results-advanced"] > summary').click();
    cy.get('[data-testid="results-profit"] [data-testid="results-empty"]').should('be.visible');
    cy.get('[data-testid="results-price-t2v"]').type('0.05');
    cy.location('search').should('contain', 'r_price_t2v=0.05');
    cy.get('[data-testid="results-profit"] [data-hardware="b200"]').should('contain', '3.27');
    cy.get('[data-testid="results-utilization"]').then(($input) => {
      const input = $input[0] as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '50');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    cy.get('[data-testid="results-profit"] [data-hardware="b200"]').should('contain', '0.77');
    cy.location('search').should('contain', 'r_utilization=0.5');
    cy.get('[data-testid="results-advanced"] > summary').click();
    cy.get('[data-testid="results-advanced"]').should('not.have.attr', 'open');
    cy.get('[data-testid="results-advanced"] > summary').click();
    cy.get('[data-testid="results-price-t2v"]').should('have.value', '0.05');
    cy.get('[data-testid="results-profit"] [data-hardware="b200"]').should('contain', '0.77');
  });

  it('plots the selected Y metric with participating GPUs and median latency', () => {
    mount({
      search: '?r_basis=allocated',
      edit: (observation) => {
        observation.videoSecondsPerHour = 400;
      },
    });
    cy.get('#video-results-chart-title').should(
      'contain',
      'Video-seconds per $1 TCO vs. Median latency per clip',
    );
    cy.get('[data-testid="video-results-chart"] .x-axis-label').should(
      'have.text',
      'Median latency per 8 s clip at 24 fps (s)',
    );
    // B200 reserves eight boards, but only the four participating boards are charged.
    plottedY('b200').should('be.closeTo', 400 / (4 * 1.73), 1e-9);
    cy.get('[data-testid="results-y-metric"]').click();
    cy.contains('[data-select-option]', 'GPU energy per valid clip (kJ)').click();
    searchParam('r_y').should('equal', 'kjPerClip');
    cy.get('#video-results-chart-title').should('contain', 'GPU energy per valid clip');
    plottedY('b200').should('be.closeTo', 301.1, 0.1);
  });

  it('plots each GPU’s best lossless engine and asks before showing two engines', () => {
    // Every deployment also ran on vLLM-Omni with identical numbers and on Sol with caching.
    mount({
      editPage: (page) => {
        for (const entry of page.entries)
          for (const source of entry.sources)
            source.observations = source.observations.flatMap((observation) => [
              { ...observation, results: evidence(observation) },
              {
                ...observation,
                id: `${observation.id}-vllm`,
                results: { ...evidence(observation), engine: 'vllm-omni' },
              },
              {
                ...observation,
                id: `${observation.id}-sol`,
                results: {
                  ...evidence(observation),
                  engine: 'sol-engine',
                  optimizations: ['first-block-cache', 'sol-attn'],
                },
              },
            ]);
      },
    });
    // A tie keeps the engine listed first; the cached Sol run never competes.
    engines().should('deep.equal', ['sglang']);
    cy.get('label[for="checkbox-b200"]').should('contain', 'B200 (SGLang)');
    chooseEngine('All');
    cy.get('[data-testid="engine-comparison-confirmation"]').contains('button', 'Cancel').click();
    searchParam('r_compare').should('equal', null);
    engines().should('deep.equal', ['sglang']);
    chooseEngine('All');
    cy.get('[data-testid="engine-comparison-confirmation"]')
      .contains('button', 'I agree, show both')
      .click();
    searchParam('r_compare').should('equal', '1');
    engines().should('deep.equal', ['sglang', 'vllm-omni']);
    cy.get('label[for="checkbox-b200"]').should('contain', 'B200 (SGLang, vLLM-Omni)');
    cy.get('[data-testid="results-lossy-key"]').should('not.exist');
    cy.get('#video-results-lossy').click();
    searchParam('r_lossy').should('equal', '1');
    engines().should('deep.equal', ['sglang', 'vllm-omni', 'sol-engine']);
    cy.get('[data-testid="results-lossy-key"]').should(
      'contain',
      'B200 (NVIDIA Sol Engine · FirstBlockCache + Sol-Attn)',
    );
  });

  it('opens deployment telemetry from chart points, switches tabs and returns', () => {
    mount({
      search: '?r_y=videosPerGpuHour',
      edit: (observation) => {
        observation.results = evidence(observation);
      },
    });
    points('[data-hardware="b200"]').trigger('mouseenter', { force: true });
    cy.get('[data-chart-tooltip="video-results-chart"]')
      .should('contain', 'Conc 1')
      .and('contain', 'Median s')
      .and('contain', '4 GPU · TP2 × Ulysses 2');
    points('[data-hardware="b200"] .visible-shape').click({ force: true });
    cy.get('[data-testid="point-details-panel"]')
      .should('contain', 'GPUs (part. / alloc.)')
      .and('contain', '4 / 8')
      .and('contain', 'Concurrency')
      .and('contain', 'TP2 × Ulysses 2')
      .find('a[href="https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34341996789"]')
      .should('contain', 'GitHub Actions run');
    cy.get('[data-testid="point-details-panel"] [data-action="view-telemetry"]').click();
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'B200');
    searchParam('r_point').should('match', /^34341996789:/u);
    cy.get('[data-testid="results-detail-deployments"]')
      .should('have.attr', 'role', 'group')
      .and('have.attr', 'aria-label', 'Deployments')
      .find('[aria-pressed="true"]')
      .should('contain', '4 GPU');
    cy.get('[data-testid="video-results-detail"] nav').should('not.exist');
    cy.get('[data-testid="results-power-trace"] svg').should('exist');
    cy.get('[data-testid="results-detail-latency"]')
      .invoke('text')
      .should('match', /P95 \d/u);
    cy.get('[data-testid="video-results-detail"]').should('contain', 'of valid clips met it');
    cy.get('[data-testid="video-results-detail"]').should('contain', '38.2 s');
    cy.get('[data-testid="results-detail-tab-validity"]').click();
    cy.get('[data-testid="results-detail-counts"] td').first().should('have.text', '20');
    cy.get('[data-testid="video-results-detail"]').should('contain', 'a'.repeat(64));
    cy.get('[data-testid="results-power-trace"]').should('not.exist');
    cy.get('[data-testid="results-detail-back"]').click();
    cy.get('[data-testid="video-results-detail"]').should('not.exist');
    cy.location('search').should('not.contain', 'r_point=');
    points().should('have.length', 3);
    openPoint('h200');
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'H200');
    cy.go('back');
    cy.get('[data-testid="video-results-detail"]').should('not.exist');
    hardwarePoints('h200').should('be.visible');
    cy.go('forward');
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'H200');
    cy.get('[data-testid="results-detail-back"]').click();
    cy.get('[data-testid="video-results-detail"]').should('not.exist');
    cy.go('forward');
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'H200');
  });

  it('plays a clicked point on the clip stage, keeping its details pinned', () => {
    const namedRun = '90000000002';
    mount({
      search: `?unofficialrun=${namedRun}&r_y=videosPerGpuHour`,
      editPage: (page) => {
        const named = structuredClone(page.entries.find((entry) => entry.runId === '34341996789')!);
        named.runId = namedRun;
        named.artifact.id = 99992;
        named.approved = false;
        page.entries.unshift(named);
        // Stored runs may have clips; H100's runs stand in for a live run without media.
        for (const entry of page.entries)
          if (!['34336635063', '34344378350'].includes(entry.runId))
            entry.publishedAt = '2026-11-01T00:00:00.000Z';
      },
    });
    playing().should('have.length', 1).and('have.attr', 'data-overlay', 'true');
    hardwarePoints('h200').find('.visible-shape').click({ force: true });
    playing().should('have.attr', 'data-hardware', 'h200');
    stagePill('a').should('contain', 'H200');
    searchParam('r_clip').should('match', /^34342452354:/u);
    // The stage switch redraws the chart without closing the panel the click pinned.
    cy.get('[data-testid="point-details-panel"]').should('contain', 'H200');
    // Hidden hardware stops playing; the stage falls back to the named run until it returns.
    cy.get('[data-testid="point-details-close"]').click();
    toggleHardware('h200');
    stagePill('a').should('contain', 'B200').and('contain', 'Unofficial run');
    playing().should('have.attr', 'data-hardware', 'b200').and('have.attr', 'data-overlay', 'true');
    toggleHardware('h200');
    playing().should('have.attr', 'data-hardware', 'h200');

    hardwarePoints('h100').should('have.attr', 'data-clips', 'false');
    hardwarePoints('h100').find('.visible-shape').should('have.css', 'stroke-width', '1.5px');
    hardwarePoints('h100').find('.visible-shape').click({ force: true });
    cy.get('[data-testid="point-details-panel"]')
      .should('contain', 'H100')
      .find('[data-action="compare-below"]')
      .should('not.exist');
    playing().should('have.attr', 'data-hardware', 'h200');
    searchParam('r_clip').should('match', /^34342452354:/u);

    // An official subject is never offered its own GPU.
    cy.get('[data-testid="video-results-compare-h200"]').should('not.exist');
    cy.get('[data-testid="video-results-compare-b200"]').click();
    stagePill('b').should('contain', 'B200').and('contain', 'Unofficial run');
    points('[data-clip-role="baseline"]').should('have.attr', 'data-overlay', 'true');

    points('[data-hardware="b200"][data-overlay="true"] .visible-shape').click({ force: true });
    playing().should('have.attr', 'data-overlay', 'true');
    cy.get('[data-testid="video-results-chart"] [data-clip-badge="playing"] rect').should(
      'have.attr',
      'fill',
      overlayRunColor(0),
    );
    stagePill('a').should('contain', 'Unofficial run');
    searchParam('r_clip').should('match', new RegExp(`^${namedRun}:`, 'u'));
    // The unofficial subject is offered the official lead on its own GPU.
    cy.get('[data-testid="video-results-compare-reference"]').click();
    cy.get('[data-testid="video-results-compare-b200"]').click();
    stagePill('b').should('contain', 'B200').and('not.contain', 'Unofficial run');
    // Both sides are B200, so the readout names the baseline as the official run.
    cy.get('[data-testid="video-results-readout"] [data-readout-side="b200"]')
      .last()
      .should('contain', 'B200 official')
      .and('not.contain', 'Unofficial run');
    points('[data-clip-role="baseline"]')
      .should('have.attr', 'data-hardware', 'b200')
      .and('have.attr', 'data-overlay', 'false');
  });

  it('plays the B200 lead against its reference and a lossy cell against its twin, in view', () => {
    const run = '34341996789';
    mount({
      search: '?r_y=videosPerGpuHour&r_lossy=1&r_view=side',
      editPage: (page) => {
        for (const entry of page.entries) {
          entry.publishedAt = '2026-11-01T00:00:00.000Z';
          for (const source of entry.sources)
            source.observations = source.observations.flatMap((observation) => [
              { ...observation, results: evidence(observation) },
              {
                ...observation,
                id: `${observation.id}-fbc`,
                results: { ...evidence(observation), optimizations: ['first-block-cache'] },
              },
            ]);
        }
        const lead = videoPoints([page]).find(
          (item) => item.runId === run && item.concurrency === 1,
        )!;
        const saved = servingArtifact(Number(run), lead.artifactId, 'NVIDIA B200');
        saved.sources[0].checksums = saved.sources[0].checksums.map(([path, sha]) => [
          path,
          path === 'manifest.json' ? lead.id.split(':')[0] : sha,
        ]);
        const fixture = referenceQualityFixture();
        const [quality] = verifiedQuality(
          fixture.attachment,
          fixture.descriptor,
          fixture.stored,
          '9'.repeat(64),
        ).pairs;
        quality.candidate = {
          ...quality.candidate,
          run_id: run,
          artifact_id: lead.artifactId,
          source_id: saved.sources[0].id,
          manifest_sha256: lead.id.split(':')[0],
        };
        quality.reference.url = 'https://media.test/reference.mp4';
        saved.quality = [quality];
        cy.intercept(
          'GET',
          `/api/video-runs?run=${run}&artifact=${lead.artifactId}&format=published`,
          saved,
        );
      },
    });
    cy.get('[data-testid="video-results-compare-h200"]').click();
    cy.get('[data-testid="video-results-quality-method"] summary').click();
    // The button sits below the stage; once it tops the viewport the stage is out of view above.
    cy.get('[data-testid="video-results-quality-show-me"]')
      .should('contain', 'Show me')
      .scrollIntoView()
      .click({ scrollBehavior: false });
    cy.get('[data-testid="video-results-compare-reference"]').should(
      'have.attr',
      'aria-pressed',
      'true',
    );
    cy.get('[data-testid="video-results-stage"]').should('have.attr', 'data-view', 'wipe');
    searchParam('r_view').should('equal', null);
    searchParam('r_clip').should('match', new RegExp(`^${run}:[^-]+$`, 'u'));
    stagePill('a').should('contain', 'B200').and('not.contain', 'FirstBlockCache');
    stageInView();

    cy.get('[data-testid="video-results-view-side"]').click();
    cy.get('[data-testid="video-results-lossy-hint"]').should('contain', 'not published yet');
    // From the legend above, the stage is out of view below.
    cy.get('[data-testid="video-results-lossy-see-changes"]')
      .scrollIntoView()
      .click({ scrollBehavior: false });
    searchParam('r_clip').should('match', new RegExp(`^${run}:.+-fbc$`, 'u'));
    cy.get('[data-testid="video-results-compare-twin"]').should(
      'have.attr',
      'aria-pressed',
      'true',
    );
    stagePill('a').should('contain', 'FirstBlockCache');
    stagePill('b').should('contain', 'lossless');
    cy.get('[data-testid="video-results-stage"]').should('have.attr', 'data-view', 'wipe');
    stageInView();
  });

  it('falls back to the overview for an unknown or hidden deployment and drops its key', () => {
    mount({ search: '?r_y=videosPerGpuHour&r_point=0:missing' });
    cy.get('[data-testid="video-results-detail"]').should('not.exist');
    points().should('have.length', 3);
    searchParam('r_point').should('equal', null);
    hardwarePoints('b200')
      .then(($points) => ($points[0] as unknown as { __data__: { key: string } }).__data__.key)
      .then((point) => {
        cy.window().then((win) => {
          win.history.replaceState(
            null,
            '',
            `${win.location.pathname}?r_point=${encodeURIComponent(point!)}&r_y=videosPerGpuHour`,
          );
          win.dispatchEvent(new win.PopStateEvent('popstate'));
        });
        cy.get('[data-testid="video-results-detail"] h1').should('contain', 'B200');
        cy.window().then((win) => {
          win.history.replaceState(
            null,
            '',
            `${win.location.pathname}?r_point=${encodeURIComponent(point!)}&r_hidden=b200&r_y=videosPerGpuHour`,
          );
          win.dispatchEvent(new win.PopStateEvent('popstate'));
        });
        cy.get('[data-testid="video-results-detail"]').should('not.exist');
        hardwarePoints('b200').should('not.exist');
        searchParam('r_point').should('equal', null);
        toggleHardware('b200');
        hardwarePoints('b200').should('exist');
        cy.get('[data-testid="video-results-detail"]').should('not.exist');
      });
  });

  for (const [pathname, width] of [
    ['/vgx', 1440],
    ['/vgx', 390],
    ['/zh/vgx', 1440],
    ['/zh/vgx', 320],
  ] as const) {
    it(`keeps ${pathname} and its workload line readable at ${width} px`, () => {
      cy.viewport(width, 844);
      mount({ pathname, search: '?r_y=videosPerGpuHour' });
      cy.get('[data-testid="video-results"] h1').should('contain', 'VideoGenX');
      cy.get('#video-results-chart-title').should(
        'contain',
        pathname.startsWith('/zh') ? '每 GPU 小时生成视频数' : 'Videos per GPU-hour',
      );
      assertResultsFit();
      cy.get('[data-testid="video-results-chart"]').then(($chart) => {
        const plot = $chart[0]
          .querySelector('[data-testid="d3-chart-svg"]')!
          .getBoundingClientRect();
        const legend = $chart[0]
          .querySelector('[data-slot="chart-legend-wrapper"]')!
          .getBoundingClientRect();
        if (width >= 1024)
          expect(legend.left, 'legend beside the chart').to.be.at.least(plot.right);
        else expect(legend.top, 'legend below the chart').to.be.at.least(plot.bottom);
      });
      cy.get('[data-testid="video-results-chart"] .x-axis-label').should(($label) => {
        const svg = $label[0].closest('svg')!.getBoundingClientRect();
        const label = $label[0].getBoundingClientRect();
        expect(label.left, 'x-axis title starts inside the chart').to.be.at.least(svg.left);
        expect(label.right, 'x-axis title ends inside the chart').to.be.at.most(svg.right);
      });
      cy.get('[data-testid="results-table"]').should('not.exist');
      cy.get('[data-testid="results-gpus"]').should('not.exist');
      cy.get('[data-testid="results-cost-basis"]').should('not.exist');
      cy.get('[data-testid="results-advanced"] > summary')
        .should('contain', pathname.startsWith('/zh') ? '高级选项' : 'Advanced')
        .click();
      cy.get('[data-testid="results-price-t2v"]').should('be.visible');
      cy.get('[data-testid="results-advanced"] > summary').click();
      cy.get('[data-testid="results-advanced"]').should('not.have.attr', 'open');
      cy.get('[data-testid="video-results-stage"]').should(($stage) => {
        const rect = $stage[0].getBoundingClientRect();
        expect(rect.left, 'stage inside the page').to.be.at.least(0);
        expect(rect.right).to.be.at.most(width);
        expect(rect.width, 'stage spans the card').to.be.greaterThan(width * 0.6);
      });
      cy.get('[data-testid="video-results-readout"] dl').should(($grid) => {
        const cells = [...$grid[0].children];
        const rows = new Set(cells.map((cell) => cell.getBoundingClientRect().top)).size;
        expect(rows, 'readout rows').to.equal(width >= 1024 ? 1 : Math.ceil(cells.length / 2));
        expect($grid.find('[data-metric="cost"]').attr('title')).to.contain(
          pathname.startsWith('/zh') ? '分配 GPU' : 'allocated',
        );
      });
      cy.get('[data-testid="video-results-sources"] summary').click();
      cy.get('[data-testid="video-results-sources"] table').should(($table) => {
        const container = $table[0].parentElement!;
        const bounds = container.getBoundingClientRect();
        expect(bounds.left).to.be.at.least(0);
        expect(bounds.right).to.be.at.most(width);
        expect(getComputedStyle(container).overflowX).to.equal('auto');
        if (width < 768) expect(container.scrollWidth).to.be.greaterThan(container.clientWidth);
      });
      assertResultsFit();
      cy.get('[data-testid="video-results-sources"] summary').click();
      openPoint('b200');
      cy.get('[data-testid="video-results-detail"] h1').should('contain', 'B200');
      cy.get('[data-testid="results-detail-tab-telemetry"]').should(
        'have.text',
        pathname.startsWith('/zh') ? '遥测' : 'Telemetry',
      );
      assertResultsFit();
      cy.get('[data-testid="results-detail-back"]').click();
      cy.get('[data-testid="results-workload-summary"]').should(($line) => {
        const rect = $line[0].getBoundingClientRect();
        expect($line.text()).to.contain('MiniMax');
        expect(rect.left).to.be.at.least(0);
        expect(rect.right).to.be.at.most(width);
      });
    });
  }
});
