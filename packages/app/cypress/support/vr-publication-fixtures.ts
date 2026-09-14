import { metricsFor } from './overlay-fixtures';

// Synthetic API rows, not published benchmark measurements. Keep real run data
// and private source links out of the public test fixtures.
export const VR_FIXTURE_DATE = '2026-09-09';
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
    },
  })),
);

export function interceptVrPublicationData(): void {
  cy.intercept('GET', '/api/v1/availability*', {
    body: vrPublicationRows.map(({ metrics: _metrics, ...row }) => row),
  });
  cy.intercept('GET', '/api/v1/benchmarks*', { body: vrPublicationRows });
  cy.intercept('GET', '/api/v1/workflow-info*', {
    body: { runs: [], changelogs: [], configs: [], runConfigs: [] },
  });
  cy.intercept('GET', '/api/v1/trace-availability*', { body: {} });
}
