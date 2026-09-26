import type {
  ComparisonColumns,
  ComparisonOp,
  ComparisonView,
  ComputePrecision,
} from '@semianalysisai/inferencex-db/operatorx/compare';

import type { Model } from '@/lib/data-mappings';
import { MODEL_ARCHITECTURES, type ModelArchitecture } from '@/lib/model-architectures';

/** Block colors of the model architecture diagram (`model-architecture-diagram-renderer`). */
export type BlockKind = 'embedding' | 'attention' | 'ffn' | 'expert' | 'output';

/** One op of a block: the cases measured for it come from `op`'s view, by role. */
export interface OpSlot {
  id: string;
  label: string;
  /** Null for a stage OperatorX does not measure yet (embedding, attention core, ...). */
  op: ComparisonOp | null;
  /** Testlist roles (`name`) whose cases belong here; the MoE op takes every case. */
  roles: string[];
}

export interface LayerBlock {
  id: string;
  label: string;
  kind: BlockKind;
  /** How many layers repeat this block, when more than one. */
  repeat: number | null;
  slots: OpSlot[];
}

/** Attention projections in forward order; roles not listed sort between these and the output. */
const ATTENTION_ORDER = [
  'qkv_proj',
  'q_proj',
  'k_proj',
  'v_proj',
  'q_a_proj',
  'q_b_proj',
  'kv_a_proj_with_mqa',
  'kv_b_proj',
  'attn.wq_a',
  'attn.wq_a+wkv',
  'attn.wq_b',
  'attn.wkv',
  'attn.compressor.wkv+wgate',
  'attn.indexer.wq_b',
  'attn.indexer.weights_proj',
];
const ATTENTION_OUT = ['o_proj', 'attn.wo_a', 'attn.wo_b'];
const FFN_ORDER = ['gate_up_proj', 'down_proj'];
const HEAD_ROLES = ['head', 'lm_head'];

type Place = 'attention' | 'ffn' | 'head' | 'other';

/**
 * Where a GEMM role runs. The MoE op already covers the router, the routed experts and
 * the shared expert, so their GEMMs have no row of their own.
 */
function place(role: string): Place | null {
  if (ATTENTION_ORDER.includes(role) || ATTENTION_OUT.includes(role)) return 'attention';
  if (/^(?:attn|self_attn)\./.test(role) || role === 'hc_attn') return 'attention';
  if (FFN_ORDER.includes(role) || role === 'hc_ffn') return 'ffn';
  if (/^(?:experts|shared_experts?|ffn\.shared_experts|ffn\.gate$|mlp\.)/.test(role)) return null;
  if (HEAD_ROLES.includes(role)) return 'head';
  return 'other';
}

/** An MTP module's layers repeat the main ones' shapes; they share the main role's row. */
const baseRole = (role: string) => role.replace(/^mtp\./, '');

const rank = (order: string[], role: string) => {
  const i = order.indexOf(role);
  return i === -1 ? order.length : i;
};

const gemm = (role: string): OpSlot => ({
  id: role,
  label: role,
  op: 'gemm',
  roles: [role, `mtp.${role}`],
});
const unmeasured = (id: string, label: string): OpSlot => ({ id, label, op: null, roles: [] });

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
  if (!view || !slot.op) return [];
  return view.cases.flatMap((c, i) =>
    (precision === null || c.computePrecision === precision) &&
    (slot.op === 'moe' || caseRoles(view, i, model).some((r) => slot.roles.includes(r)))
      ? [i]
      : [],
  );
}

/**
 * The model top down, as the architecture diagram draws it: embedding, the dense layers
 * (when an MoE model leads with some), the repeated layers, the final norm and head.
 * GEMM slots appear for the roles the data holds for this model.
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
  const at = (where: Place) => [...present].filter((r) => place(r) === where);
  const inAttention = at('attention');
  const attention: OpSlot[] = [
    ...inAttention
      .filter((r) => !ATTENTION_OUT.includes(r))
      .sort((a, b) => rank(ATTENTION_ORDER, a) - rank(ATTENTION_ORDER, b) || a.localeCompare(b))
      .map(gemm),
    unmeasured('attention-core', 'Attention'),
    ...inAttention
      .filter((r) => ATTENTION_OUT.includes(r))
      .sort((a, b) => rank(ATTENTION_OUT, a) - rank(ATTENTION_OUT, b))
      .map(gemm),
  ];
  const attentionLabel = arch ? `Attention (${arch.attentionType})` : 'Attention';
  const ffn = at('ffn')
    .sort((a, b) => rank(FFN_ORDER, a) - rank(FFN_ORDER, b) || a.localeCompare(b))
    .map(gemm);
  const head = at('head');
  const moe = arch ? arch.architectureType === 'moe' : hasMoe;
  const layers = arch?.numLayers ?? null;
  const dense = moe ? (arch?.denseFFNLayers ?? 0) : 0;
  const main = layers === null ? null : layers - dense;

  const blocks: LayerBlock[] = [
    {
      id: 'embed',
      label: 'Embedding',
      kind: 'embedding',
      repeat: null,
      slots: [unmeasured('embed', 'Token embedding')],
    },
  ];
  if (dense > 0)
    blocks.push(
      {
        id: 'dense-attention',
        label: attentionLabel,
        kind: 'attention',
        repeat: dense,
        slots: attention.map((s) => ({ ...s, id: `dense-${s.id}` })),
      },
      {
        id: 'dense-ffn',
        label: 'Dense FFN',
        kind: 'ffn',
        repeat: dense,
        slots: ffn.map((s) => ({ ...s, id: `dense-${s.id}` })),
      },
    );
  blocks.push({
    id: 'attention',
    label: attentionLabel,
    kind: 'attention',
    repeat: main,
    slots: attention,
  });
  if (moe) {
    // The MoE op runs the whole block: router GEMM and top-k, the routed experts' gate/up
    // and down projections and the shared expert, through the combined output.
    const shared = Boolean(arch?.hasSharedExpert);
    const experts = arch?.numExperts
      ? `${arch.numExperts} experts, top-${arch.activeExperts}${shared ? ' + shared' : ''}`
      : null;
    blocks.push({
      id: 'moe',
      label: experts ? `MoE (${experts})` : 'MoE',
      kind: 'expert',
      repeat: main,
      slots: [
        {
          id: 'moe',
          label: shared ? 'Router → experts + shared' : 'Router → experts',
          op: 'moe',
          roles: [],
        },
      ],
    });
  } else if (ffn.length > 0) {
    blocks.push({ id: 'ffn', label: 'FFN', kind: 'ffn', repeat: main, slots: ffn });
  }
  blocks.push({
    id: 'head',
    label: 'Output',
    kind: 'output',
    repeat: null,
    slots: [
      unmeasured('norm', 'Final norm'),
      head.length > 0 ? { ...gemm(head[0]), label: 'LM head' } : unmeasured('lm-head', 'LM head'),
    ],
  });
  const other = at('other').sort().map(gemm);
  if (other.length > 0)
    blocks.push({ id: 'other', label: 'Other GEMMs', kind: 'ffn', repeat: null, slots: other });
  return blocks.filter((b) => b.slots.length > 0);
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
