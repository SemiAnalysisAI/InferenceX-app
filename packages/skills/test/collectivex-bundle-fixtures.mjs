function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

export const COLLECTIVEX_IDS = ['90071992547409930001', '90071992547409930002'];

const topology = {
  ep_size: 8,
  nodes: 1,
  gpus_per_node: 8,
  scale_up_domain: 8,
  scale_up_transport: 'NVLink',
  scale_out_transport: null,
  topology_class: 'scale-up',
};
const percentiles = (p50 = 20) => ({ p50, p90: 30, p95: 40, p99: 50 });

export function collectivexDataset(runId, latency = 20, overrides = {}) {
  const value = {
    version: 1,
    run: {
      run_id: runId,
      run_attempt: 2,
      generated_at: '2026-09-01T12:00:00Z',
      conclusion: null,
      source_sha: `sha-${runId}`,
      requested_cases: 1,
      terminal_cases: 1,
      measured_cases: 1,
      unsupported_cases: 0,
      failed_cases: 0,
      requested_points: 1,
      terminal_points: 1,
      measured_points: 1,
      covered_skus: ['h200_sxm'],
    },
    coverage: [{ case_id: 'case-a', outcome: 'success', reason: null, detail: 'raw coverage' }],
    series: [
      {
        series_id: 'case-a',
        phase: 'decode',
        mode: 'normal',
        precision: 'bf16',
        backend: 'deepep',
        system: { ...topology, sku: 'h200_sxm', vendor: 'nvidia' },
        points: [
          {
            tokens_per_rank: 32,
            global_tokens: 256,
            components: {
              dispatch: {
                payload_bytes: 8192,
                latency_us: percentiles(latency),
                activation_data_rate_gbps_at_latency_percentile: null,
                payload_data_rate_gbps_at_latency_percentile: percentiles(0),
              },
              stage: null,
              combine: null,
              roundtrip: null,
            },
            roundtrip_token_rate_at_latency_percentile: percentiles(0),
          },
        ],
      },
    ],
    ...overrides,
  };
  return value;
}

export function collectivexKvDataset(runId, latency = 4) {
  const value = collectivexDataset(runId);
  value.series = [];
  value.coverage = [];
  value.kv = [
    {
      case_id: 'kv-a',
      label: 'H200 transfer',
      disposition: 'runnable',
      sku: 'h200_sxm',
      vendor: 'nvidia',
      backend: 'nixl',
      fabric: 'rdma',
      workload: 'kv-dsv4',
      precision: 'bf16',
      topology: {
        ...topology,
        ep_size: 2,
        nodes: 2,
        gpus_per_node: 1,
        scale_up_domain: 1,
        scale_out_transport: 'InfiniBand',
        topology_class: 'scale-out',
      },
      outcome: 'success',
      reason: null,
      detail: null,
      rows: [
        {
          kind: 'paged',
          isl: 1024,
          page_tokens: 16,
          batch: 4,
          op: 'pull',
          descs: 64,
          req_bytes: 1_000_000,
          prep_ms: 0,
          latency_ms: { p50: latency, p95: 8, min: 2, max: 10, n: 30 },
          gbps_p50: 1,
          verify_passed: true,
        },
      ],
    },
  ];
  return value;
}

const origin = 'https://inferencex.semianalysis.com';
const schema = {
  paths: Object.fromEntries(
    ['/api/v1/collectivex/runs', '/api/v1/collectivex/runs/{runId}'].map((path) => [
      path,
      {
        get: { parameters: [{ name: 'version', required: true, schema: { enum: [1] } }] },
      },
    ]),
  ),
};

function explicit(left, right, expected) {
  return {
    args: ['collectivex', 'compare', '--left', left.run.run_id, '--right', right.run.run_id],
    responses: [
      { operation: 'openapi.json', url: `${origin}/api/openapi.json`, body: schema, status: 200 },
      {
        operation: left.run.run_id,
        url: `${origin}/api/v1/collectivex/runs/${left.run.run_id}?version=1`,
        body: left,
        status: 200,
      },
      {
        operation: right.run.run_id,
        url: `${origin}/api/v1/collectivex/runs/${right.run.run_id}?version=1`,
        body: right,
        status: 200,
      },
    ],
    expected,
  };
}

const left = collectivexDataset(COLLECTIVEX_IDS[0]);
const right = collectivexDataset(COLLECTIVEX_IDS[1], 10);
const zeroLeft = collectivexDataset(COLLECTIVEX_IDS[0], 0);
const kvLeft = collectivexKvDataset(COLLECTIVEX_IDS[0]);
const kvRight = collectivexKvDataset(COLLECTIVEX_IDS[1], 2);
const topologyMismatch = structuredClone(right);
topologyMismatch.series[0].system.nodes = 2;
const oneRunList = {
  version: 1,
  discovery_complete: true,
  runs: [left.run],
};
const discoveryList = {
  version: 1,
  discovery_complete: false,
  runs: [right.run, { ...left.run, run_id: '90071992547409930003', measured_cases: 0 }, left.run],
};

export const COLLECTIVEX_BUNDLE_VARIANTS = freeze({
  positive: explicit(left, right, { matched: 1, comparable_pairs: 1 }),
  'zero-denominator': explicit(zeroLeft, right, { matched: 1, comparable_pairs: 1 }),
  'kv-positive': explicit(kvLeft, kvRight, { matched: 1, comparable_pairs: 1 }),
  'topology-mismatch': explicit(left, topologyMismatch, { matched: 0, comparable_pairs: 0 }),
  'one-list': {
    args: ['collectivex', 'compare'],
    responses: [
      { operation: 'openapi.json', url: `${origin}/api/openapi.json`, body: schema, status: 200 },
      {
        operation: 'runs',
        url: `${origin}/api/v1/collectivex/runs?version=1`,
        body: discoveryList,
        status: 200,
      },
      {
        operation: COLLECTIVEX_IDS[0],
        url: `${origin}/api/v1/collectivex/runs/${COLLECTIVEX_IDS[0]}?version=1`,
        body: left,
        status: 200,
      },
      {
        operation: COLLECTIVEX_IDS[1],
        url: `${origin}/api/v1/collectivex/runs/${COLLECTIVEX_IDS[1]}?version=1`,
        body: right,
        status: 200,
      },
    ],
    expected: { matched: 1, comparable_pairs: 1 },
  },
  empty: {
    args: ['collectivex', 'compare'],
    responses: [
      { operation: 'openapi.json', url: `${origin}/api/openapi.json`, body: schema, status: 200 },
      {
        operation: 'runs',
        url: `${origin}/api/v1/collectivex/runs?version=1`,
        body: oneRunList,
        status: 200,
      },
    ],
    expected: { matched: 0, comparable_pairs: 0 },
  },
});
