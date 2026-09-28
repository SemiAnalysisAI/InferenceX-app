import type {
  ComparisonColumns,
  ComparisonOp,
  ComparisonView,
  ComputePrecision,
} from '@semianalysisai/inferencex-db/operatorx/compare';

import type { Model } from '@/lib/data-mappings';
import {
  ffnGateActivationLabel,
  MODEL_ARCHITECTURES,
  type ModelArchitecture,
} from '@/lib/model-architectures';

/** Block colors of the model architecture diagram (`model-architecture-diagram-renderer`). */
export type BlockKind = 'embedding' | 'attention' | 'ffn' | 'expert' | 'output';

/**
 * A measured op: its cases come from `op`'s view, by role. The MoE op takes every case;
 * an attention op takes the cases of its module types whose dims match `where`.
 */
export interface OpSlot {
  id: string;
  label: string;
  op: ComparisonOp;
  roles: string[];
  types?: string[];
  where?: Record<string, number>;
}

/** One box of a block's graph. */
export interface FlowNode {
  id: string;
  label: string;
  /** More about the box, shown on hover. */
  title?: string;
  /** Ids of the measured ops that run this box: its own GEMMs, or the op covering its block. */
  slots: string[];
  /** Column of the block's grid, and how many it spans; null for a box across the middle. */
  col: number | null;
  span: number;
  /** Rows it spans; a box with several GEMMs has a row of bars for each. */
  row: number;
  rowEnd: number;
  /** A folded fused op: it unfolds into the ops it runs. */
  fold?: Fold;
  /** The unfolded fused ops this box runs part of, outermost first. */
  groups?: Fold[];
}

/** The key `open` holds while a fused op is unfolded, and whether it is. */
export interface Fold {
  key: string;
  open: boolean;
}

/** Rows a measured op spans, and the row holding its bars. */
export interface SlotSpan {
  slot: OpSlot;
  first: number;
  last: number;
  bar: number;
}

/**
 * A block drawn as the architecture explainer draws its drill-downs: boxes joined by
 * arrows, parallel paths side by side, stage by stage. A measured GEMM has a row of its
 * own, tall enough for its bars.
 */
export interface LayerBlock {
  id: string;
  label: string;
  kind: BlockKind;
  /** How many layers repeat this block, when more than one. */
  repeat: number | null;
  /** Layers run this block or the one before it, never both. */
  alternative: boolean;
  cols: number;
  /** Per row: whether it holds a row of bars. */
  tall: boolean[];
  nodes: FlowNode[];
  /** `[from, to]` node ids. */
  edges: [string, string][];
  /** Nodes fed by the block's input. */
  entries: string[];
  spans: SlotSpan[];
  /** While the whole block is unfolded from its one fused op: what folds it back. */
  fold: Fold | null;
}

/** A box of a hand-drawn graph, with the GEMM roles that run it. */
interface Def {
  id: string;
  label: string;
  col: number | null;
  span?: number;
  after?: string[];
  roles?: string[];
  title?: string;
  /** Drawn only when one of its roles was measured. */
  optional?: boolean;
  /** One op that runs these boxes: drawn in their place until it is unfolded. */
  fuses?: string[];
  fold?: Fold;
  groups?: Fold[];
}

/** Measured roles as the graphs name them, each with the spellings the data uses. */
type Present = ReadonlyMap<string, ReadonlySet<string>>;

interface Graph {
  cols: number;
  nodes: Def[];
  /** Lay each box out as late as its outputs allow, so short paths end together. */
  late?: boolean;
}

const node = (
  id: string,
  label: string,
  col: number | null,
  after: string[] = [],
  roles: string[] = [],
  extra: Partial<Def> = {},
): Def => ({ id, label, col, after, roles, ...extra });

const MODULE_PREFIX = /^(?:self_attn|block_sparse_moe|mlp|linear_attn)\./u;

/**
 * A role as the graphs name it: an MTP module's layers share the main role's box, and the
 * module prefix some checkpoints write (`self_attn.`, `block_sparse_moe.`) is dropped from
 * each GEMM of a fused role.
 */
const baseRole = (role: string) =>
  role
    .replace(/^mtp\./u, '')
    .split('+')
    .map((part) => part.replace(MODULE_PREFIX, ''))
    .join('+');

const gemm = (role: string, prefix: string, spellings: Iterable<string>): OpSlot => ({
  id: `${prefix}${role}`,
  label: role,
  op: 'gemm',
  roles: [...spellings],
});

export function architecture(model: string): ModelArchitecture | undefined {
  return MODEL_ARCHITECTURES[model as Model];
}

/** The roles case `i` has in `model`: its layers there. */
function caseRoles(view: ComparisonView, i: number, model: string): string[] {
  return view.cases[i].sources.find((s) => view.models[s.model] === model)?.roles ?? [];
}

/** Whether an attention slot takes a case: one of its module types, dims matching. */
function attentionCase(c: ComparisonView['cases'][number], slot: OpSlot): boolean {
  return (
    Boolean(slot.types?.includes(c.opType)) &&
    Object.entries(slot.where ?? {}).every(([k, v]) => c.dims[k] === v)
  );
}

/** Indices of the view's cases that belong to a slot of `model`, at one compute precision. */
export function slotCases(
  view: ComparisonView | undefined,
  slot: OpSlot,
  model: string,
  precision: ComputePrecision | null,
): number[] {
  if (!view) return [];
  const takes = (i: number) => {
    if (slot.op === 'moe') return true;
    if (slot.op === 'attention') return attentionCase(view.cases[i], slot);
    return caseRoles(view, i, model).some((r) => slot.roles.includes(r));
  };
  return view.cases.flatMap((c, i) =>
    (precision === null || c.computePrecision === precision) && takes(i) ? [i] : [],
  );
}

/** Stage of every box: its longest path from the block input, or with `late`, to the output. */
function stages(nodes: Def[], late: boolean): Map<string, number> {
  const early = new Map<string, number>();
  const at = (d: Def): number => {
    if (!early.has(d.id))
      early.set(
        d.id,
        Math.max(-1, ...(d.after ?? []).map((a) => at(nodes.find((n) => n.id === a)!))) + 1,
      );
    return early.get(d.id)!;
  };
  for (const d of nodes) at(d);
  if (!late) return early;
  const depth = Math.max(...early.values());
  const out = new Map<string, number>();
  const back = (d: Def): number => {
    if (!out.has(d.id)) {
      const next = nodes.filter((n) => n.after?.includes(d.id));
      out.set(d.id, next.length === 0 ? depth : Math.min(...next.map(back)) - 1);
    }
    return out.get(d.id)!;
  };
  for (const d of nodes) back(d);
  return out;
}

export type Flow = Pick<LayerBlock, 'cols' | 'tall' | 'nodes' | 'edges' | 'entries' | 'spans'>;

/** The graph without the boxes `drop` rejects, and the arrows into them. */
function without(graph: Graph, drop: (d: Def) => boolean): Graph {
  const kept = graph.nodes.filter((d) => !drop(d));
  const ids = new Set(kept.map((d) => d.id));
  return {
    ...graph,
    nodes: kept.map((d) => ({ ...d, after: d.after?.filter((a) => ids.has(a)) })),
  };
}

/**
 * Adds a box for each measured role that runs several of the graph's GEMMs as one
 * (`a+b`: GEMMs sharing an input, fused), drawn in place of those boxes until unfolded.
 * A fused role running a subset of another's nests inside it; one whose parts all land
 * on one box joins that box.
 */
function fuseRoles(graph: Graph, present: Present): Graph {
  const known = new Set(graph.nodes.flatMap((d) => d.roles ?? []));
  // copies: roles and arrows are added to them below
  const nodes = graph.nodes.map((d) => ({
    ...d,
    roles: [...(d.roles ?? [])],
    after: [...(d.after ?? [])],
  }));
  // the drawing's own fused boxes: another spelling of one of them joins it
  const leaves = (d: Def): string[] =>
    d.fuses ? d.fuses.flatMap((id) => nodes.filter((x) => x.id === id).flatMap(leaves)) : [d.id];
  const made = nodes.filter((d) => d.fuses).map((d) => ({ id: d.id, covers: new Set(leaves(d)) }));
  const fused = [...present.keys()]
    .filter((r) => r.includes('+') && !known.has(r))
    .map((role) => ({ role, parts: role.split('+') }))
    .sort((a, b) => a.parts.length - b.parts.length || a.role.localeCompare(b.role));
  const owner = (part: string) => nodes.find((d) => !d.fuses && d.roles.includes(part));
  for (const { role, parts } of fused) {
    const owners = parts.map(owner);
    if (owners.some((d) => !d)) continue;
    const covers = new Set(owners.map((d) => d!.id));
    const within = (m: { covers: Set<string> }) => [...m.covers].every((c) => covers.has(c));
    const same = made.find((m) => m.covers.size === covers.size && within(m));
    const into = nodes.find((d) => d.id === (covers.size === 1 ? owners[0]!.id : same?.id));
    if (into) {
      into.roles.push(role);
      continue;
    }
    // the largest fused boxes already inside this one, disjoint
    const inner: typeof made = [];
    const nested = made.filter((m) => m.covers.size < covers.size && within(m));
    for (const box of nested.toSorted((a, b) => b.covers.size - a.covers.size))
      if (![...box.covers].some((c) => inner.some((x) => x.covers.has(c)))) inner.push(box);
    const members = nodes.filter((d) => covers.has(d.id));
    const inside = new Set([
      ...covers,
      ...made.filter((m) => [...m.covers].some((c) => covers.has(c))).map((m) => m.id),
    ]);
    const cols = members.map((d) => d.col);
    const col = cols.includes(null) ? null : Math.min(...(cols as number[]));
    const end = Math.max(...members.map((d) => (d.col ?? 0) + (d.span ?? 1)));
    const id = `fused:${role}`;
    for (const d of nodes)
      if (!inside.has(d.id) && d.after.some((x) => covers.has(x))) d.after.push(id);
    nodes.push({
      id,
      label: members.map((d) => d.label).join(' + '),
      col,
      span: col === null ? 1 : end - col,
      after: [...new Set(members.flatMap((d) => d.after))].filter((x) => !inside.has(x)),
      roles: [role],
      fuses: [
        ...inner.map((box) => box.id),
        ...[...covers].filter((c) => !inner.some((box) => box.covers.has(c))),
      ],
      title: `${role}: one fused GEMM`,
    });
    made.push({ id, covers });
  }
  return { ...graph, nodes };
}

/**
 * Draws each measured fused op in place of the boxes it runs, unless `open` holds it;
 * unfolded, its boxes are drawn, each fused one of them folded again until opened.
 * With no fused op measured, the unfused boxes are the only drawing.
 */
function unfold(graph: Graph, present: Present, prefix: string, open: ReadonlySet<string>): Flow {
  const kept = without(graph, (d) => Boolean(d.optional) && !d.roles?.some((r) => present.has(r)));
  const byId = new Map(kept.nodes.map((d) => [d.id, d]));
  const members = new Set(kept.nodes.flatMap((d) => d.fuses ?? []));
  const shown = new Map<string, Pick<Def, 'fold' | 'groups'>>();
  const visit = (d: Def, groups: Fold[]) => {
    const parts = (d.fuses ?? []).flatMap((id) => byId.get(id) ?? []);
    if (parts.length === 0) {
      shown.set(d.id, { groups });
      return;
    }
    const fold = { key: `${prefix}${d.id}`, open: open.has(`${prefix}${d.id}`) };
    if (fold.open) for (const m of parts) visit(m, [...groups, fold]);
    else shown.set(d.id, { fold, groups });
  };
  for (const d of kept.nodes) if (!members.has(d.id)) visit(d, []);
  const visible = without(kept, (d) => !shown.has(d.id));
  return layout(
    { ...visible, nodes: visible.nodes.map((d) => ({ ...d, ...shown.get(d.id) })) },
    present,
    prefix,
  );
}

/**
 * Lays a graph out in rows and binds the measured roles to its boxes. Each stage puts its
 * unmeasured boxes on one row, then gives each GEMM a row for its bars. With `group`, one
 * op covers every box: its bars sit on the first row.
 */
function layout(graph: Graph, present: Present, prefix: string, group?: OpSlot): Flow {
  const stage = stages(graph.nodes, Boolean(graph.late));
  const own = new Map(
    graph.nodes.map((d) => [d.id, (d.roles ?? []).filter((r) => present.has(r))]),
  );
  const tall: boolean[] = [];
  const rows = new Map<string, number[]>();
  const slotRow = new Map<string, number>();
  const depth = Math.max(...stage.values());
  for (let s = 0; s <= depth; s++) {
    const here = graph.nodes.filter((d) => stage.get(d.id) === s);
    const compact = here.filter((d) => own.get(d.id)!.length === 0);
    if (compact.length > 0 || (group && s === 0)) {
      tall.push(Boolean(group && s === 0));
      for (const d of compact) rows.set(d.id, [tall.length - 1]);
    }
    const roles = [...new Set(here.flatMap((d) => own.get(d.id)!))];
    const users = (r: string) => here.filter((d) => own.get(d.id)!.includes(r));
    const leftmost = (r: string) => Math.min(...users(r).map((d) => d.col ?? 0));
    roles.sort((a, b) => leftmost(a) - leftmost(b) || users(a).length - users(b).length);
    for (const r of roles) {
      tall.push(true);
      slotRow.set(r, tall.length - 1);
    }
    for (const d of here)
      if (own.get(d.id)!.length > 0)
        rows.set(
          d.id,
          own.get(d.id)!.map((r) => slotRow.get(r)!),
        );
  }
  const nodes: FlowNode[] = graph.nodes.map((d) => {
    const r = rows.get(d.id)!;
    return {
      id: `${prefix}${d.id}`,
      label: d.label,
      title: d.title,
      slots: [...(group ? [group.id] : []), ...own.get(d.id)!.map((role) => `${prefix}${role}`)],
      col: d.col,
      span: d.span ?? 1,
      row: Math.min(...r),
      rowEnd: Math.max(...r),
      fold: d.fold,
      groups: d.groups,
    };
  });
  const spans: SlotSpan[] = [
    ...(group ? [{ slot: group, first: 0, last: tall.length - 1, bar: 0 }] : []),
    ...[...slotRow].map(([role, row]) => ({
      slot: gemm(role, prefix, present.get(role) ?? []),
      first: row,
      last: row,
      bar: row,
    })),
  ];
  return {
    cols: Math.max(graph.cols, ...graph.nodes.map((d) => (d.col ?? 0) + (d.span ?? 1))),
    tall,
    nodes,
    edges: graph.nodes.flatMap((d) =>
      (d.after ?? []).map((a): [string, string] => [`${prefix}${a}`, `${prefix}${d.id}`]),
    ),
    entries: graph.nodes.filter((d) => !d.after?.length).map((d) => `${prefix}${d.id}`),
    spans,
  };
}

/**
 * Grouped-query (or multi-head) attention: q, k and v, each rotated, into the core.
 * `blocks` adds a block-sparse selector: its own q and k projections score blocks of past
 * tokens and the core attends the top ones.
 */
function gqaGraph(opts: {
  qkNorm: boolean;
  core: string;
  coreTitle?: string;
  gated?: boolean;
  blocks?: string;
}) {
  const rope = opts.qkNorm ? 'Norm + RoPE' : 'RoPE';
  const out = opts.gated ? 'gate' : 'core';
  return {
    cols: opts.blocks ? 5 : 3,
    nodes: [
      node('q', 'q_proj', 0, [], ['q_proj', 'self_attn.q_proj'], {
        title: opts.gated ? 'Emits the queries and a per-head output gate' : undefined,
      }),
      node('k', 'k_proj', 1, [], ['k_proj', 'self_attn.k_proj']),
      node('v', 'v_proj', 2, [], ['v_proj', 'self_attn.v_proj']),
      node('qkv', 'qkv_proj', 0, [], ['qkv_proj'], {
        span: 3,
        optional: true,
        fuses: ['q', 'k', 'v'],
        title: 'q, k and v as one fused GEMM, as some engines run them',
      }),
      // five columns leave too little room for a rotary box per head type, so q and k share one
      ...(opts.blocks
        ? [node('qk-rope', `q/k ${rope}`, 0, ['q', 'k', 'qkv'], [], { span: 2 })]
        : [node('q-rope', rope, 0, ['q', 'qkv']), node('k-rope', rope, 1, ['k', 'qkv'])]),
      ...(opts.blocks
        ? [
            node('idx-q', 'index_q_proj', 3, [], ['index_q_proj']),
            node('idx-k', 'index_k_proj', 4, [], ['index_k_proj']),
            node('blocks', opts.blocks, 3, ['idx-q', 'idx-k'], [], {
              span: 2,
              title: 'Scores blocks of past tokens from the index queries and keys',
            }),
          ]
        : []),
      node(
        'core',
        opts.core,
        null,
        [...(opts.blocks ? ['qk-rope', 'blocks'] : ['q-rope', 'k-rope']), 'v', 'qkv'],
        [],
        { title: opts.coreTitle },
      ),
      ...(opts.gated
        ? [
            node('gate', '× σ(gate)', null, ['core'], [], {
              title: 'Output gated by the sigmoid of the gate q_proj emits',
            }),
          ]
        : []),
      node('o', 'o_proj', null, [out], ['o_proj', 'self_attn.o_proj']),
    ],
  } satisfies Graph;
}

/**
 * Multi-head latent attention: queries through a low-rank latent, keys and values from
 * one compressed latent plus a shared rotary key. `dsa` adds DeepSeek sparse attention's
 * lightning indexer, which scores tokens from the query latent.
 */
function mlaGraph(dsa: { topk: number } | null, opts: { gate?: boolean; nope?: boolean } = {}) {
  const fused = 'fused_qkv_a_proj_with_mqa';
  const rope = !opts.nope;
  return {
    cols: dsa || opts.gate ? 4 : 3,
    nodes: [
      node('q-a', 'q_a_proj', 0, [], ['q_a_proj']),
      node('kv-a', 'kv_a_proj_with_mqa', 1, [], ['kv_a_proj_with_mqa'], {
        span: 2,
      }),
      node('qkv-a', fused, 0, [], [fused], { span: 3, optional: true, fuses: ['q-a', 'kv-a'] }),
      node('q-norm', 'RMSNorm', 0, ['q-a', 'qkv-a']),
      node('kv-norm', 'RMSNorm', 1, ['kv-a', 'qkv-a']),
      node('k-rope', rope ? 'RoPE (k_pe)' : 'k_pe', 2, ['kv-a', 'qkv-a'], [], {
        title: rope
          ? 'The rotary key part, shared by every head'
          : 'The shared key part, cached but never rotated (NoPE)',
      }),
      ...(opts.gate
        ? [
            node('g', 'g_proj', 3, [], ['g_proj'], {
              title: 'Per-head output gate from the layer input',
            }),
          ]
        : []),
      node('q-b', 'q_b_proj', 0, ['q-norm'], ['q_b_proj']),
      node('kv-b', 'kv_b_proj', 1, ['kv-norm'], ['kv_b_proj']),
      ...(dsa
        ? [
            node(
              'idx',
              'Lightning indexer',
              3,
              ['q-norm'],
              [
                'indexer.wq_b',
                'indexer.wk',
                'indexer.weights_proj',
                'self_attn.indexer.wq_b',
                'self_attn.indexer.wk',
              ],
              { title: 'Scores past tokens from the query latent' },
            ),
            node('idx-top', `Top-${dsa.topk}`, 3, ['idx']),
          ]
        : []),
      ...(rope ? [node('q-rope', 'RoPE', 0, ['q-b'])] : []),
      node('core', dsa ? 'Sparse MLA attention' : 'MLA attention', null, [
        rope ? 'q-rope' : 'q-b',
        'kv-b',
        'k-rope',
        ...(dsa ? ['idx-top'] : []),
      ]),
      ...(opts.gate ? [node('gate', '× σ(gate)', null, ['core', 'g'])] : []),
      node('o', 'o_proj', null, [opts.gate ? 'gate' : 'core'], ['o_proj']),
    ],
  } satisfies Graph;
}

/**
 * DeepSeek V4 attention: a low-rank query and one shared KV head over a 128-token window,
 * plus KV compressed by a learned gated pool. Compressed-sparse (CSA) layers pool every
 * 4 tokens and let an indexer pick which to attend; heavily compressed (HCA) layers pool
 * every 128 and attend to them all. The output projection is grouped low rank, and
 * hyper-connections mix the residual streams around the block.
 */
function v4Graph(opts: { pool: string; topk: number | null }) {
  const idx = opts.topk !== null;
  return {
    cols: idx ? 4 : 3,
    nodes: [
      node('hc-pre', 'mHC pre-mix + RMSNorm', null, [], ['hc_attn'], {
        title: 'Hyper-connections reduce the residual streams to one',
      }),
      node('q-a', 'wq_a', 0, ['hc-pre'], ['attn.wq_a']),
      node('kv', 'wkv', 1, ['hc-pre'], ['attn.wkv']),
      node('q-a-kv', 'wq_a + wkv', 0, ['hc-pre'], ['attn.wq_a+wkv'], {
        span: 2,
        optional: true,
        fuses: ['q-a', 'kv'],
      }),
      node(
        'comp',
        'Compressor',
        2,
        ['hc-pre'],
        ['attn.compressor.wkv+wgate', 'attn.compressor.wkv', 'attn.compressor.wgate'],
        { title: 'compressor.wkv + wgate' },
      ),
      node('q-norm', 'RMSNorm', 0, ['q-a', 'q-a-kv']),
      node('kv-norm', 'Norm + RoPE', 1, ['kv', 'q-a-kv']),
      node('pool', opts.pool, 2, ['comp']),
      node('q-b', 'wq_b', 0, ['q-norm'], ['attn.wq_b']),
      ...(idx
        ? [
            node('idx', 'Indexer wq_b', 3, ['q-norm'], ['attn.indexer.wq_b'], {
              title: 'Queries from the query latent',
            }),
            node(
              'idx-top',
              `Top-${opts.topk}`,
              3,
              ['idx'],
              [
                'attn.indexer.weights_proj',
                'attn.indexer.compressor.wkv+wgate',
                'attn.indexer.compressor.wkv',
                'attn.indexer.compressor.wgate',
              ],
              { title: 'The indexer’s own compressor and head weights score the pooled entries' },
            ),
          ]
        : []),
      node('q-rope', 'Norm + RoPE', 0, ['q-b']),
      node(
        'core',
        idx ? 'Sparse attention + sink' : 'Attention + sink',
        null,
        ['q-rope', 'kv-norm', 'pool', ...(idx ? ['idx-top'] : [])],
        [],
        {
          title: idx
            ? 'One shared KV head: the last 128 tokens plus the selected compressed entries'
            : 'One shared KV head: the last 128 tokens plus every compressed entry',
        },
      ),
      node('wo-a', 'wo_a', null, ['core'], ['attn.wo_a'], { title: 'Grouped low-rank output' }),
      node('wo-b', 'wo_b', null, ['wo-a'], ['attn.wo_b']),
      node('hc-post', 'mHC post-mix', null, ['wo-b']),
    ],
  } satisfies Graph;
}

/** Gated DeltaNet linear attention (Qwen3.5's three-in-four layers). */
function deltaNetGraph() {
  return {
    cols: 3,
    nodes: [
      node(
        'qkv',
        'in_proj_qkv',
        0,
        [],
        ['linear_attn.in_proj_qkv', 'in_proj_qkv', 'linear_attn.in_proj_qkvz', 'in_proj_qkvz'],
      ),
      node(
        'ba',
        'in_proj_b / a',
        1,
        [],
        ['linear_attn.in_proj_b', 'linear_attn.in_proj_a', 'linear_attn.in_proj_ba', 'in_proj_ba'],
        { title: 'Per-head decay and write strength' },
      ),
      node(
        'z',
        'in_proj_z',
        2,
        [],
        ['linear_attn.in_proj_z', 'in_proj_z', 'linear_attn.in_proj_qkvz', 'in_proj_qkvz'],
      ),
      node('conv', 'Causal conv1d + SiLU', 0, ['qkv']),
      node('delta', 'Gated delta rule', 0, ['conv', 'ba'], [], { span: 2 }),
      node('norm', 'Gated RMSNorm', null, ['delta', 'z']),
      node('out', 'out_proj', null, ['norm'], ['linear_attn.out_proj', 'out_proj']),
    ],
  } satisfies Graph;
}

/**
 * Kimi Delta Attention (Kimi-K3's linear layers): q, k and v through a short conv, a
 * per-channel decay gate from a low-rank f_a / f_b pair, a write strength from b_proj,
 * the gated delta rule over the recurrent state, then an RMSNorm gated by g_proj.
 */
function kdaGraph() {
  return {
    cols: 6,
    nodes: [
      node('q', 'q_proj', 0, [], ['q_proj']),
      node('k', 'k_proj', 1, [], ['k_proj']),
      node('v', 'v_proj', 2, [], ['v_proj']),
      node('f-a', 'f_a_proj', 3, [], ['f_a_proj']),
      node('b', 'b_proj', 4, [], ['b_proj'], { title: 'Per-head write strength' }),
      node('g', 'g_proj', 5, [], ['g_proj'], { title: 'Output gate' }),
      node('conv', 'Short conv + L2 norm', 0, ['q', 'k', 'v'], [], { span: 3 }),
      node('f-b', 'f_b_proj', 3, ['f-a'], ['f_b_proj'], {
        title: 'Per-channel decay gate, low rank',
      }),
      node('delta', 'Gated delta rule', null, ['conv', 'f-b', 'b']),
      node('norm', 'RMSNorm × σ(g)', null, ['delta', 'g']),
      node('o', 'o_proj', null, ['norm'], ['o_proj']),
    ],
  } satisfies Graph;
}

const FFN_GATE_UP = ['gate_up_proj', 'gate_proj', 'up_proj', 'mlp.gate_up_proj'];
const FFN_DOWN = ['down_proj', 'mlp.down_proj'];

function ffnGraph(act: string) {
  return {
    cols: 1,
    nodes: [
      node('gate-up', 'gate_up_proj', null, [], FFN_GATE_UP),
      node('act', `${act} × up`, null, ['gate-up']),
      node('down', 'down_proj', null, ['act'], FFN_DOWN),
    ],
  } satisfies Graph;
}

interface MoeSpec {
  routed: number;
  topk: number;
  shared: number;
  /** Leading layers whose experts are picked by token id, not by the router. */
  hash?: number;
  /** Shared expert as separate w1 (gate) and w3 (up), as DeepSeek V4 writes it. */
  splitShared?: boolean;
  /** Routed experts work in a narrower latent: projected down before, up after. */
  latent?: number;
}

/**
 * The MoE block: the router picks experts, the experts run, a shared expert runs beside
 * them, and the results combine. One MoE measurement covers all of it; GEMMs measured on
 * their own still get their rows.
 */
function moeGraph(moe: MoeSpec, act: string, hc: boolean): Graph {
  const shared = moe.shared > 0;
  const latent = Boolean(moe.latent);
  const routedCol = shared || latent ? 0 : null;
  const span = shared || latent ? 2 : 1;
  const sharedGateUp = moe.splitShared
    ? [
        node('s-gate', 'w1 (gate)', 2, hc ? ['hc-pre'] : [], ['ffn.shared_experts.w1'], {}),
        node('s-up', 'w3 (up)', 3, hc ? ['hc-pre'] : [], ['ffn.shared_experts.w3'], {}),
        node('s-gate-up', 'w1 + w3', 2, hc ? ['hc-pre'] : [], ['ffn.shared_experts.w1+w3'], {
          span: 2,
          optional: true,
          fuses: ['s-gate', 's-up'],
        }),
      ]
    : [
        node(
          's-gate',
          'Shared gate / up',
          2,
          hc ? ['hc-pre'] : [],
          [
            'shared_expert.gate_up_proj',
            'shared_experts.gate_up_proj',
            'mlp.shared_expert.gate_up_proj',
            'ffn.shared_experts.w1+w3',
            'shared_experts.gate_proj',
            'shared_experts.up_proj',
          ],
          { span: 2, title: moe.shared > 1 ? `${moe.shared} shared experts` : undefined },
        ),
      ];
  const routerLabel = 'Router';
  return {
    cols: shared ? 4 : span,
    late: true,
    nodes: [
      ...(hc
        ? [
            node('hc-pre', 'mHC pre-mix + RMSNorm', null, [], ['hc_ffn'], {
              title: 'Hyper-connections reduce the residual streams to one',
            }),
          ]
        : []),
      node(
        'router',
        routerLabel,
        routedCol,
        hc ? ['hc-pre'] : [],
        ['gate', 'ffn.gate', 'mlp.gate'],
        {
          span: latent ? 1 : span,
          title: moe.hash
            ? `The first ${moe.hash} layers pick experts by token id instead`
            : undefined,
        },
      ),
      ...(latent
        ? [
            node('l-down', 'Latent down', 1, hc ? ['hc-pre'] : [], ['routed_expert_down_proj'], {
              title: `Routed experts work in a ${moe.latent}-wide latent`,
            }),
          ]
        : []),
      node('topk', `Top-${moe.topk} of ${moe.routed}`, routedCol, ['router'], [], {
        span: latent ? 1 : span,
      }),
      node(
        'e-gate-up',
        'Experts gate / up',
        routedCol,
        ['topk', ...(latent ? ['l-down'] : [])],
        ['experts.gate_up_proj', 'experts.w13', 'experts.w1+w3'],
        { span },
      ),
      node('e-act', `${act} × up`, routedCol, ['e-gate-up'], [], { span }),
      node('e-down', 'Experts down', routedCol, ['e-act'], ['experts.down_proj', 'experts.w2'], {
        span,
      }),
      ...(latent
        ? [node('l-up', 'Latent up', routedCol, ['e-down'], ['routed_expert_up_proj'], { span })]
        : []),
      ...(shared
        ? [
            ...sharedGateUp,
            node(
              's-act',
              `${act} × up`,
              2,
              sharedGateUp.map((d) => d.id),
              [],
              { span: 2 },
            ),
            node(
              's-down',
              'Shared down',
              2,
              ['s-act'],
              [
                'shared_expert.down_proj',
                'shared_experts.down_proj',
                'mlp.shared_expert.down_proj',
                'ffn.shared_experts.w2',
              ],
              { span: 2 },
            ),
          ]
        : []),
      node('combine', 'Weighted combine', null, [
        latent ? 'l-up' : 'e-down',
        ...(shared ? ['s-down'] : []),
      ]),
      ...(hc ? [node('hc-post', 'mHC post-mix', null, ['combine'])] : []),
    ],
  };
}

/**
 * A layer's attention, how many layers run it, and the attention module op types that
 * time it whole (cases whose dims match `where`).
 */
interface AttentionSpec {
  label: string;
  repeat: number;
  graph: Graph;
  types: string[];
  where?: Record<string, number>;
}

/** What the view draws for a model, from its published config. */
interface ModelSpec {
  layers: number;
  attention: AttentionSpec[];
  /** Leading layers with a dense FFN in place of the MoE. */
  dense: number;
  moe: MoeSpec | null;
  /** Manifold-constrained hyper-connections around every block. */
  hc?: boolean;
  /** The FFN activation, where the site's architecture entry does not name it. */
  act?: string;
}

const mla = (layers: number, dense: number, moe: MoeSpec, dsa: { topk: number } | null = null) => ({
  layers,
  dense,
  moe,
  attention: [
    {
      label: dsa ? 'MLA + DeepSeek sparse attention' : 'Multi-head latent attention',
      repeat: layers,
      graph: mlaGraph(dsa),
      types: [dsa ? 'mla_dsa' : 'mla'],
    },
  ],
});

/** Specs by model name, from each model's config.json on Hugging Face. */
const MODEL_SPECS: [RegExp, ModelSpec][] = [
  [/^DeepSeek-(?:R1|V3)/, mla(61, 3, { routed: 256, topk: 8, shared: 1 })],
  [/^Kimi-K2/, mla(61, 1, { routed: 384, topk: 8, shared: 1 })],
  [
    /^Kimi-K3/,
    {
      layers: 93,
      dense: 1,
      act: 'SiTU',
      moe: { routed: 896, topk: 16, shared: 2, latent: 3584 },
      attention: [
        { label: 'Kimi Delta Attention', repeat: 69, graph: kdaGraph(), types: ['kda'] },
        {
          label: 'Gated MLA (NoPE)',
          repeat: 24,
          graph: mlaGraph(null, { gate: true, nope: true }),
          types: ['mla'],
        },
      ],
    },
  ],
  [/^GLM-5/, mla(78, 3, { routed: 256, topk: 8, shared: 1 }, { topk: 2048 })],
  [
    /^DeepSeek-V4-Pro/,
    {
      layers: 61,
      dense: 0,
      hc: true,
      moe: { routed: 384, topk: 6, shared: 1, hash: 3, splitShared: true },
      attention: [
        {
          label: 'Compressed sparse attention (CSA)',
          repeat: 30,
          graph: v4Graph({ pool: 'Pool ÷4', topk: 1024 }),
          types: ['dsv4_attn'],
          where: { compressRatio: 4 },
        },
        {
          label: 'Heavily compressed attention (HCA)',
          repeat: 31,
          graph: v4Graph({ pool: 'Pool ÷128', topk: null }),
          types: ['dsv4_attn'],
          where: { compressRatio: 128 },
        },
      ],
    },
  ],
  [
    /^DeepSeek-V4/,
    {
      layers: 40,
      dense: 0,
      hc: true,
      moe: { routed: 384, topk: 6, shared: 1, splitShared: true },
      attention: [
        {
          label: 'Hybrid attention',
          repeat: 40,
          graph: v4Graph({ pool: 'Pool', topk: 512 }),
          types: ['dsv4_attn'],
        },
      ],
    },
  ],
  [
    /^Qwen-?3\.5/,
    {
      layers: 60,
      dense: 0,
      moe: { routed: 512, topk: 10, shared: 1 },
      attention: [
        { label: 'Gated DeltaNet', repeat: 45, graph: deltaNetGraph(), types: ['gdn'] },
        {
          label: 'Gated attention',
          repeat: 15,
          graph: gqaGraph({ qkNorm: true, gated: true, core: 'Attention' }),
          types: ['gqa'],
        },
      ],
    },
  ],
  [
    /^MiniMax-M2/,
    {
      layers: 62,
      dense: 0,
      moe: { routed: 256, topk: 8, shared: 0 },
      attention: [
        {
          label: 'Grouped query attention',
          repeat: 62,
          graph: gqaGraph({ qkNorm: true, core: 'Attention' }),
          types: ['gqa'],
        },
      ],
    },
  ],
  [
    /^MiniMax-M3/,
    {
      layers: 60,
      dense: 3,
      moe: { routed: 128, topk: 4, shared: 1 },
      attention: [
        {
          label: 'Grouped query attention',
          repeat: 3,
          graph: gqaGraph({ qkNorm: true, core: 'Attention' }),
          types: ['gqa'],
        },
        {
          label: 'MiniMax sparse attention',
          repeat: 57,
          graph: gqaGraph({
            qkNorm: true,
            core: 'Block-sparse attention',
            coreTitle: 'The top 16 blocks of 128 tokens plus the local block',
            blocks: 'Top-16 blocks',
          }),
          types: [],
        },
      ],
    },
  ],
  [
    /^gpt-oss-120b/,
    {
      layers: 36,
      dense: 0,
      moe: { routed: 128, topk: 4, shared: 0 },
      attention: [
        {
          label: 'Grouped query attention + sink',
          repeat: 36,
          graph: gqaGraph({
            qkNorm: false,
            core: 'Attention + sink',
            coreTitle: 'Layers alternate a 128-token sliding window and full attention',
          }),
          types: [],
        },
      ],
    },
  ],
];

/** A model the table does not know: drawn from the site's architecture entry. */
function fallbackSpec(arch: ModelArchitecture | undefined, hasMoe: boolean): ModelSpec {
  const layers = arch?.numLayers ?? 1;
  const shared = arch?.hasSharedExpert ? (arch.sharedExperts ?? 1) : 0;
  const moe = (arch ? arch.architectureType === 'moe' : hasMoe)
    ? {
        routed: (arch?.numExperts ?? 0) - shared,
        topk: arch?.activeExperts ?? 0,
        shared,
      }
    : null;
  const dense = moe ? (arch?.denseFFNLayers ?? 0) : 0;
  const isMla = arch?.attentionType === 'MLA';
  return {
    layers,
    dense,
    moe,
    attention: [
      {
        label: arch ? `Attention (${arch.attentionType})` : 'Attention',
        repeat: layers,
        graph: isMla ? mlaGraph(null) : gqaGraph({ qkNorm: false, core: 'Attention' }),
        types: isMla ? ['mla'] : [],
      },
    ],
  };
}

/**
 * The model top down, as the architecture diagram draws it: embedding, the layer's
 * attention (and its variants, for hybrids), the dense FFN or MoE, the final norm and
 * head. Every GEMM role the data holds for the model lands on the box that runs it; any
 * the graph has no place for are listed at the end. A block with a measured op timing
 * it whole (MoE; attention, when its module was measured) starts folded to that op.
 */
export function modelLayers(
  arch: ModelArchitecture | undefined,
  gemms: ComparisonView | undefined,
  attention: ComparisonView | undefined,
  model: string,
  hasMoe: boolean,
  open: ReadonlySet<string>,
): LayerBlock[] {
  const present = new Map<string, Set<string>>();
  if (gemms)
    gemms.cases.forEach((_, i) => {
      for (const role of caseRoles(gemms, i, model))
        present.set(baseRole(role), (present.get(baseRole(role)) ?? new Set()).add(role));
    });
  const spec = MODEL_SPECS.find(([re]) => re.test(model))?.[1] ?? fallbackSpec(arch, hasMoe);
  const act = spec.act ?? (arch ? ffnGateActivationLabel(arch) : 'SiLU');
  // Every role some box runs, folded or not.
  const bound = new Set<string>();
  const block = (
    id: string,
    label: string,
    kind: BlockKind,
    repeat: number | null,
    drawn: Graph,
    extra: { alternative?: boolean; fold?: { op: OpSlot; label: string; title: string } } = {},
  ): LayerBlock => {
    const prefix = `${id}:`;
    const graph = fuseRoles(drawn, present);
    for (const d of graph.nodes) for (const r of d.roles ?? []) bound.add(r);
    const base = { id, label, kind, repeat, alternative: Boolean(extra.alternative) };
    if (!extra.fold) return { ...base, ...unfold(graph, present, prefix, open), fold: null };
    // One op timing the whole block, drawn until it is unfolded into the block's graph.
    const fold = { key: `${prefix}fold`, open: open.has(`${prefix}fold`) };
    if (fold.open) return { ...base, ...unfold(graph, present, prefix, open), fold };
    const whole = node('fold', extra.fold.label, null, [], [], { title: extra.fold.title, fold });
    return {
      ...base,
      ...layout({ cols: 1, nodes: [whole] }, present, prefix, extra.fold.op),
      fold: null,
    };
  };

  const blocks: LayerBlock[] = [
    block('embed', 'Embedding', 'embedding', null, {
      cols: 1,
      nodes: [node('embed', 'Token embedding', null)],
    }),
    ...spec.attention.map((a, i) => {
      const op: OpSlot = {
        id: `attention-${i}:attn`,
        label: 'Attention',
        op: 'attention',
        roles: [],
        types: a.types,
        where: a.where,
      };
      const measured = attention?.cases.some((c) => attentionCase(c, op)) ?? false;
      return block(`attention-${i}`, a.label, 'attention', a.repeat, a.graph, {
        alternative: i > 0,
        fold: measured
          ? {
              op,
              label: 'Attention forward',
              title: 'Projections, norms, RoPE, cache writes and attention, timed as one op',
            }
          : undefined,
      });
    }),
  ];
  const moeLayers = spec.moe ? spec.layers - spec.dense : 0;
  if (spec.dense > 0 || !spec.moe)
    blocks.push(
      block(
        'ffn',
        spec.moe ? 'Dense FFN' : 'FFN',
        'ffn',
        spec.moe ? spec.dense : spec.layers,
        ffnGraph(act),
      ),
    );
  if (spec.moe) {
    const { routed, topk, shared } = spec.moe;
    blocks.push(
      block(
        'moe',
        routed > 0 ? `MoE (${routed} experts, top-${topk}${shared > 0 ? ' + shared' : ''})` : 'MoE',
        'expert',
        moeLayers,
        moeGraph(spec.moe, act, Boolean(spec.hc)),
        {
          alternative: spec.dense > 0,
          fold: {
            op: { id: 'moe:moe', label: 'MoE', op: 'moe', roles: [] },
            label: 'MoE forward',
            title: 'Router, dispatch, experts and combine, timed as one op',
          },
        },
      ),
    );
  }
  blocks.push(
    block('head', 'Output', 'output', null, {
      cols: 1,
      nodes: [
        ...(spec.hc ? [node('hc', 'mHC head mix', null)] : []),
        node('norm', 'Final norm', null, spec.hc ? ['hc'] : []),
        node('lm-head', 'lm_head', null, ['norm'], ['head', 'lm_head']),
      ],
    }),
  );

  const other = [...present.keys()].filter((r) => !bound.has(r)).sort();
  // Roles the graph has no box for: listed, unconnected.
  if (other.length > 0) {
    const listed = block('other', 'Other GEMMs', 'ffn', null, {
      cols: 1,
      nodes: other.map((r) => node(r, r, null, [], [r])),
    });
    blocks.push({ ...listed, edges: [], entries: [] });
  }
  return blocks;
}

/** A view narrowed to some of its cases, for the charts of one slot. */
export function subView(view: ComparisonView, indices: number[]): ComparisonView {
  const pick = <T>(values: T[]) => indices.map((i) => values[i]);
  return {
    ...view,
    cases: pick(view.cases),
    measurements: Object.fromEntries(
      Object.entries(view.measurements).map(([hw, col]) => [
        hw,
        Object.fromEntries(
          Object.entries(col).map(([k, values]) => [k, pick(values as unknown[])]),
        ) as unknown as ComparisonColumns,
      ]),
    ),
  };
}
