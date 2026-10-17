import { at, entries, number, ROLES, rows, text, type Bundle, type Json } from './bundle';
import { isNativeH3, servingCells } from './serving';
import { allocatedGpus } from './allocation';
import { nativeHardware } from './hardware';
import { powerLimitComparison } from './power-limit';
import { serverTimingSummary } from './server-timing';

export interface TradeoffRun {
  bundle: Pick<Bundle, 'manifest' | 'result' | 'manifestSha256'> &
    Partial<Pick<Bundle, 'documents' | 'checksums' | 'ci'>>;
  exportRun: string;
  artifact: string;
}
export type LatencyAxis = 'p90' | 'median';
export type EfficiencyAxis =
  | 'dollar'
  | 'clipsGpu'
  | 'secondsGpu'
  | 'clipsAllocatedGpu'
  | 'secondsAllocatedGpu'
  | 'energy';
export interface DeploymentCost {
  hourly: string;
  source: string;
  date: string;
}

function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const positive = (value: Json) => {
  const n = number(value);
  return n !== null && n > 0 ? n : null;
};

function workloadInfo(plan: Json, identity: string, semantics: Json) {
  const workload = Object.fromEntries(
    entries(plan).filter(([key]) => !['plan_id', 'repetitions', 'warmup_runs'].includes(key)),
  );
  const generation = at(plan, 'generation');
  const cases = rows(at(plan, 'cases'));
  const completeWorkload =
    text(at(plan, 'model_id')) &&
    text(at(plan, 'model_revision')) &&
    ['width', 'height', 'duration_seconds', 'fps', 'num_inference_steps'].every(
      (key) => positive(at(generation, key)) !== null,
    ) &&
    cases.length > 0 &&
    cases.every((item) => text(at(item, 'prompt')) && Number.isInteger(number(at(item, 'seed'))));
  const group = completeWorkload ? canonical({ plan: workload, semantics }) : `unknown:${identity}`;
  const workloadLabel = [
    `${number(at(generation, 'width')) ?? '?'} × ${number(at(generation, 'height')) ?? '?'}`,
    `${number(at(generation, 'duration_seconds')) ?? '?'} s`,
    `${number(at(generation, 'fps')) ?? '?'} fps`,
    `${number(at(generation, 'num_inference_steps')) ?? '?'} steps`,
    `${text(at(plan, 'model_id'))} @ ${text(at(plan, 'model_revision')).slice(0, 12)}`,
    `seed ${cases.map((item) => number(at(item, 'seed')) ?? '?').join(', ')}`,
    text(at(cases[0], 'prompt')).slice(0, 80),
  ].join(' · ');
  return {
    group,
    workloadLabel,
    workload,
    completeWorkload: Boolean(completeWorkload),
    model: text(at(plan, 'model_id')),
    modelRevision: text(at(plan, 'model_revision')),
  };
}

function measurementInfo(
  recordsInput: Json,
  completion: Json,
  measurement: Json,
  validStatus: boolean,
) {
  const records = rows(recordsInput).filter((r) => at(r, 'phase') === 'measurement');
  const valid = records.filter(
    (r) => at(r, 'status') === 'succeeded' && at(r, 'media', 'valid') === true,
  );
  const count = number(at(completion, 'valid'));
  const scheduled = number(at(completion, 'scheduled'));
  const accounted =
    count !== null && count === valid.length && scheduled !== null && scheduled >= count;
  const times = valid.map((r) => positive(at(r, 'submit_to_media_seconds')));
  const latencies =
    accounted && times.every((n): n is number => n !== null) ? times.sort((a, z) => a - z) : [];
  const durations = valid.map((r) => positive(at(r, 'media', 'video', 'duration_seconds')));
  const wall = positive(at(measurement, 'wall_seconds'));
  const rate = accounted && wall !== null && validStatus ? (count! * 3600) / wall : null;
  const secondsRate =
    rate !== null && wall !== null && durations.every((n): n is number => n !== null)
      ? (durations.reduce((sum, n) => sum + n, 0) * 3600) / wall
      : null;
  return {
    latencies,
    wall,
    rate,
    secondsRate,
    scheduled,
    valid: count,
    completed: number(at(completion, 'completed')),
    failed: number(at(completion, 'failed')),
  };
}

/**
 * The harness summary stands in for the per-request population only when the
 * run recorded no client latency at all (srt-client records without timings).
 * A partially recorded population still yields nothing, never a fast subset.
 */
function summaryMetrics(run: Json, complete: boolean) {
  const records = rows(at(run, 'records')).filter((r) => at(r, 'phase') === 'measurement');
  if (
    !complete ||
    records.length === 0 ||
    records.some((r) => number(at(r, 'submit_to_media_seconds')) !== null)
  )
    return null;
  const perSecond = positive(at(run, 'summary', 'valid_clips_per_second'));
  return {
    median: positive(at(run, 'summary', 'latency_median_seconds')),
    rate: perSecond === null ? null : perSecond * 3600,
  };
}

/** InferenceX's aggregate and window sidecars, when published, must not contradict the power document. */
const agreesPowerValid = (document: Json) => {
  const valid = at(document, 'power_valid');
  return valid === null || valid === true || valid === 1;
};
const energyPerClip = (document: Json) => {
  const normalization = at(document, 'energy_normalization');
  return normalization === null || normalization === 'clips';
};

function pairedTradeoffPoints(run: TradeoffRun) {
  const b = run.bundle,
    result = b.result;
  if (
    at(result, 'schema_version') !== '1.0.0' ||
    at(result, 'bundle_type') !== 'h3_benchmark_result'
  )
    return [];
  return ROLES.map((role) => {
    const metrics = at(result, 'roles', role, 'metrics');
    const phase = at(result, 'roles', role, 'power', 'phases', 'measurement');
    const measurement = measurementInfo(
      at(result, 'roles', role, 'records'),
      at(metrics, 'completion'),
      at(metrics, 'measurement'),
      at(metrics, 'status') === 'valid',
    );
    const energy =
      at(phase, 'valid') === true
        ? positive(at(phase, 'aggregate', 'joules_per_valid_clip'))
        : null;
    const devices = rows(at(result, 'hardware', 'devices'));
    const limits = at(result, 'hardware', 'configured_power_limits', 'by_role', role);
    const powerLimit = powerLimitComparison(
      phase,
      at(limits, 'before'),
      at(limits, 'after'),
      at(result, 'hardware', 'gpu_uuids'),
      at(result, 'definitions', 'gpu_power', 'unit'),
    );
    return {
      id: `${b.manifestSha256}:${role}`,
      role,
      cellId: undefined,
      run,
      ...workloadInfo(at(result, 'workload', 'plan'), b.manifestSha256, {
        boundary: at(metrics, 'measurement', 'boundary'),
        mode: 'paired_serial',
      }),
      ...measurement,
      medianSeconds: null,
      samples: measurement.latencies.length,
      sourceId: text(at(b.manifest, 'run_id')),
      hardware: [...new Set(devices.map((d) => text(at(d, 'name'))).filter(Boolean))].join(', '),
      revision: text(at(result, 'execution', 'runtime', role, 'revision')),
      concurrency: number(at(metrics, 'measurement', 'concurrency')),
      boundary: text(at(metrics, 'measurement', 'boundary')),
      allocated: positive(at(result, 'hardware', 'reserved_gpu_count')),
      participating: positive(at(result, 'hardware', 'selected_gpu_count')),
      replicas: positive(at(result, 'execution', 'deployment', 'replica_count')),
      energy,
      powerLimit,
      timing: serverTimingSummary(null, false),
      power: at(phase, 'valid') === true ? number(at(phase, 'aggregate', 'avg_power_w')) : null,
      powerWindow: at(phase, 'valid') === true ? number(at(phase, 'duration_seconds')) : null,
      server: at(result, 'workload', 'server'),
      fidelity: at(result, 'paired_fidelity'),
      policy: at(result, 'policy'),
    };
  });
}
function servingTradeoffPoints(run: TradeoffRun) {
  const b = run.bundle;
  if (!b.documents || !b.checksums) return [];
  const documents = b.documents;
  const cells = servingCells({
    documents,
    checksums: b.checksums,
    manifest: b.manifest,
    ci: b.ci ?? null,
  });
  const native = isNativeH3(b.manifest);
  const allocated = allocatedGpus(b);
  return cells.map((item) => {
    const measurement = at(item.run, 'measurement');
    const server = at(item.spec, 'server');
    const mode = at(item.run, 'serving', 'mode');
    const boundary = at(measurement, 'boundary');
    const complete =
      at(item.cell, 'verified') === true &&
      at(item.job, 'measurement_verified') === true &&
      at(item.run, 'status') === 'complete';
    const metrics = measurementInfo(
      at(item.run, 'records'),
      at(item.run, 'summary'),
      measurement,
      complete,
    );
    const summary = native ? summaryMetrics(item.run, complete) : null;
    const latencies = complete ? metrics.latencies : [];
    const median = summary?.median ?? null;
    const phase = at(item.power, 'phases', 'measurement');
    const aggregate = native ? (documents.get(`gpu/${item.id}/aggregate.json`) ?? null) : null;
    const recordedHardware = native
      ? nativeHardware(b.ci ?? null, text(at(aggregate, 'cluster')))
      : '';
    const window = native
      ? (documents.get(`gpu/${item.id}/benchmark_concurrency_${item.concurrency}.json`) ?? null)
      : null;
    // Native power carries its verdict in three places; any dissent reads as not measured.
    const powerValid =
      complete &&
      at(phase, 'valid') === true &&
      number(at(phase, 'valid_clips')) === metrics.valid &&
      (!native ||
        (at(item.power, 'valid') === true &&
          at(item.job, 'power', 'valid') === true &&
          agreesPowerValid(aggregate) &&
          agreesPowerValid(window)));
    const uuids = rows(at(item.spec, 'gpu_uuids')).map(text).filter(Boolean);
    const devices = rows(at(item.job, 'roles', 'baseline', 'gpu_before', 'gpus')).filter((d) =>
      uuids.includes(text(at(d, 'uuid'))),
    );
    const info = workloadInfo(at(item.run, 'plan'), `${b.manifestSha256}:${item.id}`, {
      boundary,
      mode,
      server: Object.fromEntries(
        entries(server).filter(
          ([key]) =>
            ![
              'tp_size',
              'ulysses_degree',
              'encoder_parallel',
              'dit_cpu_offload',
              'attention_backend',
            ].includes(key),
        ),
      ),
    });
    return {
      id: `${b.manifestSha256}:${item.id}`,
      cellId: item.id,
      role: 'serving' as const,
      run,
      ...info,
      ...metrics,
      latencies,
      medianSeconds: median,
      rate: metrics.rate ?? summary?.rate ?? null,
      // The summary median describes every valid clip, so that count is its sample size.
      samples: latencies.length > 0 ? latencies.length : median === null ? 0 : (metrics.valid ?? 0),
      completeWorkload:
        info.completeWorkload &&
        complete &&
        mode === 'closed_loop' &&
        boundary === 'submit_to_downloaded_media',
      sourceId: text(at(b.manifest, 'run_id')),
      hardware:
        [...new Set(devices.map((d) => text(at(d, 'name'))).filter(Boolean))].join(', ') ||
        recordedHardware,
      // The receipt's spec seals the served runtime; the client record names it only on the legacy path.
      revision:
        (native ? text(at(item.spec, 'baseline', 'revision')) : '') ||
        text(at(item.run, 'configuration', 'runtime_revision')),
      concurrency: item.concurrency,
      boundary: text(boundary),
      // srt-slurm plans telemetry for every GPU the job holds, so the expected count is the allocation.
      allocated: allocated ?? (native ? positive(at(item.power, 'expected_gpu_count')) : null),
      participating: uuids.length > 0 && new Set(uuids).size === uuids.length ? uuids.length : null,
      replicas: positive(at(b.result, 'execution', 'deployment', 'replica_count')),
      energy:
        powerValid && energyPerClip(aggregate) && energyPerClip(window)
          ? positive(at(phase, 'aggregate', 'joules_per_valid_clip'))
          : null,
      power: powerValid ? number(at(phase, 'aggregate', 'avg_power_w')) : null,
      powerWindow: powerValid ? number(at(phase, 'duration_seconds')) : null,
      powerLimit: powerValid
        ? powerLimitComparison(
            phase,
            at(item.job, 'roles', 'baseline', 'power_configuration_before'),
            at(item.job, 'roles', 'baseline', 'power_configuration_after'),
            at(item.spec, 'gpu_uuids'),
            at(item.power, 'semantics', 'power_unit'),
          )
        : null,
      server,
      timing: serverTimingSummary(item.run, complete),
      fidelity: null,
      policy: at(item.spec, 'policy'),
    };
  });
}

export type TradeoffPoint =
  | ReturnType<typeof pairedTradeoffPoints>[number]
  | ReturnType<typeof servingTradeoffPoints>[number];

export function tradeoffPoints(run: TradeoffRun): TradeoffPoint[] {
  const serving = servingTradeoffPoints(run);
  return serving.length > 0 ? serving : pairedTradeoffPoints(run);
}

export function tradeoffCurves<T extends TradeoffPoint & { x: number; y: number }>(
  points: T[],
): Record<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const p of points) {
    if (!p.hardware || !p.revision) continue;
    const key = canonical({
      workload: p.group,
      hardware: p.hardware,
      revision: p.revision,
      role: p.role,
      allocated: p.allocated,
      participating: p.participating,
      server: p.server,
      enforcedPowerLimitWatts: p.powerLimit?.watts ?? null,
    });
    const group = groups.get(key);
    if (group) group.push(p);
    else groups.set(key, [p]);
  }
  return Object.fromEntries(
    [...groups.values()].flatMap((group, index) => {
      const curve = group.toSorted((a, b) => a.x - b.x);
      return curve.length > 1 ? [[`curve-${index}`, curve]] : [];
    }),
  );
}

export function latencyValue(point: TradeoffPoint, axis: LatencyAxis): number | null {
  const a = point.latencies;
  // Ten samples is a display floor, not statistical or release qualification.
  if (axis === 'p90') return a.length >= 10 ? a[Math.ceil(a.length * 0.9) - 1] : null;
  if (a.length === 0) return point.medianSeconds;
  const middle = Math.floor(a.length / 2);
  return a.length % 2 ? a[middle] : (a[middle - 1] + a[middle]) / 2;
}
export function costValue(cost?: DeploymentCost): number | null {
  if (!cost || !cost.source.trim() || !/^\d{4}-\d{2}-\d{2}$/u.test(cost.date)) return null;
  const date = new Date(`${cost.date}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== cost.date)
    return null;
  const n = Number(cost.hourly);
  return Number.isFinite(n) && n > 0 ? n : null;
}
export function efficiencyValue(
  point: TradeoffPoint,
  axis: EfficiencyAxis,
  cost?: DeploymentCost,
): number | null {
  let value: number | null = null;
  if (axis === 'dollar') {
    const hourly = costValue(cost);
    if (point.rate !== null && hourly !== null) value = point.rate / hourly;
  }
  const gpuCount =
    axis === 'clipsAllocatedGpu' || axis === 'secondsAllocatedGpu'
      ? point.allocated
      : point.participating;
  if (
    (axis === 'clipsGpu' || axis === 'clipsAllocatedGpu') &&
    point.rate !== null &&
    gpuCount !== null &&
    Number.isSafeInteger(gpuCount) &&
    gpuCount > 0
  )
    value = point.rate / gpuCount;
  if (
    (axis === 'secondsGpu' || axis === 'secondsAllocatedGpu') &&
    point.secondsRate !== null &&
    gpuCount !== null &&
    Number.isSafeInteger(gpuCount) &&
    gpuCount > 0
  )
    value = point.secondsRate / gpuCount;
  if (axis === 'energy' && point.energy !== null) value = 3600000 / point.energy;
  return value !== null && Number.isFinite(value) ? value : null;
}
