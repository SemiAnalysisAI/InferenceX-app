/**
 * Human labels and useful-FLOP counts for OperatorX ops (gemm, moe_layer). Pure functions
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

function moeLayerLabels(a: Args): OpLabels {
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
    case 'moe_layer': {
      return moeLayerLabels(args);
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
  if (type === 'moe_layer') {
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
