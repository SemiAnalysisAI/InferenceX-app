/** The shared, versioned reader for persisted OperatorX Actions documents. */
export interface OperatorXRunMeta {
  run_id: string;
  run_attempt: number;
  source_sha: string;
  source_branch: string | null;
  generated_at: string;
  conclusion: string | null;
}
export interface OperatorXBundle {
  run: OperatorXRunMeta;
  manifest: unknown;
  shards: { id: string; attempt: number; docs: unknown[] }[];
}
export type OperatorXStatus = 'ok' | 'unsupported' | 'error' | 'missing';
export type OperatorXKind = 'gemm' | 'attention_mha' | 'attention_mla';
export interface OperatorXAttention {
  batch_size: number;
  seq_len_q: number;
  seq_len_kv: number;
  num_heads: number;
  num_heads_kv: number;
  head_dim_qk: number;
  head_dim_v: number;
  kv_lora_rank: number | null;
  dtype_q: string;
  dtype_k: string;
  dtype_v: string;
  dtype_o: string;
  causal: boolean;
}
export interface OperatorXPoint {
  type: OperatorXKind;
  args: Record<string, unknown>;
  attention: OperatorXAttention | null;
  id: string;
  shard: string;
  attempt: number | null;
  cluster: string;
  backend: string;
  testlist: string;
  name: string | null;
  m: number | null;
  n: number | null;
  k: number | null;
  dtype_a: string | null;
  dtype_b: string | null;
  dtype_out: string | null;
  status: OperatorXStatus;
  message: string | null;
  latency_us: number | null;
  tflops: number | null;
}
export interface OperatorXRunSummary extends OperatorXRunMeta {
  requested: number;
  measured: number;
  unsupported: number;
  failed: number;
  missing: number;
  clusters: string[];
  testlists: string[];
}
export interface OperatorXDataset {
  version: 2;
  run: OperatorXRunSummary;
  points: OperatorXPoint[];
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected an OperatorX object');
  }
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected an OperatorX array');
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Expected an OperatorX string');
  return value;
}
function dimension(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new Error('Invalid operator dimension');
  return Number(value);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
function key(type: unknown, args: unknown, backend: unknown, testlist: unknown, name: unknown) {
  return canonical([type, args, backend, testlist, name ?? null]);
}

/** Dense GEMM, two FLOPs per multiply-add, measured microseconds. Never scale by allocated GPUs. */
export function gemmTflops(m: number, n: number, k: number, latencyUs: number): number | null {
  if (![m, n, k, latencyUs].every((v) => Number.isFinite(v) && v > 0)) return null;
  const result = (2 * m * n * k) / (latencyUs * 1e6);
  return Number.isFinite(result) ? result : null;
}

export function readOperatorXBundle(bundle: OperatorXBundle): OperatorXDataset {
  const manifest = object(bundle.manifest);
  if (
    manifest.version !== 1 ||
    manifest.run_id !== bundle.run.run_id ||
    manifest.source_sha !== bundle.run.source_sha
  ) {
    throw new Error('OperatorX manifest version or provenance mismatch');
  }
  const points: OperatorXPoint[] = [];
  const ids = new Set<string>();
  for (const cellValue of array(manifest.include)) {
    const cell = object(cellValue);
    const id = text(cell.id);
    if (ids.has(id)) throw new Error('Duplicate OperatorX shard');
    ids.add(id);
    const selected = bundle.shards
      .filter((s) => s.id === id && s.attempt <= bundle.run.run_attempt)
      .sort((a, b) => b.attempt - a.attempt)[0];
    const results = new Map<string, Record<string, unknown>[]>();
    for (const value of selected?.docs ?? []) {
      const doc = object(value);
      if (!('rows' in doc)) continue;
      const run = object(doc.run);
      const env = object(run.env);
      if (
        doc.schema_version !== '1' ||
        run.operatorx_git_sha !== bundle.run.source_sha ||
        run.cluster !== cell.cluster ||
        env.OPERATORX_GITHUB_RUN_ID !== bundle.run.run_id ||
        env.OPERATORX_GITHUB_RUN_ATTEMPT !== String(selected?.attempt) ||
        env.OPERATORX_SHARD_ID !== id ||
        env.WORLD_SIZE !== String(cell.world_size)
      ) {
        throw new Error('OperatorX result provenance mismatch');
      }
      for (const rowValue of array(doc.rows)) {
        const row = object(rowValue);
        const op = object(row.op);
        const identity = key(op.type, op.args, op.backend, row.testlist, op.name);
        const entries = results.get(identity) ?? [];
        entries.push(row);
        results.set(identity, entries);
      }
    }
    for (const [index, caseValue] of array(cell.cases).entries()) {
      const entry = object(caseValue);
      const shape = object(entry.shape);
      if (!['gemm', 'attention_mha', 'attention_mla'].includes(String(shape.type))) continue;
      if (cell.world_size !== 1) throw new Error('GEMM and attention must use world_size=1');
      const args = object(shape.args);
      for (const backend of array(cell.backends)) {
        const row = results
          .get(key(shape.type, args, backend, entry.testlist, shape.name))
          ?.shift();
        const status = row?.status ?? 'missing';
        if (!['ok', 'unsupported', 'error', 'missing'].includes(String(status)))
          throw new Error('Invalid OperatorX status');
        const latency = row ? object(row.metrics).latency_us : null;
        if (
          status === 'ok' &&
          (typeof latency !== 'number' || !Number.isFinite(latency) || latency <= 0)
        ) {
          throw new Error('Successful operator has invalid latency');
        }
        const gemm = shape.type === 'gemm';
        const mla = shape.type === 'attention_mla';
        const attention: OperatorXAttention | null = gemm
          ? null
          : {
              batch_size: dimension(args.batch_size),
              seq_len_q: dimension(args.seq_len_q),
              seq_len_kv: dimension(args.seq_len_kv),
              num_heads: dimension(args.num_heads),
              num_heads_kv: dimension(mla ? args.num_heads : args.num_heads_kv),
              head_dim_qk: mla
                ? dimension(args.head_dim_qk_nope) + dimension(args.head_dim_qk_rope)
                : dimension(args.head_dim),
              head_dim_v: dimension(mla ? args.head_dim_v : args.head_dim),
              kv_lora_rank: mla ? dimension(args.kv_lora_rank) : null,
              dtype_q: text(args.dtype_q),
              dtype_k: text(mla ? args.dtype_kv : args.dtype_k),
              dtype_v: text(mla ? args.dtype_kv : args.dtype_v),
              dtype_o: text(args.dtype_o),
              causal: args.causal === undefined ? true : args.causal === true,
            };
        if (attention && args.causal !== undefined && typeof args.causal !== 'boolean')
          throw new Error('Invalid attention causality');
        const point: OperatorXPoint = {
          type: shape.type as OperatorXKind,
          args,
          attention,
          id: `${id}:${index}:${backend}`,
          shard: id,
          attempt: selected?.attempt ?? null,
          cluster: text(cell.cluster),
          backend: text(backend),
          testlist: text(entry.testlist),
          name: typeof shape.name === 'string' ? shape.name : null,
          m: gemm ? dimension(args.m) : null,
          n: gemm ? dimension(args.n) : null,
          k: gemm ? dimension(args.k) : null,
          dtype_a: gemm ? text(args.dtype_a) : null,
          dtype_b: gemm ? text(args.dtype_b) : null,
          dtype_out: gemm ? text(args.dtype_out) : null,
          status: status as OperatorXStatus,
          message: typeof row?.message === 'string' ? row.message : null,
          latency_us: status === 'ok' ? Number(latency) : null,
          tflops: null,
        };
        if (gemm && point.latency_us !== null)
          point.tflops = gemmTflops(point.m!, point.n!, point.k!, point.latency_us);
        points.push(point);
      }
    }
    // Reject unexpected/duplicate result rows rather than inflate measured coverage.
    if (
      [...results.values()].some((rows) =>
        rows.some((row) =>
          ['gemm', 'attention_mha', 'attention_mla'].includes(String(object(row.op).type)),
        ),
      )
    ) {
      throw new Error('Unexpected or duplicate operator result');
    }
  }
  const count = (status: OperatorXStatus) => points.filter((p) => p.status === status).length;
  return {
    version: 2,
    run: {
      ...bundle.run,
      requested: points.length,
      measured: count('ok'),
      unsupported: count('unsupported'),
      failed: count('error'),
      missing: count('missing'),
      clusters: [...new Set(points.map((p) => p.cluster))].sort(),
      testlists: [...new Set(points.map((p) => p.testlist))].sort(),
    },
    points,
  };
}
