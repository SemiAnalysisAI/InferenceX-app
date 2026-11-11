import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import VideoDashboard from '@/components/video-benchmark/VideoDashboard';
import type {
  VideoHistoryObservation,
  VideoHistoryPage,
} from '@/components/video-benchmark/history';
import type { VideoPoint } from '@/components/video-benchmark/metrics';
import { videoPoints } from '@/components/video-benchmark/points';
import { parseResultsState } from '@/components/video-benchmark/results';
import type { ResultsEvidence } from '@/components/video-benchmark/results-evidence';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { verifiedQuality } from '@/components/video-benchmark/reference-quality';
import { referenceQualityFixture } from '@/components/video-benchmark/reference-quality.fixture';
import { APP_THEMES } from '@/lib/themes/themes';
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
  theme,
}: {
  pathname?: string;
  search?: string;
  edit?: (observation: VideoHistoryObservation) => void;
  editPage?: (page: VideoHistoryPage) => void;
  theme?: 'light' | 'dark';
} = {}) {
  if (theme) cy.window().then((win) => win.localStorage.setItem('theme', theme));
  readOnlyVideoRequests();
  resultHistory(edit).then((page) => {
    editPage?.(page);
    cy.intercept('GET', '/api/video-runs?format=history&page=1*', page).as('history');
  });
  cy.window().then((win) =>
    win.history.replaceState(null, '', `${win.location.pathname}${search}`),
  );
  const dashboard = (
    <PathnameContext.Provider value={pathname}>
      <VideoDashboard />
    </PathnameContext.Provider>
  );
  cy.mount(
    theme ? (
      <ThemeProvider
        attribute="class"
        defaultTheme={theme}
        enableSystem={false}
        themes={APP_THEMES}
      >
        {dashboard}
      </ThemeProvider>
    ) : (
      dashboard
    ),
  );
  cy.wait('@history');
  cy.get('[data-testid="video-results"]').should('be.visible');
}

const points = (selector = '') =>
  cy.get(`[data-testid="video-results-chart"] .dot-group${selector}`);
const hardwarePoints = (hardware: string) => points(`[data-hardware="${hardware}"]`);
/** Points of `hardware` that neither side of the stage plays. */
const offStage = (hardware: string) => hardwarePoints(hardware).not('[data-clip-role]');
const openPoint = (hardware: string, overlay = false) => {
  hardwarePoints(hardware)
    .filter(`[data-overlay="${overlay}"]`)
    .find('.visible-shape')
    .click({ force: true });
  cy.get('[data-testid="point-details-panel"] [data-action="view-telemetry"]').click();
};
const seriesPills = () => cy.get('[data-testid="video-results-chart"] [data-series-pill]');
const lineColor = (hardware: string) =>
  hardwarePoints(hardware)
    .filter('[data-overlay="false"]')
    .find('.visible-shape')
    .then(($shape) => getComputedStyle($shape[0]).stroke);
const playing = () => points('[data-clip-role="playing"]');
const gpusOf = (node: Element) =>
  (node as unknown as { __data__: { cell: { point: VideoPoint } } }).__data__.cell.point
    .participating;
const stagePill = (side: 'a' | 'b') =>
  cy.get(`[data-side="${side}"] [data-testid="video-results-pill"]`);
/** The stage and its transport sit fully inside the viewport. */
const stageInView = () =>
  cy.get('#comparison-stage').should(($stage) => {
    const rect = $stage[0].getBoundingClientRect();
    expect(rect.top, 'stage top').to.be.at.least(0);
    expect(rect.bottom, 'stage bottom').to.be.at.most(
      $stage[0].ownerDocument.defaultView!.innerHeight + 1,
    );
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

const B200_RUN = '34341996789';
const FRAME = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"/>')}`;
/**
 * Adds 1-, 2- and 8-GPU points to the B200 run, drawn and playable but neither its lead nor where
 * the stage opens, and serves the run's published clips with first frames as `@b200`. Returns the
 * read's URL.
 */
const b200Frontier = (page: VideoHistoryPage, delay = 0, frame = FRAME) => {
  for (const entry of page.entries) entry.publishedAt = '2026-11-01T00:00:00.000Z';
  const source = page.entries.find((entry) => entry.runId === B200_RUN)!.sources[0];
  const lead = source.observations.find((observation) => observation.concurrency === 1)!;
  for (const [gpus, p50] of [
    [1, 300],
    [2, 150],
    [8, 40],
  ])
    source.observations.push({ ...lead, id: `${lead.id}-g${gpus}`, participating: gpus, p50 });
  const point = videoPoints([page]).find((item) => item.id === lead.id)!;
  const saved = servingArtifact(Number(B200_RUN), point.artifactId, 'NVIDIA B200');
  saved.sources[0].checksums = saved.sources[0].checksums.map(([path, sha]) => [
    path,
    path === 'manifest.json' ? lead.id.split(':')[0] : sha,
  ]);
  saved.sources[0].assets = saved.sources[0].assets.map(([path, asset]) => [
    path,
    { ...asset, posterUrl: frame },
  ]);
  const read = `/api/video-runs?run=${B200_RUN}&artifact=${point.artifactId}&format=published`;
  cy.intercept('GET', read, (request) => request.reply({ body: saved, delay })).as('b200');
  return read;
};

/** Adds an unapproved re-export of the B200 run, so the official B200 line stays drawn. */
const NAMED_RUN = '90000000003';
const addNamedRun = (page: VideoHistoryPage) => {
  const named = structuredClone(page.entries.find((entry) => entry.runId === '34341996789')!);
  named.runId = NAMED_RUN;
  named.artifact.id = 99993;
  named.approved = false;
  // Distinct observation IDs, so neither copy displaces the other's points.
  for (const source of named.sources)
    for (const observation of source.observations) observation.id = `named-${observation.id}`;
  page.entries.unshift(named);
};

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
    // The plot waits under a skeleton, never under the note for an empty selection.
    cy.get('[data-testid="video-results-chart-skeleton"]').should('be.visible');
    cy.get('[data-testid="video-results-chart"]').should('not.contain', 'No visible hardware');
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
    // A lossy line's pill is a dashed outline, named by its optimisations.
    cy.get('[data-series-pill][data-lossy="true"]')
      .should('have.length.at.least', 1)
      .first()
      .should('contain', 'B200 · ')
      .find('rect')
      .should('have.attr', 'stroke-dasharray', '3 2')
      .and('have.attr', 'fill', 'var(--card)');
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
    // On a phone the stage is shorter than the viewport, so scroll anchoring cannot hide a shift.
    cy.viewport(375, 812);
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
        // As in production, a read lands after the click's next frame.
        cy.intercept(
          'GET',
          `/api/video-runs?run=${run}&artifact=${lead.artifactId}&format=published`,
          { body: saved, delay: 400 },
        );
      },
    });
    cy.get('[data-testid="video-results-compare-h200"]').click();
    cy.get('[data-testid="video-results-quality-method"] summary').click();
    // The button sits below the stage; once it tops the viewport the stage is out of view above.
    cy.get('[data-testid="video-results-quality-show-me"]')
      .scrollIntoView()
      .click({ scrollBehavior: false });
    cy.get('[data-testid="video-results-compare-reference"]').should(
      'have.attr',
      'aria-pressed',
      'true',
    );
    cy.get('[data-testid="video-results-stage"]').should('have.attr', 'data-view', 'wipe');
    searchParam('r_clip').should('match', new RegExp(`^${run}:[^-]+$`, 'u'));
    stageInView();

    cy.get('[data-testid="video-results-view-side"]').click();
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
    cy.get('[data-testid="video-results-stage"]').should('have.attr', 'data-view', 'wipe');
    // The lossy cell's own read restores the prompt row above the stage; the stage stays in view.
    cy.get('[data-testid="video-results-prompt"]').should('exist');
    stageInView();
    cy.focused().should('have.attr', 'data-testid', 'video-results-stage');
  });

  it('opens the stage on the middle of the B200 frontier, not its most efficient end', () => {
    mount({
      edit: (observation) => {
        observation.results = evidence(observation);
      },
      editPage: (page) => {
        const source = page.entries.find((entry) => entry.runId === '34341996789')!.sources[0];
        const lead = source.observations.find((observation) => observation.concurrency === 1)!;
        // 1 and 2 GPUs are slower but more efficient; 8 GPUs is the fastest, costliest end.
        for (const [gpus, p50] of [
          [1, 300],
          [2, 150],
          [8, 40],
        ])
          source.observations.push({
            ...lead,
            id: `${lead.id}-g${gpus}`,
            participating: gpus,
            p50,
          });
      },
    });
    hardwarePoints('b200').should('have.length', 4);
    stagePill('a').should('contain', '4 GPUs').find('b').should('have.text', 'B200 · SGLang');
  });

  it('shows a read clip’s first frame in the hover card, and none for a point without one', () => {
    const run = '34341996789';
    const frame = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"/>')}`;
    mount({
      editPage: (page) => {
        for (const entry of page.entries) entry.publishedAt = '2026-11-01T00:00:00.000Z';
        const lead = videoPoints([page]).find(
          (item) => item.runId === run && item.concurrency === 1,
        )!;
        const saved = servingArtifact(Number(run), lead.artifactId, 'NVIDIA B200');
        saved.sources[0].checksums = saved.sources[0].checksums.map(([path, sha]) => [
          path,
          path === 'manifest.json' ? lead.id.split(':')[0] : sha,
        ]);
        saved.sources[0].assets = saved.sources[0].assets.map(([path, asset]) => [
          path,
          { ...asset, posterUrl: frame },
        ]);
        cy.intercept(
          'GET',
          `/api/video-runs?run=${run}&artifact=${lead.artifactId}&format=published`,
          saved,
        ).as('b200');
      },
    });
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"] video').should('exist');
    const tooltip = '[data-chart-tooltip="video-results-chart"]';
    hardwarePoints('b200').trigger('mouseenter', { force: true });
    cy.get(`${tooltip} [data-hover-image]`).should('have.attr', 'src', frame);
    hardwarePoints('b200').trigger('mouseleave', { force: true });
    // H100's read answered without media, so its card keeps text only.
    hardwarePoints('h100').trigger('mouseenter', { force: true });
    cy.get(tooltip).should('contain', 'H100').find('[data-hover-image]').should('not.exist');
    cy.get('@b200.all').should('have.length', 1);
  });

  it('reads a point the pointer rests on, so its hover card shows its first frame', () => {
    let read = '';
    mount({
      edit: (observation) => {
        observation.results = evidence(observation);
      },
      editPage: (page) => {
        read = b200Frontier(page);
      },
    });
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"] video').should('exist');
    const tooltip = '[data-chart-tooltip="video-results-chart"]';
    cy.get('@b200.all').then((before) => {
      offStage('b200').first().trigger('mouseenter', { force: true });
      // The card keeps the frame's box while the point's clips are read.
      cy.get(`${tooltip} [data-hover-image-pending]`).should('exist');
      cy.get(`${tooltip} [data-hover-image]`).should('have.attr', 'src', FRAME);
      cy.get('@b200.all').should('have.length', before.length + 1);
    });
    // A read that fails closes the box instead of leaving the card waiting.
    offStage('b200').first().trigger('mouseleave', { force: true });
    cy.then(() => cy.intercept('GET', read, { statusCode: 500 }).as('failed'));
    offStage('b200').eq(1).trigger('mouseenter', { force: true });
    cy.get(`${tooltip} [data-hover-image-pending]`).should('exist');
    cy.wait('@failed');
    cy.get(tooltip).should('contain', 'B200').find('[data-hover-media]').should('not.exist');
  });

  it('keeps the pair on screen, dimmed, while a clicked point’s clips are read', () => {
    mount({
      edit: (observation) => {
        observation.results = evidence(observation);
      },
      // The opening's first frame is still loading when the point is picked.
      editPage: (page) => b200Frontier(page, 1500, '/slow-frame.svg'),
    });
    cy.intercept('GET', '/slow-frame.svg', (request) =>
      request.reply({
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"/>',
        headers: { 'content-type': 'image/svg+xml' },
        delay: 2500,
      }),
    );
    const pair = '[data-testid="video-results-pair"]';
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"] video').should('exist');
    cy.get('[data-prompt]').its('length').as('tiles', { type: 'static' });
    stagePill('a').invoke('text').as('before', { type: 'static' });
    // The fastest B200 point: neither the lead, read with the page, nor where the stage opens.
    offStage('b200')
      .filter((_, node) => gpusOf(node) === 8)
      .then(($point) => {
        cy.wrap($point).find('.visible-shape').click({ force: true });
        // The chart follows the click at once; the stage keeps the last pair until the read lands.
        playing().should(($playing) => expect(gpusOf($playing[0])).to.equal(8));
        cy.get<string>('@before').then((before) => stagePill('a').should('have.text', before));
        cy.get<number>('@tiles').then((tiles) =>
          cy.get('[data-prompt]').should('have.length', tiles),
        );
        cy.get(pair).should('have.attr', 'data-stale', 'true');
        cy.get('[data-testid="video-results-clips"] [role="status"]').should(
          'have.class',
          'sr-only',
        );
        cy.get(pair).should('not.have.attr', 'data-stale');
        stagePill('a').should('contain', '8 GPUs');
      });
  });

  it('glides points to new data, with the playing badge on its point every frame', () => {
    mount();
    playing().should('exist');
    const frames: [string | null, string | null][] = [];
    cy.window().then((win) => {
      const chart = win.document.querySelector('[data-testid="video-results-chart"]')!;
      const start = win.performance.now();
      const tick = () => {
        frames.push([
          chart.querySelector('[data-clip-role="playing"]')?.getAttribute('transform') ?? null,
          chart.querySelector('[data-clip-badge="playing"]')?.getAttribute('transform') ?? null,
        ]);
        if (win.performance.now() - start < 1500) win.requestAnimationFrame(tick);
      };
      win.requestAnimationFrame(tick);
    });
    // Hiding H100 rescales the plot, so the B200 point moves.
    toggleHardware('h100');
    cy.wait(1600).then(() => {
      expect(new Set(frames.map(([point]) => point)).size, 'positions').to.be.greaterThan(3);
      for (const [point, badge] of frames) expect(badge).to.equal(point);
    });
  });

  it('pulses playable points until the first clip is picked', () => {
    mount({
      editPage: (page) => {
        for (const entry of page.entries) entry.publishedAt = '2026-11-01T00:00:00.000Z';
      },
    });
    cy.get('[data-clip-role="playing"]').should('exist');
    points('[data-clips="true"]:not([data-clip-role]) .video-clip-pulse').should(
      'have.length.at.least',
      1,
    );
    points('[data-clip-role] .video-clip-pulse').should('not.exist');
    points('[data-clips="false"] .video-clip-pulse').should('not.exist');
    points('[data-hardware="h200"] .visible-shape').click({ force: true });
    cy.get('[data-testid="video-results-chart"] .video-clip-pulse').should('not.exist');
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

  it('names each drawn line with one pill at its end, apart and in the line colour', () => {
    cy.viewport(1440, 900);
    mount({
      search: `?unofficialrun=${NAMED_RUN}&r_y=videosPerGpuHour`,
      edit: (observation) => {
        observation.results = evidence(observation);
      },
      editPage: addNamedRun,
    });
    // Three official GPUs and the unofficial run, one pill each.
    seriesPills().should('have.length', 4);
    seriesPills().should(($pills) => {
      const texts = [...$pills].map((pill) => pill.textContent);
      expect(texts).to.include.members([
        'B200 (SGLang)',
        'H200 (SGLang)',
        'H100 (SGLang)',
        'B200 (SGLang) · unofficial',
      ]);
      const boxes = [...$pills].map((pill) => pill.getBoundingClientRect());
      const zoom = $pills[0].closest<SVGGElement>('.zoom-group')!;
      const ctm = zoom.getScreenCTM()!;
      const width = Number(
        zoom
          .ownerSVGElement!.querySelector('#clip-video-results-chart rect')!
          .getAttribute('width'),
      );
      const plot = { left: ctm.e, right: ctm.e + width };
      for (const [i, a] of boxes.entries()) {
        expect(a.left, 'pill inside the plot').to.be.at.least(plot.left - 0.5);
        expect(a.right, 'pill inside the plot').to.be.at.most(plot.right + 0.5);
        for (const b of boxes.slice(i + 1))
          expect(
            a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
            `${texts[i]} clear of the next pill`,
          ).to.equal(true);
      }
    });
    cy.contains('[data-series-pill]', 'unofficial')
      .find('rect')
      .should('have.attr', 'fill', overlayRunColor(0));
    cy.contains('[data-series-pill]', 'H200 (SGLang)')
      .find('rect')
      .then(($h200) =>
        cy
          .contains('[data-series-pill]', 'H100 (SGLang)')
          .find('rect')
          .should('not.have.attr', 'fill', $h200.attr('fill')),
      );
  });

  it('names only the focus overlay lines on a narrow plot', () => {
    cy.viewport(375, 844);
    mount({
      search: `?unofficialrun=${NAMED_RUN}&r_y=videosPerGpuHour`,
      edit: (observation) => {
        observation.results = evidence(observation);
      },
      editPage: (page) => {
        addNamedRun(page);
        // Stored runs may have clips, so a click on H200 plays it.
        for (const entry of page.entries) entry.publishedAt = '2026-11-01T00:00:00.000Z';
      },
    });
    // The unofficial run plays, so its line keeps a pill beside the three official ones.
    seriesPills().should('have.length', 4);
    cy.contains('[data-series-pill]', 'unofficial').should('exist');
    hardwarePoints('h200').find('.visible-shape').click({ force: true });
    playing().should('have.attr', 'data-hardware', 'h200');
    seriesPills().should('have.length', 3);
    cy.contains('[data-series-pill]', 'unofficial').should('not.exist');
    assertResultsFit();
  });

  it('gives H100 and H200 distinct VideoGenX colours in light and dark themes', () => {
    mount({ theme: 'light' });
    lineColor('b200').should('equal', 'rgb(95, 158, 69)');
    lineColor('h200').should('equal', 'rgb(29, 111, 184)');
    lineColor('h100').should('equal', 'rgb(11, 92, 60)');
    mount({ theme: 'dark' });
    lineColor('h200').should('equal', 'rgb(90, 169, 236)');
    lineColor('h100').should('equal', 'rgb(47, 181, 138)');
    cy.document().then((document) => document.documentElement.classList.remove('dark'));
  });

  it('labels deployments only on the playing, baseline and hovered lines', () => {
    mount({
      search: `?unofficialrun=${NAMED_RUN}&r_y=videosPerGpuHour&r_optimal=0`,
      editPage: (page) => {
        // Every line gets a second deployment, so each has a label to show or hide.
        for (const entry of page.entries)
          for (const source of entry.sources) {
            const first = source.observations[0];
            if (!first) continue;
            source.observations.push({
              ...structuredClone(first),
              id: `two-gpu-${entry.runId}:${first.cell}`,
              participating: 2,
              allocated: 2,
            });
          }
        addNamedRun(page);
      },
    });
    const labelled = () =>
      points('[data-labelled]').then(($points) =>
        [...$points].map((point) => `${point.dataset.hardware}:${point.dataset.overlay}`),
      );
    // The unofficial run plays; only its other deployment is labelled, once.
    playing().should('have.attr', 'data-overlay', 'true');
    labelled().should('deep.equal', ['b200:true']);
    cy.get('[data-testid="video-results-chart"]').should(($chart) => {
      const labels = [
        ...$chart[0].querySelectorAll<SVGTextElement>('.dot-group[data-labelled] .point-label'),
      ];
      const pills = [...$chart[0].querySelectorAll('[data-series-pill] rect')];
      for (const label of labels)
        for (const pill of pills) {
          const a = label.getBoundingClientRect();
          const b = pill.getBoundingClientRect();
          expect(
            a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
            `"${label.textContent}" clear of every pill`,
          ).to.equal(true);
        }
    });
    // A label hidden until hover is measured shown, so its box uses the rendered width.
    const hiddenMeasures: string[] = [];
    cy.window().then((win) => {
      const measure = win.SVGTextElement.prototype.getComputedTextLength;
      cy.stub(win.SVGTextElement.prototype, 'getComputedTextLength').callsFake(function (
        this: SVGTextElement,
      ) {
        if (this.classList.contains('point-label') && win.getComputedStyle(this).display === 'none')
          hiddenMeasures.push(this.textContent ?? '');
        return measure.call(this);
      });
    });
    points('[data-hardware="h200"]').first().trigger('mouseenter', { force: true });
    labelled().should('have.members', ['b200:true', 'h200:false', 'h200:false']);
    cy.wrap(hiddenMeasures).should('have.length', 0);
    points('[data-hardware="h200"]').first().trigger('mouseleave', { force: true });
    labelled().should('deep.equal', ['b200:true']);
  });

  it('shows power and the telemetry action without scrolling the details panel', () => {
    cy.viewport(1440, 900);
    mount();
    hardwarePoints('b200').find('.visible-shape').click({ force: true });
    cy.get('[data-testid="point-details-panel"]').then(($panel) => {
      const body = $panel[0].querySelector('[data-slot="point-details-body"]')!;
      const bounds = body.getBoundingClientRect();
      const power = [...$panel[0].querySelectorAll('dt')].find(
        (term) => term.textContent === 'Avg board power',
      )!;
      expect(power, 'power row').not.to.equal(undefined);
      expect(power.getBoundingClientRect().bottom, 'power row in view').to.be.at.most(
        bounds.bottom,
      );
      const telemetry = $panel[0].querySelector('[data-action="view-telemetry"]')!;
      expect(
        telemetry.closest('[data-slot="point-details-actions"]'),
        'fixed action row',
      ).not.to.equal(null);
      const rect = telemetry.getBoundingClientRect();
      expect(rect.bottom, 'telemetry inside the window').to.be.at.most(900);
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
