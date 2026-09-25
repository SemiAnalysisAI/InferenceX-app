/**
 * Compact kernel timelines: the runner's median-replay timeline and per-kernel summary
 * (`metrics.profile`) reduced to what the case drill-down draws. Pure.
 */

type Obj = Record<string, unknown>;

/** Timeline kernel names are cut at 120 characters, `void ` included, before it is stripped. */
const TIMELINE_NAME_MAX = 115;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** What a kernel does, from its name; the drill-down colors by it. */
export const KERNEL_CATEGORIES = [
  { id: 'gemm', label: 'GEMM' },
  { id: 'expert-gemm', label: 'Expert GEMM' },
  { id: 'quantize', label: 'Quantize' },
  { id: 'activation', label: 'Activation' },
  { id: 'routing', label: 'Routing' },
  { id: 'reduce', label: 'Reduce' },
  { id: 'memory', label: 'Elementwise / memory' },
  { id: 'other', label: 'Other' },
] as const;

export type KernelCategory = (typeof KERNEL_CATEGORIES)[number]['id'];

/**
 * First match wins, so the specific rules come first: a split-K reduce named `_gemm_…
 * reduce_kernel` is a reduce, a `QuantGemm` is a GEMM, `router_gemm` is a GEMM.
 * Mangled names are matched as-is; their identifiers survive mangling.
 */
const CATEGORY_RULES: [KernelCategory, RegExp][] = [
  ['expert-gemm', /fused_moe|fmoe|moe_gemm|gemm_moe|marlin_moe|moe_wna16|^_matmul_/i],
  ['reduce', /reduce|moe_sum|combine/i],
  ['quantize', /quant(?!gemm)|cvt_fp\d+_to_fp\d|scale_1x128/i],
  ['activation', /act_and_mul|silu|gelu|sigmoid|swiglu|situ_and_mul/i],
  ['routing', /topk|gating|softmax|align_block|sort|expert_count|scatter|gather|index/i],
  [
    'gemm',
    /gemm|nvjet|^cijk_|cutlass|marlin|matmul|cublas|wvsplitk|dotprod|hipblaslt|xdl|mfma|wmma/i,
  ],
  ['memory', /elementwise|copy|fill|memset|memcpy|rocclr|ragged_tensor|triton_poi/i],
];

export function kernelCategory(name: string): KernelCategory {
  return CATEGORY_RULES.find(([, re]) => re.test(name))?.[0] ?? 'other';
}

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
  /** Category of each name, parallel to `names`. */
  categories: KernelCategory[];
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
    categories: names.map(kernelCategory),
    events,
    kernels,
    truncated: launched > events.length + 0.5,
  };
}
