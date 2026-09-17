import { at, number, text, type Json } from './bundle';

export const SERVER_STAGES = [
  ['server_ready_latency_seconds', 'server_ready_latency_seconds'],
  ['server_prequeue_seconds', 'prequeue_seconds'],
  ['queue_delay_seconds', 'queue_delay_seconds'],
  ['server_execution_seconds', 'execution_seconds'],
  ['server_postprocess_seconds', 'postprocess_seconds'],
] as const;

export const SERVER_TIMING_COPY = {
  en: {
    title: 'Server timing',
    stages: [
      'Received → media ready',
      'Before queue admission',
      'Queue delay',
      'Execution',
      'Postprocessing',
    ],
    coverage: 'Samples / valid clips / missing',
    batch: 'Observed batch sizes',
    replicas: 'Observed replica IDs',
    note: 'Seconds on the server’s monotonic clock, separate from client delivery latency. Percentiles require timing coverage for every valid measured clip; warmup is excluded. P90 requires 10 samples and P95 requires 20.',
    clock:
      'Server stages use time.monotonic_ns within the same Linux boot and time namespace. They exclude client transfer and validation; execution includes server work, not just GPU kernels.',
    status: 'Timing status',
    complete: 'Complete',
    partial: 'Partial',
    unavailable: 'Unavailable',
    identity: 'Request / instance / clock identity',
    layoutNote:
      'Observed batch sizes and replica IDs come from server records. Client concurrency does not establish batching or replica layout.',
  },
  zh: {
    title: '服务端计时',
    stages: ['接收请求 → 媒体就绪', '入队前耗时', '排队时长', '执行时长', '后处理时长'],
    coverage: '计时样本 / 有效视频 / 缺失样本',
    batch: '观测到的 batch size',
    replicas: '观测到的副本 ID',
    note: '单位为秒，使用服务端单调时钟，与客户端交付延迟分开统计。只有正式测量阶段的全部有效视频都有计时数据时才显示分位数；warmup 不计入。P90 至少需要 10 个样本，P95 至少需要 20 个。',
    clock:
      '服务端各阶段使用同一次 Linux 启动、同一时间命名空间内的 time.monotonic_ns 计时，不含客户端传输与校验；执行时长包含服务端工作，不仅是 GPU kernel 时间。',
    status: '计时状态',
    complete: '完整',
    partial: '部分可用',
    unavailable: '无数据',
    identity: '请求 / 实例 / 时钟标识',
    layoutNote:
      '观测到的 batch size 和副本 ID 来自服务端记录，不能用客户端并发数推断 batch size 或副本布局。',
  },
};

const nonnegative = (value: Json) => {
  const n = number(value);
  return n !== null && n >= 0 ? n : null;
};
const count = (value: Json) => {
  const n = nonnegative(value);
  return n !== null && Number.isSafeInteger(n) ? n : null;
};

export function timingDistribution(value: Json, validClips: Json) {
  const samples = count(at(value, 'sample_count'));
  const valid = count(at(value, 'valid_clip_count'));
  const missing = count(at(value, 'missing_count'));
  const values = at(value, 'values');
  if (
    samples === null ||
    valid === null ||
    missing === null ||
    valid !== validClips ||
    samples + missing !== valid ||
    !Array.isArray(values) ||
    values.length !== samples ||
    values.some((v) => nonnegative(v) === null)
  )
    return null;
  const complete = valid > 0 && missing === 0;
  return {
    samples,
    valid,
    missing,
    p50: complete ? nonnegative(at(value, 'p50')) : null,
    p90: complete && samples >= 10 ? nonnegative(at(value, 'p90')) : null,
    p95: complete && samples >= 20 ? nonnegative(at(value, 'p95')) : null,
  };
}

export function observedIntegers(value: Json, minimum: number): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const values = value.map(count);
  return values.every((n): n is number => n !== null && n >= minimum) ? [...new Set(values)] : null;
}

export function serverTimingSummary(run: Json, verified: boolean) {
  const serving = verified ? at(run, 'serving') : null;
  return {
    stages: SERVER_STAGES.map(([key]) =>
      timingDistribution(at(serving, key), at(run, 'summary', 'valid')),
    ),
    batchSizes: observedIntegers(at(serving, 'observed_batch_sizes'), 1),
    replicaIds: observedIntegers(at(serving, 'observed_replica_ids'), 0),
  };
}

export function requestServerTiming(record: Json, verified: boolean) {
  const timing = at(record, 'server_timings');
  if (
    !verified ||
    at(timing, 'schema_version') !== '1.0.0' ||
    at(timing, 'request_id') !== at(record, 'job_id') ||
    !['complete', 'partial'].includes(text(at(timing, 'status'))) ||
    !['request_id', 'instance_id', 'clock_id'].every((key) => text(at(timing, key))) ||
    at(timing, 'clock') !== 'time.monotonic_ns; same Linux boot and time namespace; nanoseconds'
  )
    return null;
  const stages = SERVER_STAGES.map(([, key]) => nonnegative(at(timing, key)));
  if (at(timing, 'status') === 'complete' && stages.some((value) => value === null)) return null;
  return {
    status: text(at(timing, 'status')),
    stages,
    batchSize: observedIntegers([at(timing, 'observed_batch_size')], 1)?.[0] ?? null,
    replicaId: observedIntegers([at(timing, 'replica_id')], 0)?.[0] ?? null,
    identity: ['request_id', 'instance_id', 'clock_id']
      .map((key) => text(at(timing, key)))
      .join(' / '),
  };
}
