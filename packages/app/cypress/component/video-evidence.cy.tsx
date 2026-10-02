import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import type { VideoHistoryPage } from '@/components/video-benchmark/history';
import type { VideoPoint } from '@/components/video-benchmark/metrics';
import { videoPoints } from '@/components/video-benchmark/points';
import VideoEvidence from '@/components/video-benchmark/VideoEvidence';

// Retained H100/H200/B200 C1/C2/C4 observations (cypress/fixtures/api/video-history.json).
// Nothing in the panel is priced, so it takes no metric options: every per-GPU number
// divides by the boards that generated the clip.
function mount(pathname = '/video', select = (points: VideoPoint[]) => points) {
  cy.fixture('api/video-history.json').then((page: VideoHistoryPage) => {
    cy.mount(
      <PathnameContext.Provider value={pathname}>
        <VideoEvidence
          points={select(videoPoints([page]))}
          colorFor={(key) => (key === 'b200' ? 'rgb(1, 2, 3)' : 'rgb(4, 5, 6)')}
        />
      </PathnameContext.Provider>,
    );
  });
}
const exhibit = (name: string) => cy.get(`[data-testid="video-evidence-${name}"]`);

describe('Video performance evidence (retained fixture)', () => {
  for (const { locale, width } of [
    { locale: 'en', width: 1280 },
    { locale: 'zh', width: 390 },
  ]) {
    it(`keeps the concurrency table within the stated shared layout (${locale}, ${width}px)`, () => {
      cy.viewport(width, 844);
      mount(locale === 'zh' ? '/zh/video' : '/video', (points) =>
        points.map((p) =>
          p.hardwareKey === 'b200'
            ? { ...p, participating: 8, server: { tp: 4, ulysses: 2, attention: null } }
            : p,
        ),
      );
      exhibit('plateau').find('tbody tr').should('have.length', 6);
      exhibit('plateau').find('tr[data-hardware="b200"]').should('not.exist');
      exhibit('plateau')
        .find('tr[data-hardware="h100"][data-concurrency="4"]')
        .should('contain', '5.37')
        .and('contain', '4.00×');
      exhibit('caveats').should(
        'contain',
        locale === 'zh'
          ? '每条视频由 4 张 GPU 参与计算（TP2 × Ulysses 2）'
          : '4 participating GPUs per video (TP2 × Ulysses 2)',
      );
      cy.get('[data-testid="video-evidence"]').should(($section) => {
        expect($section[0].scrollWidth).to.be.at.most($section[0].clientWidth);
      });
      exhibit('plateau').screenshot(`video-evidence-cohort-${locale}-${width}`);
    });
  }
  it('does not call low board power compute saturation', () => {
    mount('/video', (points) =>
      points
        .filter((p) => p.hardwareKey === 'h200' && p.concurrency === 1)
        .map((p) => ({ ...p, avgPowerW: 280 })),
    );
    exhibit('power-reading')
      .should('contain', '10%')
      .and('not.contain', 'near the cap')
      .and('not.contain', 'compute-saturated');
    cy.get('[data-testid="video-evidence"]').should('not.contain', 'Compute-bound evidence');
  });
  it('does not call higher throughput and lower latency a queueing plateau', () => {
    mount('/video', (points) => {
      const base = points.find((p) => p.hardwareKey === 'h200' && p.concurrency === 1)!;
      return [
        base,
        {
          ...base,
          id: 'synthetic-c2',
          concurrency: 2,
          wallSeconds: base.wallSeconds! / 2,
          p50: base.p50! / 2,
        },
      ];
    });
    exhibit('plateau-reading')
      .should('contain', '100.0%')
      .and('contain', '0.50× at C2')
      .and('not.contain', 'rises')
      .and('not.contain', 'queues requests');
    exhibit('plateau').should('not.contain', 'Client concurrency plateau');
  });
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
    mount('/video', (points) =>
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
  it('tabulates concurrency measurements with ratios against each hardware C1 cell', () => {
    mount();
    exhibit('plateau').find('tbody tr').should('have.length', 9);
    exhibit('plateau').find('tbody th[scope="rowgroup"]').should('have.length', 3);
    // Throughput divides by the 4 participating boards, never the 8 the B200/H100 jobs reserved.
    exhibit('plateau')
      .find('tr[data-hardware="b200"][data-concurrency="4"]')
      .should('contain', '11.69')
      .and('contain', '307.3')
      .and('contain', '1.01×')
      .and('contain', '3.94×');
    exhibit('plateau')
      .find('tr[data-hardware="h100"][data-concurrency="1"]')
      .should('contain', '5.37')
      .and('contain', '167.3')
      .and('contain', '1.00×');
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
      .should('contain', 'Across 6 cells above C1')
      .and('contain', 'largest deviation in throughput per GPU-hour from C1 is 1.4%')
      .and('contain', '1.97–2.00× at C2 and 3.94–4.00× at C4')
      .and('contain', 'These ratios alone do not establish queueing or batching');
  });
  it('compares observed speedups with spec-sheet ratios without attributing a bottleneck', () => {
    mount();
    exhibit('scaling').find('[data-testid="video-evidence-scaling-row"]').should('have.length', 2);
    exhibit('scaling')
      .find('[data-pair="h100-h200"]')
      .should('contain', 'H100')
      .and('contain', 'H200')
      .and('contain', '1.11×')
      .and('contain', '1.43×')
      .and('contain', '1.00×');
    exhibit('scaling')
      .find('[data-pair="h200-b200"]')
      .should('contain', '1.93×')
      .and('contain', '1.67×')
      .and('contain', '2.28×')
      .and('contain', '2.27×');
    exhibit('scaling-reading')
      .should('contain', 'H100 → H200: 1.11× observed vs. 1.43× bandwidth and 1.00× FLOPS')
      .and(
        'contain',
        'H200 → B200: 1.93× observed vs. 1.67× bandwidth and 2.28× (BF16) / 2.27× (FP8) FLOPS',
      )
      .and('contain', 'Spec-sheet ratios provide context, not bottleneck attribution');
    exhibit('caveats')
      .should('contain', 'Client concurrency is not observed batch size or replica count')
      .and('contain', '4 participating GPUs per video (TP2 × Ulysses 2)')
      .and('contain', 'the allocated GPU count may differ')
      .and('contain', 'not node, rack or facility power')
      .and('contain', 'n = 20 clips per cell')
      .and('contain', 'Matched workload: 1344 × 768 · 8 s · 24 fps · 50 steps');
  });
  it('renders Chinese copy on /zh/video at mobile width', () => {
    cy.viewport(390, 844);
    mount('/zh/video');
    cy.get('[data-testid="video-evidence"]')
      .should('contain', '性能测量证据')
      .and('contain', '板卡功率 vs. 生效功率上限')
      .and('contain', '客户端并发测量')
      .and('contain', '实测加速比 vs. 规格表比值');
    exhibit('power-reading').should(
      'contain',
      '全部 3 种实测硬件生成期间均运行在生效功率上限的 92%–97%',
    );
    exhibit('plateau-reading')
      .should('contain', '最大偏差为 1.4%')
      .and('contain', 'C2 时 1.97–2.00×、C4 时 3.94–4.00×');
    exhibit('scaling-reading').should('contain', '规格表比值仅供参考，不能用于判定瓶颈');
    cy.get('[data-testid="video-evidence"]')
      .should('not.contain', '算力饱和')
      .and('not.contain', '出片时间升至')
      .should(($section) => {
        expect($section[0].scrollWidth).to.be.at.most($section[0].clientWidth);
      });
    exhibit('caveats')
      .should('contain', '每条视频由 4 张 GPU 参与计算（TP2 × Ulysses 2）')
      .and('contain', '每个 cell n = 20 条视频');
    cy.screenshot('video-evidence-zh-mobile', { capture: 'viewport' });
  });
  it('hides the plateau and scaling exhibits when only one hardware at C1 is measured', () => {
    mount('/video', (points) =>
      points.filter((p) => p.hardwareKey === 'h200' && p.concurrency === 1),
    );
    exhibit('power').find('[data-testid="video-evidence-power-row"]').should('have.length', 1);
    exhibit('power-reading').should('contain', 'H200 ran at 97% of its enforced power limit');
    exhibit('plateau').should('not.exist');
    exhibit('scaling').should('not.exist');
    exhibit('caveats').should('contain', '4 participating GPUs per video (TP2 × Ulysses 2)');
  });
  it('renders nothing when no cell is measured', () => {
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoEvidence points={[]} colorFor={() => 'rgb(0, 0, 0)'} />
      </PathnameContext.Provider>,
    );
    cy.get('[data-testid="video-evidence"]').should('not.exist');
  });
});
