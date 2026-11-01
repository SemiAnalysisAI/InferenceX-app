import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import type { VideoHistoryPage } from '@/components/video-benchmark/history';
import type { MetricOptions, VideoPoint } from '@/components/video-benchmark/metrics';
import { dashboardCells, videoPoints } from '@/components/video-benchmark/points';
import VideoCompare from '@/components/video-benchmark/VideoCompare';
import VideoResultsClips from '@/components/video-benchmark/VideoResultsClips';
import history from '../fixtures/api/video-history.json';
import { servingArtifact } from '../support/video-artifacts';

// Retained H100/H200/B200 C1/C2/C4 observations; clips come from synthetic stored artifacts.
const points = videoPoints([history as unknown as VideoHistoryPage]);
// The dashboard hands Compare its cells, so the retained native H200 run under the sample floor never becomes a side.
const cells = dashboardCells(points).cells;
const c1 = (key: string) => cells.find((p) => p.hardwareKey === key && p.concurrency === 1)!;
const COLORS: Record<string, string> = {
  h100: 'rgb(10, 20, 30)',
  h200: 'rgb(40, 50, 60)',
  b200: 'rgb(70, 80, 90)',
};
const colorFor = (key: string) => COLORS[key] ?? 'rgb(0, 0, 0)';
const OWNING: MetricOptions = { tier: 'h' };

const mediaUrl = (point: VideoPoint) =>
  `/api/video-runs?run=${point.runId}&artifact=${point.artifactId}&format=published`;
function media(point: VideoPoint, hardware: string, alias: string) {
  cy.intercept(
    'GET',
    mediaUrl(point),
    servingArtifact(Number(point.runId), point.artifactId, hardware),
  ).as(alias);
}

/** Clips load on their own once the panel is in view, so overrides must be registered before mounting. */
function mount(
  pathname = '/video',
  search = '',
  data: VideoPoint[] = cells,
  options: MetricOptions = OWNING,
  beforeMount?: () => void,
) {
  media(c1('h100'), 'NVIDIA H100 80GB HBM3', 'h100');
  media(c1('b200'), 'NVIDIA B200', 'b200');
  media(c1('h200'), 'NVIDIA H200', 'h200');
  cy.intercept('GET', 'https://media.test/**', { statusCode: 204 });
  beforeMount?.();
  cy.window().then((win) =>
    win.history.replaceState(null, '', `${win.location.pathname}${search}`),
  );
  cy.mount(
    <PathnameContext.Provider value={pathname}>
      <VideoCompare points={data} options={options} colorFor={colorFor} />
    </PathnameContext.Provider>,
  );
}
const table = () => cy.get('[data-testid="video-compare-table"]');
const metricRow = (id: string) => table().find(`tbody tr[data-metric="${id}"]`);
const clip = (role: 'baseline' | 'candidate') =>
  cy.get(`[data-testid="video-compare-clip"][data-role="${role}"]`);
const pick = (label: string, option: string) => {
  cy.get(`[role="combobox"][aria-label="${label}"]`).click();
  cy.contains('[role="option"]', option).click();
};

describe('Video compare panel (retained fixture)', () => {
  it('plays the same case from the slowest and fastest hardware side by side by default', () => {
    mount();
    cy.wait(['@h100', '@b200']);
    cy.get('[data-testid="video-compare-prompt"]')
      .should('contain', 'A drummer taps a snare drum.')
      .and('contain', 'seed 11');
    cy.get('[data-testid="video-compare-case-of"]').should('contain', 'Case 1 of');
    clip('baseline')
      .should('contain', 'H100')
      .and('contain', '4 GPU · TP2 × Ulysses 2')
      .and('contain', 'time to video 120 s')
      .find('video')
      .should('have.attr', 'src')
      .and('include', 'measurement-r001-c001.mp4');
    clip('candidate').should('contain', 'B200').find('video').should('exist');
    cy.get('[data-testid="video-compare-baseline"]').should('contain', 'H100');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'B200');
    table()
      .find('tbody tr')
      .should(($rows) => {
        expect([...$rows].map((el) => el.dataset.metric)).to.deep.equal([
          'p50Latency',
          'dollarsPerVideo',
          'kjPerVideo',
        ]);
      });
    metricRow('p50Latency')
      .should('contain', '167.3')
      .and('contain', '77.9')
      .and('contain', '-53.4%');
    metricRow('p50Latency').find('[data-tone="better"]').should('exist');
    // $1.17 ÷ 5.3741 videos/GPU-hr vs. $1.73 ÷ 11.526, both per participating GPU.
    metricRow('dollarsPerVideo')
      .should('contain', '$0.218')
      .and('contain', '$0.150')
      .and('contain', '-31.1%');
    metricRow('kjPerVideo')
      .should('contain', '431.1')
      .and('contain', '301.1')
      .and('contain', '-30.2%');
    metricRow('kjPerVideo').find('[data-tone="better"]').should('exist');
    cy.contains('[data-testid="video-compare"] p', 'Cost tier:').should(
      'have.text',
      'Cost tier: Owning at Large Hyperscaler Volume.',
    );
    cy.get('[data-testid="video-compare"]')
      .should('contain', 'retained CI outputs')
      .and('not.contain', 'GPU basis');
    cy.get('[data-testid="video-compare-blind"]').should('not.exist');
    cy.get('[data-testid="video-compare-controls"] [role="combobox"]').should(($boxes) => {
      expect([...$boxes].map((el) => el.getAttribute('aria-label'))).to.deep.equal([
        'Baseline',
        'Candidate',
      ]);
    });
    cy.get('@h200.all').should('have.length', 0);
  });
  it('steps through cases with the arrows, keeping v_case in the URL', () => {
    mount();
    cy.wait(['@h100', '@b200']);
    cy.get('[data-testid="video-compare-prev"]').should('be.disabled');
    cy.get('[role="combobox"][aria-label="Case (prompt · seed)"]').should('not.exist');
    cy.get('[data-testid="video-compare-next"]').click();
    cy.get('[data-testid="video-compare-clip"] video').each(($video) =>
      expect($video.attr('src')).to.include('measurement-r002-c001.mp4'),
    );
    cy.get('[data-testid="video-compare-case-of"]').should('contain', 'Case 2 of');
    cy.location('search').should('contain', 'v_case=1');
    cy.get('[data-testid="video-compare-next"]').click();
    cy.get('[data-testid="video-compare-clip"] video').each(($video) =>
      expect($video.attr('src')).to.include('measurement-r003-c001.mp4'),
    );
    cy.get('[data-testid="video-compare-case-of"]').should('contain', 'Case 3 of');
    cy.location('search').should('contain', 'v_case=2');
    cy.get('[data-testid="video-compare-prev"]').click();
    cy.get('[data-testid="video-compare-case-of"]').should('contain', 'Case 2 of');
    cy.location('search').should('contain', 'v_case=1');
  });
  it('drives both players together', () => {
    mount();
    cy.wait(['@h100', '@b200']);
    cy.window().then((win) => {
      cy.stub(win.HTMLMediaElement.prototype, 'play').as('play').resolves();
      cy.stub(win.HTMLMediaElement.prototype, 'pause').as('pause');
    });
    cy.get('[data-testid="video-compare-play"]').click();
    cy.get('@play').should('have.callCount', 2);
    cy.get('[data-testid="video-compare-pause"]').click();
    cy.get('@pause').should('have.callCount', 2);
    cy.get('[data-testid="video-compare-restart"]').click();
    cy.get('@play').should('have.callCount', 4);
  });
  it('switches the candidate, fetching only the new side, and swaps on collision or request', () => {
    mount();
    cy.wait(['@h100', '@b200']);
    pick('Candidate', 'H200');
    cy.wait('@h200');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'H200');
    clip('candidate').should('contain', 'H200');
    metricRow('p50Latency').should('contain', '150.6').and('contain', '-10%');
    metricRow('dollarsPerVideo').should('contain', '$0.204').and('contain', '-6.2%');
    metricRow('kjPerVideo').should('contain', '411').and('contain', '-4.7%');
    cy.location('search').should('contain', 'v_cand=h200');
    cy.get('@h100.all').should('have.length', 1);
    cy.get('@h200.all').should('have.length', 1);
    // Choosing the baseline's hardware as candidate swaps the two sides; the swap button does too.
    pick('Candidate', 'H100');
    cy.get('[data-testid="video-compare-baseline"]').should('contain', 'H200');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'H100');
    metricRow('p50Latency').should('contain', '+11.1%').find('[data-tone="worse"]').should('exist');
    cy.get('[data-testid="video-compare-swap"]').click();
    cy.get('[data-testid="video-compare-baseline"]').should('contain', 'H100');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'H200');
    cy.get('@h200.all').should('have.length', 1);
  });
  it('restores v_base and v_cand from the URL and reports a failed media read with a retry', () => {
    mount('/video', '?v_base=h200&v_cand=h100', cells, OWNING, () => {
      cy.intercept('GET', mediaUrl(c1('h200')), { statusCode: 404, body: { error: 'gone' } }).as(
        'missing',
      );
    });
    cy.get('[data-testid="video-compare-baseline"]').should('contain', 'H200');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'H100');
    cy.wait('@missing');
    cy.get('[data-testid="video-compare-clips"] [role="alert"]')
      .should('contain', 'Could not load clips')
      .and('contain', 'HTTP 404');
    cy.contains('button', 'Retry').should('exist');
  });
  it('keeps a restored, repaired pair when one side changes', () => {
    // v_cand on the default baseline makes restore swap the baseline to B200; that repair must
    // stay explicit, so a later candidate change cannot re-default the baseline to H100.
    mount('/video', '?v_cand=h100');
    cy.wait(['@b200', '@h100']);
    cy.get('[data-testid="video-compare-baseline"]').should('contain', 'B200');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'H100');
    pick('Candidate', 'H200');
    cy.wait('@h200');
    cy.get('[data-testid="video-compare-baseline"]').should('contain', 'B200');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'H200');
    cy.location('search').should('contain', 'v_base=b200').and('contain', 'v_cand=h200');
  });
  it('says when a run publishes no clips and keeps the metric deltas', () => {
    mount('/video', '', cells, OWNING, () => {
      cy.intercept('GET', mediaUrl(c1('b200')), { statusCode: 204 }).as('unpublished');
    });
    cy.wait(['@h100', '@unpublished']);
    cy.get('[data-testid="video-compare-clips"]').should(
      'contain',
      'Clips are not published for one of these runs',
    );
    cy.get('[data-testid="video-compare-clip"]').should('not.exist');
    metricRow('p50Latency').should('contain', '-53.4%');
  });
  it('disables the selects when fewer than two hardware are measured', () => {
    mount(
      '/video',
      '',
      cells.filter((p) => p.hardwareKey === 'h200'),
    );
    cy.get('[data-testid="video-compare-controls"]').should('have.attr', 'disabled');
    cy.get('[data-testid="video-compare"]').should(
      'contain',
      'Comparison needs at least two measured hardware.',
    );
    cy.get('[data-testid="video-compare-table"]').should('not.exist');
  });
  it('renders Chinese copy on /zh/video', () => {
    mount('/zh/video', '', cells, { tier: 'r' });
    cy.wait(['@h100', '@b200']);
    cy.get('[data-testid="video-compare"]')
      .should('contain', '基线')
      .and('contain', '候选')
      .and('contain', '同时播放')
      .and('contain', '成本档位：租赁 - 3 年承诺。');
    metricRow('p50Latency').should('contain', 'P50 出片时间');
    // Rent - 3 Year Commit: $2.00 ÷ 5.3741 vs. $3.70 ÷ 11.526 per participating GPU-hour.
    metricRow('dollarsPerVideo')
      .should('contain', '每条视频 TCO 成本')
      .and('contain', '$0.372')
      .and('contain', '$0.321');
    metricRow('kjPerVideo').should('contain', '每条视频 GPU 板卡能耗');
    cy.get('[data-testid="video-compare-case-of"]').should('contain', '第 1 /');
    clip('baseline').should('contain', '出片时间 120 s');
  });
});

// These decoder fixtures are test inputs, never benchmark evidence.
function mountResultsClips(keys = ['b200', 'h200'], pathname = '/video') {
  for (const key of keys) {
    cy.fixture(`video-results/${key === 'h200' ? 'reference' : 'candidate'}.mp4`, 'base64').then(
      (encoded: string) => {
        cy.window().then((win) => {
          const bytes = Uint8Array.from(win.atob(encoded), (char) => char.codePointAt(0)!);
          const url = win.URL.createObjectURL(new win.Blob([bytes], { type: 'video/mp4' }));
          const point = c1(key);
          const saved = servingArtifact(
            Number(point.runId),
            point.artifactId,
            `NVIDIA ${key.toUpperCase()}`,
          );
          saved.sources[0].checksums = saved.sources[0].checksums.map(([path, sha]) => [
            path,
            path === 'manifest.json' ? point.id.split(':')[0] : sha,
          ]);
          saved.sources[0].assets = saved.sources[0].assets.map(([path, asset]) => [
            path,
            { ...asset, url },
          ]);
          cy.intercept('GET', mediaUrl(point), saved).as(`results-${key}`);
        });
      },
    );
  }
  cy.mount(
    <PathnameContext.Provider value={pathname}>
      <VideoResultsClips
        points={keys.map(c1)}
        colorFor={colorFor}
        hidden={new Set()}
        costs={{ [c1('b200').id]: { participating: 0.02, allocated: null } }}
      />
    </PathnameContext.Provider>,
  );
  cy.wait(keys.map((key) => `@results-${key}` as const));
}

describe('Video results synchronized clips', () => {
  for (const [pathname, width] of [
    ['/video', 1440],
    ['/zh/video', 390],
  ] as const) {
    it(`includes H100 in the synchronized test clips in ${pathname} at ${width}px`, () => {
      cy.viewport(width, 900);
      mountResultsClips(['b200', 'h200', 'h100'], pathname);
      cy.get('[data-testid="video-results-clip"]').should('have.length', 5);
      cy.get('[data-testid="video-results-clip"][data-hardware="h100"] video').should(($video) => {
        expect(($video[0] as HTMLVideoElement).videoWidth).to.equal(32);
      });
      cy.get('[data-testid="video-results-play"]').click();
      cy.get('[data-testid="video-results-clip"] video')
        .should('have.length', 3)
        .each(($video) => {
          cy.wrap($video).should(($element) =>
            expect(($element[0] as HTMLVideoElement).paused).to.equal(false),
          );
        });
      cy.get('[data-testid="video-results-play"]').click();
      cy.document().should((doc) => expect(doc.documentElement.scrollWidth).to.equal(width));
      cy.get('[data-testid="video-results-clip"]').should(($tiles) => {
        const lefts = new Set(
          [...$tiles].map((tile) => Math.round(tile.getBoundingClientRect().left)),
        );
        expect(lefts.size).to.equal(width === 1440 ? 5 : 2);
      });
      cy.get('[data-testid="video-results-clips"]').screenshot(`h100-synthetic-clips-${width}`, {
        overwrite: true,
      });
    });
  }

  it('keeps exact prompt and source identity behind one focusable disclosure', () => {
    cy.viewport(1440, 900);
    mountResultsClips();
    cy.get('[data-testid="video-results-sources"]').should('not.have.attr', 'open');
    cy.get('[data-testid="video-results-prompt"]').should(
      'contain',
      'A drummer taps a snare drum.',
    );
    cy.get('[data-testid="video-results-sources"] summary')
      .should('contain', 'Prompt & sources')
      .focus();
    cy.focused().should('contain', 'Prompt & sources');
    cy.get('[data-testid="video-results-sources"] summary').click();
    cy.get('[data-testid="video-results-sources"]').should('have.attr', 'open');
    cy.get('[data-testid="video-results-prompt"]')
      .should('be.visible')
      .and('contain', 'A drummer taps a snare drum.')
      .and('contain', 'seed 11')
      .and('contain', 'take 1');
    cy.get('[data-testid="video-results-sources"]')
      .should('contain', c1('b200').runId)
      .and('contain', c1('b200').runtime)
      .and('contain', c1('h200').runId);
    cy.get('[data-testid="video-results-clip"] .aspect-video').should(($media) => {
      expect($media).to.have.length(4);
      const tops = [...$media].map((element) => element.getBoundingClientRect().top);
      expect(Math.max(...tops) - Math.min(...tops)).to.be.lessThan(2);
    });
  });
  it('decodes retained media, seeks and plays both clips, then displays real pixel differences', () => {
    mountResultsClips();
    cy.get('[data-testid="video-results-clip"] video')
      .should('have.length', 2)
      .each(($video) => {
        cy.wrap($video).should(($element) => {
          const video = $element[0] as HTMLVideoElement;
          expect(video.readyState).to.be.greaterThan(0.8);
          expect(video.videoWidth).to.equal(32);
          expect(video.duration).to.equal(2);
        });
      });
    cy.get('[data-testid="video-results-sources"] summary').click();
    cy.get('[data-testid="video-results-prompt"]')
      .should('contain', 'seed 11')
      .and('contain', 'take 1');
    cy.window().then((win) => {
      cy.get('[data-testid="video-results-scrub"]').then(($input) => {
        const setValue = Object.getOwnPropertyDescriptor(
          win.HTMLInputElement.prototype,
          'value',
        )!.set!;
        setValue.call($input[0], '0.8');
        $input[0].dispatchEvent(new win.Event('input', { bubbles: true }));
      });
    });
    cy.get('[data-testid="video-results-scrub"]').should('have.value', '0.8');
    cy.get('[data-testid="video-results-clip"] video').each(($video) =>
      cy
        .wrap($video)
        .should(($element) =>
          expect(($element[0] as HTMLVideoElement).currentTime).to.be.closeTo(0.8, 0.08),
        ),
    );
    cy.get('[data-testid="video-results-play"]').click();
    cy.get('[data-testid="video-results-clip"] video').each(($video) =>
      cy.wrap($video).should(($element) => {
        const video = $element[0] as HTMLVideoElement;
        expect(video.paused).to.equal(false);
        expect(video.currentTime).to.be.greaterThan(0.8);
      }),
    );
    cy.get('[data-testid="video-results-play"]').click();
    cy.get('[data-testid="video-results-clip"] video').each(($video) =>
      cy
        .wrap($video)
        .should(($element) => expect(($element[0] as HTMLVideoElement).paused).to.equal(true)),
    );
    cy.get('[data-testid="video-results-view"][data-view="difference"]').click();
    cy.get('[data-testid="video-results-clip"][data-hardware="h200"] canvas').should(($canvas) => {
      const rgba = ($canvas[0] as HTMLCanvasElement)
        .getContext('2d')!
        .getImageData(0, 0, 1, 1).data;
      expect([...rgba]).to.deep.equal([0, 0, 0, 255]);
    });
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"] canvas').should(($canvas) => {
      const rgba = ($canvas[0] as HTMLCanvasElement)
        .getContext('2d')!
        .getImageData(0, 0, 1, 1).data;
      expect(rgba[0]).to.be.greaterThan(200);
      expect(rgba[2]).to.be.greaterThan(200);
      expect(rgba[3]).to.equal(255);
    });
    cy.get('[data-testid="video-results-clip"][data-hardware="b200"]')
      .should('contain', '0.02')
      .find('dl')
      .should('contain', '—');
  });
  it('keeps unknown hardware empty and cannot draw a difference after the reference decoder fails', () => {
    mountResultsClips();
    cy.get('[data-testid="video-results-clip"]').should('have.length', 4);
    cy.get('[data-testid="video-results-clip"][data-hardware="gb200"] video').should('not.exist');
    cy.get('[data-testid="video-results-clip"][data-hardware="mi355x"] video').should('not.exist');
    cy.get('[data-testid="video-results-clip"][data-hardware="gb200"]').should(
      'not.contain',
      'Unofficial run',
    );
    cy.get('[data-testid="video-results-clip"][data-hardware="mi355x"]').should(
      'not.contain',
      'Unofficial run',
    );
    cy.get('[data-testid="video-results-clip"][data-hardware="h200"] video').then(($video) => {
      const video = $video[0] as HTMLVideoElement;
      video.src = 'data:video/mp4;base64,YmFk';
      video.load();
    });
    cy.get('[data-testid="video-results-view"][data-view="difference"]').click();
    cy.get(
      '[data-testid="video-results-clip"][data-hardware="b200"] [data-testid="video-results-media-empty"]',
    ).should('contain', 'reference');
    cy.get('[data-testid="video-results-clips"]').should(
      'contain',
      'A matched H200 50-step reference is not available.',
    );
  });
});
