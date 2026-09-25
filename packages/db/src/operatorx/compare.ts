/**
 * Cross-hardware comparison: the same cases measured on different GPU pools, aligned by
 * case identity (op args + backend) and grouped into workload sources. Pure; the caller
 * picks which run supplies each pool's results (newest first wins per case).
 */
import { opLabels, usefulBytes, usefulFlops } from './describe';
import { type OperatorXDataset, type OperatorXStatus, stableJson } from './normalize';
import { type WorkloadSource, workloadSources } from './workloads';

export type ComparisonOp = 'gemm' | 'moe';

/** One GPU pool and the run(s) its results came from. */
export interface ComparisonHardware {
  /** Hardware key (h200, b200, mi355x, ...): the entity that is compared and colored. */
  id: string;
  pool: string;
  runs: { runId: string; generatedAt: string }[];
}

/** Arithmetic precision the math runs at, for peak-throughput lookups. */
export type ComputePrecision = 'fp4' | 'fp8' | 'bf16' | 'other';

export interface ComparisonRow {
  /** Case identity shared by the same case on every pool. */
  caseKey: string;
  hardware: string;
  testlist: string;
  workloads: string[];
  shape: string;
  precision: string;
  computePrecision: ComputePrecision;
  /** Primary size axis: GEMM M, MoE tokens. */
  x: number | null;
  dims: Record<string, number>;
  status: OperatorXStatus;
  latencyUs: number | null;
  flops: number | null;
  bytes: number | null;
  kernel: string | null;
  cudaGraph: boolean | null;
  runId: string;
  resultIndex: number;
}

export interface ComparisonWorkload extends WorkloadSource {
  cases: number;
  hardware: string[];
}

export interface Comparison {
  op: ComparisonOp;
  hardware: ComparisonHardware[];
  workloads: ComparisonWorkload[];
  rows: ComparisonRow[];
}

export interface ComparisonInput {
  /** Pool name as the sweep planned it (h200-dgxc, mi355x, ...). */
  pool: string;
  dataset: OperatorXDataset;
}

/** Hardware key of a pool: `h200-dgxc` -> `h200`, `b200-nscale` -> `b200`. */
export function hardwareKey(pool: string): string {
  return pool.split('-')[0];
}

type Args = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const dtypeOf = (v: unknown): string => {
  const d = v && typeof v === 'object' ? (v as Args).dtype : null;
  return typeof d === 'string' ? d : 'bf16';
};

function computePrecision(op: ComparisonOp, a: Args): ComputePrecision {
  const quant =
    op === 'gemm'
      ? [a.a, a.b]
      : (() => {
          const q = ((a.experts ?? {}) as Args).quant as Args | undefined;
          return q ? [q.x, q.w13] : [];
        })();
  const widest = quant.map(dtypeOf);
  if (widest.some((d) => d === 'bf16' || d === 'fp16')) return 'bf16';
  if (widest.some((d) => d === 'e4m3' || d === 'e5m2' || d === 'int8')) return 'fp8';
  if (widest.length > 0 && widest.every((d) => d === 'e2m1' || d === 'int4')) return 'fp4';
  return 'other';
}

function dims(op: ComparisonOp, a: Args): Record<string, number> {
  const out: Record<string, number> = {};
  const put = (k: string, v: unknown) => {
    const n = num(v);
    if (n !== null) out[k] = n;
  };
  if (op === 'gemm') {
    put('m', a.m);
    put('n', a.n);
    put('k', a.k);
  } else {
    const ex = (a.experts ?? {}) as Args;
    put('tokens', a.tokens);
    put('hidden', a.hidden);
    put('experts', ex.num);
    put('topK', ex.top_k);
    put('inter', ex.inter);
  }
  return out;
}

const isObj = (v: unknown) => typeof v === 'object' && v !== null;

/** GEMM operands are descriptors (`a`, `b`); MoE carries an `experts` block. */
function isCurrentSchema(op: ComparisonOp, a: Args): boolean {
  return op === 'gemm' ? isObj(a.a) && isObj(a.b) : isObj(a.experts);
}

/** Inputs newest first: the first pool result for a case wins. */
export function buildComparison(op: ComparisonOp, inputs: ComparisonInput[]): Comparison {
  const hardware = new Map<string, ComparisonHardware>();
  const rows = new Map<string, ComparisonRow>();
  const workloads = new Map<
    string,
    { source: WorkloadSource; cases: Set<string>; hardware: Set<string> }
  >();
  for (const { pool, dataset } of inputs) {
    const hw = hardwareKey(pool);
    let used = false;
    for (const r of dataset.results) {
      if (r.opType !== op || !isCurrentSchema(op, r.args)) continue;
      const caseKey = `${stableJson(r.args)}|${r.backend}`;
      const key = `${hw}|${caseKey}`;
      if (rows.has(key)) continue;
      used = true;
      const sources = workloadSources(op, r.testlist, r.sources);
      for (const s of sources) {
        const w = workloads.get(s.id) ?? { source: s, cases: new Set(), hardware: new Set() };
        w.cases.add(caseKey);
        w.hardware.add(hw);
        workloads.set(s.id, w);
      }
      rows.set(key, {
        caseKey,
        hardware: hw,
        testlist: r.testlist,
        workloads: sources.map((s) => s.id),
        ...opLabels(op, r.args),
        computePrecision: computePrecision(op, r.args),
        x: op === 'gemm' ? num(r.args.m) : num(r.args.tokens),
        dims: dims(op, r.args),
        status: r.status,
        latencyUs: r.latencyUs,
        flops: usefulFlops(op, r.args),
        bytes: usefulBytes(op, r.args),
        kernel: r.kernel,
        cudaGraph: r.cudaGraph,
        runId: dataset.run.runId,
        resultIndex: r.index,
      });
    }
    if (used) {
      const h = hardware.get(hw) ?? { id: hw, pool, runs: [] };
      h.runs.push({ runId: dataset.run.runId, generatedAt: dataset.run.generatedAt });
      hardware.set(hw, h);
    }
  }
  return {
    op,
    hardware: [...hardware.values()],
    workloads: [...workloads.values()]
      .map((w) => ({ ...w.source, cases: w.cases.size, hardware: [...w.hardware].sort() }))
      .sort((a, b) => b.hardware.length - a.hardware.length || a.label.localeCompare(b.label)),
    rows: [...rows.values()],
  };
}

/** A case as every pool measured it: described once. */
export interface ComparisonCase {
  key: string;
  testlist: string;
  shape: string;
  precision: string;
  computePrecision: ComputePrecision;
  x: number | null;
  dims: Record<string, number>;
  flops: number | null;
  bytes: number | null;
}

/** Per-pool measurements, column arrays indexed like `ComparisonView.cases`. */
export interface ComparisonColumns {
  status: (OperatorXStatus | null)[];
  latencyUs: (number | null)[];
  /** Index into `ComparisonView.kernels`. */
  kernel: (number | null)[];
  cudaGraph: (boolean | null)[];
  runId: (string | null)[];
  resultIndex: (number | null)[];
}

/** One workload's cases across hardware, compact for transfer. */
export interface ComparisonView {
  op: ComparisonOp;
  hardware: ComparisonHardware[];
  workloads: ComparisonWorkload[];
  workload: string | null;
  cases: ComparisonCase[];
  kernels: string[];
  measurements: Record<string, ComparisonColumns>;
}

export function comparisonView(comparison: Comparison, workloadId: string | null): ComparisonView {
  const workload =
    comparison.workloads.find((w) => w.id === workloadId)?.id ??
    comparison.workloads[0]?.id ??
    null;
  const rows = workload ? comparison.rows.filter((r) => r.workloads.includes(workload)) : [];
  const caseIndex = new Map<string, number>();
  const cases: ComparisonCase[] = [];
  for (const r of rows) {
    if (caseIndex.has(r.caseKey)) continue;
    caseIndex.set(r.caseKey, cases.length);
    cases.push({
      key: r.caseKey,
      testlist: r.testlist,
      shape: r.shape,
      precision: r.precision,
      computePrecision: r.computePrecision,
      x: r.x,
      dims: r.dims,
      flops: r.flops,
      bytes: r.bytes,
    });
  }
  const kernels: string[] = [];
  const kernelIndex = new Map<string, number>();
  const measurements: Record<string, ComparisonColumns> = {};
  const hardware = comparison.hardware.filter((h) => rows.some((r) => r.hardware === h.id));
  for (const h of hardware) {
    const empty = () => Array.from({ length: cases.length }, () => null);
    measurements[h.id] = {
      status: empty(),
      latencyUs: empty(),
      kernel: empty(),
      cudaGraph: empty(),
      runId: empty(),
      resultIndex: empty(),
    };
  }
  for (const r of rows) {
    const i = caseIndex.get(r.caseKey)!;
    const col = measurements[r.hardware];
    col.status[i] = r.status;
    col.latencyUs[i] = r.latencyUs;
    col.cudaGraph[i] = r.cudaGraph;
    col.runId[i] = r.runId;
    col.resultIndex[i] = r.resultIndex;
    if (r.kernel) {
      if (!kernelIndex.has(r.kernel)) {
        kernelIndex.set(r.kernel, kernels.length);
        kernels.push(r.kernel);
      }
      col.kernel[i] = kernelIndex.get(r.kernel)!;
    }
  }
  return {
    op: comparison.op,
    hardware,
    workloads: comparison.workloads,
    workload,
    cases,
    kernels,
    measurements,
  };
}
