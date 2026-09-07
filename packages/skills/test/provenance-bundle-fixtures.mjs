export function provenanceFixture() {
  const row = {
    id: '421',
    hardware: 'h200_sxm',
    framework: 'vllm',
    model: 'dsr1',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 0,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 1024,
    osl: 1024,
    conc: 32,
    offload_mode: 'off',
    image: 'vllm:sha-123',
    recipe_fingerprint: null,
    metrics: { tput_per_gpu: 128.4, error_rate: 0 },
    date: '2026-08-08',
    workflow_run_id: 17,
    run_started_at: null,
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123456789/attempts/2',
    curve_date: '2026-08-09',
    curve_workflow_run_id: 25,
    curve_run_started_at: '2026-08-09T03:00:00Z',
  };
  const run = {
    github_run_id: 123456789,
    name: 'Benchmark',
    conclusion: 'success',
    run_attempt: 2,
    html_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/123456789',
    created_at: '2026-08-08T03:00:00Z',
    date: '2026-08-08',
  };
  const config = {
    github_run_id: 123456789,
    run_started_at: null,
    html_url: run.html_url,
    head_sha: 'abc123',
    model: 'dsr1',
    hardware: 'h200_sxm',
    framework: 'vllm',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
  };
  const workflow = { runs: [run], changelogs: [], configs: [], runConfigs: [config] };
  const log = {
    id: 421,
    fileName: 'server.log',
    serverLog: 'INFO ready\n',
    offset: 0,
    nextOffset: null,
  };
  return { row, run, config, workflow, log };
}

export function provenanceBundleFixtures() {
  const { row, workflow, log } = provenanceFixture();
  const args = [
    'result',
    'inspect',
    '--id',
    '421',
    '--model',
    'DeepSeek-R1-0528',
    '--date',
    '2026-08-09',
  ];
  const responses = [
    {
      operation: 'benchmarks',
      url: 'https://inferencex.semianalysis.com/api/v1/benchmarks?model=DeepSeek-R1-0528&date=2026-08-09',
      body: [row],
      status: 200,
    },
    {
      operation: 'workflow-info',
      url: 'https://inferencex.semianalysis.com/api/v1/workflow-info?date=2026-08-08',
      body: workflow,
      status: 200,
    },
    {
      operation: 'server-log',
      url: 'https://inferencex.semianalysis.com/api/v1/server-log?id=421&offset=0&limit=16384',
      body: log,
      status: 200,
    },
  ];
  const missingLog = structuredClone(responses);
  missingLog[2] = { ...missingLog[2], status: 404, body: { error: 'Log not found' } };
  return {
    result: {
      'producer-differs-from-curve': {
        args,
        responses,
        expected: { resultId: '421', producerRun: '123456789', producerAttempt: '2' },
      },
      'missing-log': { args, responses: missingLog, expected: { resultId: '421' } },
    },
  };
}
