import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import VideoDashboard from '@/components/video-benchmark/VideoDashboard';
import type {
  VideoHistoryObservation,
  VideoHistoryPage,
} from '@/components/video-benchmark/history';
import { videoPoints } from '@/components/video-benchmark/points';
import type { ResultsEvidence } from '@/components/video-benchmark/results-evidence';
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
  pathname = '/video',
  search = '',
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
    cy.intercept('GET', '/api/video-runs?format=history&page=1', page).as('history');
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

const row = (hardware: string) =>
  cy.get(`[data-testid="results-table"] [data-testid="results-row"][data-hardware="${hardware}"]`);
const points = (selector = '') =>
  cy.get(`[data-testid="video-results-chart"] .dot-group${selector}`);
const openRow = (hardware: string, overlay = false) =>
  row(hardware).filter(`[data-overlay="${overlay}"]`).find('button').click();
const toggleHardware = (hardware: string) => cy.get(`label[for="checkbox-${hardware}"]`).click();
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

describe('VideoGenX results', () => {
  for (const pathname of ['/zh/video']) {
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
        .should('contain', zh ? '暂无匹配的发布批准回执' : 'No matching approval receipt');
      cy.get('[data-testid="video-history-power"]').should(($verdicts) => {
        expect([...$verdicts].map((el) => el.textContent?.trim())).to.deep.equal(
          zh
            ? ['· GPU 功率: 已测得', '· GPU 功率: 未测得', '· GPU 功率: 已测得']
            : ['· GPU power: Measured', '· GPU power: Not measured', '· GPU power: Measured'],
        );
      });
    });
  }

  it('keeps every named-run deployment in the chart while the table follows the GPU count', () => {
    mount({
      search: '?unofficialrun=34341996789&r_gpus=3&r_y=videosPerGpuHour&r_optimal=0',
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
    const overlay = '[data-hardware="b200"][data-overlay="true"]';
    row('b200').should('not.exist');
    points(overlay).should('have.length', 2);
    // Same latency on half the boards doubles videos per GPU-hour, so the 4-GPU cell is dominated.
    points(`${overlay}[data-optimal="false"]`).should('have.length', 1);
    cy.get('[data-testid="results-gpus"]').contains('button', /^2$/).click();
    row('b200').find('td').eq(1).should('have.text', '2 / 2');
    points(overlay).should('have.length', 2);
    cy.get('[data-testid="results-gpus"]').contains('button', /^4$/).click();
    row('b200').find('td').eq(1).should('have.text', '4 / 8');
    cy.location('search').should('contain', 'r_gpus=4');
    cy.get('label[for="video-results-optimal"]').click();
    points(overlay).should('have.length', 1).and('have.attr', 'data-optimal', 'true');
    searchParam('r_optimal').should('equal', '1');
    toggleHardware('b200');
    row('b200').should('not.exist');
    points(overlay).should('not.exist');
  });

  it('shows a named unapproved run without an approved cohort and clears it without promotion', () => {
    mount({
      search: '?unofficialrun=34341996789',
      editPage: (page) => {
        for (const entry of page.entries) entry.approved = false;
      },
    });
    row('b200').should('have.attr', 'data-overlay', 'true');
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"]').should(
      'contain',
      'Unofficial run',
    );
    cy.get('[data-testid="video-results-sources"] summary').click();
    cy.get('[data-testid="video-results-sources"]').should('contain', 'No matching receipt');
    cy.get('[data-testid="results-row"][data-overlay="false"]').should('not.exist');
    cy.get('@history.all')
      .its('length')
      .then((requestCount) => {
        cy.get('[data-testid="results-overlay-dismiss"]').click();
        cy.get('@history.all').should('have.length', requestCount);
      });
    cy.get('[data-testid="results-overlay"]').should('not.exist');
    cy.get('[data-testid="results-row"]').should('not.exist');
    cy.get('[data-testid="video-results-clip"] video').should('not.exist');
    cy.get('[data-testid="video-results-play"]').should('be.disabled');
    cy.get('[data-testid="video-results-scrub"]').should('be.disabled');
    cy.contains('summary', 'Performance history').click();
    cy.get('[data-testid="video-history-entry"]').should('have.length', 7);
    cy.get('[data-testid="video-history-publication"]').each(($entry) => {
      expect($entry).to.contain('No matching approval receipt');
    });
  });

  it('restores the approved workload after dismissing an explicitly selected named-only workload', () => {
    mount({
      search: '?unofficialrun=34341996789',
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
    row('h200').should('exist');
    cy.get<string>('@namedWorkload').then((sourceId) => {
      cy.get('[data-testid="results-workload"]').click('left');
      cy.get('[data-select-option]')
        .filter((_, option) => option.dataset.value === sourceId)
        .click();
    });
    row('b200').should('have.attr', 'data-overlay', 'true');
    row('h200').should('not.exist');
    cy.get('[data-testid="results-overlay-dismiss"]').click();
    row('h200').should('have.attr', 'data-overlay', 'false');
    row('b200').should('not.exist');
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
      win.history.replaceState(null, '', `${win.location.pathname}?unofficialrun=${namedRun}`);
      win.dispatchEvent(new win.PopStateEvent('popstate'));
    });
    row('b200').should('have.length', 2);
    cy.wait('@namedMedia');
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"] video').should('not.exist');
    openRow('b200', true);
    searchParam('r_point').should('match', new RegExp(`^${namedRun}:`, 'u'));
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'B200');
    cy.get('[data-testid="video-results-detail"]').should('contain', `Unofficial run #${namedRun}`);
    cy.get('[data-testid="results-detail-tab-sources"]').click();
    cy.get('[data-testid="video-results-detail"]')
      .should('contain', namedRun)
      .and('contain', '99991')
      .and('contain', 'No matching approval receipt');
    cy.get('[data-testid="results-detail-back"]').click();
    openRow('b200');
    cy.get('[data-testid="results-detail-tab-sources"]').click();
    cy.get('[data-testid="video-results-detail"]')
      .should('contain', '34341996789')
      .and('not.contain', namedRun);
    cy.get('[data-testid="results-detail-back"]').click();
    toggleHardware('b200');
    row('b200').should('not.exist');
    toggleHardware('b200');
    row('b200').should('have.length', 2);
    cy.get('[data-testid="results-overlay-dismiss"]').click();
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"] video').should('exist');
    cy.get('@approvedMedia.all').should('have.length', 1);
    row('b200').should('have.length', 1).and('have.attr', 'data-overlay', 'false');
  });

  it('keeps matching summaries distinct and selects the exact source ID', () => {
    mount({
      edit: (observation) => {
        if (!observation.hardware.includes('H100') || observation.durationSeconds !== 8) return;
        const workload = JSON.parse(observation.workloadKey!);
        workload.plan.cases[0].seed += 1;
        observation.workloadKey = JSON.stringify(workload);
        observation.hardware = 'NVIDIA GB200';
      },
    });
    cy.get('[data-testid="results-workload"]').click('left');
    cy.get('[data-select-option]').should('have.length', 3);
    cy.get('[data-select-option]')
      .eq(1)
      .invoke('text')
      .then((first) => {
        cy.get('[data-select-option]').eq(2).invoke('text').should('not.equal', first);
      });
    cy.get('[data-select-option]')
      .eq(1)
      .then(($option) => {
        const sourceId = $option.attr('data-value')!;
        cy.wrap($option).closest('[role="row"]').find('[data-option-help]').click();
        cy.get('[data-testid^="option-help-content-"]').should('contain', sourceId);
        cy.location('search').should((search) => {
          expect(new URLSearchParams(search).get('r_workload')).to.equal(null);
        });
        cy.get('[data-select-option]').eq(1).click();
        cy.location('search').should((search) => {
          expect(new URLSearchParams(search).get('r_workload')).to.equal(sourceId);
        });
      });
  });

  it('uses the shared selector fallbacks and clears scenario prices when the model changes', () => {
    mount();
    cy.contains('summary', 'Profit estimator').click();
    cy.get('[data-testid="results-price-t2v"]').type('0.05');
    cy.get('[data-testid="results-model"]').click();
    cy.get('[role="listbox"] [role="option"]').last().click();
    cy.get('[data-testid="results-price-t2v"]').should('have.value', '');
    cy.location('search').should('contain', 'r_model=');
    cy.get('[data-testid="results-model"]').click();
    cy.get('[role="listbox"] [role="option"]').first().click();
    cy.location('search').should('not.contain', 'r_model=');
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
    cy.get('details[data-testid^="results-"] > summary').should(($summaries) => {
      expect([...$summaries].map((summary) => summary.textContent)).to.deep.equal([
        'How to read these results',
        'Profit estimator',
        'Performance history',
      ]);
    });
    cy.get('[data-testid="results-not-measured"]').should('contain', 'LoRA switch time');
    cy.get('[data-testid="results-empty"][data-state="planned"]').should('not.exist');
    cy.get('[data-testid="results-row"]').should('have.length', 2);
    row('h100').should('not.exist');
    cy.get('#checkbox-h100').should('not.exist');
    row('b200').find('td').eq(6).should('contain', '0.15');
    row('h200').find('td').eq(6).should('contain', '0.204');
    row('h200').find('td').eq(1).should('have.text', '4 / —');
    cy.get('[data-testid="results-cost-basis"]').click();
    cy.contains('[data-select-option]', 'Allocated GPUs').click();
    searchParam('r_basis').should('equal', 'allocated');
    row('b200').find('td').eq(6).should('contain', '0.3');
    row('h200').find('td').eq(6).should('have.text', '—');
  });

  it('hides hardware from the chart and table through the legend and handles an empty selection', () => {
    mount({ search: '?r_y=videosPerGpuHour' });
    points().should('have.length', 3);
    cy.get('[data-testid="video-results-single-note"]').should('be.visible');
    cy.get('#checkbox-gb200').should('have.attr', 'aria-disabled', 'true');
    cy.contains('label', 'GB200 NVL72 · no matched run').should('exist');
    toggleHardware('b200');
    cy.get('#checkbox-b200').should('not.be.checked');
    row('b200').should('not.exist');
    points('[data-hardware="b200"]').should('not.exist');
    cy.location('search').should('contain', 'r_hidden=b200');
    toggleHardware('h200');
    toggleHardware('h100');
    cy.get('[data-testid="results-row"]').should('not.exist');
    points().should('not.exist');
    cy.get('[data-testid="video-results-chart"]').should(
      'contain',
      'No visible hardware has both selected metrics',
    );
    cy.get('[data-testid="video-results-legend-reset"]').click();
    points().should('have.length', 3);
    cy.location('search').should('not.contain', 'r_hidden=');
  });

  it('uses explicit scenario prices and clears them for a different workload', () => {
    // Synthetic additive evidence exercises controls absent from retained public
    // projections. It is never written to the committed history fixture.
    mount({
      edit: (observation) => {
        observation.videoSecondsPerHour = 400;
        observation.results = evidence(observation);
        // Turn the H100 row into an explicitly synthetic second workload so the test changes
        // clip duration without replacing the retained B200/H200 cohort used below.
        if (observation.hardware.includes('H100')) {
          const workload = JSON.parse(observation.workloadKey!);
          workload.plan.generation.duration_seconds = 10;
          workload.plan.generation.frame_count = 240;
          observation.workloadKey = JSON.stringify(workload);
          observation.workload = observation.workload.replace('8 s', '10 s');
          observation.durationSeconds = 10;
          observation.frameCount = 240;
          observation.hardware = 'NVIDIA GB200';
        }
      },
    });
    cy.contains('summary', 'Profit estimator').click();
    cy.get('[data-testid="results-profit"] [data-testid="results-empty"]').should('exist');
    cy.get('[data-testid="results-price-t2v"]').type('0.05');
    cy.location('search').should('contain', 'r_price_t2v=0.05');
    cy.get('[data-testid="results-profit"] [data-hardware="b200"]').should('contain', '3.27');
    cy.get('[data-testid="results-utilization"]').then(($input) => {
      const input = $input[0] as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '0');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    cy.get('[data-testid="results-profit"] [data-hardware="b200"]').should('contain', '-1.73');
    cy.location('search').should('contain', 'r_utilization=0');
    cy.get('[data-testid="results-price-i2v"]').type('0.09');
    cy.get('[data-testid="results-price-r2v"]').type('0.12');
    cy.get('[data-testid="results-workload"]').click('left');
    cy.contains('[data-select-option]', '10 s').click();
    row('gb200').should('exist');
    for (const mode of ['t2v', 'i2v', 'r2v'])
      cy.get(`[data-testid="results-price-${mode}"]`).should('have.value', '');
    cy.get('[data-testid="results-profit"] [data-testid="results-empty"]').should('exist');
    cy.location('search').should('not.contain', 'r_price_');
  });

  it('plots the selected axis metrics and cost basis', () => {
    mount({
      edit: (observation) => {
        observation.videoSecondsPerHour = 400;
      },
    });
    cy.get('#video-results-chart-title').should(
      'contain',
      'Video-seconds per $1 TCO vs. P50 latency per clip',
    );
    plottedY('b200').then((participating) => {
      cy.get('[data-testid="results-cost-basis"]').click();
      cy.contains('[data-select-option]', 'Allocated GPUs').click();
      // B200 reserved eight boards for four participating ones; H200 used all four.
      plottedY('b200').should('be.closeTo', participating / 2, 1e-9);
    });
    cy.get('[data-testid="results-y-metric"]').click();
    cy.contains('[data-select-option]', 'GPU energy per valid clip (kJ)').click();
    searchParam('r_y').should('equal', 'kjPerClip');
    cy.get('#video-results-chart-title').should('contain', 'GPU energy per valid clip');
    plottedY('b200').should('be.closeTo', 301.1, 0.1);
  });

  it('opens deployment telemetry from the popover and table, switches tabs and returns', () => {
    mount({
      search: '?r_y=videosPerGpuHour',
      edit: (observation) => {
        observation.results = evidence(observation);
      },
    });
    points('[data-hardware="b200"] .visible-shape').click({ force: true });
    cy.get('[data-chart-tooltip]:visible')
      .should('contain', 'B200 · 4 GPU')
      .and('contain', '4 participating · 8 allocated');
    cy.get('[data-chart-tooltip]:visible [data-action="view-telemetry"]').click();
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'B200');
    searchParam('r_point').should('match', /^34341996789:/u);
    cy.get('[data-testid="results-detail-deployments"] [aria-pressed="true"]').should(
      'contain',
      '4 GPU',
    );
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
    openRow('h200');
    cy.get('[data-testid="video-results-detail"] h1').should('contain', 'H200');
    cy.go('back');
    cy.get('[data-testid="video-results-detail"]').should('not.exist');
    row('h200').should('be.visible');
  });

  it('falls back to the overview for an unknown or hidden deployment and drops its key', () => {
    mount({ search: '?r_y=videosPerGpuHour&r_point=0:missing' });
    cy.get('[data-testid="video-results-detail"]').should('not.exist');
    points().should('have.length', 3);
    searchParam('r_point').should('equal', null);
    row('b200')
      .invoke('attr', 'data-point')
      .then((point) => {
        cy.window().then((win) => {
          win.history.replaceState(
            null,
            '',
            `${win.location.pathname}?r_point=${encodeURIComponent(point!)}`,
          );
          win.dispatchEvent(new win.PopStateEvent('popstate'));
        });
        cy.get('[data-testid="video-results-detail"] h1').should('contain', 'B200');
        cy.window().then((win) => {
          win.history.replaceState(
            null,
            '',
            `${win.location.pathname}?r_point=${encodeURIComponent(point!)}&r_hidden=b200`,
          );
          win.dispatchEvent(new win.PopStateEvent('popstate'));
        });
        cy.get('[data-testid="video-results-detail"]').should('not.exist');
        row('b200').should('not.exist');
        searchParam('r_point').should('equal', null);
        toggleHardware('b200');
        row('b200').should('exist');
        cy.get('[data-testid="video-results-detail"]').should('not.exist');
      });
  });

  for (const [pathname, width] of [
    ['/video', 1440],
    ['/video', 390],
    ['/zh/video', 1440],
    ['/zh/video', 320],
  ] as const) {
    it(`keeps ${pathname} and its workload menu readable at ${width} px`, () => {
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
      cy.get('[data-testid="results-table"]').should(($table) => {
        const container = $table[0].parentElement!;
        expect(getComputedStyle(container).overflowX).to.equal('auto');
        if (width < 768) expect(container.scrollWidth).to.be.greaterThan(container.clientWidth);
      });
      cy.get('[data-testid="video-results-clip"]').should(($tiles) => {
        expect($tiles).to.have.length(5);
        const first = $tiles[0].getBoundingClientRect();
        const second = $tiles[1].getBoundingClientRect();
        if (width === 1440) {
          const columns = new Set(
            [...$tiles].map((tile) => Math.round(tile.getBoundingClientRect().left)),
          );
          expect(columns.size).to.equal(5);
        }
        if (width === 320) expect(second.top).to.be.greaterThan(first.top);
        else if (width === 390) expect(second.top).to.be.closeTo(first.top, 2);
      });
      cy.get('[data-testid="video-results-clip"][data-hardware="b200"]')
        .should('contain', 'TCO')
        .and('contain', pathname.startsWith('/zh') ? '分配 GPU' : 'Allocated');
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
      openRow('b200');
      cy.get('[data-testid="video-results-detail"] h1').should('contain', 'B200');
      cy.get('[data-testid="results-detail-tab-telemetry"]').should(
        'have.text',
        pathname.startsWith('/zh') ? '遥测' : 'Telemetry',
      );
      assertResultsFit();
      cy.get('[data-testid="results-detail-back"]').click();
      cy.get('[data-testid="results-workload"]').click('left');
      cy.get('[role="grid"]')
        .should('be.visible')
        .should(($menu) => {
          const rect = $menu[0].getBoundingClientRect();
          expect(rect.left).to.be.at.least(0);
          expect(rect.right).to.be.at.most(width);
          expect(rect.height).to.be.greaterThan(0);
          expect($menu[0].scrollWidth).to.be.at.most($menu[0].clientWidth + 1);
        });
      cy.get('[data-select-option]')
        .last()
        .should(($option) => {
          expect($option[0].scrollWidth).to.be.at.most($option[0].clientWidth + 1);
          expect($option.text()).to.contain('MiniMax');
        });
      cy.get('[data-select-option]')
        .last()
        .closest('[role="row"]')
        .find('[data-option-help]')
        .click();
      cy.get('[data-testid^="option-help-content-"]').should(($help) => {
        const rect = $help[0].getBoundingClientRect();
        expect(rect.left).to.be.at.least(0);
        expect(rect.right).to.be.at.most(width);
      });
      cy.get('[data-select-option]').last().click();
      cy.get('[data-testid^="option-help-content-"]').should('not.exist');
      cy.location('search').should('contain', 'r_workload=');
    });
  }
});
