/**
 * Raw OperatorX bundle -> the dataset the dashboard renders. Pure and source-agnostic:
 * the GitHub, local-directory and database sources all hand this the same raw bundle.
 *
 * Tolerant by design: an unknown op type or args schema still produces rows (with
 * generic labels) instead of failing the run, so a new sweep schema never takes the
 * page down. Requested cases with no result row are reported as `missing`.
 */
import { type OperatorXRawBundle, type OperatorXRunPlan, planFromManifest } from './bundle';
import { opLabels, usefulFlops } from './describe';

export type OperatorXStatus = 'ok' | 'unsupported' | 'error' | 'missing';

/** Per-replay kernel timing structure from the profiler pass (timing runs only). */
export interface OperatorXTimingShape {
  spanUs: number;
  busyUs: number;
  gapUs: number;
  overlapUs: number;
  streams: number;
}

/** One requested (case, backend) and its outcome: the list-view row. Kept small. */
export interface OperatorXResult {
  /** Stable index within the dataset; the key for fetching the full detail. */
  index: number;
  testlist: string;
  opType: string;
  name: string | null;
  backend: string;
  shard: string;
  cluster: string | null;
  args: Record<string, unknown>;
  shape: string;
  precision: string;
  status: OperatorXStatus;
  message: string | null;
  latencyUs: number | null;
  tflops: number | null;
  cudaGraph: boolean | null;
  /** The kernel implementation the backend reported choosing, when it did. */
  kernel: string | null;
  timing: OperatorXTimingShape | null;
  /** Telemetry saw clock/power capping during the timed window. */
  capped: boolean | null;
}

export interface OperatorXRunSummary {
  runId: string;
  runAttempt: number;
  sourceSha: string;
  sourceBranch: string | null;
  generatedAt: string;
  conclusion: string | null;
  plan: OperatorXRunPlan | null;
  clusters: string[];
  testlists: string[];
  opTypes: string[];
  backends: string[];
  counts: Record<OperatorXStatus, number> & { requested: number };
  /** Environment of the first result document: image, versions, host. */
  environment: Record<string, unknown> | null;
}

export interface OperatorXDataset {
  run: OperatorXRunSummary;
  results: OperatorXResult[];
}

/** Everything the sweep stored for one result, for the detail view. */
export interface OperatorXResultDetail {
  result: OperatorXResult;
  metrics: Record<string, unknown>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Recursively key-sorted JSON, so equal args match regardless of key order. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObj(value))
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function chosenKernel(metrics: Obj): string | null {
  const meta = isObj(metrics.backend_meta) ? metrics.backend_meta : null;
  if (meta) {
    const modules = isObj(meta.vllm_modules) ? meta.vllm_modules : null;
    const routed =
      modules && isObj(modules['experts.routed_experts'])
        ? modules['experts.routed_experts']
        : null;
    if (routed) {
      const experts = routed['moe_kernel.fused_experts'] ?? routed.method;
      if (typeof experts === 'string') return experts;
    }
    const kernels = isObj(meta.vllm_kernels) ? Object.values(meta.vllm_kernels) : [];
    const k = kernels.find((v): v is string => typeof v === 'string');
    if (k) return k;
    if (typeof meta.vllm_quant_method === 'string') return meta.vllm_quant_method;
  }
  const profile = isObj(metrics.profile) ? metrics.profile : null;
  const top =
    profile && Array.isArray(profile.kernels) && isObj(profile.kernels[0])
      ? profile.kernels[0]
      : null;
  return top && typeof top.name === 'string' ? top.name.replace(/^void /, '').slice(0, 80) : null;
}

function timingShape(metrics: Obj): OperatorXTimingShape | null {
  const p = isObj(metrics.profile) ? metrics.profile : null;
  if (!p || num(p.span_us) === null) return null;
  return {
    spanUs: num(p.span_us)!,
    busyUs: num(p.busy_us) ?? 0,
    gapUs: num(p.gap_us) ?? 0,
    overlapUs: num(p.overlap_us) ?? 0,
    streams: num(p.streams) ?? 1,
  };
}

function toStatus(v: unknown): OperatorXStatus {
  return v === 'ok' || v === 'unsupported' ? v : 'error';
}

interface Normalized extends OperatorXDataset {
  /** Full per-result metrics, by result index (missing rows have none). */
  metrics: (Obj | null)[];
}

export function normalizeBundle(bundle: OperatorXRawBundle): Normalized {
  const results: OperatorXResult[] = [];
  const metrics: (Obj | null)[] = [];
  const seen = new Set<string>();
  const clusters = new Set<string>();
  let environment: Obj | null = null;

  const push = (r: Omit<OperatorXResult, 'index'>, m: Obj | null) => {
    results.push({ ...r, index: results.length });
    metrics.push(m);
  };

  for (const shard of bundle.shards) {
    for (const doc of shard.docs) {
      if (!isObj(doc) || !Array.isArray(doc.rows)) continue;
      const run = isObj(doc.run) ? doc.run : {};
      const cluster = typeof run.cluster === 'string' ? run.cluster : null;
      if (cluster) clusters.add(cluster);
      environment ??= {
        container_image: run.container_image ?? null,
        software: run.software ?? null,
        hostname: run.hostname ?? null,
        operatorx_git_sha: run.operatorx_git_sha ?? null,
      };
      for (const row of doc.rows) {
        if (!isObj(row) || !isObj(row.op)) continue;
        const op = row.op;
        const type = String(op.type ?? 'unknown');
        const args = isObj(op.args) ? op.args : {};
        const backend = String(op.backend ?? 'unknown');
        const testlist = String(row.testlist ?? '');
        const m = isObj(row.metrics) ? row.metrics : {};
        const status = toStatus(row.status);
        const latencyUs = status === 'ok' ? num(m.latency_us) : null;
        const flops = usefulFlops(type, args);
        const telemetry = isObj(m.telemetry) ? m.telemetry : null;
        seen.add(`${testlist}|${type}|${stableJson(args)}|${backend}`);
        push(
          {
            testlist,
            opType: type,
            name: typeof op.name === 'string' ? op.name : null,
            backend,
            shard: shard.id,
            cluster,
            args,
            ...opLabels(type, args),
            status,
            message:
              typeof row.message === 'string'
                ? row.message
                : typeof row.error === 'string'
                  ? row.error
                  : null,
            latencyUs,
            tflops: latencyUs && flops ? flops / (latencyUs * 1e6) : null,
            cudaGraph: typeof m.cuda_graph === 'boolean' ? m.cuda_graph : null,
            kernel: status === 'ok' ? chosenKernel(m) : null,
            timing: timingShape(m),
            capped: telemetry && typeof telemetry.capped === 'boolean' ? telemetry.capped : null,
          },
          m,
        );
      }
    }
  }

  // requested (case, backend) pairs that produced no row
  const manifest = isObj(bundle.manifest) ? bundle.manifest : {};
  const cells = Array.isArray(manifest.include) ? manifest.include.filter(isObj) : [];
  const shardIds = new Set(bundle.shards.map((s) => s.id));
  for (const cell of cells) {
    const backends = Array.isArray(cell.backends) ? cell.backends.map(String) : ['unknown'];
    for (const c of Array.isArray(cell.cases) ? cell.cases.filter(isObj) : []) {
      const shape = isObj(c.shape) ? c.shape : {};
      const type = String(shape.type ?? 'unknown');
      const args = isObj(shape.args) ? shape.args : {};
      for (const backend of backends) {
        const key = `${String(c.testlist ?? '')}|${type}|${stableJson(args)}|${backend}`;
        if (seen.has(key)) continue;
        seen.add(key);
        push(
          {
            testlist: String(c.testlist ?? ''),
            opType: type,
            name: typeof shape.name === 'string' ? shape.name : null,
            backend,
            shard: String(cell.id ?? ''),
            cluster: typeof cell.cluster === 'string' ? cell.cluster : null,
            args,
            ...opLabels(type, args),
            status: 'missing',
            message: shardIds.has(String(cell.id))
              ? 'No result row for this case'
              : 'Shard produced no results',
            latencyUs: null,
            tflops: null,
            cudaGraph: null,
            kernel: null,
            timing: null,
            capped: null,
          },
          null,
        );
      }
    }
  }

  const counts = { ok: 0, unsupported: 0, error: 0, missing: 0, requested: results.length };
  for (const r of results) counts[r.status]++;
  const uniq = (f: (r: OperatorXResult) => string) =>
    [...new Set(results.map(f))].filter(Boolean).sort();
  return {
    run: {
      runId: bundle.run.run_id,
      runAttempt: bundle.run.run_attempt,
      sourceSha: bundle.run.source_sha,
      sourceBranch: bundle.run.source_branch,
      generatedAt: bundle.run.generated_at,
      conclusion: bundle.run.conclusion,
      plan: planFromManifest(bundle.manifest),
      clusters: [...clusters].sort(),
      testlists: uniq((r) => r.testlist),
      opTypes: uniq((r) => r.opType),
      backends: uniq((r) => r.backend),
      counts,
      environment,
    },
    results,
    metrics,
  };
}
