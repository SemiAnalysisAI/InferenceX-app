type Args = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const obj = (v: unknown): Args | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Args) : null;

export function describeGroup(group: unknown): string {
  if (!Array.isArray(group) || group.length !== 2) return '?';
  const [r, c] = group as number[];
  if (r === -1 && c === -1) return 'tensor';
  if (r === 1 && c === -1) return 'token';
  if (r === -1 && c === 1) return 'channel';
  return `${r === -1 ? 'all' : r}×${c === -1 ? 'all' : c}`;
}

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

const PARALLEL_AXES = ['tp', 'dp', 'ep', 'dcp'];

/** ` · tp=8 ep=8` for a split case, empty for one device; distinguishes otherwise equal shapes. */
export function parallelLabel(a: Args): string {
  const p = obj(a.parallel);
  if (!p) return '';
  const parts = PARALLEL_AXES.flatMap((k) => (p[k] === undefined ? [] : [`${k}=${String(p[k])}`]));
  return parts.length > 0 ? ` · ${parts.join(' ')}` : '';
}

function gemmLabels(a: Args): OpLabels {
  return {
    shape: `${a.m}×${a.n}×${a.k}${parallelLabel(a)}`,
    precision: `${describeOperand(a.a)} × ${describeOperand(a.b)} → ${a.out ?? 'bf16'}`,
  };
}

function moeLabels(a: Args): OpLabels {
  const ex = obj(a.experts) ?? {};
  const latent = num(ex.latent) ? ` L=${ex.latent}` : '';
  const routing = obj(a.routing);
  const dist = routing?.distribution;
  const distLabel =
    dist && dist !== 'natural'
      ? ` · ${typeof dist === 'string' ? dist : `zipf s=${(obj(dist) ?? {}).s}`}`
      : '';
  const select = str(obj(obj(a.router)?.select)?.kind);
  const selectLabel = select && select !== 'topk' ? ` · ${select} routing` : '';
  const shape = `T=${a.tokens} H=${a.hidden} E=${ex.num}/top${ex.top_k} I=${ex.inter}${latent}${distLabel}${selectLabel}${parallelLabel(a)}`;
  const shared = obj(a.shared);
  const sharedW = shared?.w1;
  const precision = `a1 ${describeOperand(ex.a1)} · w ${describeOperand(ex.w1)}${sharedW ? ` · shared w ${describeOperand(sharedW)}` : ''}`;
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
 * How a case is split over one node, per upstream `operatorx/core/parallel.py`: args keep
 * the full unsplit shape and each dp group's batch, and the op runs on `tp × dp` devices.
 * No `parallel` means one device. Returns null for a malformed split.
 */
function split(a: Args): { devices: number; dp: number } | null {
  const p = a.parallel;
  if (p === undefined || p === null) return { devices: 1, dp: 1 };
  const o = obj(p);
  if (!o) return null;
  const axis = (k: string): number | null => {
    const v = o[k];
    if (v === undefined) return 1;
    return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : null;
  };
  const [tp, dp] = [axis('tp'), axis('dp')];
  return tp && dp ? { devices: tp * dp, dp } : null;
}

type NodeCount = (a: Args, tokens: number) => number | null;

/**
 * Spread a whole-node count evenly over the node's devices, so latency (one device's view
 * of the split op) pairs with one device's share. MoE experts see every dp group's batch.
 */
function perDevice(type: string, a: Args, gemm: NodeCount, moe: NodeCount): number | null {
  const s = split(a);
  if (!s) return null;
  let total: number | null = null;
  if (type === 'gemm') total = gemm(a, 0);
  else if (type === 'moe') {
    const t = num(a.tokens);
    total = t ? moe(a, t * s.dp) : null;
  }
  return total === null ? null : total / s.devices;
}

/** Useful FLOPs per device; sharded cases divide the node's work by `tp × dp`. */
export function usefulFlops(type: string, a: Args): number | null {
  return perDevice(type, a, gemmFlops, moeFlops);
}

/** Ideal DRAM bytes per device; sharded cases divide the node's traffic by `tp × dp`. */
export function usefulBytes(type: string, a: Args): number | null {
  return perDevice(type, a, gemmBytes, moeBytes);
}

function gemmFlops(a: Args): number | null {
  const [m, n, k] = [num(a.m), num(a.n), num(a.k)];
  return m && n && k ? 2 * m * n * k : null;
}

function moeFlops(a: Args, t: number): number | null {
  const ex = obj(a.experts);
  const h = num(a.hidden);
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

function gemmBytes(a: Args): number | null {
  const [m, n, k] = [num(a.m), num(a.n), num(a.k)];
  if (!m || !n || !k) return null;
  const out = ELEMENT_BYTES[str(a.out) ?? 'bf16'] ?? 2;
  return operandBytes(obj(a.a), m, k, false) + operandBytes(obj(a.b), n, k) + m * n * out;
}

/**
 * Expected distinct experts that `t` tokens route to, following the forced distributions
 * in InferenceX `operatorx/runners/common/vllm/moe.py`. `natural` (the router's own choice)
 * and unknown values keep the uniform-random estimate. Returns null for a malformed zipf.
 */
export function touchedExperts(e: number, k: number, t: number, routing: unknown): number | null {
  const dist = obj(routing)?.distribution;
  if (dist === 'balanced') return Math.min(e, t * k);
  if (dist === 'single_hot') {
    // Expert 0 on every token, plus k-1 of the remaining e-1 uniformly.
    return e === 1 ? 1 : 1 + (e - 1) * (1 - (1 - (k - 1) / (e - 1)) ** t);
  }
  const zipf = obj(dist);
  if (zipf) {
    const s = num(zipf.s);
    return zipf.kind === 'zipf' && s !== null ? zipfTouched(e, k, t, s) : null;
  }
  return e * (1 - (1 - k / e) ** t);
}

/**
 * Each token draws k experts without replacement with p ~ 1/rank^s. Rosén's approximation
 * gives each expert's per-token inclusion probability 1 - exp(-p·τ), with τ solved so the
 * probabilities sum to k. Against simulation it stays within 2% and errs high, so it never
 * understates bytes.
 */
function zipfTouched(e: number, k: number, t: number, s: number): number {
  if (k >= e) return e;
  const weights = Array.from({ length: e }, (_, i) => 1 / (i + 1) ** s);
  const total = weights.reduce((sum, w) => sum + w, 0);
  const p = weights.map((w) => w / total);
  const picked = (tau: number) => p.reduce((sum, q) => sum + 1 - Math.exp(-q * tau), 0);
  let [lo, hi] = [0, 1];
  while (picked(hi) < k) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (picked(mid) < k) lo = mid;
    else hi = mid;
  }
  return p.reduce((sum, q) => sum + 1 - Math.exp(-q * hi * t), 0);
}

function moeBytes(a: Args, t: number): number | null {
  const ex = obj(a.experts);
  const h = num(a.hidden);
  if (!ex || !t || !h) return null;
  const [e, k, i] = [num(ex.num), num(ex.top_k), num(ex.inter)];
  if (!e || !k || !i) return null;
  const w = num(ex.latent) ?? h;
  const touched = touchedExperts(e, k, t, a.routing);
  if (touched === null) return null;
  let bytes = touched * (operandBytes(obj(ex.w1), 2 * i, w) + operandBytes(obj(ex.w2), w, i));
  const gate = str(obj(obj(a.router)?.gate)?.dtype) ?? 'bf16';
  bytes += h * e * (ELEMENT_BYTES[gate] ?? 2) + 2 * t * h * 2;
  if (num(ex.latent)) bytes += 2 * h * w * 2;
  const sh = obj(a.shared);
  if (sh && num(sh.count) && num(sh.inter)) {
    const si = (sh.inter as number) * (sh.count as number);
    bytes += operandBytes(obj(sh.w1), 2 * si, h) + operandBytes(obj(sh.w2), h, si);
  }
  return bytes;
}
