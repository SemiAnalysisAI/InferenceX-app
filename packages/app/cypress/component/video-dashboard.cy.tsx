import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import VideoDashboard from '@/components/video-benchmark/VideoDashboard';
import type {
  VideoHistoryObservation,
  VideoHistoryPage,
} from '@/components/video-benchmark/history';
import type { VideoPoint } from '@/components/video-benchmark/metrics';
import { videoPoints } from '@/components/video-benchmark/points';
import type { ResultsEvidence } from '@/components/video-benchmark/results-evidence';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { overlayRunColor } from '@/lib/charts/overlay-run-style';
import { verifiedQuality } from '@/components/video-benchmark/reference-quality';
import { referenceQualityFixture } from '@/components/video-benchmark/reference-quality.fixture';
import { APP_THEMES } from '@/lib/themes/themes';
import { servingArtifact } from '../support/video-artifacts';
import { mountWithProviders } from '../support/test-utils';
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
/** The Compare row's second select: what the playing config is compared with. */
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
const toggleHardware = (hardware: string) => cy.get(`label[for="checkbox-${hardware}"]`).click();
const searchParam = (key: string) =>
  cy.location('search').then((search) => new URLSearchParams(search).get(key));

const B200_RUN = '34341996789';
const FRAME = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"/>')}`;

/**
 * Adds 1-, 2- and 8-GPU points to the B200 run, drawn and playable but neither its lead nor where
 * the stage opens: 1 and 2 GPUs are slower but more efficient, 8 GPUs is the fastest, costliest
 * end. Serves the run's published clips with first frames as `@b200`. Returns the
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

describe('VideoGenX Results', () => {
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
      .should('contain', 'GitHub Actions Run');
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
          .and('contain', 'GitHub Actions Run');
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
      'GitHub Actions Run',
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
      cy.get('[data-testid="video-results-stage"]').should(($stage) => {
        const rect = $stage[0].getBoundingClientRect();
        expect(rect.left, 'stage inside the page').to.be.at.least(0);
        expect(rect.right).to.be.at.most(width);
        expect(rect.width, 'stage spans the card').to.be.greaterThan(width * 0.6);
      });
      cy.get('[data-testid="video-results-readout"] dl').should(($grid) => {
        const cells = [...$grid[0].children];
        const rows = new Set(cells.map((cell) => cell.getBoundingClientRect().top)).size;
        // One row from 1024 px, two columns from 768 px, and one column on a phone.
        expect(rows, 'readout rows').to.equal(
          width >= 1024 ? 1 : width >= 768 ? Math.ceil(cells.length / 2) : cells.length,
        );
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
