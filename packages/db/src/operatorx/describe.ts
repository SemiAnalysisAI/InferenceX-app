/**
 * Human labels and useful-FLOP counts for OperatorX ops (gemm, moe). Pure functions
 * of an op's type and args; other op types fall back to generic labels.
 */

type Args = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const obj = (v: unknown): Args | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Args) : null;

/** Scale granularity of an operand scale group `[rows, cols]` (-1 spans the dimension). */
export function describeGroup(group: unknown): string {
  if (!Array.isArray(group) || group.length !== 2) return '?';
  const [r, c] = group as number[];
  if (r === -1 && c === -1) return 'tensor';
  if (r === 1 && c === -1) return 'token';
  if (r === -1 && c === 1) return 'channel';
  return `${r === -1 ? 'all' : r}×${c === -1 ? 'all' : c}`;
}

/** `e4m3 (1×128 fp32)`, `e2m1 (1×16 e4m3 + tensor fp32)`, `bf16`. */
export function describeOperand(value: unknown): string {
  const d = obj(value);
  if (!d) return '?';
  const dtype = str(d.dtype) ?? '?';
  const scale = obj(d.scale);
  if (!scale) return dtype;
  const parts = [`${describeGroup(scale.group)} ${str(scale.dtype) ?? '?'}`];
  const scale2 = obj(d.scale2);
  if (scale2) parts.push(`${describeGroup(scale2.group)} ${str(scale2.dtype) ?? '?'}`);
  const pre = str(d.input) === dtype ? ', pre-quantized' : '';
  return `${dtype} (${parts.join(' + ')}${pre})`;
}

export interface OpLabels {
  shape: string;
  precision: string;
}

function gemmLabels(a: Args): OpLabels {
  return {
    shape: `${a.m}×${a.n}×${a.k}`,
    precision: `${describeOperand(a.a)} × ${describeOperand(a.b)} → ${a.out ?? 'bf16'}`,
  };
}

function moeLabels(a: Args): OpLabels {
  const ex = obj(a.experts) ?? {};
  const q = obj(ex.quant) ?? {};
  const latent = num(ex.latent) ? ` L=${ex.latent}` : '';
  const routing = obj(a.routing);
  const dist = routing?.distribution;
  const distLabel =
    dist && dist !== 'natural'
      ? ` · ${typeof dist === 'string' ? dist : `zipf s=${(obj(dist) ?? {}).s}`}`
      : '';
  const shape = `T=${a.tokens} H=${a.hidden} E=${ex.num}/top${ex.top_k} I=${ex.inter}${latent}${distLabel}`;
  const shared = obj(a.shared);
  const sharedW = shared ? obj(shared.quant)?.w13 : null;
  const precision = `x ${describeOperand(q.x)} · w ${describeOperand(q.w13)}${sharedW ? ` · shared w ${describeOperand(sharedW)}` : ''}`;
  return { shape, precision };
}

export function opLabels(type: string, args: Args): OpLabels {
  switch (type) {
    case 'gemm': {
      return gemmLabels(args);
    }
    case 'moe': {
      return moeLabels(args);
    }
    default: {
      return { shape: JSON.stringify(args).slice(0, 80), precision: '' };
    }
  }
}

/**
 * Useful matmul FLOPs of one op call (2 per multiply-add), or null when the op has no
 * defined count here. MoE counts router, routed experts at their active top-k, latent
 * projections and shared experts; it excludes activations, routing and combine work.
 */
export function usefulFlops(type: string, a: Args): number | null {
  if (type === 'gemm') {
    const [m, n, k] = [num(a.m), num(a.n), num(a.k)];
    return m && n && k ? 2 * m * n * k : null;
  }
  if (type === 'moe') {
    const ex = obj(a.experts);
    const [t, h] = [num(a.tokens), num(a.hidden)];
    if (!ex || !t || !h) return null;
    const [e, k, i] = [num(ex.num), num(ex.top_k), num(ex.inter)];
    if (!e || !k || !i) return null;
    const w = num(ex.latent) ?? h;
    let flops = 2 * t * h * e + 6 * t * w * i * k;
    if (num(ex.latent)) flops += 2 * 2 * t * h * w;
    const sh = obj(a.shared);
    if (sh && num(sh.count) && num(sh.inter))
      flops += 6 * t * h * (sh.inter as number) * (sh.count as number);
    return flops;
  }
  return null;
}

const ELEMENT_BYTES: Record<string, number> = {
  fp32: 4,
  bf16: 2,
  fp16: 2,
  e4m3: 1,
  e5m2: 1,
  int8: 1,
  e2m1: 0.5,
  int4: 0.5,
};
const SCALE_BYTES: Record<string, number> = { fp32: 4, bf16: 2, fp16: 2, e4m3: 1, ue8m0: 1 };

/** Bytes of an operand descriptor over a rows×cols tensor: elements plus scales. */
function operandBytes(d: Args | null, rows: number, cols: number, stored = true): number {
  if (!d) return rows * cols * 2;
  const dtype = str(stored ? d.dtype : (d.input ?? 'bf16')) ?? 'bf16';
  let bytes = rows * cols * (ELEMENT_BYTES[dtype] ?? 2);
  if (!stored) return bytes;
  for (const key of ['scale', 'scale2']) {
    const s = obj(d[key]);
    const g = s && Array.isArray(s.group) ? (s.group as number[]) : null;
    if (!s || !g) continue;
    const r = g[0] === -1 ? rows : g[0];
    const c = g[1] === -1 ? cols : g[1];
    bytes += Math.ceil(rows / r) * Math.ceil(cols / c) * (SCALE_BYTES[str(s.dtype) ?? ''] ?? 4);
  }
  return bytes;
}

/**
 * Minimum bytes one op call must move to/from memory: each input read once, output
 * written once. GEMM reads A as it enters the op (bf16 unless pre-quantized) and B as
 * stored. MoE reads the weights of the experts the tokens are expected to touch
 * (E·(1-(1-k/E)^T) distinct experts under uniform routing), the shared experts and
 * the router, plus the activations in and out.
 */
export function usefulBytes(type: string, a: Args): number | null {
  if (type === 'gemm') {
    const [m, n, k] = [num(a.m), num(a.n), num(a.k)];
    if (!m || !n || !k) return null;
    const out = ELEMENT_BYTES[str(a.out) ?? 'bf16'] ?? 2;
    return operandBytes(obj(a.a), m, k, false) + operandBytes(obj(a.b), n, k) + m * n * out;
  }
  if (type === 'moe') {
    const ex = obj(a.experts);
    const [t, h] = [num(a.tokens), num(a.hidden)];
    if (!ex || !t || !h) return null;
    const [e, k, i] = [num(ex.num), num(ex.top_k), num(ex.inter)];
    if (!e || !k || !i) return null;
    const w = num(ex.latent) ?? h;
    const q = obj(ex.quant) ?? {};
    const touched = e * (1 - (1 - k / e) ** t);
    let bytes = touched * (operandBytes(obj(q.w13), 2 * i, w) + operandBytes(obj(q.w2), w, i));
    bytes += h * e * 2 + 2 * t * h * 2;
    if (num(ex.latent)) bytes += 2 * h * w * 2;
    const sh = obj(a.shared);
    if (sh && num(sh.count) && num(sh.inter)) {
      const sq = obj(sh.quant) ?? {};
      const si = (sh.inter as number) * (sh.count as number);
      bytes += operandBytes(obj(sq.w13), 2 * si, h) + operandBytes(obj(sq.w2), h, si);
    }
    return bytes;
  }
  return null;
}
