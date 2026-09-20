import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import type { VideoHistoryPage } from '@/components/video-benchmark/history';
import type { GpuBasis, VideoPoint } from '@/components/video-benchmark/metrics';
import { videoPoints } from '@/components/video-benchmark/points';
import VideoEvidence from '@/components/video-benchmark/VideoEvidence';

// Retained H100/H200/B200 C1/C2/C4 observations (cypress/fixtures/api/video-history.json).
function mount(
  pathname = '/video',
  basis: GpuBasis = 'participating',
  select = (points: VideoPoint[]) => points,
) {
  cy.fixture('api/video-history.json').then((page: VideoHistoryPage) => {
    cy.mount(
      <PathnameContext.Provider value={pathname}>
        <VideoEvidence
          points={select(videoPoints([page]))}
          options={{ tier: 'h', basis }}
          colorFor={(key) => (key === 'b200' ? 'rgb(1, 2, 3)' : 'rgb(4, 5, 6)')}
        />
      </PathnameContext.Provider>,
    );
  });
}
const exhibit = (name: string) => cy.get(`[data-testid="video-evidence-${name}"]`);

describe('Video compute-bound evidence (retained fixture)', () => {
  it('reads board power against the recorded enforced limit per measured hardware', () => {
    mount();
    exhibit('power').find('[data-testid="video-evidence-power-row"]').should('have.length', 3);
    exhibit('power')
      .find('[data-hardware="h100"]')
      .should('contain', '2,575 W / 2,800 W')
      .and('contain', '91.9%');
    exhibit('power').find('[data-hardware="h200"]').should('contain', '97.4%');
    exhibit('power')
      .find('[data-hardware="b200"]')
      .should('contain', '3,856 W / 4,000 W')
      .and('contain', '96.4%');
    exhibit('power').find('[role="meter"]').should('have.length', 3);
    exhibit('power')
      .find('[data-hardware="b200"] [role="meter"]')
      .should('have.attr', 'aria-valuenow', '96.4')
      .find('div')
      .should('have.css', 'background-color', 'rgb(1, 2, 3)');
    exhibit('power-reading').should(
      'contain',
      'All 3 measured GPU types ran at 92–97% of their enforced power limit',
    );
  });
  it('bounds the power meter to its declared range when mean power exceeds the recorded limit', () => {
    // 2,856 W against the recorded 2,800 W limit: the label keeps the measured 102.0%,
    // the meter reports and fills its 0–100 range.
    mount('/video', 'participating', (points) =>
      points
        .filter((p) => p.hardwareKey === 'h200' && p.concurrency === 1)
        .map((p) => ({ ...p, avgPowerW: 2856 })),
    );
    exhibit('power')
      .find('[data-hardware="h200"]')
      .should('contain', '2,856 W / 2,800 W')
      .and('contain', '102.0%');
    exhibit('power')
      .find('[data-hardware="h200"] [role="meter"]')
      .should('have.attr', 'aria-valuemax', '100')
      .and('have.attr', 'aria-valuenow', '100')
      .find('div')
      .invoke('attr', 'style')
      .should('match', /width:\s*100%/u);
    exhibit('power-reading').should('contain', 'H200 ran at 102% of its enforced power limit');
  });
  it('tabulates the concurrency plateau with ratios against each hardware C1 cell', () => {
    mount();
    exhibit('plateau').find('tbody tr').should('have.length', 9);
    exhibit('plateau').find('tbody th[scope="rowgroup"]').should('have.length', 3);
    exhibit('plateau')
      .find('tr[data-hardware="b200"][data-concurrency="4"]')
      .should('contain', '11.69')
      .and('contain', '307.3')
      .and('contain', '1.01×')
      .and('contain', '3.94×');
    exhibit('plateau')
      .find('tr[data-hardware="h100"][data-concurrency="4"]')
      .should('contain', '5.37')
      .and('contain', '669.2')
      .and('contain', '1.00×')
      .and('contain', '4.00×');
    exhibit('plateau')
      .find('tr[data-hardware="h200"][data-concurrency="1"]')
      .should('contain', '5.97')
      .and('contain', '150.6');
    exhibit('plateau-reading')
      .should('contain', 'Across 6 queued cells')
      .and('contain', 'within 1.4% of C1')
      .and('contain', '1.97–2.00× at C2 and 3.94–4.00× at C4')
      .and('contain', 'queues requests instead of batching them');
  });
  it('compares observed speedups with spec-sheet ratios and hedges when they do not separate', () => {
    mount();
    exhibit('scaling').find('[data-testid="video-evidence-scaling-row"]').should('have.length', 2);
    exhibit('scaling')
      .find('[data-pair="h100-h200"]')
      .should('contain', 'H100')
      .and('contain', 'H200')
      .and('contain', '1.11×')
      .and('contain', '1.43×')
      .and('contain', '1.00×')
      .and('contain', 'closer to the FLOPS ratio');
    exhibit('scaling')
      .find('[data-pair="h200-b200"]')
      .should('contain', '1.93×')
      .and('contain', '1.67×')
      .and('contain', '2.28×')
      .and('contain', '2.27×')
      .and('contain', 'between the two, not clearly closer to either');
    exhibit('scaling-reading')
      .should('contain', 'H100 → H200: 1.11× observed vs. 1.43× bandwidth and 1.00× FLOPS')
      .and(
        'contain',
        'H200 → B200: 1.93× observed vs. 1.67× bandwidth and 2.28× (BF16) / 2.27× (FP8) FLOPS',
      )
      .and('contain', 'A bandwidth-bound workload would track the bandwidth ratio');
    exhibit('caveats')
      .should('contain', 'Batch-one, single-replica server')
      .and('contain', '4 participating GPUs per video (TP2 × Ulysses 2)')
      .and('contain', 'not node, rack or facility power')
      .and('contain', 'n = 20 clips per cell')
      .and('contain', 'Frozen workload 1344 × 768 · 8 s · 24 fps · 50 steps');
  });
  it('switches the throughput column to the allocated basis without moving the ratios', () => {
    mount('/video', 'allocated');
    exhibit('plateau')
      .find('tr[data-hardware="h100"][data-concurrency="1"]')
      .should('contain', '2.69')
      .and('contain', '1.00×');
    exhibit('plateau')
      .find('tr[data-hardware="h100"][data-concurrency="4"]')
      .should('contain', '2.68')
      .and('contain', '4.00×');
    exhibit('plateau-reading').should('contain', 'within 1.4% of C1');
  });
  it('renders Chinese copy on /zh/video', () => {
    mount('/zh/video');
    cy.get('[data-testid="video-evidence"]')
      .should('contain', '算力受限（compute-bound）的证据')
      .and('contain', '板卡功率 vs. 生效功率上限')
      .and('contain', '客户端并发平台期')
      .and('contain', '实测加速比 vs. 规格表比值');
    exhibit('power-reading').should(
      'contain',
      '全部 3 种实测硬件生成期间均运行在生效功率上限的 92%–97%',
    );
    exhibit('plateau-reading')
      .should('contain', '偏差不超过 1.4%')
      .and('contain', 'C2 时 1.97–2.00×、C4 时 3.94–4.00×');
    exhibit('scaling')
      .should('contain', '更接近 FLOPS 比值')
      .and('contain', '介于两者之间，不明显偏向任一方');
    exhibit('caveats')
      .should('contain', '每条视频由 4 张 GPU 参与计算（TP2 × Ulysses 2）')
      .and('contain', '每个 cell n = 20 条视频');
  });
  it('hides the plateau and scaling exhibits when only one hardware at C1 is measured', () => {
    cy.fixture('api/video-history.json').then((page: VideoHistoryPage) => {
      cy.mount(
        <PathnameContext.Provider value="/video">
          <VideoEvidence
            points={videoPoints([page]).filter(
              (p) => p.hardwareKey === 'h200' && p.concurrency === 1,
            )}
            options={{ tier: 'h', basis: 'participating' }}
            colorFor={() => 'rgb(0, 0, 0)'}
          />
        </PathnameContext.Provider>,
      );
    });
    exhibit('power').find('[data-testid="video-evidence-power-row"]').should('have.length', 1);
    exhibit('power-reading').should('contain', 'H200 ran at 97% of its enforced power limit');
    exhibit('plateau').should('not.exist');
    exhibit('scaling').should('not.exist');
    exhibit('caveats').should('contain', '4 participating GPUs per video (TP2 × Ulysses 2)');
  });
  it('renders nothing when no cell is measured', () => {
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoEvidence
          points={[]}
          options={{ tier: 'h', basis: 'participating' }}
          colorFor={() => 'rgb(0, 0, 0)'}
        />
      </PathnameContext.Provider>,
    );
    cy.get('[data-testid="video-evidence"]').should('not.exist');
  });
});
