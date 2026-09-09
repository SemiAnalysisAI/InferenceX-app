import { at, entries, number, ROLES, rows, text, type Bundle, type Json } from './bundle';

export interface TradeoffRun {
  bundle: Pick<Bundle, 'manifest' | 'result' | 'manifestSha256'>;
  exportRun: string;
  artifact: string;
}
export type LatencyAxis = 'p90' | 'median';
export type EfficiencyAxis = 'dollar' | 'clipsGpu' | 'secondsGpu' | 'energy';
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

export function tradeoffPoints(run: TradeoffRun) {
  const b = run.bundle,
    result = b.result;
  if (
    at(result, 'schema_version') !== '1.0.0' ||
    at(result, 'bundle_type') !== 'h3_benchmark_result'
  )
    return [];
  const plan = at(result, 'workload', 'plan');
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
  const group = completeWorkload ? canonical(workload) : `unknown:${b.manifestSha256}`;
  const workloadLabel = [
    `${number(at(generation, 'width')) ?? '?'} × ${number(at(generation, 'height')) ?? '?'}`,
    `${number(at(generation, 'duration_seconds')) ?? '?'} s`,
    `${number(at(generation, 'fps')) ?? '?'} fps`,
    `${number(at(generation, 'num_inference_steps')) ?? '?'} steps`,
    text(at(plan, 'plan_id')),
  ].join(' · ');
  return ROLES.map((role) => {
    const metrics = at(result, 'roles', role, 'metrics');
    const records = rows(at(result, 'roles', role, 'records')).filter(
      (r) => at(r, 'phase') === 'measurement',
    );
    const valid = records.filter(
      (r) => at(r, 'status') === 'succeeded' && at(r, 'media', 'valid') === true,
    );
    const count = number(at(metrics, 'completion', 'valid'));
    const scheduled = number(at(metrics, 'completion', 'scheduled'));
    const accounted =
      count !== null && count === valid.length && scheduled !== null && scheduled >= count;
    const times = valid.map((r) => positive(at(r, 'submit_to_media_seconds')));
    const latencies =
      accounted && times.every((n): n is number => n !== null) ? times.sort((a, z) => a - z) : [];
    const durations = valid.map((r) => positive(at(r, 'media', 'video', 'duration_seconds')));
    const wall = positive(at(metrics, 'measurement', 'wall_seconds'));
    const rate =
      accounted && wall !== null && at(metrics, 'status') === 'valid'
        ? (count! * 3600) / wall
        : null;
    const secondsRate =
      rate !== null && wall !== null && durations.every((n): n is number => n !== null)
        ? (durations.reduce((sum, n) => sum + n, 0) * 3600) / wall
        : null;
    const phase = at(result, 'roles', role, 'power', 'phases', 'measurement');
    const energy =
      at(phase, 'valid') === true
        ? positive(at(phase, 'aggregate', 'joules_per_valid_clip'))
        : null;
    const devices = rows(at(result, 'hardware', 'devices'));
    return {
      id: `${b.manifestSha256}:${role}`,
      role,
      run,
      group,
      workloadLabel,
      completeWorkload: Boolean(completeWorkload),
      sourceId: text(at(b.manifest, 'run_id')),
      model: text(at(plan, 'model_id')),
      modelRevision: text(at(plan, 'model_revision')),
      hardware: [...new Set(devices.map((d) => text(at(d, 'name'))).filter(Boolean))].join(', '),
      revision: text(at(result, 'execution', 'runtime', role, 'revision')),
      concurrency: number(at(metrics, 'measurement', 'concurrency')),
      boundary: text(at(metrics, 'measurement', 'boundary')),
      allocated: positive(at(result, 'hardware', 'reserved_gpu_count')),
      participating: positive(at(result, 'hardware', 'selected_gpu_count')),
      latencies,
      rate,
      secondsRate,
      energy,
      scheduled,
      valid: count,
      completed: number(at(metrics, 'completion', 'completed')),
      failed: number(at(metrics, 'completion', 'failed')),
      wall,
      power: at(phase, 'valid') === true ? number(at(phase, 'aggregate', 'avg_power_w')) : null,
      powerWindow: at(phase, 'valid') === true ? number(at(phase, 'duration_seconds')) : null,
      server: at(result, 'workload', 'server'),
      fidelity: at(result, 'paired_fidelity'),
      policy: at(result, 'policy'),
    };
  });
}
export type TradeoffPoint = ReturnType<typeof tradeoffPoints>[number];

export function latencyValue(point: TradeoffPoint, axis: LatencyAxis): number | null {
  const a = point.latencies;
  // Ten samples is a display floor, not statistical or release qualification.
  if (axis === 'p90') return a.length >= 10 ? a[Math.ceil(a.length * 0.9) - 1] : null;
  if (a.length === 0) return null;
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
  if (axis === 'clipsGpu' && point.rate !== null && point.allocated !== null)
    value = point.rate / point.allocated;
  if (axis === 'secondsGpu' && point.secondsRate !== null && point.allocated !== null)
    value = point.secondsRate / point.allocated;
  if (axis === 'energy' && point.energy !== null) value = 3600000 / point.energy;
  return value !== null && Number.isFinite(value) ? value : null;
}
