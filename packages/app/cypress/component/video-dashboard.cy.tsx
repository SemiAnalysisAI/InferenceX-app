import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import VideoDashboard from '@/components/video-benchmark/VideoDashboard';
import type {
  VideoHistoryObservation,
  VideoHistoryPage,
} from '@/components/video-benchmark/history';
import { videoPoints } from '@/components/video-benchmark/points';
import { servingArtifact } from '../support/video-artifacts';
import { readOnlyVideoRequests, resultHistory } from '../support/video-results';

const RESULT_GROUPS = [
  'validity',
  'latency',
  'throughput',
  'energy',
  'cost',
  'quality',
  'stability',
  'startup',
  'deploy',
];

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

const costRow = (hardware: string, basis = 'participating') =>
  cy.get(`[data-testid="results-cost-table"] [data-hardware="${hardware}"][data-basis="${basis}"]`);

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

  it('keeps named-run GPU-count chart points when the cards select one GPU count', () => {
    mount({
      search: '?unofficialrun=34341996789&r_gpus=3',
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
    const latencyPoints =
      '[data-testid="results-latency-series"] [data-hardware="b200-overlay"] > circle';
    cy.get('[data-testid="results-cost-table"] [data-hardware]').should('not.exist');
    cy.get(latencyPoints).should('have.length', 2);
    cy.get('[data-testid="results-gpus"]').contains('button', /^2$/).click();
    costRow('b200').find('td').eq(2).should('have.text', '2');
    cy.get(latencyPoints).should('have.length', 2);
    cy.get('[data-testid="results-gpus"]').contains('button', /^4$/).click();
    costRow('b200').find('td').eq(2).should('have.text', '4');
    cy.get(latencyPoints).should('have.length', 2);
    cy.location('search').should('contain', 'r_gpus=4');
    cy.get('[data-testid="results-hardware-b200"]').uncheck();
    costRow('b200').should('not.exist');
    cy.get(latencyPoints).should('not.exist');
  });

  it('shows a named unapproved run without an approved cohort and clears it without promotion', () => {
    mount({
      search: '?unofficialrun=34341996789',
      editPage: (page) => {
        for (const entry of page.entries) entry.approved = false;
      },
    });
    costRow('b200').should('have.attr', 'data-overlay', 'true');
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"]').should(
      'contain',
      'Unofficial run',
    );
    cy.get('[data-testid="video-results-sources"] summary').click();
    cy.get('[data-testid="video-results-sources"]').should('contain', 'No matching receipt');
    cy.get('[data-testid="results-cost-table"] [data-overlay="false"]').should('not.exist');
    cy.get('@history.all')
      .its('length')
      .then((requestCount) => {
        cy.get('[data-testid="results-overlay-dismiss"]').click();
        cy.get('@history.all').should('have.length', requestCount);
      });
    cy.get('[data-testid="results-overlay"]').should('not.exist');
    cy.get('[data-testid="results-cost-table"] [data-hardware]').should('not.exist');
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
    costRow('h200').should('exist');
    cy.get<string>('@namedWorkload').then((sourceId) => {
      cy.get('[data-testid="results-workload"]').click('left');
      cy.get('[data-select-option]')
        .filter((_, option) => option.dataset.value === sourceId)
        .click();
    });
    costRow('b200').should('have.attr', 'data-overlay', 'true');
    costRow('h200').should('not.exist');
    cy.get('[data-testid="results-overlay-dismiss"]').click();
    costRow('h200').should('have.attr', 'data-overlay', 'false');
    costRow('b200').should('not.exist');
    cy.location('search').should('not.contain', 'r_workload=').and('not.contain', 'unofficialrun');
  });

  it('requests the new artifact when a named run re-exports the same observation ID', () => {
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
    costRow('b200').filter('[data-overlay="true"]').should('exist');
    costRow('b200').should('have.length', 2);
    cy.get('#validity tbody tr[data-hardware="b200"]').should('have.length', 4);
    cy.get('#validity details dl > div').filter(':contains("B200")').should('have.length', 2);
    cy.wait('@namedMedia');
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"] video').should('not.exist');
    cy.get('[data-testid="video-results-sources"] summary').click();
    cy.get('[data-testid="video-results-sources"] tbody tr')
      .contains('td', /^B200$/u)
      .parent()
      .should('contain', namedRun)
      .and('contain', '99991')
      .and('contain', 'No matching receipt')
      .find('a')
      .should('not.exist');
    cy.get('[data-testid="results-hardware-b200"]').uncheck();
    costRow('b200').should('not.exist');
    cy.get('#validity tbody tr[data-hardware="b200"]').should('not.exist');
    cy.get('#validity details dl > div').filter(':contains("B200")').should('not.exist');
    cy.get('[data-testid="results-hardware-b200"]').check();
    costRow('b200').should('have.length', 2);
    cy.get('[data-testid="results-overlay-dismiss"]').click();
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"] video').should('exist');
    cy.get('@approvedMedia.all').should('have.length', 1);
    costRow('b200').should('have.length', 1).and('have.attr', 'data-overlay', 'false');
    costRow('b200', 'allocated').should('have.length', 1);
    cy.get('#validity tbody tr[data-hardware="b200"]').should('have.length', 2);
    cy.get('#validity details dl > div').filter(':contains("B200")').should('have.length', 1);
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
    cy.get('[data-testid="results-price-t2v"]').type('0.05');
    cy.get('[data-testid="results-model"]').click();
    cy.get('[role="listbox"] [role="option"]').last().click();
    cy.get('[data-testid="results-price-t2v"]').should('have.value', '');
    cy.location('search').should('contain', 'r_model=');
    cy.get('[data-testid="results-model"]').click();
    cy.get('[role="listbox"] [role="option"]').first().click();
    cy.location('search').should('not.contain', 'r_model=');
  });
  it('keeps comparison before the nine groups, applies the common sample floor and preserves unknown allocation', () => {
    mount({
      edit: (observation) => {
        if (observation.hardware.includes('H100')) {
          observation.samples = 9;
          observation.valid = 9;
        }
        if (observation.hardware.includes('H200')) observation.allocated = null;
      },
    });
    cy.get('[data-testid="video-results"] section[id]').should(($sections) => {
      expect([...$sections].map((section) => section.id)).to.deep.equal([
        'comparison-clips',
        ...RESULT_GROUPS,
      ]);
    });
    costRow('b200').should('contain', '0.15');
    costRow('b200', 'allocated').should('contain', '0.3');
    costRow('h200').should('contain', '0.204');
    costRow('h200', 'allocated').should('contain', '—');
    costRow('h100').should('not.exist');
    cy.get('[data-testid="results-cost-table"] [data-hardware]').should('have.length', 4);
    cy.get('#latency [data-hardware="h100"] rect, #latency [data-hardware="h100"] circle').should(
      'not.exist',
    );
    cy.get('#throughput [data-hardware="h100"] rect').should('not.exist');
    cy.get('[data-testid="results-latency-series"] [data-percentile="p90"]').should(
      'have.length',
      2,
    );
    cy.get('[data-testid="results-latency-series"] [data-percentile="p95"]').should('not.exist');
    cy.get('#quality [data-testid="results-empty"]').should('exist');
    cy.get('#startup [data-testid="results-empty"]').should('exist');
  });

  it('hides hardware in all metrics and handles an empty selection without stale values', () => {
    mount();
    cy.get('[data-testid="results-hardware-b200"]').uncheck();
    costRow('b200').should('not.exist');
    cy.get('#latency [data-hardware="b200"]').should('not.exist');
    cy.get('#energy [data-hardware="b200"]').should('not.exist');
    cy.location('search').should('contain', 'r_hidden=b200');
    for (const hardware of ['gb200', 'mi355x', 'h200', 'h100'])
      cy.get(`[data-testid="results-hardware-${hardware}"]`).uncheck();
    cy.get('[data-testid="results-cost-table"] [data-hardware]').should('not.exist');
    cy.get('#latency [data-hardware] circle').should('not.exist');
    cy.get('[data-testid="results-hardware-b200"]').check();
    costRow('b200').should('contain', '0.15');
  });

  it('uses explicit scenario prices, clears them for a different workload and hides power traces', () => {
    // Synthetic additive evidence exercises controls absent from retained public
    // projections. It is never written to the committed history fixture.
    mount({
      edit: (observation) => {
        // Turn the H100 row into an explicitly synthetic second
        // workload so the test changes clip duration without replacing the
        // retained B200/H200 cohort used for the scenario assertions below.
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
        observation.results = {
          workloadHash: 'a'.repeat(64),
          manifestHash: observation.id.split(':')[0],
          verified: true,
          engine: 'test-engine',
          mode: 't2v',
          attempted: 20,
          notStarted: 0,
          latencies: null,
          powerValid: true,
          powerSeries: [
            { seconds: 0, watts: 100 },
            { seconds: 1, watts: 120 },
          ],
          peakPowerW: 120,
          gpuMemoryMiB: null,
          warmupSeconds: null,
          failures: null,
        };
      },
    });
    cy.get('[data-testid="results-profit"] [data-testid="results-empty"]').should('exist');
    cy.get('[data-testid="results-price-t2v"]').type('0.05');
    cy.location('search').should('contain', 'r_price_t2v=0.05');
    cy.get('[data-testid="results-profit"] [data-hardware="b200"]').should('contain', '2.88');
    cy.get('[data-testid="results-utilization"]').then(($input) => {
      const input = $input[0] as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '0');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    cy.get('[data-testid="results-profit"] [data-hardware="b200"]').should('contain', '-1.73');
    cy.location('search').should('contain', 'r_utilization=0');
    cy.get('[data-testid="results-trace-select"]').click();
    cy.contains('[data-select-option]', 'H200').click();
    cy.get('[data-testid="results-power-trace"] [data-hardware="h200"]').should('exist');
    cy.get('[data-testid="results-hardware-h200"]').uncheck();
    cy.get('[data-testid="results-power-trace"] [data-hardware="h200"]').should('not.exist');
    cy.get('[data-testid="results-power-trace"] [data-hardware="b200"]').should('exist');
    cy.get('[data-testid="results-trace-select"]').click();
    cy.get('[data-select-option]').should('not.contain', 'H200');
    cy.get('[data-testid="results-trace-select"]').click();
    cy.get('[data-testid="results-price-i2v"]').type('0.09');
    cy.get('[data-testid="results-price-r2v"]').type('0.12');
    cy.get('[data-testid="results-workload"]').click('left');
    cy.contains('[data-select-option]', '10 s').click();
    costRow('gb200').should('exist');
    for (const mode of ['t2v', 'i2v', 'r2v'])
      cy.get(`[data-testid="results-price-${mode}"]`).should('have.value', '');
    cy.get('[data-testid="results-profit"] [data-testid="results-empty"]').should('exist');
    cy.location('search').should('not.contain', 'r_price_');
  });

  for (const [pathname, width] of [
    ['/video', 1440],
    ['/video', 390],
    ['/zh/video', 1440],
    ['/zh/video', 320],
  ] as const) {
    it(`keeps ${pathname} and its workload menu readable at ${width} px`, () => {
      cy.viewport(width, 844);
      mount({ pathname });
      cy.get('[data-testid="video-results"] h1').should('contain', 'VideoGenX');
      cy.get('#validity h2').should('contain', pathname.startsWith('/zh') ? '有效性' : 'Validity');
      cy.get('#energy [data-testid="results-empty"]').should('exist');
      assertResultsFit();
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
      if (width < 768) {
        cy.get('[data-testid="video-results-sources"] table').parent().scrollTo('right');
        cy.get('[data-testid="video-results-sources"] th')
          .last()
          .should(($header) => {
            expect($header[0].getBoundingClientRect().right).to.be.at.most(width);
          });
      }
      cy.get('[data-testid="video-results-sources"] summary').click();
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
