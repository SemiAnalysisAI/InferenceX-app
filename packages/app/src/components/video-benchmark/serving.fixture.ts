import type { Bundle, Json } from './bundle';

const hash = (name: string) => name.padEnd(64, '0');

// Synthetic contract data, shaped after the C1/C2/C4 backend artifact.
export function servingFixture(
  runId = '123',
  hardware = 'NVIDIA H200',
  requests = 4,
): Pick<Bundle, 'documents' | 'checksums' | 'manifest' | 'ci'> {
  const plan = {
    model_id: 'MiniMaxAI/MiniMax-H3',
    model_revision: 'a'.repeat(40),
    generation: {
      duration_seconds: 4,
      width: 1344,
      height: 768,
      fps: 24,
      frame_count: 107,
      num_inference_steps: 50,
      aspect_ratio: '16:9',
      audio_sample_rate_hz: 32000,
      audio_channels: 2,
      flow_shift: 12,
      audio_flow_shift: 3,
    },
    cases: [{ case_id: 'drum-taps', prompt: 'A drummer taps a snare drum.', seed: 11 }],
    repetitions: requests,
    warmup_runs: 1,
  };
  const runtime = {
    revision: 'b'.repeat(40),
    source: '/runtime/sglang',
    python: '/usr/bin/python3',
  };
  const devices = ['GPU-first', 'GPU-second'];
  const documents = new Map<string, Json>();
  const checksums = new Map<string, string>();
  const save = (path: string, value: Json, digest: string) => {
    documents.set(path, structuredClone(value));
    checksums.set(path, digest);
  };
  const cells = [1, 2, 4].map((concurrency) => {
    const root = `gpu/c${concurrency}`;
    const latencies = Array.from(
      { length: requests },
      (_, i) => Math.min(i + 1, concurrency) * 120,
    );
    const median =
      (latencies[Math.floor((requests - 1) / 2)] + latencies[Math.ceil((requests - 1) / 2)]) / 2;
    const serving = {
      concurrency,
      mode: 'closed_loop',
      capacity_qualified: false,
      peak_client_in_flight: concurrency,
      valid_video_seconds_per_second: 107 / 24 / 120,
      client_ready_latency_seconds: {
        p50: median,
        p90: requests >= 10 ? latencies[Math.ceil(requests * 0.9) - 1] : null,
        p95: null,
        sample_count: requests,
        values: latencies,
      },
    };
    const measurement = {
      concurrency,
      boundary: 'submit_to_downloaded_media',
      wall_seconds: requests * 120,
      warmup_runs: 1,
      warmup_qualified: true,
    };
    const completion = {
      scheduled: requests,
      attempted: requests,
      completed: requests,
      valid: requests,
      failed: 0,
      not_started: 0,
    };
    const phases = {
      measurement: {
        valid: true,
        valid_clips: requests,
        duration_seconds: requests * 120,
        aggregate: {
          avg_power_w: 1400,
          energy_j: 168000 * requests,
          joules_per_valid_clip: 168000,
        },
      },
    };
    const runHash = hash(`a${concurrency}`),
      jobHash = hash(`b${concurrency}`),
      powerHash = hash(`c${concurrency}`),
      specHash = hash(`d${concurrency}`);
    const runPath = `${root}/baseline/run.json`;
    const records = [
      'warmup-001',
      ...Array.from(
        { length: requests },
        (_, i) => `measurement-r${String(i + 1).padStart(3, '0')}-c001`,
      ),
    ].map((slot, index) => {
      const mediaHash = hash(`e${concurrency}${index}`);
      checksums.set(`${root}/baseline/artifacts/${slot}.mp4`, mediaHash);
      return {
        slot_id: slot,
        phase: index === 0 ? 'warmup' : 'measurement',
        status: 'succeeded',
        attempted: true,
        artifact_path: `artifacts/${slot}.mp4`,
        sha256: mediaHash,
        submit_to_media_seconds: index === 0 ? 120 : latencies[index - 1],
        media: { valid: true, video: { duration_seconds: 107 / 24 } },
      };
    });
    save(
      runPath,
      {
        bundle_type: 'mvp_run',
        bundle_version: '0.1.0',
        evidence_kind: 'operator_endpoint',
        status: 'complete',
        plan,
        plan_sha256: hash('f'),
        measurement,
        serving,
        records,
        configuration: {
          runtime_revision: runtime.revision,
          model_revision: plan.model_revision,
          serving,
        },
        summary: { ...completion, valid_clips_per_second: 1 / 120 },
      },
      runHash,
    );
    save(
      `${root}/spec.json`,
      {
        plan,
        gpu_uuids: devices,
        baseline: runtime,
        serving,
        server: {
          tp_size: 1,
          ulysses_degree: 2,
          dit_cpu_offload: false,
          performance_mode: 'speed',
          encoder_parallel: 'auto',
        },
      },
      specHash,
    );
    save(
      `${root}/gpu-job.json`,
      {
        schema_version: '0.1.0',
        bundle_type: 'controlled_serving_smoke',
        job_id: `github-${runId}-1-c${concurrency}`,
        spec_sha256: specHash,
        plan_sha256: hash('f'),
        status: 'complete',
        measurement_verified: true,
        cleanup_status: 'clean',
        evidence_kind: 'controlled_h3_gpu',
        roles: {
          baseline: {
            run_path: 'baseline/run.json',
            run_sha256: runHash,
            gpu_before: { gpus: devices.map((uuid) => ({ uuid, name: hardware })) },
            telemetry_summary: {
              gpu_identity: devices.map((uuid) => ({ uuid, name: hardware })),
            },
          },
        },
      },
      jobHash,
    );
    save(`${root}/power.json`, { schema_version: '1.0.0', phases }, powerHash);
    return {
      concurrency,
      status: 'complete',
      verified: true,
      completion,
      metrics: {
        measurement,
        serving,
        client_ready_p50_seconds: serving.client_ready_latency_seconds.p50,
        valid_clips_per_second: 1 / 120,
      },
      run: { path: runPath, sha256: runHash },
      receipt: { path: `${root}/gpu-job.json`, sha256: jobHash },
      power: { path: `${root}/power.json`, sha256: powerHash, phases },
    };
  });
  save(
    'serving-smoke.json',
    {
      schema_version: '1.0.0',
      bundle_type: 'h3_serving_smoke_matrix',
      status: 'complete',
      plan,
      runtime,
      gpu_uuids: devices,
      cells,
    },
    hash('f1'),
  );
  return structuredClone({
    documents,
    checksums,
    manifest: {
      mode: 'serving-smoke',
      run_id: runId,
      run_attempt: '1',
      git_commit: 'c'.repeat(40),
      workload_plan: plan,
      evidence: { 'serving-smoke.json': hash('f1') },
    },
    ci: {
      mode: 'serving-smoke',
      run_id: runId,
      run_attempt: '1',
      source_sha: 'c'.repeat(40),
      slurm_job: { AllocTRES: 'cpu=32,mem=512G,node=1,gres/gpu=2' },
    },
  });
}
