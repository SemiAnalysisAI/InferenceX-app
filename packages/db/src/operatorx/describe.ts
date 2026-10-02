/**
 * Human labels and work counts for OperatorX ops (gemm, moe and the attention modules).
 * Pure functions of an op's type and args; other op types fall back to generic labels.
 * Counts are per device: a split case's work is shared by its devices.
 */

import { parallelAxes } from './parallel';

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
  const latent = num(ex.latent) ? ` L=${ex.latent}` : '';
  const routing = obj(a.routing);
  const dist = routing?.distribution;
  const distLabel =
    dist && dist !== 'natural'
      ? ` · ${typeof dist === 'string' ? dist : `zipf s=${(obj(dist) ?? {}).s}`}`
      : '';
  const shape = `T=${a.tokens} H=${a.hidden} E=${ex.num}/top${ex.top_k} I=${ex.inter}${latent}${distLabel}`;
  const shared = obj(a.shared);
  const sharedW = shared?.w1;
  const precision = `a1 ${describeOperand(ex.a1)} · w ${describeOperand(ex.w1)}${sharedW ? ` · shared w ${describeOperand(sharedW)}` : ''}`;
  return { shape, precision };
}

/** Attention module op types, each timed whole (OperatorX ops/attention.py). */
export const ATTENTION_TYPES = ['mla', 'mla_dsa', 'dsv4_attn', 'gqa', 'qsa', 'gdn', 'kda'];

const ATTENTION_NAMES: Record<string, string> = {
  mla: 'MLA',
  mla_dsa: 'MLA + DSA',
  dsv4_attn: 'V4 attention',
  gqa: 'GQA',
  qsa: 'Sparse GQA',
  gdn: 'Gated DeltaNet',
  kda: 'KDA',
};

interface Group {
  count: number;
  q: number;
  ctx: number;
}

/** A batch's request groups, a ranged ctx at its mean. */
function groups(a: Args): Group[] {
  const b = obj(a.batch);
  const list = b && Array.isArray(b.groups) ? b.groups : [];
  return list.flatMap((g) => {
    const o = obj(g);
    if (!o) return [];
    const range = obj(o.ctx);
    const ctx = range ? ((num(range.min) ?? 0) + (num(range.max) ?? 0)) / 2 : num(o.ctx);
    const [count, q] = [num(o.count), num(o.q)];
    return count && q && ctx !== null ? [{ count, q, ctx }] : [];
  });
}

/** New tokens of a batch: the module's input rows. */
export function attentionTokens(a: Args): number | null {
  const gs = groups(a);
  return gs.length > 0 ? gs.reduce((t, g) => t + g.count * g.q, 0) : null;
}

/**
 * Keys the q new tokens of one request attend causally after ctx cached ones, summed over
 * the tokens, each token seeing at most `cap` keys.
 */
function keys(ctx: number, q: number, cap = Infinity): number {
  if (ctx + q <= cap) return q * ctx + (q * (q + 1)) / 2;
  if (ctx + 1 >= cap) return q * cap;
  const n = cap - ctx;
  return n * ctx + (n * (n + 1)) / 2 + (q - n) * cap;
}

const sumGroups = (gs: Group[], f: (g: Group) => number) =>
  gs.reduce((t, g) => t + g.count * f(g), 0);

/** A projection: checkpoint module name, input and output width. */
type Proj = [name: string, inDim: number, outDim: number];

/** An attention module's projections, core work and cache/state traffic, per data-parallel group. */
interface AttentionWork {
  proj: Proj[];
  /** Attention-core or recurrence FLOPs. */
  core: number;
  /** Cache or recurrent-state bytes read and written. */
  cache: number;
  /** Width of each new token's attention output over all heads, merged across dcp ranks. */
  merge: number;
}

const CACHE_BYTES = (dtype: unknown): number =>
  typeof dtype === 'string' && dtype.startsWith('fp8') ? 1 : 2;

function attentionWork(type: string, a: Args): AttentionWork | null {
  const gs = groups(a);
  const h = num(a.hidden);
  if (gs.length === 0 || !h) return null;
  const tokens = sumGroups(gs, (g) => g.q);
  const kvBytes = CACHE_BYTES(a.kv_cache_dtype);
  // Cached tokens read plus new tokens written, `perToken` bytes each.
  const cacheOf = (perToken: number, read: (g: Group) => number = (g) => g.ctx) =>
    perToken * (sumGroups(gs, read) + tokens);
  const n = (k: string) => num(a[k]) ?? 0;
  switch (type) {
    case 'gqa':
    case 'qsa': {
      const [qh, kvh, hd] = [n('q_heads'), n('kv_heads'), n('head_dim')];
      const gated = type === 'qsa' || a.gate === true;
      const proj: Proj[] = [
        ['q_proj', h, qh * hd * (gated ? 2 : 1)],
        ['k_proj', h, kvh * hd],
        ['v_proj', h, kvh * hd],
        ['o_proj', qh * hd, h],
      ];
      if (type === 'gqa')
        return {
          proj,
          core: 4 * qh * hd * sumGroups(gs, (g) => keys(g.ctx, g.q)),
          cache: cacheOf(2 * kvh * hd * kvBytes),
          merge: qh * hd,
        };
      const [ih, id, compress, budget] = [
        n('index_heads'),
        n('index_dim'),
        n('compress'),
        n('budget'),
      ];
      proj.push(['indexer.index_qk_proj', h, (ih + 1) * id]);
      const scored = sumGroups(gs, (g) => keys(g.ctx, g.q)) / Math.max(compress, 1);
      return {
        proj,
        core: 4 * qh * hd * sumGroups(gs, (g) => keys(g.ctx, g.q, budget)) + 2 * ih * id * scored,
        cache: cacheOf(2 * kvh * hd * 2, (g) => Math.min(g.ctx, budget)),
        merge: qh * hd,
      };
    }
    case 'mla':
    case 'mla_dsa': {
      const [heads, ql, kvl, nope, rope, v] = [
        n('heads'),
        n('q_lora_rank'),
        n('kv_lora_rank'),
        n('nope'),
        n('rope_dim'),
        n('v'),
      ];
      const proj: Proj[] = [
        ['q_a_proj', h, ql],
        ['kv_a_proj_with_mqa', h, kvl + rope],
        ['q_b_proj', ql, heads * (nope + rope)],
        ['kv_b_proj', kvl, heads * (nope + v)],
        ['o_proj', heads * v, h],
      ];
      if (a.gate === true) proj.push(['g_proj', h, heads * v]);
      const perQuery = 2 * heads * (nope + rope + v);
      if (type === 'mla')
        return {
          proj,
          core: perQuery * sumGroups(gs, (g) => keys(g.ctx, g.q)),
          cache: cacheOf((kvl + rope) * kvBytes),
          merge: heads * v,
        };
      const [topk, ih, id] = [n('topk'), n('index_heads'), n('index_dim')];
      const own = (a.indexer ?? 'own') === 'own';
      if (own)
        proj.push(
          ['indexer.wq_b', ql, ih * id],
          ['indexer.wk', h, id],
          ['indexer.weights_proj', h, ih],
        );
      return {
        proj,
        core:
          perQuery * sumGroups(gs, (g) => keys(g.ctx, g.q, topk)) +
          (own ? 2 * ih * id * sumGroups(gs, (g) => keys(g.ctx, g.q)) : 0),
        cache: cacheOf((kvl + rope) * kvBytes, (g) => Math.min(g.ctx, topk)),
        merge: heads * v,
      };
    }
    case 'dsv4_attn': {
      const [heads, hd, ql, groupsOut, ol, ratio, window] = [
        n('heads'),
        n('head_dim'),
        n('q_lora_rank'),
        n('o_groups'),
        n('o_lora_rank'),
        n('compress_ratio'),
        n('window'),
      ];
      const proj: Proj[] = [
        ['wq_a', h, ql],
        ['wkv', h, hd],
        ['wq_b', ql, heads * hd],
        // grouped: each of o_groups groups maps its heads to o_lora_rank
        ['wo_a', heads * hd, ol],
        ['wo_b', groupsOut * ol, h],
      ];
      if (ratio > 0 && a.source !== false) {
        const width = hd * (ratio === 4 ? 2 : 1);
        proj.push(['compressor.wkv', h, width], ['compressor.wgate', h, width]);
      }
      const indexer = str(a.indexer);
      const [topk, ih, id] = [n('topk'), n('index_heads'), n('index_dim')];
      if (indexer === 'own') {
        proj.push(['indexer.wq_b', ql, ih * id], ['indexer.weights_proj', h, ih]);
        if (ratio === 4)
          proj.push(['indexer.compressor.wkv', h, 2 * id], ['indexer.compressor.wgate', h, 2 * id]);
        else proj.push(['indexer.wk', h, id]);
      }
      const all = (g: Group) => keys(g.ctx, g.q);
      const compressed = (g: Group) =>
        ratio > 0 ? Math.min(all(g) / ratio, indexer ? g.q * topk : Infinity) : 0;
      const attended = sumGroups(gs, (g) => keys(g.ctx, g.q, window) + compressed(g));
      const scored = indexer && ratio > 0 ? sumGroups(gs, all) / ratio : 0;
      return {
        proj,
        core: 4 * heads * hd * attended + 2 * ih * id * scored,
        cache:
          cacheOf(hd * kvBytes, (g) => Math.min(g.ctx, window)) +
          (ratio > 0 ? (hd * kvBytes * sumGroups(gs, (g) => g.ctx)) / ratio : 0),
        merge: heads * hd,
      };
    }
    case 'gdn':
    case 'kda': {
      const hd = n('head_dim');
      const vh = type === 'gdn' ? n('v_heads') : n('heads');
      const proj: Proj[] =
        type === 'gdn'
          ? [
              ['in_proj_qkv', h, 2 * n('qk_heads') * hd + vh * hd],
              ['in_proj_z', h, vh * hd],
              ['in_proj_a', h, vh],
              ['in_proj_b', h, vh],
              ['out_proj', vh * hd, h],
            ]
          : [
              ['q_proj', h, vh * hd],
              ['k_proj', h, vh * hd],
              ['v_proj', h, vh * hd],
              ['g_proj', h, vh * hd],
              ['f_a_proj', h, hd],
              ['f_b_proj', hd, vh * hd],
              ['b_proj', h, vh],
              ['o_proj', vh * hd, h],
            ];
      const state = vh * hd * hd * (a.state_dtype === 'bf16' ? 2 : 4);
      // each token updates and reads every head's k×v state
      return {
        proj,
        core: 6 * vh * hd * hd * tokens,
        cache: 2 * state * sumGroups(gs, () => 1),
        merge: 0,
      };
    }
    default: {
      return null;
    }
  }
}

/** The operand pair a module's projection runs with; bf16 × bf16 when unlisted. */
function projOperands(a: Args, name: string): { a: Args | null; b: Args | null } {
  const pair = obj(obj(a.proj)?.[name]);
  return { a: obj(pair?.a), b: obj(pair?.b) };
}

function attentionLabels(type: string, a: Args): OpLabels {
  const gs = groups(a);
  const batch = gs.map((g) => `${g.count}×q${g.q} ctx${Math.round(g.ctx)}`).join(' + ');
  const ratio = num(a.compress_ratio);
  const variant = type === 'dsv4_attn' && ratio ? ` ÷${ratio}` : '';
  const proj = obj(a.proj);
  const first = proj ? Object.keys(proj).sort()[0] : null;
  const weights = first ? describeOperand(projOperands(a, first).b) : 'bf16';
  const cache =
    type === 'gdn' || type === 'kda'
      ? `state ${str(a.state_dtype) ?? 'fp32'}`
      : `kv ${str(a.kv_cache_dtype) ?? 'auto'}`;
  return {
    shape: `${ATTENTION_NAMES[type] ?? type}${variant} · ${batch}`,
    precision: `proj ${weights} · ${cache}`,
  };
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
      if (ATTENTION_TYPES.includes(type)) return attentionLabels(type, args);
      return { shape: JSON.stringify(args).slice(0, 80), precision: '' };
    }
  }
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

/** Arithmetic precision the math runs at, for peak-throughput lookups. */
export type ComputePrecision = 'fp4' | 'fp8' | 'bf16' | 'other';

/** The precision math on these operands runs at: that of the widest. */
export function mathPrecision(operands: unknown[]): ComputePrecision {
  const dtypes = operands.map((o) => str(obj(o)?.dtype) ?? 'bf16');
  if (dtypes.some((d) => d === 'bf16' || d === 'fp16')) return 'bf16';
  if (dtypes.some((d) => d === 'e4m3' || d === 'e5m2' || d === 'int8')) return 'fp8';
  if (dtypes.length > 0 && dtypes.every((d) => d === 'e2m1' || d === 'int4')) return 'fp4';
  return 'other';
}

/** One stage of an op on one device: useful FLOPs, the bytes it must move, its math precision. */
export interface WorkPart {
  name: string;
  flops: number;
  bytes: number;
  precision: ComputePrecision;
}

/** A collective inside the op: the bytes each device sends over its scale-up link. */
export interface LinkTransfer {
  name: string;
  bytes: number;
}

/** What one call of an op does on each of its devices. */
export interface OpWork {
  parts: WorkPart[];
  links: LinkTransfer[];
}

const BF16 = { dtype: 'bf16' };

/** Ring all-reduce: each device sends 2(n-1)/n of the buffer. */
const allReduce = (n: number, size: number) => (2 * (n - 1) * size) / n;
/** All-gather, reduce-scatter or all-to-all: each device sends (n-1)/n of the whole. */
const spread = (n: number, size: number) => ((n - 1) * size) / n;

function gemmWork(a: Args): OpWork | null {
  const [m, n, k] = [num(a.m), num(a.n), num(a.k)];
  if (!m || !n || !k) return null;
  const { tp } = parallelAxes(a);
  const c = m * n * (ELEMENT_BYTES[str(a.out) ?? 'bf16'] ?? 2);
  // B split over K: each device reads its slice of A and B and writes a full partial C
  const inputs = operandBytes(obj(a.a), m, k, false) + operandBytes(obj(a.b), n, k);
  return {
    parts: [
      {
        name: 'GEMM',
        flops: (2 * m * n * k) / tp,
        bytes: inputs / tp + c,
        precision: mathPrecision([a.a, a.b]),
      },
    ],
    links: tp > 1 ? [{ name: 'all-reduce', bytes: allReduce(tp, c) }] : [],
  };
}

function moeWork(a: Args): OpWork | null {
  const ex = obj(a.experts);
  const [t, h] = [num(a.tokens), num(a.hidden)];
  if (!ex || !t || !h) return null;
  const [e, k, i] = [num(ex.num), num(ex.top_k), num(ex.inter)];
  if (!e || !k || !i) return null;
  const { tp, dp, ep } = parallelAxes(a);
  const w = num(ex.latent) ?? h;
  // Routed experts serve every dp group's tokens, their weights split over all tp·dp devices
  // (by expert under ep, else within each expert): the experts all the tokens are expected
  // to touch under uniform routing, over dp here and tp below.
  const touched = (e * (1 - (1 - k / e) ** (t * dp))) / dp;
  const gate = obj(obj(a.router)?.gate);
  const parts: WorkPart[] = [
    {
      name: 'router',
      flops: 2 * t * h * e,
      bytes: h * e * 2 + t * h * 2,
      precision: mathPrecision([gate ?? BF16]),
    },
  ];
  if (num(ex.latent))
    parts.push(
      { name: 'latent down', flops: 2 * t * h * w, bytes: h * w * 2, precision: 'bf16' },
      { name: 'latent up', flops: 2 * t * h * w, bytes: h * w * 2, precision: 'bf16' },
    );
  parts.push(
    {
      name: 'experts gate/up',
      flops: 4 * t * w * i * k,
      bytes: touched * operandBytes(obj(ex.w1), 2 * i, w),
      precision: mathPrecision([ex.a1, ex.w1]),
    },
    {
      name: 'experts down',
      flops: 2 * t * w * i * k,
      bytes: touched * operandBytes(obj(ex.w2), w, i) + t * h * 2,
      precision: mathPrecision([ex.a2 ?? ex.a1, ex.w2]),
    },
  );
  const sh = obj(a.shared);
  const si = sh ? (num(sh.inter) ?? 0) * (num(sh.count) ?? 0) : 0;
  if (sh && si)
    parts.push({
      name: 'shared expert',
      flops: 6 * t * h * si,
      bytes: operandBytes(obj(sh.w1), 2 * si, h) + operandBytes(obj(sh.w2), h, si),
      precision: mathPrecision([sh.a1, sh.w1]),
    });
  const world = tp * dp;
  const x = t * h * 2;
  let links: LinkTransfer[] = [];
  if (ep > 1) {
    // each of a group's tp devices dispatches its share of the group's token copies;
    // the copies bound for experts on other devices leave over the link
    links = [
      { name: 'dispatch', bytes: spread(world, operandBytes(obj(ex.a1), t * k, h) / tp) },
      { name: 'combine', bytes: spread(world, (t * k * h * 2) / tp) },
    ];
  } else if (dp > 1)
    links = [
      { name: 'all-gather', bytes: (dp - 1) * x },
      { name: 'reduce-scatter', bytes: spread(world, dp * x) },
    ];
  else if (tp > 1) links = [{ name: 'all-reduce', bytes: allReduce(tp, x) }];
  return { parts: parts.map((p) => ({ ...p, flops: p.flops / tp, bytes: p.bytes / tp })), links };
}

function attentionOpWork(type: string, a: Args): OpWork | null {
  const work = attentionWork(type, a);
  if (!work) return null;
  const [tokens, h] = [attentionTokens(a) ?? 0, num(a.hidden) ?? 0];
  const { tp, dcp } = parallelAxes(a);
  const parts: WorkPart[] = work.proj.map(([name, i, o]) => {
    const pair = projOperands(a, name);
    return {
      name,
      flops: 2 * tokens * i * o,
      bytes: operandBytes(pair.b, o, i),
      precision: mathPrecision([pair.a ?? BF16, pair.b ?? BF16]),
    };
  });
  parts.push({
    name: type === 'gdn' || type === 'kda' ? 'recurrence' : 'attention core',
    flops: work.core,
    bytes: work.cache + 2 * tokens * h * 2,
    precision: 'bf16',
  });
  // dcp: each rank holds 1/dcp of the cache for dcp× the heads; queries gathered, outputs merged
  const merged = (tokens * work.merge * dcp * 2) / tp;
  return {
    parts: parts.map((p) => ({ ...p, flops: p.flops / tp, bytes: p.bytes / tp })),
    links: dcp > 1 && merged > 0 ? [{ name: 'dcp merge', bytes: 2 * spread(dcp, merged) }] : [],
  };
}

/**
 * What one op call does on each of its devices, stage by stage, or null when the op has
 * no defined count here. FLOPs are useful work (2 per multiply-add); bytes are the least
 * each stage must move to or from memory, every input read once and output written once.
 *
 * GEMM reads A as it enters the op (bf16 unless pre-quantized) and B as stored. MoE counts
 * the router, latent projections, the routed experts at their active top-k (reading the
 * weights of the experts the tokens are expected to touch, E·(1-(1-k/E)^T) under uniform
 * routing) and the shared experts; activations, routing and combine work are excluded.
 * Attention counts each projection and the attention core (or linear recurrence), causal,
 * each query's keys capped where the module selects them, reading the cache or state it
 * attends. A data-parallel group's work is split over its tensor-parallel devices.
 *
 * Links are the collectives the split needs at the least: a tensor-parallel GEMM's
 * all-reduce, an MoE's all-reduce, all-gather/reduce-scatter or expert-parallel
 * dispatch/combine, attention's dcp merge. Attention's tensor-parallel all-reduce runs
 * outside the op.
 */
export function opWork(type: string, a: Args): OpWork | null {
  if (type === 'gemm') return gemmWork(a);
  if (type === 'moe') return moeWork(a);
  return ATTENTION_TYPES.includes(type) ? attentionOpWork(type, a) : null;
}

/** Useful FLOPs of one op call on each of its devices, or null when not counted here. */
export function usefulFlops(type: string, a: Args): number | null {
  return opWork(type, a)?.parts.reduce((t, p) => t + p.flops, 0) ?? null;
}

/** Minimum memory bytes of one op call on each of its devices, or null when not counted here. */
export function usefulBytes(type: string, a: Args): number | null {
  return opWork(type, a)?.parts.reduce((t, p) => t + p.bytes, 0) ?? null;
}
