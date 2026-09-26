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

/** A measured op: its cases come from `op`'s view, by role (the MoE op takes every case). */
export interface OpSlot {
  id: string;
  label: string;
  op: ComparisonOp;
  roles: string[];
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
}

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

/** An MTP module's layers repeat the main ones' shapes; they share the main role's box. */
const baseRole = (role: string) => role.replace(/^mtp\./, '');

const gemm = (role: string, prefix: string): OpSlot => ({
  id: `${prefix}${role}`,
  label: role,
  op: 'gemm',
  roles: [role, `mtp.${role}`],
});

export function architecture(model: string): ModelArchitecture | undefined {
  return MODEL_ARCHITECTURES[model as Model];
}

/** The roles case `i` has in `model`: its layers there. */
function caseRoles(view: ComparisonView, i: number, model: string): string[] {
  return view.cases[i].sources.find((s) => view.models[s.model] === model)?.roles ?? [];
}

/** Indices of the view's cases that belong to a slot of `model`, at one compute precision. */
export function slotCases(
  view: ComparisonView | undefined,
  slot: OpSlot,
  model: string,
  precision: ComputePrecision | null,
): number[] {
  if (!view) return [];
  return view.cases.flatMap((c, i) =>
    (precision === null || c.computePrecision === precision) &&
    (slot.op === 'moe' || caseRoles(view, i, model).some((r) => slot.roles.includes(r)))
      ? [i]
      : [],
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

type Flow = Pick<LayerBlock, 'cols' | 'tall' | 'nodes' | 'edges' | 'entries' | 'spans'>;

/**
 * Lays a graph out in rows and binds the measured roles to its boxes. Each stage puts its
 * unmeasured boxes on one row, then gives each GEMM a row for its bars. With `group`, one
 * op covers every box: its bars sit on the first row.
 */
function layout(full: Graph, present: Set<string>, prefix: string, group?: OpSlot): Flow {
  const kept = full.nodes.filter((d) => !d.optional || d.roles?.some((r) => present.has(r)));
  const ids = new Set(kept.map((d) => d.id));
  const graph = {
    ...full,
    cols: Math.max(full.cols, ...kept.map((d) => (d.col ?? 0) + (d.span ?? 1))),
    nodes: kept.map((d) => ({ ...d, after: d.after?.filter((a) => ids.has(a)) })),
  };
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
    };
  });
  const spans: SlotSpan[] = [
    ...(group ? [{ slot: group, first: 0, last: tall.length - 1, bar: 0 }] : []),
    ...[...slotRow].map(([role, row]) => ({
      slot: gemm(role, prefix),
      first: row,
      last: row,
      bar: row,
    })),
  ];
  return {
    cols: graph.cols,
    tall,
    nodes,
    edges: graph.nodes.flatMap((d) =>
      (d.after ?? []).map((a): [string, string] => [`${prefix}${a}`, `${prefix}${d.id}`]),
    ),
    entries: graph.nodes.filter((d) => !d.after?.length).map((d) => `${prefix}${d.id}`),
    spans,
  };
}

/** Grouped-query (or multi-head) attention: q, k and v, each rotated, into the core. */
function gqaGraph(opts: { qkNorm: boolean; core: string; coreTitle?: string; gated?: boolean }) {
  const rope = opts.qkNorm ? 'Norm + RoPE' : 'RoPE';
  const out = opts.gated ? 'gate' : 'core';
  return {
    cols: 3,
    nodes: [
      node('q', 'q_proj', 0, [], ['q_proj', 'self_attn.q_proj'], {
        title: opts.gated ? 'Emits the queries and a per-head output gate' : undefined,
      }),
      node('k', 'k_proj', 1, [], ['k_proj', 'self_attn.k_proj']),
      node('v', 'v_proj', 2, [], ['v_proj', 'self_attn.v_proj']),
      node('qkv', 'qkv_proj', 3, [], ['qkv_proj'], {
        optional: true,
        title: 'q, k and v as one fused GEMM, as some engines run them',
      }),
      node('q-rope', rope, 0, ['q', 'qkv']),
      node('k-rope', rope, 1, ['k', 'qkv']),
      node('core', opts.core, null, ['q-rope', 'k-rope', 'v', 'qkv'], [], {
        title: opts.coreTitle,
      }),
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
function mlaGraph(dsa: { topk: number } | null) {
  const fused = 'fused_qkv_a_proj_with_mqa';
  return {
    cols: dsa ? 4 : 3,
    nodes: [
      node('q-a', 'q_a_proj', 0, [], ['q_a_proj', fused]),
      node('kv-a', 'kv_a_proj_with_mqa', 1, [], ['kv_a_proj_with_mqa', fused], { span: 2 }),
      node('q-norm', 'RMSNorm', 0, ['q-a']),
      node('kv-norm', 'RMSNorm', 1, ['kv-a']),
      node('k-rope', 'RoPE (k_pe)', 2, ['kv-a'], [], {
        title: 'The rotary key part, shared by every head',
      }),
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
      node('q-rope', 'RoPE', 0, ['q-b']),
      node('core', dsa ? 'Sparse MLA attention' : 'MLA attention', null, [
        'q-rope',
        'kv-b',
        'k-rope',
        ...(dsa ? ['idx-top'] : []),
      ]),
      node('o', 'o_proj', null, ['core'], ['o_proj']),
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
function v4Graph(opts: { pool: string; topk: number }) {
  return {
    cols: 4,
    nodes: [
      node('hc-pre', 'mHC pre-mix + RMSNorm', null, [], ['hc_attn'], {
        title: 'Hyper-connections reduce the residual streams to one',
      }),
      node('q-a', 'wq_a', 0, ['hc-pre'], ['attn.wq_a', 'attn.wq_a+wkv']),
      node('kv', 'wkv', 1, ['hc-pre'], ['attn.wkv', 'attn.wq_a+wkv']),
      node(
        'comp',
        'Compressor',
        2,
        ['hc-pre'],
        ['attn.compressor.wkv+wgate', 'attn.compressor.wkv', 'attn.compressor.wgate'],
        { title: 'compressor.wkv + wgate' },
      ),
      node('q-norm', 'RMSNorm', 0, ['q-a']),
      node('kv-norm', 'Norm + RoPE', 1, ['kv']),
      node('pool', opts.pool, 2, ['comp']),
      node('q-b', 'wq_b', 0, ['q-norm'], ['attn.wq_b']),
      node('idx', 'Indexer wq_b', 3, ['q-norm'], ['attn.indexer.wq_b'], {
        title: 'Compressed-sparse layers only: queries from the query latent',
      }),
      node('q-rope', 'Norm + RoPE', 0, ['q-b']),
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
      node('core', 'Sparse attention + sink', null, ['q-rope', 'kv-norm', 'pool', 'idx-top'], [], {
        title: 'One shared KV head: the last 128 tokens plus the compressed entries',
      }),
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
}

/**
 * The MoE block: the router picks experts, the experts run, a shared expert runs beside
 * them, and the results combine. One MoE measurement covers all of it; GEMMs measured on
 * their own still get their rows.
 */
function moeGraph(moe: MoeSpec, act: string, hc: boolean): Graph {
  const shared = moe.shared > 0;
  const routedCol = shared ? 0 : null;
  const span = shared ? 2 : 1;
  const sharedGateUp = moe.splitShared
    ? [
        node('s-gate', 'w1 (gate)', 2, hc ? ['hc-pre'] : [], [
          'ffn.shared_experts.w1',
          'ffn.shared_experts.w1+w3',
        ]),
        node('s-up', 'w3 (up)', 3, hc ? ['hc-pre'] : [], [
          'ffn.shared_experts.w3',
          'ffn.shared_experts.w1+w3',
        ]),
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
          ],
          { span: 2 },
        ),
      ];
  const routerLabel = 'Router';
  return {
    cols: shared ? 4 : 1,
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
          span,
          title: moe.hash
            ? `The first ${moe.hash} layers pick experts by token id instead`
            : undefined,
        },
      ),
      node('topk', `Top-${moe.topk} of ${moe.routed}`, routedCol, ['router'], [], { span }),
      node(
        'e-gate-up',
        'Experts gate / up',
        routedCol,
        ['topk'],
        ['experts.gate_up_proj', 'experts.w13', 'experts.w1+w3'],
        { span },
      ),
      node('e-act', `${act} × up`, routedCol, ['e-gate-up'], [], { span }),
      node('e-down', 'Experts down', routedCol, ['e-act'], ['experts.down_proj', 'experts.w2'], {
        span,
      }),
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
      node('combine', 'Weighted combine', null, ['e-down', ...(shared ? ['s-down'] : [])]),
      ...(hc ? [node('hc-post', 'mHC post-mix', null, ['combine'])] : []),
    ],
  };
}

/** A layer's attention, and how many layers run it. */
interface AttentionSpec {
  label: string;
  repeat: number;
  graph: Graph;
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
    },
  ],
});

/** Specs by model name, from each model's config.json on Hugging Face. */
const MODEL_SPECS: [RegExp, ModelSpec][] = [
  [/^DeepSeek-(?:R1|V3)/, mla(61, 3, { routed: 256, topk: 8, shared: 1 })],
  [/^Kimi-K2/, mla(61, 1, { routed: 384, topk: 8, shared: 1 })],
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
          label: 'Hybrid attention (30 CSA + 31 HCA)',
          repeat: 61,
          graph: v4Graph({ pool: 'Pool ÷4 / ÷128', topk: 1024 }),
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
        { label: 'Gated DeltaNet', repeat: 45, graph: deltaNetGraph() },
        {
          label: 'Gated attention',
          repeat: 15,
          graph: gqaGraph({ qkNorm: true, gated: true, core: 'Attention' }),
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
          label: 'MiniMax sparse attention',
          repeat: 60,
          graph: gqaGraph({
            qkNorm: true,
            core: 'Block-sparse attention',
            coreTitle:
              'Top 16 blocks of 128 tokens plus the local block; the first 3 layers attend fully',
          }),
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
  const graph =
    arch?.attentionType === 'MLA' ? mlaGraph(null) : gqaGraph({ qkNorm: false, core: 'Attention' });
  return {
    layers,
    dense,
    moe,
    attention: [
      { label: arch ? `Attention (${arch.attentionType})` : 'Attention', repeat: layers, graph },
    ],
  };
}

/**
 * The model top down, as the architecture diagram draws it: embedding, the layer's
 * attention (and its variants, for hybrids), the dense FFN or MoE, the final norm and
 * head. Every GEMM role the data holds for the model lands on the box that runs it; any
 * the graph has no place for are listed at the end.
 */
export function modelLayers(
  arch: ModelArchitecture | undefined,
  gemms: ComparisonView | undefined,
  model: string,
  hasMoe: boolean,
): LayerBlock[] {
  const present = new Set(
    gemms ? gemms.cases.flatMap((_, i) => caseRoles(gemms, i, model).map(baseRole)) : [],
  );
  const spec = MODEL_SPECS.find(([re]) => re.test(model))?.[1] ?? fallbackSpec(arch, hasMoe);
  const act = arch ? ffnGateActivationLabel(arch) : 'SiLU';
  const block = (
    id: string,
    label: string,
    kind: BlockKind,
    repeat: number | null,
    graph: Graph,
    extra: { alternative?: boolean; group?: OpSlot } = {},
  ): LayerBlock => ({
    id,
    label,
    kind,
    repeat,
    alternative: Boolean(extra.alternative),
    ...layout(graph, present, `${id}:`, extra.group),
  });

  const blocks: LayerBlock[] = [
    block('embed', 'Embedding', 'embedding', null, {
      cols: 1,
      nodes: [node('embed', 'Token embedding', null)],
    }),
    ...spec.attention.map((a, i) =>
      block(`attention-${i}`, a.label, 'attention', a.repeat, a.graph, { alternative: i > 0 }),
    ),
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
          group: { id: 'moe:moe', label: 'MoE', op: 'moe', roles: [] },
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

  const bound = new Set(blocks.flatMap((b) => b.spans.flatMap((s) => s.slot.roles)));
  const other = [...present].filter((r) => !bound.has(r)).sort();
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
