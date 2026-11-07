import type { Locale } from '@/lib/i18n/i18n';

/**
 * Chinese for the Model View diagram (block names, box labels and hover notes from
 * `layers.ts`), keyed by the English text. Module names (`q_proj`, `wkv`), activations and
 * terms engineers write in English (RoPE, RMSNorm, sink, top-k) have no entry and stay as
 * written.
 */
const ZH: Record<string, string> = {
  // blocks
  Embedding: '嵌入',
  Output: '输出',
  FFN: 'FFN',
  'Dense FFN': '稠密 FFN',
  MoE: 'MoE',
  'Other GEMMs': '其他 GEMM',
  Attention: '注意力',
  'Multi-head latent attention': '多头潜在注意力',
  'MLA + DeepSeek sparse attention': 'MLA + DeepSeek 稀疏注意力',
  'Gated MLA (NoPE)': '门控 MLA（NoPE）',
  'Compressed sparse attention (CSA)': '压缩稀疏注意力（CSA）',
  'Heavily compressed attention (HCA)': '高压缩注意力（HCA）',
  'Hybrid attention': '混合注意力',
  'Gated attention': '门控注意力',
  'Grouped query attention': '分组查询注意力',
  'Grouped query attention + sink': '分组查询注意力 + sink',
  'MiniMax sparse attention': 'MiniMax 稀疏注意力',
  // boxes
  'Token embedding': 'Token 嵌入',
  'Final norm': '最终归一化',
  'Attention forward': '注意力前向',
  'MoE forward': 'MoE 前向',
  'MLA attention': 'MLA 注意力',
  'Sparse MLA attention': '稀疏 MLA 注意力',
  'Attention + sink': '注意力 + sink',
  'Sparse attention + sink': '稀疏注意力 + sink',
  'Block-sparse attention': '块稀疏注意力',
  'mHC pre-mix + RMSNorm': 'mHC 前置混合 + RMSNorm',
  'mHC post-mix': 'mHC 后置混合',
  'mHC head mix': 'mHC 输出头混合',
  Compressor: '压缩器',
  Pool: '池化',
  'Pool ÷4': '池化 ÷4',
  'Pool ÷128': '池化 ÷128',
  'Causal conv1d + SiLU': '因果 conv1d + SiLU',
  'Gated delta rule': '门控 delta 规则',
  'Gated RMSNorm': '门控 RMSNorm',
  'Short conv + L2 norm': '短卷积 + L2 归一化',
  Router: '路由器',
  'Latent down': 'Latent 降维',
  'Latent up': 'Latent 升维',
  'Experts gate / up': '专家 gate / up',
  'Experts down': '专家 down',
  'Shared gate / up': '共享专家 gate / up',
  'Shared down': '共享专家 down',
  'Weighted combine': '加权合并',
  // hover notes
  'Emits the queries and a per-head output gate': '输出 query 以及每个 head 的输出门控',
  'q, k and v as one fused GEMM, as some engines run them':
    'q、k、v 融合为一个 GEMM，部分推理引擎按此方式运行',
  'Scores blocks of past tokens from the index queries and keys':
    '用 index query 和 key 为历史 token 块打分',
  'Output gated by the sigmoid of the gate q_proj emits': '输出乘以 q_proj 所输出门控值的 sigmoid',
  'The rotary key part, shared by every head': 'key 中做旋转位置编码的部分，所有 head 共享',
  'The shared key part, cached but never rotated (NoPE)':
    'key 中所有 head 共享的部分，写入缓存但不做旋转（NoPE）',
  'Per-head output gate from the layer input': '由层输入计算每个 head 的输出门控',
  'Scores past tokens from the query latent': '根据 query latent 为历史 token 打分',
  'Hyper-connections reduce the residual streams to one':
    'Hyper-connections 将多路残差流合并为一路',
  'Queries from the query latent': '由 query latent 计算 query',
  'The indexer’s own compressor and head weights score the pooled entries':
    'indexer 用自身的压缩器和 head 权重为池化后的条目打分',
  'One shared KV head: the last 128 tokens plus the selected compressed entries':
    '单个共享 KV head：最近 128 个 token，加上选中的压缩条目',
  'One shared KV head: the last 128 tokens plus every compressed entry':
    '单个共享 KV head：最近 128 个 token，加上全部压缩条目',
  'Grouped low-rank output': '分组低秩输出',
  'Per-head decay and write strength': '每个 head 的衰减与写入强度',
  'Per-head write strength': '每个 head 的写入强度',
  'Output gate': '输出门控',
  'Per-channel decay gate, low rank': '逐通道衰减门控（低秩）',
  'The top 16 blocks of 128 tokens plus the local block':
    '以 128 个 token 为一块，取得分最高的 16 块加上局部块',
  'Layers alternate a 128-token sliding window and full attention':
    '各层交替使用 128 token 滑动窗口注意力和全注意力',
  'Projections, norms, RoPE, cache writes and attention, timed as one op':
    '投影、norm、RoPE、缓存写入和注意力合为一个 op 计时',
  'Router, dispatch, experts and combine, timed as one op':
    '路由、分发、专家计算和合并合为一个 op 计时',
};

/** Text `layers.ts` builds from numbers or names, with its Chinese. */
const ZH_PATTERNS: [RegExp, string][] = [
  [/^(?<role>\S+): one fused GEMM$/u, '$<role>：融合为一个 GEMM'],
  [/^(?<n>\d+) shared experts$/u, '$<n> 个共享专家'],
  [
    /^The first (?<n>\d+) layers pick experts by token id instead$/u,
    '前 $<n> 层改为按 token id 选择专家',
  ],
  [/^Routed experts work in a (?<n>\d+)-wide latent$/u, '路由专家在 $<n> 维 latent 中计算'],
  [/^Top-(?<k>\d+) of (?<n>\d+)$/u, 'Top-$<k> / $<n>'],
  [/^Top-(?<k>\d+) blocks$/u, 'Top-$<k> 块'],
  [/^Attention \((?<type>[^)]+)\)$/u, '注意力（$<type>）'],
  [
    /^MoE \((?<n>\d+) experts, top-(?<k>\d+) \+ shared\)$/u,
    'MoE（$<n> 个专家，top-$<k> + 共享专家）',
  ],
  [/^MoE \((?<n>\d+) experts, top-(?<k>\d+)\)$/u, 'MoE（$<n> 个专家，top-$<k>）'],
];

function zh(text: string): string | null {
  if (text in ZH) return ZH[text];
  const pattern = ZH_PATTERNS.find(([re]) => re.test(text));
  return pattern ? text.replace(...pattern) : null;
}

/**
 * A diagram text in `locale`. A fused box's label joins the labels of the boxes it runs
 * with ` + `, so each of those is looked up on its own.
 */
export function diagramText(text: string, locale: Locale): string {
  if (locale === 'en') return text;
  return (
    zh(text) ??
    text
      .split(' + ')
      .map((part) => zh(part) ?? part)
      .join(' + ')
  );
}
