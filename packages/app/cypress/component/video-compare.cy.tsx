import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import type { VideoHistoryPage } from '@/components/video-benchmark/history';
import type { MetricOptions, VideoPoint } from '@/components/video-benchmark/metrics';
import { videoPoints } from '@/components/video-benchmark/points';
import VideoCompare from '@/components/video-benchmark/VideoCompare';
import history from '../fixtures/api/video-history.json';
import { servingArtifact } from '../support/video-artifacts';

// Retained H100/H200/B200 C1/C2/C4 observations; clips come from synthetic stored artifacts.
const points = videoPoints([history as unknown as VideoHistoryPage]);
const c1 = (key: string) => points.find((p) => p.hardwareKey === key && p.concurrency === 1)!;
const COLORS: Record<string, string> = {
  h100: 'rgb(10, 20, 30)',
  h200: 'rgb(40, 50, 60)',
  b200: 'rgb(70, 80, 90)',
};
const colorFor = (key: string) => COLORS[key] ?? 'rgb(0, 0, 0)';
const OWNING_PARTICIPATING: MetricOptions = { tier: 'h', basis: 'participating' };

const mediaUrl = (point: VideoPoint) =>
  `/api/video-runs?run=${point.runId}&artifact=${point.artifactId}&format=media`;
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
  data: VideoPoint[] = points,
  options: MetricOptions = OWNING_PARTICIPATING,
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
    metricRow('p50Latency')
      .should('contain', '167.3')
      .and('contain', '77.9')
      .and('contain', '-53.4%');
    metricRow('p50Latency').find('[data-tone="better"]').should('exist');
    metricRow('dollarsPerVideo')
      .should('contain', '$0.218')
      .and('contain', '$0.150')
      .and('contain', '-31.1%');
    metricRow('powerPctCap').find('[data-tone="better"]').should('exist');
    cy.get('[data-testid="video-compare"]')
      .should('contain', 'Owning at Large Hyperscaler Volume')
      .and('contain', 'retained CI outputs');
    cy.get('@h200.all').should('have.length', 0);
  });
  it('steps through cases with the arrows and the select, keeping v_case in the URL', () => {
    mount();
    cy.wait(['@h100', '@b200']);
    cy.get('[data-testid="video-compare-prev"]').should('be.disabled');
    cy.get('[data-testid="video-compare-next"]').click();
    cy.get('[data-testid="video-compare-clip"] video').each(($video) =>
      expect($video.attr('src')).to.include('measurement-r002-c001.mp4'),
    );
    cy.location('search').should('contain', 'v_case=1');
    pick('Case (prompt · seed)', '#3');
    cy.get('[data-testid="video-compare-clip"] video').each(($video) =>
      expect($video.attr('src')).to.include('measurement-r003-c001.mp4'),
    );
    cy.get('[data-testid="video-compare-case-of"]').should('contain', 'Case 3 of');
    cy.location('search').should('contain', 'v_case=2');
    cy.get('[data-testid="video-compare-prev"]').click();
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
  it('hides which hardware is which in blind mode until revealed', () => {
    mount();
    cy.wait(['@h100', '@b200']);
    cy.get('[data-testid="video-compare-blind"]').click();
    cy.get('[data-testid="video-compare-pane-label"]').should(($labels) => {
      expect([...$labels].map((el) => el.textContent)).to.deep.equal(['A', 'B']);
    });
    clip('baseline').should('not.contain', 'H100').and('contain', 'time to video 120 s');
    cy.get('[data-testid="video-compare-table"]').should('not.exist');
    cy.get('[data-testid="video-compare-metrics-hidden"]').should('exist');
    cy.get('[data-testid="video-compare-reveal"]').click();
    cy.get('[data-testid="video-compare-pane-label"]').first().should('contain', 'H100');
    cy.get('[data-testid="video-compare-table"]').should('exist');
    // The next case is blind again.
    cy.get('[data-testid="video-compare-next"]').click();
    cy.get('[data-testid="video-compare-pane-label"]').first().should('have.text', 'A');
  });
  it('switches the candidate, fetching only the new side, and swaps on collision or request', () => {
    mount();
    cy.wait(['@h100', '@b200']);
    pick('Candidate', 'H200');
    cy.wait('@h200');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'H200');
    clip('candidate').should('contain', 'H200');
    metricRow('p50Latency').should('contain', '150.6').and('contain', '-10%');
    metricRow('dollarsPerVideo').should('contain', '$0.204');
    cy.location('search').should('contain', 'v_cand=h200');
    cy.get('@h100.all').should('have.length', 1);
    cy.get('@h200.all').should('have.length', 1);
    // Choosing the baseline's hardware as candidate swaps the two sides; the swap button does too.
    pick('Candidate', 'H100');
    cy.get('[data-testid="video-compare-baseline"]').should('contain', 'H200');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'H100');
    metricRow('p50Latency').find('[data-tone="worse"]').should('exist');
    cy.get('[data-testid="video-compare-swap"]').click();
    cy.get('[data-testid="video-compare-baseline"]').should('contain', 'H100');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'H200');
    cy.get('@h200.all').should('have.length', 1);
  });
  it('restores v_base and v_cand from the URL and reports a failed media read with a retry', () => {
    mount('/video', '?v_base=h200&v_cand=h100', points, OWNING_PARTICIPATING, () => {
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
  it('says when a run publishes no clips and keeps the metric deltas', () => {
    mount('/video', '', points, OWNING_PARTICIPATING, () => {
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
      points.filter((p) => p.hardwareKey === 'h200'),
    );
    cy.get('[data-testid="video-compare-controls"]').should('have.attr', 'disabled');
    cy.get('[data-testid="video-compare"]').should(
      'contain',
      'Comparison needs at least two measured hardware.',
    );
    cy.get('[data-testid="video-compare-table"]').should('not.exist');
  });
  it('renders Chinese copy on /zh/video', () => {
    mount('/zh/video', '', points, { tier: 'r', basis: 'allocated' });
    cy.wait(['@h100', '@b200']);
    cy.get('[data-testid="video-compare"]')
      .should('contain', '基线')
      .and('contain', '候选')
      .and('contain', '同时播放')
      .and('contain', '盲测模式')
      .and('contain', '租赁 - 3 年承诺')
      .and('contain', '已分配的 GPU');
    metricRow('p50Latency').should('contain', 'P50 出片时间');
    cy.get('[data-testid="video-compare-case-of"]').should('contain', '第 1 /');
    clip('baseline').should('contain', '出片时间 120 s');
  });
});
