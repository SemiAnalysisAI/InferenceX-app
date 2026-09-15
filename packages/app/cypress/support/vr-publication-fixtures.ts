import { metricsFor } from './overlay-fixtures';

// Synthetic API rows, not published benchmark measurements. Keep real run data
// and private source links out of the public test fixtures.
export const VR_FIXTURE_DATE = '2026-09-09';
export const VR_LATEST_FIXTURE_DATE = '2026-09-10';
export const VR_LATEST_FIXTURE_RUN = 9_100_001;
const CURVE = [
  [512, 20, 24_000],
  [128, 40, 18_000],
  [32, 80, 12_000],
  [8, 160, 6_000],
] as const;

export const vrPublicationRows = ['vr200', 'gb300'].flatMap((hardware, chipIndex) =>
  CURVE.map(([conc, interactivity, throughput], pointIndex) => ({
    id: 980_000 + chipIndex * 100 + pointIndex,
    hardware,
    framework: 'trt',
    model: 'dsv4',
    precision: 'fp4',
    spec_method: 'none',
    disagg: true,
    is_multinode: true,
    prefill_tp: 16,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 16,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 16,
    num_decode_gpu: 16,
    isl: null,
    osl: null,
    conc,
    offload_mode: 'off',
    benchmark_type: 'agentic_traces',
    image: null,
    // VR remains visible even when the model's newest date belongs to GB300.
    date: chipIndex === 0 ? VR_FIXTURE_DATE : '2026-09-10',
    run_url: null,
    metrics: {
      ...metricsFor(interactivity, throughput * (chipIndex === 0 ? 1 : 0.8), 60),
      server_gpu_cache_hit_rate: 0.95,
      server_external_cache_hit_rate: 0,
      server_cpu_cache_hit_rate: 0,
      theoretical_cache_hit_rate: 0.97,
    } as Record<string, number>,
  })),
);

export const vrLatestPublicationRows = vrPublicationRows
  .filter((row) => row.hardware === 'vr200')
  .map((row) => ({
    ...row,
    id: row.id + 200,
    date: VR_LATEST_FIXTURE_DATE,
    prefill_tp: 8,
    decode_tp: 8,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    metrics: {
      ...row.metrics,
      tput_per_gpu: row.metrics.tput_per_gpu * 0.75,
      input_tput_per_gpu: row.metrics.input_tput_per_gpu * 0.75,
      output_tput_per_gpu: row.metrics.output_tput_per_gpu * 0.75,
      server_gpu_cache_hit_rate: 0.9,
    },
  }));

export function interceptVrPublicationData(includeNewerVr = false): void {
  const preferred = vrPublicationRows.filter((row) => row.hardware === 'vr200');
  const latest = includeNewerVr
    ? [...vrLatestPublicationRows, ...vrPublicationRows.filter((row) => row.hardware !== 'vr200')]
    : vrPublicationRows;
  cy.intercept('GET', '/api/v1/availability*', {
    body: [...preferred, ...latest].map(({ metrics: _metrics, ...row }) => row),
  });
  cy.intercept('GET', '/api/v1/benchmarks*', (request) => {
    request.reply({ body: request.query['date'] === VR_FIXTURE_DATE ? preferred : latest });
  });
  cy.intercept('GET', '/api/v1/workflow-info*', {
    body: {
      runs: [
        {
          github_run_id: VR_LATEST_FIXTURE_RUN,
          run_attempt: 1,
          name: 'Synthetic September 10 run',
          conclusion: 'success',
          html_url: `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${VR_LATEST_FIXTURE_RUN}`,
          created_at: `${VR_LATEST_FIXTURE_DATE}T12:00:00Z`,
          date: VR_LATEST_FIXTURE_DATE,
        },
      ],
      changelogs: [],
      configs: [],
      runConfigs: [],
    },
  });
  cy.intercept('GET', '/api/v1/trace-availability*', { body: {} });
}
