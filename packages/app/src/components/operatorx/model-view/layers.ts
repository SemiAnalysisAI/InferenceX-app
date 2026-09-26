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

/** One box of a block's flow, on its own row. */
export interface FlowNode {
  id: string;
  label: string;
  /** Full role name, when the label shortens it. */
  title?: string;
  /** The measured op this box belongs to; null for a stage OperatorX does not measure. */
  slot: OpSlot | null;
  /** Parallel branch, left to right; null for the shared trunk. */
  lane: number | null;
  row: number;
}

/**
 * Rows a measured op spans. A GEMM owns its row; the MoE op spans every box of its
 * block, since one measurement covers them all.
 */
export interface SlotSpan {
  slot: OpSlot;
  first: number;
  last: number;
}

/**
 * A block drawn as the architecture explainer draws its drill-downs: boxes joined by
 * arrows, parallel branches side by side. Each box has a row of its own so the results
 * beside it line up; rows of a measured GEMM are tall enough for its bars.
 */
export interface LayerBlock {
  id: string;
  label: string;
  kind: BlockKind;
  /** How many layers repeat this block, when more than one. */
  repeat: number | null;
  lanes: number;
  /** Per row: whether it holds a measured GEMM's bars. */
  tall: boolean[];
  nodes: FlowNode[];
  /** `[from, to]` node ids. */
  edges: [string, string][];
  /** Nodes fed by the block's input. */
  entries: string[];
  spans: SlotSpan[];
}

type Flow = Pick<LayerBlock, 'lanes' | 'tall' | 'nodes' | 'edges' | 'entries' | 'spans'>;

/**
 * Attention projections by branch and position in it: `q_a -> norm -> q_b`. Stage 1 is
 * left for the norm between a latent projection and its up-projection.
 */
const ATTENTION_BRANCH: Record<string, [string, number]> = {
  qkv_proj: ['qkv', 0],
  q_proj: ['q', 0],
  k_proj: ['k', 0],
  v_proj: ['v', 0],
  q_a_proj: ['q', 0],
  q_b_proj: ['q', 2],
  kv_a_proj_with_mqa: ['kv', 0],
  kv_b_proj: ['kv', 2],
  'attn.wq_a': ['q', 0],
  'attn.wq_a+wkv': ['q', 0],
  'attn.wq_b': ['q', 2],
  'attn.wkv': ['kv', 0],
  'attn.compressor.wkv+wgate': ['compressor', 0],
  'attn.indexer.wq_b': ['indexer', 0],
  'attn.indexer.weights_proj': ['indexer', 1],
};
const BRANCH_ORDER = ['qkv', 'q', 'k', 'v', 'kv', 'compressor', 'indexer'];
const branchRank = (b: string) =>
  BRANCH_ORDER.includes(b) ? BRANCH_ORDER.indexOf(b) : BRANCH_ORDER.length;
/** Projections after the attention core, in order. */
const ATTENTION_OUT = ['o_proj', 'attn.wo_a', 'attn.wo_b'];
/** Branches whose rotary embedding the explainer draws after the projection. */
const ROPE_BRANCHES = new Set(['qkv', 'q', 'k']);
const FFN_ROLES = new Set(['gate_up_proj', 'down_proj', 'hc_ffn']);
const HEAD_ROLES = ['head', 'lm_head'];

type Place = 'attention' | 'ffn' | 'head' | 'other';

/**
 * Where a GEMM role runs. The MoE op already covers the router, the routed experts and
 * the shared expert, so their GEMMs have no box of their own.
 */
function place(role: string): Place | null {
  if (role in ATTENTION_BRANCH || ATTENTION_OUT.includes(role)) return 'attention';
  if (/^(?:attn|self_attn)\./.test(role) || role === 'hc_attn') return 'attention';
  if (FFN_ROLES.has(role)) return 'ffn';
  if (/^(?:experts|shared_experts?|ffn\.shared_experts|ffn\.gate$|mlp\.)/.test(role)) return null;
  if (HEAD_ROLES.includes(role)) return 'head';
  return 'other';
}

/** An MTP module's layers repeat the main ones' shapes; they share the main role's box. */
const baseRole = (role: string) => role.replace(/^mtp\./, '');

const gemm = (role: string): OpSlot => ({
  id: role,
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

interface Box {
  id: string;
  label: string;
  title?: string;
  slot?: OpSlot | null;
}

/** A measured GEMM's box, labeled without the `attn.` its block already says. */
const gemmBox = (role: string): Box => {
  const label = role.replace(/^attn\./, '');
  return { id: role, label, title: label === role ? undefined : role, slot: gemm(role) };
};

/**
 * Lays out parallel branches that converge into a trunk, stage by stage. A measured box
 * gets a row of its own, for its bars; a stage's unmeasured boxes share one row. With
 * `group`, one measured op covers every box, so each stage is a single row and a branch
 * shorter than the longest ends alongside it.
 */
function flow(branches: Box[][], trunk: Box[], group: OpSlot | null = null): Flow {
  const live = branches.filter((b) => b.length > 0);
  const parallel = live.length > 1;
  const nodes: FlowNode[] = [];
  const tall: boolean[] = [];
  const add = (box: Box, lane: number | null, row: number) =>
    nodes.push({
      id: box.id,
      label: box.label,
      title: box.title,
      slot: group ?? box.slot ?? null,
      lane,
      row,
    });
  const measured = (box: Box) => !group && Boolean(box.slot);
  const depth = Math.max(0, ...live.map((b) => b.length));
  for (let s = 0; s < depth; s++) {
    const stage = live.flatMap((b, lane) => {
      const box = b[group ? s - depth + b.length : s];
      return box ? [{ box, lane: parallel ? lane : null }] : [];
    });
    const compact = stage.filter(({ box }) => !measured(box));
    if (compact.length > 0) {
      tall.push(false);
      for (const { box, lane } of compact) add(box, lane, tall.length - 1);
    }
    for (const { box, lane } of stage.filter((entry) => measured(entry.box))) {
      tall.push(true);
      add(box, lane, tall.length - 1);
    }
  }
  for (const box of trunk) {
    tall.push(measured(box));
    add(box, null, tall.length - 1);
  }

  const edges: [string, string][] = [];
  for (const b of live) {
    for (let i = 1; i < b.length; i++) edges.push([b[i - 1].id, b[i].id]);
    if (trunk[0]) edges.push([b.at(-1)!.id, trunk[0].id]);
  }
  for (let i = 1; i < trunk.length; i++) edges.push([trunk[i - 1].id, trunk[i].id]);
  const entries = live.length > 0 ? live.map((b) => b[0].id) : trunk.slice(0, 1).map((b) => b.id);
  const spans: SlotSpan[] = group
    ? [{ slot: group, first: 0, last: tall.length - 1 }]
    : nodes.flatMap((n) => (n.slot ? [{ slot: n.slot, first: n.row, last: n.row }] : []));
  return { lanes: parallel ? live.length : 1, tall, nodes, edges, entries, spans };
}

/** The flow with every id prefixed, for a second copy of a block. */
function prefixed(f: Flow, prefix: string): Flow {
  const id = (s: string) => `${prefix}${s}`;
  const slot = (s: OpSlot) => ({ ...s, id: id(s.id) });
  return {
    ...f,
    nodes: f.nodes.map((n) => ({ ...n, id: id(n.id), slot: n.slot && slot(n.slot) })),
    edges: f.edges.map(([a, b]) => [id(a), id(b)]),
    entries: f.entries.map(id),
    spans: f.spans.map((s) => ({ ...s, slot: slot(s.slot) })),
  };
}

function attentionFlow(roles: string[]): Flow {
  const branches = new Map<string, [number, Box][]>();
  for (const role of roles) {
    if (ATTENTION_OUT.includes(role)) continue;
    const [branch, stage] = ATTENTION_BRANCH[role] ?? [role, 0];
    branches.set(branch, [...(branches.get(branch) ?? []), [stage, gemmBox(role)]]);
  }
  const paths = [...branches]
    .sort(([a], [b]) => branchRank(a) - branchRank(b) || a.localeCompare(b))
    .map(([branch, boxes]) => {
      const sorted = boxes.sort((a, b) => a[0] - b[0]);
      const path: Box[] = [];
      for (const [stage, box] of sorted) {
        // A latent projection is normalized before its up-projection.
        if (stage === 2 && path.length > 0) path.push({ id: `${branch}-norm`, label: 'RMSNorm' });
        path.push(box);
      }
      if (ROPE_BRANCHES.has(branch) && sorted.every(([stage]) => stage === 0))
        path.push({ id: `${branch}-rope`, label: 'RoPE' });
      return path;
    });
  const out = ATTENTION_OUT.filter((r) => roles.includes(r)).map(gemmBox);
  return flow(paths, [{ id: 'attention-core', label: 'Attention' }, ...out]);
}

/** Gate/up, activation, down; a projection is measured when the data has its role. */
function ffnFlow(arch: ModelArchitecture | undefined, roles: string[]): Flow {
  const box = (role: string, label: string): Box =>
    roles.includes(role) ? gemmBox(role) : { id: role, label };
  const act = arch ? ffnGateActivationLabel(arch) : 'SiLU';
  return flow(
    [],
    [
      box('gate_up_proj', 'Gate / up'),
      { id: 'act', label: `${act} × up` },
      box('down_proj', 'Down'),
    ],
  );
}

/** One MoE measurement runs the whole block, router through combine. */
function moeFlow(arch: ModelArchitecture | undefined): Flow {
  const shared = Boolean(arch?.hasSharedExpert);
  const act = arch ? ffnGateActivationLabel(arch) : 'SiLU';
  return flow(
    [
      [
        { id: 'router', label: 'Router' },
        { id: 'topk', label: arch?.activeExperts ? `Top-${arch.activeExperts}` : 'Top-k' },
        { id: 'experts-gate-up', label: 'Expert gate / up' },
        { id: 'experts-act', label: `${act} × up` },
        { id: 'experts-down', label: 'Expert down' },
      ],
      shared
        ? [
            { id: 'shared-gate-up', label: 'Shared gate / up' },
            { id: 'shared-act', label: `${act} × up` },
            { id: 'shared-down', label: 'Shared down' },
          ]
        : [],
    ],
    [{ id: 'combine', label: 'Combine' }],
    { id: 'moe', label: 'MoE', op: 'moe', roles: [] },
  );
}

/**
 * The model top down, as the architecture diagram draws it: embedding, the dense layers
 * (when an MoE model leads with some), the repeated layers, the final norm and head.
 * Measured GEMMs appear for the roles the data holds for this model.
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
  const at = (where: Place) => [...present].filter((r) => place(r) === where).sort();
  const attentionLabel = arch ? `Attention (${arch.attentionType})` : 'Attention';
  const moe = arch ? arch.architectureType === 'moe' : hasMoe;
  const layers = arch?.numLayers ?? null;
  const dense = moe ? (arch?.denseFFNLayers ?? 0) : 0;
  const main = layers === null ? null : layers - dense;
  const attention = attentionFlow(at('attention'));
  const ffn = ffnFlow(arch, at('ffn'));

  const blocks: LayerBlock[] = [
    {
      id: 'embed',
      label: 'Embedding',
      kind: 'embedding',
      repeat: null,
      ...flow([], [{ id: 'embed', label: 'Token embedding' }]),
    },
  ];
  if (dense > 0)
    blocks.push(
      {
        id: 'dense-attention',
        label: attentionLabel,
        kind: 'attention',
        repeat: dense,
        ...prefixed(attention, 'dense-'),
      },
      {
        id: 'dense-ffn',
        label: 'Dense FFN',
        kind: 'ffn',
        repeat: dense,
        ...prefixed(ffn, 'dense-'),
      },
    );
  blocks.push({
    id: 'attention',
    label: attentionLabel,
    kind: 'attention',
    repeat: main,
    ...attention,
  });
  if (moe) {
    const shared = Boolean(arch?.hasSharedExpert);
    const experts = arch?.numExperts
      ? `${arch.numExperts} experts, top-${arch.activeExperts}${shared ? ' + shared' : ''}`
      : null;
    blocks.push({
      id: 'moe',
      label: experts ? `MoE (${experts})` : 'MoE',
      kind: 'expert',
      repeat: main,
      ...moeFlow(arch),
    });
  } else {
    blocks.push({ id: 'ffn', label: 'FFN', kind: 'ffn', repeat: main, ...ffn });
  }
  const head = at('head')[0];
  blocks.push({
    id: 'head',
    label: 'Output',
    kind: 'output',
    repeat: null,
    ...flow(
      [],
      [
        { id: 'norm', label: 'Final norm' },
        head ? { ...gemmBox(head), label: 'LM head' } : { id: 'lm-head', label: 'LM head' },
      ],
    ),
  });
  const other = at('other').map(gemmBox);
  // Roles with no known place: listed, unconnected.
  if (other.length > 0)
    blocks.push({
      id: 'other',
      label: 'Other GEMMs',
      kind: 'ffn',
      repeat: null,
      ...flow([], other),
      edges: [],
      entries: [],
    });
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
