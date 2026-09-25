/**
 * Compact kernel timelines: the runner's median-replay timeline and per-kernel summary
 * (`metrics.profile`) reduced to what the case drill-down draws. Pure.
 */

type Obj = Record<string, unknown>;

/** Timeline kernel names are cut at 120 characters, `void ` included, before it is stripped. */
const TIMELINE_NAME_MAX = 115;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Per-call totals of one kernel over the profiled replays. */
export interface TimelineKernel {
  /** Index into `OperatorXTimeline.names`. */
  name: number;
  usPerCall: number;
  countPerCall: number;
  grid: number[] | null;
  block: number[] | null;
  regs: number | null;
  smemBytes: number | null;
  occupancyPct: number | null;
}

export interface OperatorXTimeline {
  spanUs: number;
  busyUs: number;
  gapUs: number;
  overlapUs: number;
  /** Stream (or TPU lane) labels; events refer to them by index. */
  lanes: string[];
  /** Distinct kernel names; events and kernels refer to them by index. */
  names: string[];
  /** `[name, lane, startUs, durUs]`, op-relative, sorted by start. */
  events: [number, number, number, number][];
  /** Longest first. */
  kernels: TimelineKernel[];
  /** The runner caps the timeline; true when the replay launched more kernels than it kept. */
  truncated: boolean;
}

const dims = (v: unknown): number[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === 'number') ? (v as number[]) : null;

/** The drill-down timeline of one result's metrics, or null when it was not profiled. */
export function compactTimeline(metrics: Obj | null | undefined): OperatorXTimeline | null {
  const p = metrics && isObj(metrics.profile) ? metrics.profile : null;
  if (!p || !Array.isArray(p.timeline) || p.timeline.length === 0) return null;
  const names: string[] = [];
  const nameIndex = new Map<string, number>();
  // The runner cuts timeline names at 120 characters and kernel-table names at 200, so
  // the two are matched on that prefix and the longer spelling is kept.
  const intern = (raw: unknown) => {
    const name = String(raw ?? '').replace(/^void /, '');
    const key = name.slice(0, TIMELINE_NAME_MAX);
    let i = nameIndex.get(key);
    if (i === undefined) {
      i = names.length;
      nameIndex.set(key, i);
      names.push(name);
    } else if (name.length > names[i].length) names[i] = name;
    return i;
  };
  const lanes: string[] = [];
  const laneIndex = new Map<string, number>();
  const events: OperatorXTimeline['events'] = [];
  for (const e of p.timeline) {
    if (!isObj(e)) continue;
    const start = num(e.start_us);
    const dur = num(e.dur_us);
    if (start === null || dur === null) continue;
    const lane = String(e.stream ?? '0');
    if (!laneIndex.has(lane)) {
      laneIndex.set(lane, lanes.length);
      lanes.push(lane);
    }
    events.push([intern(e.name), laneIndex.get(lane)!, start, dur]);
  }
  if (events.length === 0) return null;
  events.sort((a, b) => a[2] - b[2]);
  const kernels: TimelineKernel[] = (Array.isArray(p.kernels) ? p.kernels : [])
    .filter(isObj)
    .map((k) => ({
      name: intern(k.name),
      usPerCall: num(k.us_per_call) ?? 0,
      countPerCall: num(k.count_per_call) ?? 0,
      grid: dims(k.grid),
      block: dims(k.block),
      regs: num(k.regs),
      smemBytes: num(k.smem),
      occupancyPct: num(k.occupancy_pct),
    }));
  const launched = kernels.reduce((n, k) => n + k.countPerCall, 0);
  const spanUs = num(p.span_us) ?? Math.max(...events.map((e) => e[2] + e[3]));
  return {
    spanUs,
    busyUs: num(p.busy_us) ?? spanUs,
    gapUs: num(p.gap_us) ?? 0,
    overlapUs: num(p.overlap_us) ?? 0,
    lanes,
    names,
    events,
    kernels,
    truncated: launched > events.length + 0.5,
  };
}
