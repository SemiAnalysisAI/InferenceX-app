/**
 * Cross-hardware comparison: the same cases measured on different GPU runners, aligned by
 * case identity (op args + backend) and grouped into workload sources. Pure; the caller
 * picks which run supplies each runner's results (newest first wins per case).
 */
import {
  ATTENTION_TYPES,
  attentionTokens,
  type ComputePrecision,
  mathPrecision,
  opLabels,
  type OpWork,
  opWork,
} from './describe';
import {
  type OperatorXDataset,
  type OperatorXSource,
  type OperatorXStatus,
  stableJson,
} from './normalize';
import { compareSplits, parallelKey, parallelLabel } from './parallel';
import { topLevelModel, type WorkloadSource, workloadSources } from './workloads';

/** An op family: GEMM, MoE, or the attention modules (several op types). */
export type ComparisonOp = 'gemm' | 'moe' | 'attention';

/** The family an op type belongs to, or null for types no view compares. */
export function opFamily(type: string): ComparisonOp | null {
  if (type === 'gemm' || type === 'moe') return type;
  return ATTENTION_TYPES.includes(type) ? 'attention' : null;
}

/** One GPU and the run(s) its results came from. */
export interface ComparisonHardware {
  /** Hardware key (h200, b200, mi355x, ...): the entity that is compared and colored. */
  id: string;
  runner: string;
  runs: { runId: string; generatedAt: string }[];
}

export type { ComputePrecision, OpWork, WorkPart, LinkTransfer } from './describe';

export interface ComparisonRow {
  /** Case identity shared by the same case on every runner. */
  caseKey: string;
  hardware: string;
  testlist: string;
  /** The op type: the family itself, or the attention module. */
  opType: string;
  /** Device split (`tp8`, `dp8·ep8`); empty for one device. */
  parallel: string;
  workloads: string[];
  /** Models the case comes from, as InferenceX names them, with its roles in each. */
  sources: CaseSource<string>[];
  shape: string;
  precision: string;
  computePrecision: ComputePrecision;
  /** Primary size axis: GEMM M, MoE tokens, attention new tokens. */
  x: number | null;
  dims: Record<string, number>;
  status: OperatorXStatus;
  latencyUs: number | null;
  flops: number | null;
  bytes: number | null;
  /** Per device, stage by stage, for the roofline. */
  work: OpWork | null;
  kernel: string | null;
  cudaGraph: boolean | null;
  runId: string;
  resultIndex: number;
  revision: string;
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
  /** Models any case comes from, most cases first. */
  models: string[];
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
/** The operands the math runs on: GEMM A and B, the experts, attention's projections. */
function quantOperands(op: ComparisonOp, a: Args): unknown[] {
  if (op === 'gemm') return [a.a, a.b];
  if (op === 'moe') {
    const ex = (a.experts ?? {}) as Args;
    return ex.w1 ? [ex.a1, ex.w1] : [];
  }
  const proj = (a.proj ?? {}) as Record<string, Args>;
  const pairs = Object.values(proj).flatMap((p) => [p.a, p.b]);
  return pairs.length > 0 ? pairs : [{ dtype: 'bf16' }];
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
  } else if (op === 'attention') {
    put('tokens', attentionTokens(a));
    put('hidden', a.hidden);
    put('heads', a.heads ?? a.q_heads ?? a.v_heads);
    put('compressRatio', a.compress_ratio);
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

/** GEMM operands are descriptors (`a`, `b`); MoE carries an `experts` block, attention a `batch`. */
function isCurrentSchema(op: ComparisonOp, a: Args): boolean {
  if (op === 'gemm') return isObj(a.a) && isObj(a.b);
  return op === 'moe' ? isObj(a.experts) : isObj(a.batch);
}

function sizeOf(op: ComparisonOp, a: Args): number | null {
  if (op === 'gemm') return num(a.m);
  return op === 'moe' ? num(a.tokens) : attentionTokens(a);
}

/** The identity used to choose one result per GPU, case, and backend. */
export function comparisonCaseKey(
  op: ComparisonOp,
  runner: string,
  result: OperatorXDataset['results'][number],
): string | null {
  if (opFamily(result.opType) !== op || !isCurrentSchema(op, result.args)) return null;
  return `${hardwareKey(runner)}|${stableJson(result.args)}|${result.backend}`;
}

function totals(work: OpWork | null): Pick<ComparisonRow, 'flops' | 'bytes' | 'work'> {
  if (!work) return { flops: null, bytes: null, work: null };
  const sum = (key: 'flops' | 'bytes') => work.parts.reduce((t, p) => t + p[key], 0);
  return { flops: sum('flops'), bytes: sum('bytes'), work };
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
      const key = comparisonCaseKey(op, runner, r);
      if (key === null) continue;
      const caseKey = `${stableJson(r.args)}|${r.backend}`;
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
        opType: r.opType,
        parallel: parallelKey(r.args),
        workloads: sources.map((s) => s.id),
        sources: sourcesByModel(r.sources),
        ...opLabels(r.opType, r.args),
        computePrecision: mathPrecision(quantOperands(op, r.args)),
        x: sizeOf(op, r.args),
        dims: dims(op, r.args),
        status: r.status,
        latencyUs: r.latencyUs,
        ...totals(opWork(r.opType, r.args)),
        kernel: r.kernel,
        cudaGraph: r.cudaGraph,
        runId: dataset.run.runId,
        resultIndex: r.index,
        revision: dataset.run.revision,
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
    models: modelsByCases(rows.values()),
    rows: [...rows.values()],
  };
}

function modelsByCases(rows: Iterable<ComparisonRow>): string[] {
  const cases = new Map<string, Set<string>>();
  for (const r of rows)
    for (const s of r.sources) cases.set(s.model, (cases.get(s.model) ?? new Set()).add(r.caseKey));
  return [...cases]
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([m]) => m);
}

/** A case as every runner measured it: described once. */
export interface ComparisonCase {
  key: string;
  testlist: string;
  opType: string;
  sources: CaseSource<number>[];
  shape: string;
  precision: string;
  computePrecision: ComputePrecision;
  x: number | null;
  dims: Record<string, number>;
  /** Useful FLOPs and minimum memory bytes per device: `work`'s totals. */
  flops: number | null;
  bytes: number | null;
  work: OpWork | null;
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
  revision: (string | null)[];
}

/** One workload's cases across hardware, compact for transfer. */
export interface ComparisonView {
  op: ComparisonOp;
  hardware: ComparisonHardware[];
  workloads: ComparisonWorkload[];
  workload: string | null;
  /** Models with cases, for picking one; see `comparisonView`'s `model`. */
  modelOptions: string[];
  /** The model the cases were picked by, instead of a workload. */
  model: string | null;
  /** Device splits the workload (or model) has cases at, one device first. */
  parallelOptions: ParallelOption[];
  /** The split the cases are at. */
  parallel: string;
  cases: ComparisonCase[];
  /** Models the cases come from. */
  models: string[];
  kernels: string[];
  measurements: Record<string, ComparisonColumns>;
}

export interface ParallelOption {
  /** `tp8`, `dp8·ep8`; empty for one device. */
  key: string;
  label: string;
  cases: number;
}

/** The splits rows are at, with their case counts: one device first, then by size. */
function parallelOptions(rows: ComparisonRow[]): ParallelOption[] {
  const cases = new Map<string, Set<string>>();
  for (const r of rows) cases.set(r.parallel, (cases.get(r.parallel) ?? new Set()).add(r.caseKey));
  return [...cases]
    .map(([key, set]) => ({ key, label: parallelLabel(key), cases: set.size }))
    .sort((a, b) => compareSplits(a.key, b.key));
}

/**
 * The cases of one workload (default: the best-covered), or, given `model`, every case
 * that model's checkpoints contribute, at one device split (default: one device, else
 * the smallest split there is).
 */
export function comparisonView(
  comparison: Comparison,
  workloadId: string | null,
  model: string | null = null,
  parallel: string | null = null,
): ComparisonView {
  const workload = model
    ? null
    : (comparison.workloads.find((w) => w.id === workloadId)?.id ??
      comparison.workloads[0]?.id ??
      null);
  const scoped = model
    ? comparison.rows.filter((r) => r.sources.some((s) => s.model === model))
    : workload
      ? comparison.rows.filter((r) => r.workloads.includes(workload))
      : [];
  const splits = parallelOptions(scoped);
  const split = splits.find((o) => o.key === parallel)?.key ?? splits[0]?.key ?? '';
  const rows = scoped.filter((r) => r.parallel === split);
  const caseIndex = new Map<string, number>();
  const cases: ComparisonCase[] = [];
  const models: string[] = [];
  const modelIndex = new Map<string, number>();
  const internModel = (name: string) => {
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
        const m = internModel(s.model);
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
      opType: r.opType,
      sources: r.sources.map((s) => ({ model: internModel(s.model), roles: [...s.roles] })),
      shape: r.shape,
      precision: r.precision,
      computePrecision: r.computePrecision,
      x: r.x,
      dims: r.dims,
      flops: r.flops,
      bytes: r.bytes,
      work: r.work,
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
      revision: empty(),
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
    col.revision[i] = r.revision;
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
    modelOptions: comparison.models,
    model,
    parallelOptions: splits,
    parallel: split,
    cases,
    models,
    kernels,
    measurements,
  };
}
