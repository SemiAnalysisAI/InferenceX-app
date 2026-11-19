import { describe, expect, it } from 'vitest';

import { parseEngineLog, parsePythonLiteral, parseSrtctlSweepLog } from './launch-record';

const DISAGG_SWEEP = [
  'Container: /squash/nvcr.io_nvidia_tensorrt-llm_release_1.4.0rc2_sha256_93a3.sqsh',
  ' + srtctl==0.0.0.post1+unknown.gae3d6877c.d20261031 (from file:///checkout)',
  '2026-10-31 01:42:06 [INFO] Loaded config: inferencex-gb300-nv_19',
  '  Nodes: 2 (im-c001, im-c002)',
  '  CPU hardware: ARM CPU implementer 0x41 part 0xd4f (144 logical, aarch64)',
  '  GPUs: 8 backend / 8 configured (4/node, gb300)',
  '2026-10-31 01:42:12 [INFO] Starting service etcd (etcd) on im-c001: /configs/etcd --data-dir /tmp/etcd',
  '2026-10-31 01:42:13 [INFO] Starting service otel-collector (otel-collector) on im-c001: /configs/otelcol-contrib',
  '2026-10-31 01:45:43 [INFO] Starting trtllm backend workers',
  '2026-10-31 01:45:43 [INFO] Starting prefill worker 0 on 1 nodes (im-c001) with 4 total GPUs (MPI mode)',
  '2026-10-31 01:45:44 [INFO] Env: DYNAMO_VERSION=1.6.0 DYN_REQUEST_PLANE=tcp',
  '2026-10-31 01:45:44 [INFO] Command: trtllm-llmapi-launch python3 -m dynamo.trtllm --disaggregation-mode prefill',
  '2026-10-31 01:45:46 [INFO] Starting decode worker 0 on 2 nodes (im-c002,im-c003) with 8 total GPUs (MPI mode)',
  '2026-10-31 01:45:46 [INFO] Command: trtllm-llmapi-launch python3 -m dynamo.trtllm --disaggregation-mode decode',
  '2026-10-31 01:45:50 [INFO] Starting frontend layer',
  '2026-10-31 01:45:53 [INFO] Starting dynamo frontend 0 on im-c001: python3 -m dynamo.frontend --http-port 8000',
  '2026-10-31 01:45:54 [INFO] Starting service dcgm-exporter (dcgm-exporter) on im-c001: dcgm-exporter -f x.csv',
  '2026-10-31 02:11:51 [INFO] Starting benchmark',
  "2026-10-31 02:11:51 [INFO] Command: bash -lc 'bash /infmax-workspace/benchmarks/srt_agentic.sh'",
].join('\n');

describe('parseSrtctlSweepLog', () => {
  it('pairs each worker with its own env and command and keeps deployment services', () => {
    const launch = parseSrtctlSweepLog(DISAGG_SWEEP);
    expect(launch).toMatchObject({
      container: '/squash/nvcr.io_nvidia_tensorrt-llm_release_1.4.0rc2_sha256_93a3.sqsh',
      srtctl_version: '0.0.0.post1+unknown.gae3d6877c.d20261031',
      recipe: 'inferencex-gb300-nv_19',
      resources: {
        nodes: '2 (im-c001, im-c002)',
        cpu: 'ARM CPU implementer 0x41 part 0xd4f (144 logical, aarch64)',
        gpus: '8 backend / 8 configured (4/node, gb300)',
      },
    });
    expect(launch?.steps).toEqual([
      {
        kind: 'service',
        role: 'etcd',
        index: null,
        hosts: ['im-c001'],
        env: null,
        command: '/configs/etcd --data-dir /tmp/etcd',
      },
      {
        kind: 'worker',
        role: 'prefill',
        index: 0,
        hosts: ['im-c001'],
        env: 'DYNAMO_VERSION=1.6.0 DYN_REQUEST_PLANE=tcp',
        command: 'trtllm-llmapi-launch python3 -m dynamo.trtllm --disaggregation-mode prefill',
      },
      {
        kind: 'worker',
        role: 'decode',
        index: 0,
        hosts: ['im-c002', 'im-c003'],
        env: null,
        command: 'trtllm-llmapi-launch python3 -m dynamo.trtllm --disaggregation-mode decode',
      },
      {
        kind: 'frontend',
        role: 'dynamo frontend',
        index: 0,
        hosts: ['im-c001'],
        env: null,
        command: 'python3 -m dynamo.frontend --http-port 8000',
      },
      {
        kind: 'benchmark',
        role: 'benchmark',
        index: null,
        hosts: [],
        env: null,
        command: "bash -lc 'bash /infmax-workspace/benchmarks/srt_agentic.sh'",
      },
    ]);
  });

  it('reads single-host workers and strips terminal colors', () => {
    const launch = parseSrtctlSweepLog(
      [
        '2026-11-09 15:12:18 [INFO] Starting agg worker 0 on watchtower-cn07',
        '\u001B[32m2026-11-09 15:12:22 [INFO] Command: vllm serve m --port 6100\u001B[0m',
      ].join('\n'),
    );
    expect(launch?.steps).toEqual([
      {
        kind: 'worker',
        role: 'agg',
        index: 0,
        hosts: ['watchtower-cn07'],
        env: null,
        command: 'vllm serve m --port 6100',
      },
    ]);
    expect(launch?.container).toBeNull();
  });

  it('returns null for logs without a recorded worker command', () => {
    expect(parseSrtctlSweepLog('2026-01-01 00:00:00 [INFO] Starting benchmark\n')).toBeNull();
    expect(
      parseSrtctlSweepLog('2026-01-01 00:00:00 [INFO] Starting agg worker 0 on host\n'),
    ).toBeNull();
  });
});

describe('parseEngineLog', () => {
  it('reads vLLM non-default args including nested config objects', () => {
    const facts = parseEngineLog(
      [
        "(APIServer pid=25) INFO 08-26 [api_utils.py:273] non-default args: {'model_tag': 'Qwen/Qwen3.5', 'tensor_parallel_size': 8, 'enable_prefix_caching': False, 'max_num_seqs': 8, 'kernel_config': KernelConfig(monokernel=False, moe_backend='deep_gemm')}",
        'NCCL version 2.32.3+cuda13.4',
      ].join('\n'),
    );
    expect(facts).toEqual({
      engine_args: {
        source: 'vllm-non-default-args',
        args: {
          model_tag: 'Qwen/Qwen3.5',
          tensor_parallel_size: 8,
          enable_prefix_caching: false,
          max_num_seqs: 8,
          kernel_config: { monokernel: false, moe_backend: 'deep_gemm' },
        },
      },
      versions: { nccl: '2.32.3', cuda: '13.4', tensorrt_llm: null },
    });
  });

  it('reads SGLang server args and the TensorRT-LLM banner', () => {
    expect(
      parseEngineLog(
        "[2026-09-18 08:15:26] server_args={'model_path': '/scratch/m', 'mem_fraction_static': 0.82, 'dsv4_attn_backend': None}",
      ).engine_args,
    ).toEqual({
      source: 'sglang-server-args',
      args: { model_path: '/scratch/m', mem_fraction_static: 0.82, dsv4_attn_backend: null },
    });
    expect(parseEngineLog('[TensorRT-LLM] TensorRT LLM version: 1.3.0rc18').versions).toEqual({
      nccl: null,
      cuda: null,
      tensorrt_llm: '1.3.0rc18',
    });
  });

  it('omits engine args whose line is truncated', () => {
    expect(parseEngineLog("non-default args: {'model_tag': 'x', 'port'").engine_args).toBeNull();
  });
});

describe('parsePythonLiteral', () => {
  it('converts tuples, escapes, wrapper calls, and special floats', () => {
    expect(
      parsePythonLiteral(
        `{"a": (1, 2), 'b': 'it\\'s', 'c': PosixPath('/model'), 'd': -1.5e3, 'e': inf, 'f': []}`,
      ),
    ).toEqual({ a: [1, 2], b: "it's", c: '/model', d: -1500, e: 'inf', f: [] });
  });

  it('names enum members by their qualified name', () => {
    expect(
      parsePythonLiteral(
        "{'mode': <CompilationMode.VLLM_COMPILE: 3>, 'cg': <CUDAGraphMode.FULL: (2, 1)>, 'b': AttentionBackendEnum.FLASHMLA}",
      ),
    ).toEqual({
      mode: 'CompilationMode.VLLM_COMPILE',
      cg: 'CUDAGraphMode.FULL',
      b: 'AttentionBackendEnum.FLASHMLA',
    });
  });

  it('rejects trailing text', () => {
    expect(parsePythonLiteral("{'a': 1} extra")).toBeUndefined();
  });
});
