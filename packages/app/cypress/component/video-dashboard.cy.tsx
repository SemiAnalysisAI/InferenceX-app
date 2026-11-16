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
import { mountWithProviders } from '../support/test-utils';
import {
  coarsePointer,
  readOnlyVideoRequests,
  resultHistory,
  tapArea,
  touchScreen,
} from '../support/video-results';

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
  mountWithProviders(
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
/** The Compare row's two selects: the config that plays, and what it is compared with. */
const config = () => cy.get('[data-testid="video-results-config"]');
const against = () => cy.get('[data-testid="video-results-against"]');
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
/** Stored runs may have clips, so every hardware is offered as a pair. */
const publishEveryRun = (page: VideoHistoryPage) => {
  for (const entry of page.entries) entry.publishedAt = '2026-11-01T00:00:00.000Z';
};
/** Whether the subject's pill sits left of its pair's, which Swap exchanges. */
const subjectOnLeft = (left: boolean) =>
  cy.get<HTMLElement>('[data-testid="video-results-pill"]').should(($pills) => {
    const side = (role: string) =>
      [...$pills]
        .find((pill) => pill.closest<HTMLElement>('[data-side]')?.dataset.side === role)!
        .getBoundingClientRect().left;
    expect(side('a') < side('b'), 'subject pill on the left').to.equal(left);
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
 * the stage opens: 1 and 2 GPUs are slower but more efficient, 8 GPUs is the fastest, costliest
 * end. Serves the run's published clips with first frames as `@b200`, and with `media` as every
 * clip's file when a test plays one. Returns the read's URL.
 */
const b200Frontier = (page: VideoHistoryPage, delay = 0, frame = FRAME, media?: string) => {
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
    { ...asset, posterUrl: frame, ...(media ? { url: media } : {}) },
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
  powerSamples: 2,
  peakPowerW: 3900,
  gpuMemoryMiB: null,
  warmupSeconds: 38.2,
  failures: { timeout: 0, oom: 0, engine: 0, transport: 0, other: 0 },
});

/** Publishes the B200 run with the two-sample power trace the detail view reads when it opens. */
const b200PowerTrace = (page: VideoHistoryPage) => {
  const entry = page.entries.find((item) => item.runId === B200_RUN)!;
  const saved = servingArtifact(Number(B200_RUN), entry.artifact.id, 'NVIDIA B200');
  const [source] = saved.sources;
  const manifestSha = entry.sources[0].observations[0].id.split(':')[0];
  source.checksums = source.checksums.map(([path, sha]) => [
    path,
    path === 'manifest.json' ? manifestSha : sha,
  ]);
  source.documents = source.documents.map(([path, document]) => [
    path,
    /^gpu\/c\d+\/power\.json$/u.test(path)
      ? {
          ...(document as Record<string, unknown>),
          window: { start_unix: 100, end_unix: 101 },
          sample_series: [
            { unix_seconds: 100, aggregate_watts: 3800, valid: true },
            { unix_seconds: 101, aggregate_watts: 3900, valid: true },
          ],
        }
      : document,
  ]) as typeof source.documents;
  cy.intercept(
    'GET',
    `/api/video-runs?run=${B200_RUN}&artifact=${entry.artifact.id}&format=published`,
    saved,
  );
};

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

const sheet = () => cy.get('[data-testid="video-point-sheet"]');
/** Where a chart point's mark is drawn, in viewport coordinates. */
const centreOf = (group: Element) => {
  const box = group.querySelector('.visible-shape')!.getBoundingClientRect();
  return {
    hardware: (group as HTMLElement).dataset.hardware!,
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
  };
};
const centres = () => points().then(($groups) => [...$groups].map(centreOf));
/** A finger's tap on the chart at viewport coordinates, which a touch screen reports as a click. */
const tapChart = (x: number, y: number) =>
  cy.get('[data-testid="d3-chart-svg"]').then(($svg) => {
    const box = $svg[0].getBoundingClientRect();
    cy.wrap($svg).trigger('click', x - box.left, y - box.top, {
      clientX: x,
      clientY: y,
      force: true,
    });
  });
const tapPoint = ($group: JQuery<HTMLElement>) => {
  const { x, y } = centreOf($group[0]);
  tapChart(x, y);
};

/** The plotted point lowest on the screen. */
const lowestPoint = () =>
  points().then(($groups) =>
    Cypress.$([...$groups].toSorted((a, b) => centreOf(b).y - centreOf(a).y)[0]),
  );
/** The page's scroll offset once a smooth scroll has come to rest. */
const restingScroll = () =>
  cy.window().then(
    (win) =>
      new Cypress.Promise<number>((resolve) => {
        let last = -1;
        let still = 0;
        const frame = () => {
          still = win.scrollY === last ? still + 1 : 0;
          last = win.scrollY;
          if (still >= 10) resolve(last);
          else win.requestAnimationFrame(frame);
        };
        frame();
      }),
  );

/** The viewport y of an element's top edge. */
const topOf = (selector: string) =>
  cy.get(selector).then(($element) => $element[0].getBoundingClientRect().top);
/** Each selector's element starts below the one before it. */
const expectStacked = (order: string[]) =>
  cy.wrap(order).each((selector: string, index) => {
    if (index === 0) return;
    topOf(order[index - 1]).then((above) =>
      topOf(selector).should((below) =>
        expect(below, `${selector} below ${order[index - 1]}`).to.be.greaterThan(above),
      ),
    );
  });

describe('VideoGenX results', () => {
  afterEach(() => {
    if (Cypress.isBrowser({ family: 'chromium' })) touchScreen(false);
  });

  it('shows the loading state without reading History while the server streams the cohort', () => {
    readOnlyVideoRequests();
    cy.intercept('GET', '/api/video-runs?format=history&page=*', {
      schemaVersion: 1,
      entries: [],
      nextPage: null,
    }).as('history');
    const initialData = { state: parseResultsState('?r_tier=r'), history: null, sides: {} };
    mountWithProviders(
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
    mountWithProviders(
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
    cy.get('[data-testid="video-results-chart"] .x-axis-label').should('contain', 'Median latency');
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
    searchParam('r_optimal').should('equal', null);
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

  it('switches between approved models from the benchmark config', () => {
    mount({
      // A filter left over from the previous workload must not hide the next one.
      search: '?r_y=videosPerGpuHour&r_steps=50',
      editPage: (page) => {
        const entry = page.entries.find((item) => item.runId === B200_RUN)!;
        for (const source of entry.sources)
          for (const observation of source.observations) {
            const workload = JSON.parse(observation.workloadKey!);
            workload.plan.model_id = 'Wan-AI/Wan2.2-T2V-A14B-Diffusers';
            workload.plan.generation.num_inference_steps = 40;
            observation.workloadKey = JSON.stringify(workload);
          }
      },
    });
    hardwarePoints('h200').should('exist');
    hardwarePoints('b200').should('not.exist');
    cy.get('[data-testid="results-benchmark-config"]').should('be.visible');
    cy.get('#results-workload').should('contain', 'MiniMaxAI/MiniMax-H3').click();
    cy.contains('[role="option"]', 'Wan-AI/Wan2.2-T2V-A14B-Diffusers').click();
    hardwarePoints('b200').should('exist');
    hardwarePoints('h200').should('not.exist');
    cy.get('#video-results-chart-title').should('contain', 'Wan-AI/Wan2.2-T2V-A14B-Diffusers');
    searchParam('r_workload').should('equal', 'wan2.2-t2v-a14b-diffusers');
    searchParam('r_steps').should('be.null');
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
    // An unrecorded allocation shows only the GPUs used, not a dangling "of —".
    cy.get('[data-slot="point-details-setup"]')
      .should('contain', 'GPUs')
      .and('not.contain', ' of ');
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

  it('plots each GPU’s best lossless engine or one engine, and asks before showing two', () => {
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
    // Best or one engine: no option draws every engine at once.
    cy.get('[data-testid="results-engine"]').contains('button', /^All$/u).should('not.exist');
    chooseEngine('vLLM-Omni');
    searchParam('r_engine').should('equal', 'vllm-omni');
    engines().should('deep.equal', ['vllm-omni']);
    chooseEngine('Best');
    engines().should('deep.equal', ['sglang']);
    cy.get('[data-testid="results-lossy-key"]').should('not.exist');
    // The lossy Sol line beside SGLang puts two engines on one GPU, so it asks first.
    cy.get('#video-results-lossy').click();
    cy.get('[data-testid="engine-comparison-confirmation"]').contains('button', 'Cancel').click();
    searchParam('r_lossy').should('equal', null);
    cy.get('#video-results-lossy').click();
    cy.get('[data-testid="engine-comparison-confirmation"]')
      .contains('button', 'I agree, show both')
      .click();
    searchParam('r_lossy').should('equal', '1');
    engines().should('deep.equal', ['sglang', 'sol-engine']);
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
      editPage: b200PowerTrace,
    });
    points('[data-hardware="b200"]').trigger('mouseenter', { force: true });
    cy.get('[data-chart-tooltip="video-results-chart"]')
      .should('contain', 'Conc 1')
      .and('contain', 'Median s')
      .and('contain', '4 GPU · TP2 × Ulysses 2');
    points('[data-hardware="b200"] .visible-shape').click({ force: true });
    cy.get('[data-testid="point-details-panel"]')
      .should('contain', 'GPUs')
      .and('contain', '4 of 8')
      .and('contain', 'Concurrency')
      .and('contain', 'TP2 × Ulysses 2')
      .find('a[href="https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34341996789"]')
      .should('contain', 'GitHub Actions run');
    cy.get('[data-testid="point-details-panel"]')
      .should('not.contain', '? attention')
      .and('not.contain', 'replicas not recorded')
      .within(() => {
        cy.get('[data-action="artifact"]')
          .should('have.attr', 'href')
          .and('match', /\/actions\/runs\/34341996789\/artifacts\/\d+$/u);
        cy.get('[data-action="reproduce"]')
          .should('have.attr', 'href')
          .and('contain', 'video-generation/SUBMITTING.md');
      });
    cy.get('[data-testid="point-details-panel"]').invoke('outerWidth').should('be.gte', 280);
    cy.get('[data-testid="point-details-panel"] [data-action="view-telemetry"]').click();
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'B200');
    searchParam('r_point').should('match', /^34341996789:/u);
    cy.get('[data-testid="results-detail-deployments"]')
      .should('have.attr', 'role', 'group')
      .and('have.attr', 'aria-label', 'Deployments')
      .find('[aria-pressed="true"]')
      .should('contain', '4 GPU');
    cy.get('[data-testid="video-results-detail"] nav').should('not.exist');
    cy.get('[data-testid="results-detail-actions"]')
      .should('have.attr', 'role', 'group')
      .within(() => {
        cy.get('[data-action="run"]')
          .should(
            'have.attr',
            'href',
            'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34341996789',
          )
          .and('contain', 'GitHub Actions run');
        cy.get('[data-action="artifact"]')
          .should('have.attr', 'href')
          .and('match', /\/actions\/runs\/34341996789\/artifacts\/\d+$/u);
        cy.get('[data-action="reproduce"]')
          .should('have.attr', 'href')
          .and('contain', 'video-generation/SUBMITTING.md');
      });
    cy.get('[data-testid="video-results-detail"]').should('contain', 'value (ms, log scale)');
    cy.get('[data-testid="video-results-detail"]')
      .invoke('text')
      .should('match', /range \d{2},\d{3}–\d{2},\d{3} ms/u);
    cy.viewport(393, 900);
    cy.get('[data-testid="results-detail-actions"] a').then((links) => {
      const tops = [...links].map((link) => link.getBoundingClientRect().top);
      expect(new Set(tops).size, 'actions share one row on a phone').to.equal(1);
    });
    cy.get('[data-testid="results-detail-actions"] [data-action="run"]').should(
      'have.attr',
      'aria-label',
      'GitHub Actions run',
    );
    cy.viewport(1280, 900);
    cy.get('[data-testid="results-power-trace"] svg').should('exist');
    cy.get('[data-testid="results-detail-latency"]')
      .invoke('text')
      .should('match', /^Recorded median \d/u);
    // Twenty clips have no meaningful tail, so neither the readout nor the histogram names one.
    cy.get('[data-testid="video-results-detail"]')
      .invoke('text')
      .should('not.match', /p9[05]/iu);
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
    against().find('option[value="h200"]').should('not.exist');
    against().select('b200');
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
    // A new subject drops the H200 pick: the unofficial run pairs with the official lead on its GPU.
    against().should('have.value', 'b200');
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
    against().select('h200');
    cy.get('[data-testid="video-results-quality-method"] summary').click();
    // The button sits below the stage; once it tops the viewport the stage is out of view above.
    cy.get('[data-testid="video-results-quality-show-me"]')
      .scrollIntoView()
      .click({ scrollBehavior: false });
    against().should('have.value', 'reference');
    cy.get('[data-testid="video-results-stage"]').should('have.attr', 'data-view', 'wipe');
    searchParam('r_clip').should('match', new RegExp(`^${run}:[^-]+$`, 'u'));
    stageInView();

    cy.get('[data-testid="video-results-view-side"]').click();
    // From the legend above, the stage is out of view below.
    cy.get('[data-testid="video-results-lossy-see-changes"]')
      .scrollIntoView()
      .click({ scrollBehavior: false });
    searchParam('r_clip').should('match', new RegExp(`^${run}:.+-fbc$`, 'u'));
    against().should('have.value', 'twin');
    stagePill('a').should('contain', 'FirstBlockCache');
    cy.get('[data-testid="video-results-stage"]').should('have.attr', 'data-view', 'wipe');
    // The lossy cell's own read restores the prompt row above the stage; the stage stays in view.
    cy.get('[data-testid="video-results-prompt"]').should('exist');
    stageInView();
    cy.focused().should('have.attr', 'data-testid', 'video-results-stage');
  });

  it('plays the config picked in the Compare row against its default pairing', () => {
    // No run stored clips; the row and its pairing still follow the pick.
    cy.intercept('GET', '/api/video-runs*', { statusCode: 204 });
    mount({
      search: '?r_y=videosPerGpuHour&r_lossy=1',
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
      },
    });
    // The first select picks what plays, and the second follows it.
    config().select('h200');
    playing().should('have.attr', 'data-hardware', 'h200');
    searchParam('r_clip').should('match', /^34342452354:[^-]+$/u);
    against().should('have.value', 'reference');
    searchParam('r_vs').should('equal', null);
    stagePill('b').should('contain', 'Diffusers reference');
    cy.get('[data-testid="video-results-compare"]').should('contain', 'compare');
    // A click on the playing point keeps the reader's pairing, which the URL carries.
    against().select('h100');
    searchParam('r_vs').should('equal', 'h100');
    playing().find('.visible-shape').click({ force: true });
    against().should('have.value', 'h100');
    // A lossy config pairs with its lossless twin.
    config()
      .find('option[value^="h200+"]')
      .then(($option) => config().select(String($option.val())));
    searchParam('r_clip').should('match', /^34342452354:.+-fbc$/u);
    against().should('have.value', 'twin');
    searchParam('r_vs').should('equal', null);
    stagePill('b').should('contain', 'H200').and('contain', 'lossless');
  });

  it('reopens a shared comparison with its pair and swap, and the default for a pair it lacks', () => {
    cy.intercept('GET', '/api/video-runs*', { statusCode: 204 });
    mount({ search: '?r_y=videosPerGpuHour&r_vs=h200&r_swap=1', editPage: publishEveryRun });
    against().should('have.value', 'h200');
    stagePill('a').should('contain', 'B200');
    stagePill('b').should('contain', 'H200');
    subjectOnLeft(true);
    // Each choice leaves the URL once it is the default again.
    cy.get('[data-testid="video-results-swap"]').click();
    subjectOnLeft(false);
    searchParam('r_swap').should('equal', null);
    searchParam('r_vs').should('equal', 'h200');
    against().select('reference');
    searchParam('r_vs').should('equal', null);
    // A pair the subject does not offer plays its default and stays in the URL.
    cy.window().then((win) => {
      win.history.replaceState(null, '', `${win.location.pathname}?r_y=videosPerGpuHour&r_vs=b300`);
      win.dispatchEvent(new PopStateEvent('popstate'));
    });
    against().should('have.value', 'reference');
    searchParam('r_vs').should('equal', 'b300');
  });

  it('puts the clip stage first on a phone and leaves the desktop order alone', () => {
    cy.intercept('GET', '/api/video-runs*', { statusCode: 204 });
    cy.viewport(390, 844);
    mount({ editPage: publishEveryRun });
    cy.get('[data-testid="results-phone-title"]').should('be.visible').and('contain', 'VideoGenX');
    cy.get('[data-testid="video-results"] h1:visible').should('have.length', 1);
    expectStacked([
      '[data-testid="results-phone-title"]',
      '[data-testid="video-results-stage"]',
      '[data-testid="video-results-compare"]',
      '[data-testid="results-benchmark-config"]',
      '[data-testid="d3-chart-svg"]',
      '[data-testid="video-results-view-wipe"]',
      '[data-testid="video-results-readout"]',
      '[data-testid="results-how-to-read"]',
    ]);
    // The first select still changes what plays, and the model picker is still on the page.
    against().should('not.have.value', 'reference');
    searchParam('r_vs').should('match', /^h[12]00$/u);
    config().select('h200');
    stagePill('a').should('contain', 'H200');
    cy.get('#results-workload').should('be.visible');
    assertResultsFit();

    cy.viewport(1280, 900);
    cy.get('[data-testid="results-phone-title"]').should('not.be.visible');
    cy.get('[data-testid="video-results"] h1:visible').should('have.length', 1);
    expectStacked([
      '[data-testid="results-benchmark-config"]',
      '[data-testid="d3-chart-svg"]',
      '[data-testid="video-results-compare"]',
      '[data-testid="video-results-stage"]',
      '[data-testid="video-results-readout"]',
      '[data-testid="results-how-to-read"]',
    ]);
  });

  it('takes taps 44 px tall on the legend toolbar and each disclosure row, at their mouse size', function () {
    if (!Cypress.isBrowser({ family: 'chromium' })) this.skip();
    cy.intercept('GET', '/api/video-runs*', { statusCode: 204 });
    cy.viewport(390, 844);
    mount({ editPage: publishEveryRun });
    const close = '[data-testid="legend-close-button"]';
    const rows = [
      '[data-testid="video-results-legend-reset"]',
      '[data-testid="video-results-quality-method"] > summary',
      '[data-testid="video-results-sources"] > summary',
      '[data-testid="results-advanced"] > summary',
      '[data-testid="results-history"] > summary',
    ];
    // A mouse gets each control's own box and nothing more.
    tapArea(close).should('deep.equal', { width: 32, height: 32 });
    tapArea(rows[2]).its('height').should('be.lessThan', 24);
    const sizes: Record<string, number> = {};
    cy.wrap([close, ...rows]).each((selector: string) =>
      cy.get(selector).then(($control) => {
        sizes[selector] = $control[0].getBoundingClientRect().height;
      }),
    );
    touchScreen(true);
    tapArea(close).should('deep.equal', { width: 44, height: 44 });
    cy.wrap(rows).each((selector: string) =>
      tapArea(selector).should((area) => {
        expect(area.height, `${selector} height`).to.be.at.least(44);
        expect(area.width, `${selector} width`).to.be.at.least(44);
      }),
    );
    // The first legend row under the toolbar keeps its own 44 px.
    tapArea('[data-testid="chart-legend"] li label').its('height').should('be.at.least', 44);
    // Only the hit area grew: no control changed its height.
    cy.wrap([close, ...rows]).each((selector: string) =>
      cy
        .get(selector)
        .should(($control) =>
          expect($control[0].getBoundingClientRect().height, selector).to.equal(sizes[selector]),
        ),
    );
  });

  it('fades the cut-off edge of a wide table on a phone and masks nothing where no column is hidden', () => {
    cy.intercept('GET', '/api/video-runs*', { statusCode: 204 });
    cy.viewport(1440, 900);
    mount({ editPage: publishEveryRun });
    cy.get('[data-testid="video-results-sources"] > summary').click();
    const scroller = '[data-testid="video-results-sources"] [data-scroll-more]';
    cy.get(scroller)
      .should('have.attr', 'data-scroll-more', '')
      .and('have.css', 'mask-image', 'none');
    cy.viewport(390, 844);
    cy.get(scroller)
      .should('have.attr', 'data-scroll-more', 'end')
      .and(($table) => expect(getComputedStyle($table[0]).maskImage).to.contain('linear-gradient'));
    cy.get(scroller).scrollTo('right');
    cy.get(scroller).should('have.attr', 'data-scroll-more', 'start');
  });

  it('opens the point nearest a tap in a sheet on a touch screen, and closes it four ways', () => {
    coarsePointer();
    cy.viewport(390, 844);
    mount({});
    points().should('have.length.at.least', 2);
    centres().then((all) => {
      // 16 px from a point's centre is outside its 12 px hit circle and inside a finger's reach;
      // the tap must be nearer to that point than to any other by more than the 8 px tie.
      const taps = all.flatMap((centre) =>
        [
          [16, 0],
          [-16, 0],
          [0, 16],
          [0, -16],
        ].map(([dx, dy]) => ({ centre, x: centre.x + dx, y: centre.y + dy })),
      );
      const tap = taps.find((candidate) =>
        all.every(
          (other) =>
            other === candidate.centre ||
            Math.hypot(other.x - candidate.x, other.y - candidate.y) > 16 + 8 + 1,
        ),
      )!;
      expect(tap, 'a point with room beside it').to.not.equal(undefined);
      tapChart(tap.x, tap.y);
      sheet()
        .should('have.attr', 'role', 'dialog')
        .and('have.attr', 'aria-modal', 'true')
        .and('contain', tap.centre.hardware.toUpperCase());
    });
    // The sheet stands in for the panel a mouse pins, rings its point and takes the focus.
    cy.get('[data-testid="point-details-panel"]').should('not.exist');
    cy.get('[data-testid="video-results-chart"] .point-sheet-ring')
      .should('have.length', 1)
      .and(($ring) => {
        // The page scrolls a point the sheet would cover clear of where the sheet rests.
        const view = $ring[0].ownerDocument.defaultView!;
        const resting =
          view.innerHeight -
          view.document.querySelector<HTMLElement>('[data-testid="video-point-sheet"]')!
            .offsetHeight;
        expect($ring[0].getBoundingClientRect().bottom, 'ring above the sheet').to.be.at.most(
          resting,
        );
      });
    cy.focused().should('have.attr', 'data-testid', 'video-point-sheet');
    searchParam('r_sheet').should('be.a', 'string');
    sheet().find('[data-testid="video-point-sheet-metrics"] dt').should('have.length', 4);
    sheet()
      .find('[data-testid="video-point-sheet-close"], [data-action]')
      .should('have.length.at.least', 6)
      .each(($control) => expect($control[0].getBoundingClientRect().height).to.be.at.least(44));
    // Setup, latency, power, cost and the three source links follow the first screen.
    sheet()
      .find('[data-testid="video-point-sheet-more"]')
      .should('contain', 'Concurrency')
      .and('contain', 'Power')
      .find('a[data-action]')
      .should('have.length', 3);
    assertResultsFit();

    const closedBy = (way: string) => {
      cy.get('body').should(($body) =>
        expect($body.find('[data-testid="video-point-sheet"]').length, `closed by ${way}`).to.equal(
          0,
        ),
      );
      searchParam('r_sheet').should('equal', null);
      cy.get('[data-testid="video-results-chart"] .point-sheet-ring').should('not.exist');
    };
    const reopen = () => {
      hardwarePoints('b200').first().then(tapPoint);
      sheet().should('contain', 'B200');
    };
    cy.get('[data-testid="video-point-sheet-close"]').click();
    closedBy('the close button');
    reopen();
    cy.get('body').type('{esc}');
    closedBy('Escape');
    reopen();
    // A tap beside the sheet that lands on no point closes it.
    cy.get('[data-testid="video-point-sheet-backdrop"]').click(4, 4);
    closedBy('a tap outside');
    reopen();
    // The release follows the last move at once, as a flick does.
    cy.get('[data-testid="video-point-sheet-header"]')
      .trigger('pointerdown', 60, 20, {
        pointerId: 1,
        eventConstructor: 'PointerEvent',
        force: true,
      })
      .trigger('pointermove', 60, 120, {
        pointerId: 1,
        eventConstructor: 'PointerEvent',
        force: true,
      })
      .trigger('pointerup', 60, 120, {
        pointerId: 1,
        eventConstructor: 'PointerEvent',
        force: true,
      });
    closedBy('a swipe down');
    // The blocked legend row's tooltip never shows on touch, so the legend spells it out.
    cy.get('[data-testid="results-no-matched-run-note"]').should(
      'contain',
      'No qualifying run for this workload on this hardware.',
    );
  });

  it('puts the page back where a tap found it, also when closed while it still scrolls', () => {
    coarsePointer();
    cy.viewport(390, 844);
    mount({});
    points().should('have.length.at.least', 2);
    // With the chart at the foot of the screen, its lowest point is where the sheet rests.
    cy.get('[data-testid="d3-chart-svg"]').then(($svg) =>
      $svg[0].scrollIntoView({ block: 'end', behavior: 'instant' }),
    );
    restingScroll().then((found) => {
      lowestPoint().then(tapPoint);
      sheet().should('exist');
      restingScroll().should('be.greaterThan', found);
      cy.get('[data-testid="video-point-sheet-close"]').click();
      restingScroll().should('equal', found);
      // Closed again at once, while the scroll that clears the point has only just begun.
      lowestPoint().then(tapPoint);
      sheet().should('exist');
      cy.get('body').type('{esc}');
      sheet().should('not.exist');
      restingScroll().should('equal', found);
    });
  });

  it('plays a point’s clip inside its sheet, and compares, shares and opens telemetry from it', () => {
    coarsePointer();
    cy.viewport(390, 844);
    cy.fixture('video-results/candidate.mp4', 'base64').then((encoded: string) => {
      cy.window().then((win) => {
        const bytes = Uint8Array.from(win.atob(encoded), (char) => char.codePointAt(0)!);
        const media = win.URL.createObjectURL(new win.Blob([bytes], { type: 'video/mp4' }));
        mount({
          edit: (observation) => {
            observation.results = evidence(observation);
          },
          editPage: (page) => {
            b200Frontier(page, 0, FRAME, media);
          },
        });
      });
    });
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"] video').should('exist');
    offStage('b200').first().then(tapPoint);
    sheet().should('contain', 'B200').and('contain', 'seed');
    // The first frame shows without a byte of video; the play button reads the clip.
    cy.get('[data-testid="video-point-sheet-video"]')
      .should('have.attr', 'poster', FRAME)
      .and('have.attr', 'preload', 'none')
      .and('have.prop', 'muted', true)
      .and('have.prop', 'playsInline', true)
      .and('have.prop', 'paused', true)
      .and('have.prop', 'readyState', 0);
    cy.get('[data-testid="video-point-sheet-play"]').click();
    cy.get('[data-testid="video-point-sheet-play"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="video-point-sheet-video"]')
      .should('have.prop', 'paused', false)
      .and(($video) => expect($video.prop('readyState'), 'clip read').to.be.greaterThan(0));
    cy.get('[data-testid="video-point-sheet-play"]').click();
    cy.get('[data-testid="video-point-sheet-video"]').should('have.prop', 'paused', true);

    // A tap on another point beside the open sheet moves the sheet there.
    hardwarePoints('h200')
      .first()
      .then(($group) => {
        const { x, y } = centreOf($group[0]);
        cy.get('[data-testid="video-point-sheet-backdrop"]').trigger('click', {
          clientX: x,
          clientY: y,
          force: true,
        });
      });
    sheet().should('contain', 'H200');
    cy.focused().should('have.attr', 'data-testid', 'video-point-sheet');

    // Share hands the link to the system sheet where the browser has one.
    cy.window().then((win) => {
      Object.defineProperty(win.navigator, 'share', {
        configurable: true,
        value: cy.stub().as('share').resolves(),
      });
    });
    sheet().find('[data-action="share"]').click();
    cy.get('@share').should('have.been.calledOnce');
    cy.get('@share').its('firstCall.args.0.url').should('be.a', 'string');
    // The open point is in the address, which is what a shared link carries.
    searchParam('r_sheet').then((key) => {
      expect(key, 'open point').to.be.a('string');
      cy.get('[data-testid="video-point-sheet-close"]').click();
      sheet().should('not.exist');
      cy.window().then((win) => {
        const params = new URLSearchParams(win.location.search);
        params.set('r_sheet', key!);
        win.history.replaceState(null, '', `${win.location.pathname}?${params}`);
        win.dispatchEvent(new PopStateEvent('popstate'));
      });
    });
    sheet().should('contain', 'H200');

    // Compare plays the point as the first clip, closes the sheet and brings the stage into view.
    sheet().find('[data-action="compare"]').click();
    sheet().should('not.exist');
    searchParam('r_sheet').should('equal', null);
    playing().should('have.attr', 'data-hardware', 'h200');
    stagePill('a').should('contain', 'H200');
    stageInView();

    hardwarePoints('h200').first().then(tapPoint);
    sheet().find('[data-action="view-telemetry"]').click();
    sheet().should('not.exist');
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'H200');
  });

  it('gives a point without clips and a named run’s point the same sheet, one tap apart', () => {
    const namedRun = '90000000004';
    coarsePointer();
    cy.viewport(390, 844);
    mount({
      search: `?unofficialrun=${namedRun}&r_y=videosPerGpuHour`,
      editPage: (page) => {
        const named = structuredClone(page.entries.find((entry) => entry.runId === B200_RUN)!);
        named.runId = namedRun;
        named.artifact.id = 99994;
        named.approved = false;
        page.entries.unshift(named);
        // Stored runs may have clips; H100's runs stand in for a live run without media.
        for (const entry of page.entries)
          if (!['34336635063', '34344378350'].includes(entry.runId))
            entry.publishedAt = '2026-11-01T00:00:00.000Z';
      },
    });
    hardwarePoints('h100').should('have.attr', 'data-clips', 'false');
    hardwarePoints('h100').first().then(tapPoint);
    sheet().should('contain', 'H100');
    cy.get('[data-testid="video-point-sheet-empty"]').should(
      'contain',
      'Only filled points have clips',
    );
    sheet().find('video, [data-action="compare"]').should('not.exist');
    sheet().find('[data-testid="video-point-sheet-metrics"] dt').should('have.length', 4);
    sheet().find('[data-action="share"], [data-action="view-telemetry"]').should('have.length', 2);
    cy.get('body').type('{esc}');

    // The named run re-exports the official B200 cell, so the two plot on one spot: a tap opens
    // one of them and the next tap on that spot steps to the other.
    const marker = `#${namedRun}`;
    const tapNamed = () =>
      points('[data-hardware="b200"][data-overlay="true"]').first().then(tapPoint);
    tapNamed();
    sheet()
      .should('contain', 'B200')
      .invoke('text')
      .then((first) => {
        tapNamed();
        sheet().should(($sheet) =>
          expect($sheet.text().includes(marker), 'the other point').to.equal(
            !first.includes(marker),
          ),
        );
        if (first.includes(marker)) tapNamed();
      });
    sheet().should('contain', marker);
    sheet().find('[data-action="compare"]').click();
    playing().should('have.attr', 'data-overlay', 'true');
    stagePill('a').should('contain', 'Unofficial run');
  });

  it('steps between two GPUs one tap covers, with the sheet in Chinese', () => {
    coarsePointer();
    cy.viewport(390, 844);
    mount({ pathname: '/zh/vgx', editPage: publishEveryRun });
    // On screen, as a finger finds it: closing the sheet then leaves the chart where it was.
    cy.get('[data-testid="d3-chart-svg"]').scrollIntoView();
    centres().then((all) => {
      // The two points of different hardware that plot closest together.
      const pairs = all.flatMap((first, index) =>
        all
          .slice(index + 1)
          .filter((second) => second.hardware !== first.hardware)
          .map((second) => ({
            first,
            second,
            gap: Math.hypot(first.x - second.x, first.y - second.y),
          })),
      );
      const pair = pairs.reduce((closest, item) => (item.gap < closest.gap ? item : closest));
      // Both are within a finger of the midpoint and neither is nearer by more than the tie.
      expect(pair.gap, 'two points within one finger').to.be.lessThan(40);
      const x = (pair.first.x + pair.second.x) / 2;
      const y = (pair.first.y + pair.second.y) / 2;
      const names = [pair.first.hardware.toUpperCase(), pair.second.hardware.toUpperCase()];
      tapChart(x, y);
      sheet()
        .find('[id]')
        .first()
        .invoke('text')
        .then((opened) => {
          expect(names).to.include(opened);
          cy.get('[data-testid="video-point-sheet-close"]')
            .should('have.attr', 'aria-label', '关闭数据点详情')
            .click();
          tapChart(x, y);
          sheet()
            .find('[id]')
            .first()
            .should(
              'have.text',
              names.find((name) => name !== opened),
            );
        });
    });
    // The figure carries its own "$", so the label names only the metric, as the readout does.
    sheet()
      .find('[data-testid="video-point-sheet-metrics"] dt')
      .eq(1)
      .should('have.text', '每条视频成本');
    sheet().find('[data-action="compare"]').should('have.text', '对比');
    sheet().find('[data-action="share"]').should('contain', '分享');
    sheet().find('[data-action="view-telemetry"]').should('contain', '查看遥测');
  });

  it('pairs an unofficial run with the official cell of the same deployment', () => {
    mount({
      search: `?unofficialrun=${NAMED_RUN}&r_y=videosPerGpuHour`,
      editPage: (page) => {
        b200Frontier(page);
        addNamedRun(page);
        // Without its lead's deployment the named run opens on another of its GPU counts.
        const named = page.entries.find((entry) => entry.runId === NAMED_RUN)!.sources[0];
        named.observations = named.observations.filter((item) => /-g\d+$/u.test(item.id));
      },
    });
    playing().should('have.attr', 'data-overlay', 'true');
    // The row names which B200 plays, so it never reads "B200 compare B200 official".
    config().find('option:selected').should('have.text', 'B200 · unofficial run');
    against().should('have.value', 'b200');
    points('[data-clip-role="baseline"]').should('have.attr', 'data-overlay', 'false');
    points('[data-clip-role]').should(($points) => {
      const [first, second] = [...$points].map(gpusOf);
      expect(second, 'baseline GPUs').to.equal(first);
    });
  });

  it('opens and pairs B200 on the middle of its frontier, not its most efficient end', () => {
    mount({
      edit: (observation) => {
        observation.results = evidence(observation);
      },
      editPage: (page) => {
        b200Frontier(page);
      },
    });
    hardwarePoints('b200').should('have.length', 4);
    stagePill('a').should('contain', '4 GPUs').find('b').should('have.text', 'B200 · SGLang');
    // Compared with another GPU, B200 plays the deployment the first select plays for it.
    config().select('h100');
    against().select('b200');
    points('[data-clip-role="baseline"]').should(($point) => expect(gpusOf($point[0])).to.equal(4));
  });

  it('shows a point’s first frame in its hover card, reading clips the pointer rests on', () => {
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
    // The playing point's clips were read with the stage, so its card needs no second read.
    cy.get('@b200.all').then((before) => {
      playing().trigger('mouseenter', { force: true });
      cy.get(`${tooltip} [data-hover-image]`).should('have.attr', 'src', FRAME);
      cy.get('@b200.all').should('have.length', before.length);
    });
    playing().trigger('mouseleave', { force: true });
    // H100's read answered without media, so its card keeps text only.
    hardwarePoints('h100').trigger('mouseenter', { force: true });
    cy.get(tooltip).should('contain', 'H100').find('[data-hover-image]').should('not.exist');
    hardwarePoints('h100').trigger('mouseleave', { force: true });
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
    // The unofficial run plays against the reference; only its other deployment is labelled, once.
    playing().should('have.attr', 'data-overlay', 'true');
    against().select('reference');
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
