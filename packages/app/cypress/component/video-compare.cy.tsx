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

function media(point: VideoPoint, hardware: string, alias: string) {
  cy.intercept(
    'GET',
    `/api/video-runs?run=${point.runId}&artifact=${point.artifactId}&format=media`,
    servingArtifact(Number(point.runId), point.artifactId, hardware),
  ).as(alias);
}

function mount(
  pathname = '/video',
  search = '',
  data: VideoPoint[] = points,
  options: MetricOptions = OWNING_PARTICIPATING,
) {
  media(c1('h100'), 'NVIDIA H100 80GB HBM3', 'h100');
  media(c1('b200'), 'NVIDIA B200', 'b200');
  media(c1('h200'), 'NVIDIA H200', 'h200');
  cy.intercept('GET', 'https://media.test/**', { statusCode: 204 });
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
const pick = (label: string, option: string) => {
  cy.get(`[role="combobox"][aria-label="${label}"]`).click();
  cy.contains('[role="option"]', option).click();
};

describe('Video compare panel (retained fixture)', () => {
  it('defaults to the slowest hardware as baseline and the fastest as candidate', () => {
    mount();
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
    cy.get('[data-testid="video-compare"]').should('contain', 'Owning at Large Hyperscaler Volume');
    cy.get('[data-testid="video-compare-clip"]').should('not.exist');
    cy.get('@h100.all').should('have.length', 0);
  });
  it('loads both runs’ clips on demand and pairs the same prompt and seed', () => {
    mount();
    cy.get('[data-testid="video-compare-load"]').click();
    cy.wait(['@h100', '@b200']);
    cy.get('[data-testid="video-compare-clip"]').should('have.length', 2);
    cy.get('[data-testid="video-compare-clip"] video').should('have.length', 2);
    cy.get('[data-testid="video-compare-clip"][data-role="baseline"]')
      .should('contain', 'H100')
      .and('contain', 'time to video 120 s')
      .find('video')
      .should('have.attr', 'src')
      .and('include', 'measurement-r001-c001.mp4');
    cy.get('[data-testid="video-compare-clip"][data-role="candidate"]').should('contain', 'B200');
    cy.get('[role="combobox"][aria-label="Case (prompt · seed)"]').should(
      'contain',
      'A drummer taps a snare drum. · seed 11 · #1',
    );
    pick('Case (prompt · seed)', '#3');
    cy.get('[data-testid="video-compare-clip"] video').each(($video) =>
      expect($video.attr('src')).to.include('measurement-r003-c001.mp4'),
    );
    cy.location('search').should('contain', 'v_case=2');
    cy.get('[data-testid="video-compare"]').should('contain', 'retained CI outputs');
  });
  it('updates the delta table and the URL when the candidate changes, without refetching', () => {
    mount();
    cy.get('[data-testid="video-compare-load"]').click();
    cy.wait(['@h100', '@b200']);
    pick('Candidate', 'H200');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'H200');
    metricRow('p50Latency').should('contain', '150.6').and('contain', '-10%');
    metricRow('dollarsPerVideo').should('contain', '$0.204');
    cy.location('search').should('contain', 'v_cand=h200');
    // H200 clips were never fetched: the pane returns to the on-demand button.
    cy.get('[data-testid="video-compare-load"]').should('exist');
    cy.get('@h200.all').should('have.length', 0);
    // Choosing the baseline's hardware as candidate swaps the two sides.
    pick('Candidate', 'H100');
    cy.get('[data-testid="video-compare-baseline"]').should('contain', 'H200');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'H100');
    metricRow('p50Latency').find('[data-tone="worse"]').should('exist');
  });
  it('restores v_base and v_cand from the URL and reports a failed media read', () => {
    mount('/video', '?v_base=h200&v_cand=h100');
    cy.intercept(
      'GET',
      `/api/video-runs?run=${c1('h200').runId}&artifact=${c1('h200').artifactId}&format=media`,
      { statusCode: 404, body: { error: 'gone' } },
    ).as('missing');
    cy.get('[data-testid="video-compare-baseline"]').should('contain', 'H200');
    cy.get('[data-testid="video-compare-candidate"]').should('contain', 'H100');
    cy.get('[data-testid="video-compare-load"]').click();
    cy.wait('@missing');
    cy.get('[data-testid="video-compare-clips"] [role="alert"]')
      .should('contain', 'Could not load clips')
      .and('contain', 'HTTP 404');
    cy.contains('button', 'Retry').should('exist');
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
    cy.get('[data-testid="video-compare"]')
      .should('contain', '基线')
      .and('contain', '候选')
      .and('contain', '加载视频')
      .and('contain', '租赁 - 3 年承诺')
      .and('contain', '已分配的 GPU');
    metricRow('p50Latency').should('contain', 'P50 出片时间');
    cy.get('[data-testid="video-compare-load"]').click();
    cy.wait(['@h100', '@b200']);
    cy.get('[data-testid="video-compare-clip"]').first().should('contain', '出片时间 120 s');
  });
});
