/**
 * Cross-hardware comparison: the same cases measured on different GPU runners, aligned by
 * case identity (op args + backend) and grouped into workload sources. Pure; the caller
 * picks which run supplies each runner's results (newest first wins per case).
 */
import { opLabels, usefulBytes, usefulFlops } from './describe';
import {
  type OperatorXDataset,
  type OperatorXSource,
  type OperatorXStatus,
  stableJson,
} from './normalize';
import { topLevelModel, type WorkloadSource, workloadSources } from './workloads';

export type ComparisonOp = 'gemm' | 'moe';

/** One GPU and the run(s) its results came from. */
export interface ComparisonHardware {
  /** Hardware key (h200, b200, mi355x, ...): the entity that is compared and colored. */
  id: string;
  runner: string;
  runs: { runId: string; generatedAt: string }[];
}

/** Arithmetic precision the math runs at, for peak-throughput lookups. */
export type ComputePrecision = 'fp4' | 'fp8' | 'bf16' | 'other';

export interface ComparisonRow {
  /** Case identity shared by the same case on every runner. */
  caseKey: string;
  hardware: string;
  testlist: string;
  workloads: string[];
  /** Models the case comes from, as InferenceX names them, with its roles in each. */
  sources: CaseSource<string>[];
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

/**
 * A model a case comes from (a name, or an index into `ComparisonView.models`) and the
 * layers that run the case in it (`attn.wq_b`, `mlp`).
 */
export interface CaseSource<M> {
  model: M;
  roles: string[];
}

/** Sources grouped by model: several checkpoints of one model merge. */
function sourcesByModel(sources: OperatorXSource[]): CaseSource<string>[] {
  const byModel = new Map<string, Set<string>>();
  for (const s of sources) {
    const model = topLevelModel(s.model);
    byModel.set(model, (byModel.get(model) ?? new Set()).add(s.role));
  }
  return [...byModel].map(([model, roles]) => ({ model, roles: [...roles].sort() }));
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
  /** Runner label as the sweep planned it (h200-dgxc, mi300x-amd, ...). */
  runner: string;
  dataset: OperatorXDataset;
}

/** Hardware key of a runner label: `h200-dgxc` -> `h200`, `mi300x-amd` -> `mi300x`. */
export function hardwareKey(runner: string): string {
  return runner.split('-')[0];
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
          const ex = (a.experts ?? {}) as Args;
          return ex.w1 ? [ex.a1, ex.w1] : [];
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

/** Inputs newest first: the first runner's result for a case wins. */
export function buildComparison(op: ComparisonOp, inputs: ComparisonInput[]): Comparison {
  const hardware = new Map<string, ComparisonHardware>();
  const rows = new Map<string, ComparisonRow>();
  const workloads = new Map<
    string,
    { source: WorkloadSource; cases: Set<string>; hardware: Set<string> }
  >();
  for (const { runner, dataset } of inputs) {
    const hw = hardwareKey(runner);
    let used = false;
    for (const r of dataset.results) {
      if (r.opType !== op || !isCurrentSchema(op, r.args)) continue;
      const caseKey = `${stableJson(r.args)}|${r.backend}`;
      const key = `${hw}|${caseKey}`;
      if (rows.has(key)) continue;
      used = true;
      const sources = workloadSources(op, r.testlist, [...new Set(r.sources.map((s) => s.model))]);
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
        sources: sourcesByModel(r.sources),
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
      const h = hardware.get(hw) ?? { id: hw, runner, runs: [] };
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

/** A case as every runner measured it: described once. */
export interface ComparisonCase {
  key: string;
  testlist: string;
  sources: CaseSource<number>[];
  shape: string;
  precision: string;
  computePrecision: ComputePrecision;
  x: number | null;
  dims: Record<string, number>;
  flops: number | null;
  bytes: number | null;
}

/** Per-GPU measurements, column arrays indexed like `ComparisonView.cases`. */
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
  /** Models the cases come from. */
  models: string[];
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
  const models: string[] = [];
  const modelIndex = new Map<string, number>();
  const model = (name: string) => {
    if (!modelIndex.has(name)) {
      modelIndex.set(name, models.length);
      models.push(name);
    }
    return modelIndex.get(name)!;
  };
  for (const r of rows) {
    const seen = caseIndex.get(r.caseKey);
    // Runners can list different layers for one case; the case names every one.
    if (seen !== undefined) {
      const merged = cases[seen].sources;
      for (const s of r.sources) {
        const m = model(s.model);
        const into = merged.find((x) => x.model === m);
        if (into) {
          into.roles = [...new Set([...into.roles, ...s.roles])].sort();
        } else {
          merged.push({ model: m, roles: [...s.roles] });
        }
      }
      continue;
    }
    caseIndex.set(r.caseKey, cases.length);
    cases.push({
      key: r.caseKey,
      testlist: r.testlist,
      sources: r.sources.map((s) => ({ model: model(s.model), roles: [...s.roles] })),
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
    models,
    kernels,
    measurements,
  };
}
