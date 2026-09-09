import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import VideoTradeoff from '@/components/video-benchmark/VideoTradeoff';
import type { TradeoffRun } from '@/components/video-benchmark/tradeoff';
import type { Json } from '@/components/video-benchmark/bundle';

const role = {
  metrics: {
    status: 'valid',
    measurement: { wall_seconds: 3600, concurrency: 2 },
    completion: { valid: 10, completed: 10, scheduled: 11, failed: 1 },
  },
  records: Array.from({ length: 10 }, (_, i) => ({
    phase: 'measurement',
    status: 'succeeded',
    submit_to_media_seconds: i + 1,
    media: { valid: true, video: { duration_seconds: 8 } },
  })),
};
const run: TradeoffRun = {
  exportRun: '20',
  artifact: '30',
  bundle: {
    manifest: { run_id: '10' },
    manifestSha256: 'synthetic-only',
    result: {
      schema_version: '1.0.0',
      bundle_type: 'h3_benchmark_result',
      workload: {
        plan: {
          model_id: 'synthetic',
          model_revision: 'synthetic-revision',
          generation: {
            width: 1280,
            height: 720,
            fps: 24,
            duration_seconds: 8,
            num_inference_steps: 50,
          },
          cases: [{ prompt: 'Synthetic test only', seed: 1 }],
        },
      },
      hardware: {
        reserved_gpu_count: 8,
        selected_gpu_count: 4,
        devices: [{ name: 'Synthetic GPU' }],
      },
      roles: { baseline: role, candidate: role },
    },
  },
};

describe('Video tradeoff chart (synthetic fixtures)', () => {
  it('withholds missing cost, plots measured axes and drills into the original run', () => {
    const open = cy.stub().as('open');
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoTradeoff runs={[run]} onOpen={open} />
      </PathnameContext.Provider>,
    );
    cy.contains('No points qualify for these axes yet.').should('be.visible');
    cy.get('[role="combobox"][aria-label="Efficiency axis · higher is better"]').click();
    cy.contains('[role="option"]', 'Valid clips / allocated GPU-hour').click();
    cy.get('[data-testid="video-tradeoff-chart"] circle.point').should('have.length', 2);
    cy.contains('td', '1.25').should('be.visible');
    cy.contains('dd', '8 / 4').should('be.visible');
    cy.get('[role="combobox"][aria-label="Efficiency axis · higher is better"]').click();
    cy.contains('[role="option"]', 'Valid clips / USD').click();
    cy.get('input[aria-label="Whole deployment cost (USD/hour)"]').type('2');
    cy.get('circle.point').should('not.exist');
    cy.get('input[aria-label="Cost source and included items"]').type(
      'Synthetic complete-deployment cost',
    );
    cy.get('input[aria-label="Cost as of"]').type('2026-09-09');
    cy.get('circle.point').should('have.length', 1);
    cy.contains('td', '5').should('be.visible');
    cy.contains('button', 'Open videos and full result').click();
    cy.get('@open').should('have.been.calledOnce');
  });
  it('shows an empty state without inventing fixture results', () => {
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoTradeoff runs={[]} onOpen={() => undefined} />
      </PathnameContext.Provider>,
    );
    cy.contains('Open a CI result').should('be.visible');
    cy.get('circle.point').should('not.exist');
  });
  it('distinguishes groups with the same short label and exposes their full workload', () => {
    const other = structuredClone(run);
    other.bundle.manifestSha256 = 'different-synthetic-workload';
    const result = other.bundle.result as {
      workload: { plan: { generation: Record<string, Json> } };
    };
    result.workload.plan.generation.guidance_scale = 4;
    cy.mount(
      <PathnameContext.Provider value="/video">
        <VideoTradeoff runs={[run, other]} onOpen={() => undefined} />
      </PathnameContext.Provider>,
    );
    cy.get('[role="combobox"][aria-label="Matched workload"]').click();
    cy.get('[role="option"]').should('have.length', 2);
    cy.contains('[role="option"]', '#1').should('be.visible');
    cy.contains('[role="option"]', '#2').click();
    cy.contains('summary', 'Matched workload').click();
    cy.get('[data-testid="tradeoff-detail"] pre').first().should('contain', '"guidance_scale": 4');
  });
});
