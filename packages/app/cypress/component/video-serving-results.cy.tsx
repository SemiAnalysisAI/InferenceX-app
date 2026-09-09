import { useState } from 'react';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import ServingResults from '@/components/video-benchmark/ServingResults';
import type { ServingCell } from '@/components/video-benchmark/serving';
import type { Bundle } from '@/components/video-benchmark/bundle';

// Synthetic fixtures exercise the serving contract; they are never benchmark results.
const cells: ServingCell[] = [1, 2, 4].map((concurrency) => {
  const id = `c${concurrency}`;
  const request = (phase: string, slot: string) => ({
    phase,
    slot_id: slot,
    artifact_path: `artifacts/${slot}.mp4`,
    prompt: 'Synthetic test prompt only',
    seed: 11,
    submit_to_media_seconds: 120 * concurrency,
    media_validation_seconds: 0.6,
    media: {
      valid: true,
      video: { duration_seconds: 4.4583, width: 1344, height: 768, frame_count: 107, fps: 24 },
      audio: { sample_rate_hz: 32000, channels: 2 },
      checks: [{ name: 'media.decode', status: 'passed' }],
    },
  });
  return {
    id,
    concurrency,
    runPath: `gpu/${id}/baseline/run.json`,
    jobPath: `gpu/${id}/gpu-job.json`,
    powerPath: `gpu/${id}/power.json`,
    specPath: `gpu/${id}/spec.json`,
    cell: {
      status: 'complete',
      verified: true,
      completion: {
        valid: 4,
        scheduled: 4,
        completed: 4,
        failed: 0,
        not_started: 0,
        unfinished: 0,
      },
      metrics: {
        client_ready_p50_seconds: 120 * concurrency,
        valid_clips_per_second: 1 / 120,
        measurement: { wall_seconds: 480 },
        serving: {
          client_ready_latency_seconds: { sample_count: 4, p90: null },
          valid_video_seconds_per_second: 4.4583 / 120,
          peak_client_in_flight: concurrency,
        },
      },
    },
    run: {
      records: [request('warmup', 'warmup-001'), request('measurement', 'measurement-r001-c001')],
      plan: { generation: { duration_seconds: 4, frame_count: 107, num_inference_steps: 50 } },
      configuration: {
        model_id: 'Synthetic model',
        model_revision: 'synthetic-model-revision',
        runtime_revision: 'synthetic-runtime-revision',
      },
    },
    job: {
      roles: {
        baseline: {
          telemetry_summary: {
            gpu_identity: [{ name: 'Synthetic GPU', uuid: 'GPU-test' }],
            measurement_observed_memory_peak_mib_by_gpu: { 'GPU-test': 100000 },
          },
        },
      },
    },
    spec: { gpu_uuids: ['GPU-test', 'GPU-test-2'], server: { ulysses_degree: 2, tp_size: 1 } },
    power: {
      phases: {
        measurement: {
          valid: true,
          duration_seconds: 479.9,
          aggregate: {
            avg_power_w: 1374,
            observed_peak_power_w: 1394,
            energy_j: 656721,
            joules_per_valid_clip: 164180,
          },
          per_gpu: { 'GPU-test': { avg_power_w: 687, observed_peak_power_w: 697 } },
        },
        startup: {
          valid: false,
          invalid_reasons: ['Synthetic missing telemetry'],
          aggregate: { avg_power_w: 999999 },
        },
      },
    },
  };
});
const bundle: Bundle = {
  manifest: {
    run_id: '123',
    git_commit: 'synthetic-backend-sha',
    resources: { requested: { gpus: 8 } },
  },
  ci: { slurm_job: { AllocTRES: 'cpu=32,mem=512G,gres/gpu=2' } },
  result: null,
  job: null,
  report: null,
  comparison: null,
  documents: new Map(),
  files: new Map(),
  checksums: new Map(),
  manifestSha256: 'synthetic-manifest-sha',
};
const urls = new Map(
  cells.flatMap((cell) =>
    ['measurement-r001-c001', 'warmup-001'].map((slot): [string, string] => [
      `gpu/${cell.id}/baseline/artifacts/${slot}.mp4`,
      `https://media.example.test/${cell.id}/${slot}.mp4`,
    ]),
  ),
);

function mount(
  props: Partial<React.ComponentProps<typeof ServingResults>> = {},
  locale = '/video',
) {
  cy.mount(
    <PathnameContext.Provider value={locale}>
      <ServingResults
        bundle={bundle}
        cells={cells}
        urls={urls}
        downloads={new Map()}
        html=""
        {...props}
      />
    </PathnameContext.Provider>,
  );
}

function LinkedSelection() {
  const [cell, setCell] = useState('c1');
  return (
    <PathnameContext.Provider value="/video">
      <button onClick={() => setCell('c4')}>Open C4 from chart</button>
      <ServingResults
        bundle={bundle}
        cells={cells}
        urls={urls}
        downloads={new Map()}
        html=""
        initialCell={cell}
        onCellChange={setCell}
      />
    </PathnameContext.Provider>
  );
}

describe('H3 serving results (synthetic fixtures)', () => {
  it('follows chart-driven cell changes while the result remains mounted', () => {
    cy.mount(<LinkedSelection />);
    cy.contains('button', 'C1').should('have.attr', 'aria-pressed', 'true');
    cy.contains('button', 'Open C4 from chart').click();
    cy.contains('button', /^C4$/u).should('have.attr', 'aria-pressed', 'true');
    cy.get('video').should(
      'have.attr',
      'src',
      'https://media.example.test/c4/measurement-r001-c001.mp4',
    );
    cy.contains('button', 'C2').click();
    cy.contains('button', 'C2').should('have.attr', 'aria-pressed', 'true');
  });
  it('shows each concurrency without manufacturing a candidate and uses allocated GPU count', () => {
    const change = cy.stub().as('change');
    mount({ onCellChange: change });
    cy.get('[data-testid="serving-matrix"] tbody tr').should('have.length', 3);
    cy.get('[data-testid="serving-selected-metrics"]').within(() => {
      cy.contains('120 s').should('be.visible');
      cy.contains('p', '15').should('be.visible');
      cy.contains('dt', 'P90 delivery latency').next().should('have.text', 'Unavailable');
    });
    cy.get('video')
      .should('have.attr', 'src', 'https://media.example.test/c1/measurement-r001-c001.mp4')
      .and('have.prop', 'muted', false);
    cy.contains('button', /^C4$/u).click();
    cy.get('@change').should('have.been.calledWith', 'c4');
    cy.get('[data-testid="serving-selected-metrics"]').should('contain', '480 s');
    cy.get('video').should(
      'have.attr',
      'src',
      'https://media.example.test/c4/measurement-r001-c001.mp4',
    );
    cy.get('[aria-label="Clip / request"]').click();
    cy.contains('[role="option"]', 'Warmup').click();
    cy.get('video').should('have.attr', 'src', 'https://media.example.test/c4/warmup-001.mp4');
    cy.get('[data-testid="serving-selected-metrics"]').should('contain', '4 / 4');
    cy.contains('a', 'Download original MP4').should(
      'have.attr',
      'href',
      'https://media.example.test/c4/warmup-001.mp4',
    );
    cy.contains('Baseline').should('not.exist');
    cy.contains('Candidate').should('not.exist');
  });

  it('distinguishes requested and decoded duration and withholds invalid power', () => {
    mount();
    cy.contains('dt', 'Requested duration (s)').next().should('have.text', '4');
    cy.contains('dt', 'Decoded video duration (s)').next().should('have.text', '4.4583');
    cy.get('[data-testid="serving-power"]').within(() => {
      cy.contains('dt', 'Energy / valid clip (kJ/clip)').next().should('have.text', '164.18');
      cy.get('[aria-label="Power window"]').click();
    });
    cy.contains('[role="option"]', 'Startup').click();
    cy.get('[data-testid="serving-power"]').within(() => {
      cy.contains('dt', 'Aggregate mean (W)').next().should('have.text', 'Unavailable');
      cy.contains('Synthetic missing telemetry').should('be.visible');
      cy.contains('999,999').should('not.exist');
    });
  });

  it('withholds headline metrics and power for an unverified configuration', () => {
    mount({
      cells: [
        {
          ...cells[0],
          cell: {
            verified: false,
            status: 'failed',
            metrics: { client_ready_p50_seconds: 999999, valid_clips_per_second: 999999 },
          },
        },
      ],
    });
    cy.get('[data-testid="serving-selected-metrics"]').should('not.contain', '999,999');
    cy.get('[data-testid="serving-matrix"]').should('not.contain', '999,999');
    cy.contains('dt', 'Measurement verified').next().should('have.text', 'No');
    cy.get('[data-testid="serving-power"]').within(() => {
      cy.contains('dt', 'Aggregate mean (W)').next().should('have.text', 'Unavailable');
    });
  });

  it('supports Chinese copy and missing request, media, and allocation data', () => {
    mount({ urls: new Map(), bundle: { ...bundle, ci: null } }, '/zh/video');
    cy.contains('并发服务测试结果').should('be.visible');
    cy.contains('此请求暂无可用媒体。').should('be.visible');
    cy.get('video').should('not.exist');
    cy.contains('p', '有效视频 / 已分配 GPU 小时').next().should('have.text', '无数据');
    mount({ cells: [{ ...cells[0], run: null, job: null, spec: null, power: null }] });
    cy.contains('No request records are available for this configuration.').should('be.visible');
  });
});
