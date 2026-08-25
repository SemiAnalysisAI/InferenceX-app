import { Model } from '@/lib/data-mappings';
import type { AttentionCostSpec } from '@/lib/attention-flops';

/**
 * Model architecture types
 */
export type ArchitectureType = 'dense' | 'moe';

/**
 * Attention mechanism types used in modern LLMs
 */
export type AttentionType = 'MHA' | 'GQA' | 'MLA' | 'Linear' | 'Hybrid' | 'AlternatingSinkGQA';

/**
 * Describes one category of alternating transformer layers.
 * Used when a model interleaves different layer types (e.g., sliding vs full attention).
 */
export interface AlternatingLayerSpec {
  /** Short label for this layer type (e.g., "Sliding Attention + Sink") */
  label: string;
  /** Longer description shown in the diagram */
  description: string;
  /** Number of layers of this type */
  count: number;
  /** Color key for visual distinction */
  colorKey: 'attention' | 'ffn' | 'norm' | 'router' | 'expert';
  /**
   * Sliding-window size (in tokens) for this layer type, when it includes a
   * local sliding-window attention branch. Rendered as `window=N` in the
   * diagram. Omit for layer types that use full / non-windowed attention.
   */
  slidingWindow?: number;
}

/**
 * Model architecture specification
 */
export interface ModelArchitecture {
  /** Model enum value */
  model: Model;
  /** Total parameter count (in billions) */
  totalParams: number;
  /** Active parameters per forward pass (in billions, same as total for dense models) */
  activeParams: number;
  /** Architecture type: dense or mixture-of-experts */
  architectureType: ArchitectureType;
  /** Attention mechanism used */
  attentionType: AttentionType;
  /** Number of transformer layers */
  numLayers?: number;
  /** Hidden dimension size */
  hiddenSize?: number;
  /** Number of attention heads */
  numHeads?: number;
  /** Number of KV heads (for GQA/MQA) */
  numKVHeads?: number;
  /** Per-head dimension. If not provided, inferred from hiddenSize/numHeads */
  headDim?: number;
  /** Vocabulary size */
  vocabSize?: number;
  /** FFN intermediate dimension (for dense models or expert FFN for MoE) */
  ffnDim?: number;
  /** Number of experts (for MoE models) */
  numExperts?: number;
  /** Number of active experts per token (for MoE models) */
  activeExperts?: number;
  /** Whether the model uses a shared expert (DeepSeek-style) */
  hasSharedExpert?: boolean;
  /** Number of initial transformer layers that use dense FFN instead of MoE (for MoE models) */
  denseFFNLayers?: number;
  /** Intermediate dimension of the dense FFN layers (differs from MoE expert FFN dim) */
  denseFFNDim?: number;
  /**
   * Number of leading MoE layers that use hash routing (token-id → fixed experts)
   * instead of the learned gate. Rendered as a separate stacked prefix block.
   */
  hashRoutedLayers?: number;
  /**
   * Alternating layer type pattern (e.g., gpt-oss uses sliding_attention/full_attention).
   * Each entry describes one category of layer and how many of that type exist.
   */
  alternatingLayers?: AlternatingLayerSpec[];
  /** Sliding window size in tokens (for models using sliding/local attention) */
  slidingWindow?: number;
  /**
   * Number of parallel residual streams for hyper-connections (mHC). When > 1,
   * residual merges render as "mHC ×N" mixer nodes instead of a plain "+" add.
   */
  hyperConnections?: number;
  /** Context window size (in tokens) */
  contextWindow?: number;
  /** Special architectural features */
  features?: string[];
  // No `releaseDate` here, deliberately. A model's release date is the same fact
  // the Fleet Lifecycle time axis anchors on, so it lives once in
  // `MODEL_RELEASE_DATES` (`@semianalysisai/inferencex-constants`) and is read
  // through `getModelReleaseDate(arch.model)`. While this file kept its own copy
  // the two disagreed: DeepSeek-V4-Pro was listed here as releasing six weeks
  // after its own first benchmark run, and both values were rendered to users.
  /** Developer/Organization */
  developer?: string;
  /** Link to model card or paper */
  sourceUrl?: string;
  /** Override whether the attention block is expandable in diagrams. If not set, determined by attentionType. */
  attentionExpandable?: boolean;
  /**
   * Override whether the attention block *inside each alternating layer block*
   * drills down to the hybrid local/compressed flow (`getHybridAttentionSubBlocks`).
   * Defaults to expandable for `Hybrid` attention. Independent of
   * `attentionExpandable`, which governs the single non-alternating block:
   * DeepSeek V4 disables that one but keeps this one. Set false for hybrids
   * that aren't CSA/HCA-shaped (Kimi K3's KDA + gated MLA stack).
   */
  alternatingAttentionExpandable?: boolean;
  /**
   * Number of shared experts included in `numExperts`. Defaults to 1 when
   * `hasSharedExpert` is set — the DeepSeek-style single shared expert every
   * other MoE model here uses. Kimi K3's LatentMoE has 2.
   */
  sharedExperts?: number;
  /**
   * Override the caption on the arrow between the two alternating blocks.
   * Defaults to "alternating every layer", which is only true for an even 1:1
   * interleave (gpt-oss, DeepSeek V4). Set it when the split is uneven.
   */
  alternatingNote?: string;
  /**
   * Attention label for the dense-FFN prefix block, when that layer's mechanism
   * differs from the model-wide `attentionType`. Only matters for hybrids whose
   * dense layer belongs to one specific category — Kimi K3's dense layer is a
   * KDA layer, so the model-wide "Hybrid Attention" label would misdescribe it.
   */
  denseLayerAttentionLabel?: string;
  /** GLU variant of the FFN / expert blocks. Defaults to `SwiGLU`. */
  ffnVariant?: string;
  /** Elementwise activation applied to the gate projection. Defaults to `SiLU`. */
  ffnGateActivation?: string;
  /**
   * Attention-FLOPs cost model for the TFLOP/s-per-chip y-metric — see
   * attention-flops.ts for the accounting conventions (activation–activation
   * ops only, MAC = 2 FLOPs, absorbed MLA form). Models without a spec are
   * simply omitted from that metric.
   */
  attention?: AttentionCostSpec;
}

/**
 * Model architecture specifications for supported models.
 *
 * Sources:
 * - https://github.com/meta-llama/llama3/blob/main/llama/model.py
 * - https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct
 * - https://huggingface.co/meta-llama/Llama-3.1-70B-Instruct
 * - https://huggingface.co/deepseek-ai/DeepSeek-R1-0528
 * - https://github.com/deepseek-ai/DeepSeek-V3
 * - https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro (config.json, inference/model.py, DeepSeek_V4.pdf)
 * - https://huggingface.co/moonshotai/Kimi-K2.5/blob/main/config.json
 * - https://huggingface.co/moonshotai/Kimi-K3/blob/main/config.json (+ model card)
 * - https://huggingface.co/openai/gpt-oss-120b/blob/main/config.json
 * - https://huggingface.co/MiniMaxAI/MiniMax-M2/blob/main/config.json
 * - https://huggingface.co/MiniMaxAI/MiniMax-M3/blob/main/config.json
 */
export const MODEL_ARCHITECTURES: Partial<Record<Model, ModelArchitecture>> = {
  [Model.DeepSeek_R1]: {
    model: Model.DeepSeek_R1,
    totalParams: 671,
    activeParams: 37,
    architectureType: 'moe',
    attentionType: 'MLA',
    numLayers: 61,
    hiddenSize: 7168,
    numHeads: 128,
    vocabSize: 129280,
    ffnDim: 2048,
    numExperts: 257,
    activeExperts: 8,
    hasSharedExpert: true,
    denseFFNLayers: 3,
    denseFFNDim: 18432,
    contextWindow: 128000,
    features: [
      'Multi-head Latent Attention',
      'Auxiliary-loss-free Load Balancing',
      'Multi-Token Prediction',
    ],
    developer: 'DeepSeek',
    sourceUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-R1-0528',
    // Absorbed (MQA-mode) MLA — the form that executes at decode: all 128
    // query heads score against the shared 576-dim cached latent (512
    // kv_lora_rank + 64 rope) and aggregate 512-dim latent values.
    // 2·128·(576+512)·L = 278,528·L per layer. Dims:
    // https://huggingface.co/deepseek-ai/DeepSeek-R1-0528/raw/main/config.json;
    // MQA-mode description: https://arxiv.org/html/2512.02556v1.
    attention: {
      groups: [{ label: 'MLA (absorbed)', layers: 61, linPerCtx: 278528 }],
    },
  },
  [Model.DeepSeek_V4_Pro]: {
    model: Model.DeepSeek_V4_Pro,
    totalParams: 1600, // 1.6T
    activeParams: 49,
    architectureType: 'moe',
    attentionType: 'Hybrid',
    // Hybrid CSA/HCA is a bespoke compressed-attention stack, not the standard
    // Q/K/V GQA layout — render it as static blocks, not the GQA drill-down.
    attentionExpandable: false,
    numLayers: 61,
    hiddenSize: 7168,
    numHeads: 128,
    // Shared single-latent KV (MLA-lineage MQA): num_key_value_heads = 1.
    numKVHeads: 1,
    headDim: 512,
    vocabSize: 129280,
    ffnDim: 3072, // moe_intermediate_size
    numExperts: 385, // 384 routed + 1 shared
    activeExperts: 6,
    hasSharedExpert: true,
    // First 3 layers use hash-routed MoE (shown as a separate prefix block); the
    // remaining 58 learned-router layers interleave two compressed-attention
    // variants. Every layer also carries a 128-token sliding-window branch plus a
    // learnable attention sink. Counts below are the learned-router layers:
    // 29 HCA + 29 CSA + 3 hash-routed = 61 (the extra MTP block is SWA-only).
    hashRoutedLayers: 3,
    alternatingLayers: [
      {
        label: 'Heavily Compressed Attention',
        description:
          'HCA (learned-router layers): the KV of every 128 tokens is consolidated into a single entry and attended densely, alongside a 128-token sliding window of uncompressed KV and a learnable attention sink.',
        count: 29,
        colorKey: 'attention',
        slidingWindow: 128,
      },
      {
        label: 'Compressed Sparse Attention',
        description:
          'CSA (learned-router layers): the KV of every 4 tokens is compressed to one entry, then a lightning indexer selects the top-1024 compressed blocks for sparse attention, alongside a 128-token sliding window and a learnable attention sink.',
        count: 29,
        colorKey: 'attention',
        slidingWindow: 128,
      },
    ],
    slidingWindow: 128,
    hyperConnections: 4, // mHC: 4 parallel residual streams (hc_mult)
    contextWindow: 1048576, // 1M
    features: [
      'Hybrid CSA + HCA Attention',
      'Sliding window (128 tokens)',
      'Attention Sink',
      'MLA-style Shared-KV MQA',
      'Lightning Indexer (sparse top-k)',
      'Manifold-Constrained Hyper-Connections (mHC)',
      'sqrt-softplus Routing',
      'Auxiliary-loss-free Load Balancing',
      'Hash Routing (first 3 layers)',
      'Multi-Token Prediction',
      'YaRN RoPE (1M context)',
      'FP4 Experts + FP8 Mixed Precision',
      'Muon Optimizer',
    ],
    developer: 'DeepSeek',
    sourceUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro',
    // Shared single-latent MQA (d_score = d_v = 512, RoPE in-place in the last
    // 64 dims). Config `compress_ratios` decodes the full stack as 31 HCA +
    // 30 CSA layers (the 3 hash-routed MoE layers are HCA, HCA, CSA).
    // HCA: dense over L/128 pooled entries + 128-token window, no indexer →
    //   2·128·(512+512)·(L/128 + 128) = 2,048·L + 33,554,432.
    // CSA: FP4 lightning indexer (64 heads × dim 128) over L/4 pooled keys +
    //   core attention over top-1024 pooled entries + 128-token window →
    //   4,096·L + 262,144·(min(1024, L/4) + 128), and
    //   262,144·min(1024, L/4) ≡ 65,536·min(L, 4096).
    // Attention sink = one learnable per-head logit (0 KV entries, ~0 FLOPs).
    // Sources: https://arxiv.org/html/2606.19348v1;
    // https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/raw/main/config.json;
    // https://huggingface.co/docs/transformers/en/model_doc/deepseek_v4.
    attention: {
      groups: [
        {
          label: 'HCA (128:1 pooled, dense)',
          layers: 31,
          linPerCtx: 2048,
          constPerToken: 33554432,
        },
        {
          label: 'CSA (4:1 pooled, indexer top-1024)',
          layers: 30,
          linPerCtx: 4096,
          capped: { coeff: 65536, cap: 4096 },
          constPerToken: 33554432,
        },
      ],
    },
  },
  [Model.Llama3_3_70B]: {
    model: Model.Llama3_3_70B,
    totalParams: 70,
    activeParams: 70,
    architectureType: 'dense',
    attentionType: 'GQA',
    numLayers: 80,
    hiddenSize: 8192,
    numHeads: 64,
    numKVHeads: 8,
    vocabSize: 128256,
    ffnDim: 28672,
    contextWindow: 128000,
    features: ['Grouped Query Attention', 'RoPE'],
    developer: 'Meta',
    sourceUrl: 'https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct',
    // Dense causal GQA: 4·H·d·L = 4·64·128·L per layer (GQA KV sharing saves
    // cache, not score/AV compute). Dims:
    // https://huggingface.co/unsloth/Llama-3.3-70B-Instruct/raw/main/config.json.
    attention: {
      groups: [{ label: 'Full GQA', layers: 80, linPerCtx: 65536 }],
    },
  },
  [Model.Llama3_1_70B]: {
    model: Model.Llama3_1_70B,
    totalParams: 70,
    activeParams: 70,
    architectureType: 'dense',
    attentionType: 'GQA',
    numLayers: 80,
    hiddenSize: 8192,
    numHeads: 64,
    numKVHeads: 8,
    vocabSize: 128256,
    ffnDim: 28672,
    contextWindow: 128000,
    features: ['Grouped Query Attention', 'RoPE'],
    developer: 'Meta',
    sourceUrl: 'https://huggingface.co/meta-llama/Llama-3.1-70B-Instruct',
    // Identical attention geometry to Llama 3.3 70B (80 × 64 heads × dim 128):
    // https://huggingface.co/unsloth/Meta-Llama-3.1-70B-Instruct/raw/main/config.json.
    attention: {
      groups: [{ label: 'Full GQA', layers: 80, linPerCtx: 65536 }],
    },
  },
  [Model.GptOss]: {
    model: Model.GptOss,
    totalParams: 120,
    activeParams: 5,
    architectureType: 'moe',
    attentionType: 'AlternatingSinkGQA',
    numLayers: 36,
    hiddenSize: 2880,
    numHeads: 64,
    numKVHeads: 8,
    headDim: 64,
    vocabSize: 201088,
    ffnDim: 2880,
    numExperts: 128,
    activeExperts: 4,
    hasSharedExpert: false,
    alternatingLayers: [
      {
        label: 'Sliding Attention + Sink',
        description: 'GQA with 128-token sliding window and learnable attention sink tokens',
        count: 18,
        colorKey: 'attention',
        slidingWindow: 128,
      },
      {
        label: 'Causal Grouped Query Attention',
        description: 'Standard GQA with full causal masking over entire context',
        count: 18,
        colorKey: 'norm',
      },
    ],
    slidingWindow: 128,
    contextWindow: 131072,
    features: [
      'Alternating Sliding/Full Attention',
      'Attention Sink Tokens',
      'YaRN RoPE (factor=32)',
      'MXFP4 Quantization',
    ],
    developer: 'OpenAI',
    sourceUrl: 'https://huggingface.co/openai/gpt-oss-120b',
    // 18 full + 18 sliding-128 GQA layers, 64 heads × dim 64 → 4·64·64 =
    // 16,384 FLOPs/token per ctx unit; sliding layers cap L at 128. The
    // learnable sink is one extra softmax logit per head (~0 FLOPs).
    // https://huggingface.co/openai/gpt-oss-120b/raw/main/config.json;
    // https://arxiv.org/abs/2508.10925.
    attention: {
      groups: [
        { label: 'Full GQA', layers: 18, linPerCtx: 16384 },
        { label: 'Sliding-128 GQA', layers: 18, capped: { coeff: 16384, cap: 128 } },
      ],
    },
  },
  [Model.Kimi_K2_5]: {
    model: Model.Kimi_K2_5,
    totalParams: 1000,
    activeParams: 32,
    architectureType: 'moe',
    attentionType: 'MLA',
    numLayers: 61,
    hiddenSize: 7168,
    numHeads: 64,
    vocabSize: 163840,
    ffnDim: 2048,
    numExperts: 385,
    activeExperts: 8,
    hasSharedExpert: true,
    denseFFNLayers: 1,
    denseFFNDim: 18432,
    contextWindow: 262144,
    features: ['Multi-head Latent Attention', 'DeepSeek-style MoE', 'YaRN RoPE'],
    developer: 'Moonshot AI',
    sourceUrl: 'https://huggingface.co/moonshotai/Kimi-K2.5',
    // DeepSeek-V3-style absorbed MLA on all 61 layers, 64 heads: score dim
    // 576 (512 latent + 64 rope), value dim 512 → 2·64·(576+512)·L =
    // 139,264·L per layer.
    // https://huggingface.co/moonshotai/Kimi-K2.5/raw/main/config.json.
    attention: {
      groups: [{ label: 'MLA (absorbed)', layers: 61, linPerCtx: 139264 }],
    },
  },
  [Model.Kimi_K3]: {
    model: Model.Kimi_K3,
    totalParams: 2800, // 2.8T
    activeParams: 104,
    architectureType: 'moe',
    // 69 Kimi Delta Attention (linear) layers interleaved with 24 gated-MLA
    // layers. Neither the GQA drill-down nor the DeepSeek V4 CSA/HCA hybrid
    // drill-down describes this stack, so both layer categories render as
    // static attention blocks.
    attentionType: 'Hybrid',
    attentionExpandable: false,
    alternatingAttentionExpandable: false,
    numLayers: 93,
    hiddenSize: 7168,
    numHeads: 96,
    vocabSize: 163840,
    ffnDim: 3072, // moe_intermediate_size (per-expert FFN)
    numExperts: 898, // 896 routed + 2 shared
    sharedExperts: 2,
    activeExperts: 16,
    hasSharedExpert: true,
    denseFFNLayers: 1, // first_k_dense_replace
    denseFFNDim: 33792, // intermediate_size (dense layer FFN)
    // The dense-FFN layer (layer 1) is a KDA layer, and the diagram stacks the
    // dense prefix block above both alternating blocks — so it is carved out of
    // the KDA count here (68 + 24 + 1 dense = 93), the same partition DeepSeek
    // V4 uses for its hash-routed prefix. Full layer composition is 69 KDA + 24
    // gated MLA.
    alternatingLayers: [
      {
        label: 'Kimi Delta Attention (KDA)',
        description:
          'Linear-attention layers with a gated delta-rule state update — constant-size recurrent state instead of a growing KV cache. 69 KDA layers total; the first is the dense-FFN layer shown above.',
        count: 68,
        colorKey: 'attention',
      },
      {
        label: 'Gated MLA',
        description:
          'Multi-head Latent Attention (512-dim compressed KV latent, NoPE) with an output gate, placed every fourth layer to carry full-context recall.',
        count: 24,
        colorKey: 'norm',
      },
    ],
    // Not a 1:1 interleave — full attention lands on layers 4, 8, … 92 plus the
    // final layer 93.
    alternatingNote: 'gated MLA every 4th layer',
    // The dense-FFN prefix is layer 1, which config.json lists under
    // `kda_layers` — the model-wide "Hybrid Attention" label would be wrong for
    // that single block.
    denseLayerAttentionLabel: 'Kimi Delta Attention (KDA)',
    // hidden_act = "situ"; the model card calls the FFN SiTU-GLU.
    ffnVariant: 'SiTU-GLU',
    ffnGateActivation: 'SiTU',
    contextWindow: 1048576, // 1M
    features: [
      'Kimi Delta Attention (KDA linear attention)',
      'Gated MLA (every 4th layer, NoPE)',
      'Attention Residuals (AttnRes)',
      'Stable LatentMoE (3584-dim latent)',
      'MoE (896 routed + 2 shared experts, 16 active)',
      'SiTU-GLU Activation',
      'Native Multimodality (text/image/video)',
      'MXFP4 Quantization',
    ],
    developer: 'Moonshot AI',
    sourceUrl: 'https://huggingface.co/moonshotai/Kimi-K3',
    // 69 KDA linear-attention layers: gated delta-rule update + readout on a
    // 128×128 state per head × 96 heads ≈ 7·H·d² = 11,010,048 FLOPs/token,
    // independent of L (recurrent form; the chunked prefill kernel is ~11%
    // higher — within noise of this metric). 24 gated-MLA layers are NoPE
    // (`mla_use_nope`), so score dim = value dim = 512 → 2·96·(512+512)·L =
    // 196,608·L per layer.
    // https://huggingface.co/moonshotai/Kimi-K3/raw/main/config.json;
    // https://arxiv.org/abs/2510.26692.
    attention: {
      groups: [
        { label: 'KDA (linear)', layers: 69, constPerToken: 11010048 },
        { label: 'Gated MLA (NoPE, absorbed)', layers: 24, linPerCtx: 196608 },
      ],
    },
  },
  [Model.MiniMax_M2_5]: {
    model: Model.MiniMax_M2_5,
    totalParams: 230,
    activeParams: 10,
    architectureType: 'moe',
    attentionType: 'GQA',
    attentionExpandable: false,
    numLayers: 62,
    hiddenSize: 3072,
    numHeads: 48,
    numKVHeads: 8,
    headDim: 128,
    vocabSize: 200064,
    ffnDim: 1536,
    numExperts: 256,
    activeExperts: 8,
    hasSharedExpert: false,
    contextWindow: 196608,
    features: [
      'GQA with QK Norm',
      'RoPE',
      'Multi-Token Prediction (3 modules)',
      'FP8 Quantization',
    ],
    developer: 'MiniMax',
    sourceUrl: 'https://huggingface.co/MiniMaxAI/MiniMax-M2',
    // Dense causal GQA on all 62 layers (config `attn_type_list` is all 1s):
    // 4·48·128·L = 24,576·L per layer.
    // https://huggingface.co/MiniMaxAI/MiniMax-M2.5/raw/main/config.json.
    attention: {
      groups: [{ label: 'Full GQA', layers: 62, linPerCtx: 24576 }],
    },
  },
  [Model.MiniMax_M3]: {
    model: Model.MiniMax_M3,
    totalParams: 428,
    activeParams: 23,
    architectureType: 'moe',
    // MiniMax Sparse Attention (MSA) is built on a GQA projection layout
    // (64 Q / 4 KV heads) with sparse KV selection layered on top. Render it as
    // a static attention block, not the standard GQA Q/K/V drill-down — same
    // treatment as the M2.5 entry.
    attentionType: 'GQA',
    attentionExpandable: false,
    numLayers: 60,
    hiddenSize: 6144,
    numHeads: 64,
    numKVHeads: 4,
    headDim: 128,
    vocabSize: 200064,
    ffnDim: 3072, // moe_intermediate_size (per-expert FFN)
    numExperts: 129, // 128 routed + 1 shared
    activeExperts: 4,
    hasSharedExpert: true,
    contextWindow: 1048576, // 1M
    features: [
      'MiniMax Sparse Attention (MSA)',
      'GQA with QK Norm',
      'Partial RoPE (rotary factor 0.5)',
      'SwiGLU FFN',
      'Native Multimodality (text/image/video)',
      'MoE (128 routed + 1 shared experts, 4 active)',
    ],
    developer: 'MiniMax',
    sourceUrl: 'https://huggingface.co/MiniMaxAI/MiniMax-M3',
    // Layers 0–2 dense GQA (4·64·128·L = 32,768·L); layers 3–59 MSA: per-token
    // index scoring (4 group heads × dim 128, no value head) over all L
    // positions = 2·4·128·L = 1,024·L, then exact GQA over the top-16
    // 128-token blocks (2048-token budget) = 32,768·min(L, 2048). Reproduces
    // the paper's 28.4× attention-compute reduction at 1M.
    // https://huggingface.co/MiniMaxAI/MiniMax-M3/raw/main/config.json;
    // https://arxiv.org/html/2606.13392v2.
    attention: {
      groups: [
        { label: 'Dense GQA (layers 0-2)', layers: 3, linPerCtx: 32768 },
        {
          label: 'MSA (top-16 blocks of 128)',
          layers: 57,
          linPerCtx: 1024,
          capped: { coeff: 32768, cap: 2048 },
        },
      ],
    },
  },
};

/**
 * Get architecture specification for a model
 */
export function getModelArchitecture(model: Model): ModelArchitecture | undefined {
  return MODEL_ARCHITECTURES[model];
}

/**
 * Format parameter count for display (e.g., "671B" or "70B")
 */
export function formatParamCount(params: number): string {
  if (params >= 1000) {
    return `${(params / 1000).toFixed(1)}T`;
  }
  return `${params}B`;
}

/**
 * Get a human-readable architecture summary
 */
export function getArchitectureSummary(arch: ModelArchitecture): string {
  if (arch.architectureType === 'moe') {
    return `MoE ${formatParamCount(arch.totalParams)} (${formatParamCount(arch.activeParams)} active)`;
  }
  return `Dense ${formatParamCount(arch.totalParams)}`;
}

/** GLU variant of the FFN / expert blocks, e.g. `SwiGLU` or K3's `SiTU-GLU`. */
export function ffnVariantLabel(arch: ModelArchitecture): string {
  return arch.ffnVariant ?? 'SwiGLU';
}

/** Elementwise activation on the gate projection, e.g. `SiLU` or K3's `SiTU`. */
export function ffnGateActivationLabel(arch: ModelArchitecture): string {
  return arch.ffnGateActivation ?? 'SiLU';
}

/**
 * Attention label for the dense-FFN prefix block. Falls back to the model-wide
 * attention type, which is right for every uniform-attention model; hybrids
 * whose dense layer is one specific category override it.
 */
export function denseLayerAttentionLabel(arch: ModelArchitecture): string {
  return arch.denseLayerAttentionLabel ?? getAttentionLabel(arch.attentionType);
}

/** Shared experts counted inside `numExperts`. Zero when the model has none. */
export function sharedExpertCount(arch: ModelArchitecture): number {
  if (!arch.hasSharedExpert) return 0;
  return arch.sharedExperts ?? 1;
}

/**
 * Router sub-label for a MoE expert grid, e.g. `Top-8 of 384 routed + 1 shared`.
 * `numExperts` counts routed *and* shared experts, so the shared ones are
 * subtracted out of the routed figure — with the model's own shared count, not
 * an assumed 1 (Kimi K3 has 2).
 */
export function expertRouterSummary(arch: ModelArchitecture): string {
  const shared = sharedExpertCount(arch);
  const routed = (arch.numExperts ?? 0) - shared;
  const sharedSuffix = shared > 0 ? ` + ${shared} shared` : '';
  return `Top-${arch.activeExperts} of ${routed} routed${sharedSuffix}`;
}

/**
 * Get attention type label with description
 */
export function getAttentionLabel(type: AttentionType): string {
  switch (type) {
    case 'MHA': {
      return 'Multi-Head Attention';
    }
    case 'GQA': {
      return 'Grouped Query Attention';
    }
    case 'MLA': {
      return 'Multi-head Latent Attention';
    }
    case 'Linear': {
      return 'Linear Attention';
    }
    case 'Hybrid': {
      return 'Hybrid Attention';
    }
    case 'AlternatingSinkGQA': {
      return 'Alternating Sink/Full GQA';
    }
    default: {
      return type;
    }
  }
}

/**
 * Format context window for display (e.g., "128K" or "1M")
 */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(0)}M`;
  }
  return `${(tokens / 1000).toFixed(0)}K`;
}

/**
 * Sub-block component of an architecture module (attention or FFN).
 * Used to render expanded drill-down views in architecture diagrams.
 */
export interface ArchSubBlock {
  /** Display name of the sub-component */
  name: string;
  /** Technical detail (dimensions, ratios, etc.) */
  detail?: string;
  /** Component type for color coding */
  type: 'projection' | 'activation' | 'operation' | 'attention';
  /** When set, render as a circle with this symbol instead of a rectangular block (e.g., '\u00D7' for multiply, '+' for add) */
  circleSymbol?: string;
}

/**
 * Flow layout for sub-blocks, supporting both sequential and parallel rendering.
 * Sequential: all blocks rendered top-to-bottom with arrows.
 * Parallel: two independent paths (left/right) that converge into merge blocks.
 * ThreeWay: three independent paths that converge in two stages.
 */
export type SubBlockFlow =
  | { layout: 'sequential'; blocks: ArchSubBlock[] }
  | {
      layout: 'parallel';
      leftPath: ArchSubBlock[];
      rightPath: ArchSubBlock[];
      mergeBlocks: ArchSubBlock[];
      leftLabel?: string;
      rightLabel?: string;
    }
  | {
      layout: 'threeWay';
      leftPath: ArchSubBlock[];
      middlePath: ArchSubBlock[];
      rightPath: ArchSubBlock[];
      /** Where left + middle converge (e.g., RoPE for Q & K only) */
      intermediateMergeBlocks: ArchSubBlock[];
      /** Where intermediate result + right converge (e.g., Grouped Attention) */
      finalMergeBlocks: ArchSubBlock[];
      leftLabel?: string;
      middleLabel?: string;
      rightLabel?: string;
    };

/**
 * Generate attention mechanism sub-blocks based on model architecture.
 * Shows internal components like projections, RoPE, and attention computation.
 * GQA uses a three-way layout with independent Q, K, V paths.
 * Only Q and K go through RoPE; V bypasses directly to attention.
 * Ref: https://github.com/meta-llama/llama3/blob/main/llama/model.py
 */
export function getAttentionSubBlocks(arch: ModelArchitecture): SubBlockFlow {
  // Grouped Query Attention — Q, K, V are 3 INDEPENDENT parallel projections from hidden state
  // Only Q and K go through RoPE; V bypasses RoPE and goes directly to attention
  const hd =
    arch.headDim ||
    (arch.hiddenSize && arch.numHeads ? Math.round(arch.hiddenSize / arch.numHeads) : undefined);

  return {
    layout: 'threeWay',
    leftPath: [
      {
        name: 'Q Projection',
        detail: arch.numHeads
          ? `${arch.numHeads} heads${hd ? ` \u00D7 ${hd}d` : ''}`
          : 'Query heads',
        type: 'projection',
      },
      {
        name: 'RoPE',
        detail: 'Rotary Pos Emb',
        type: 'operation',
      },
    ],
    middlePath: [
      {
        name: 'K Projection',
        detail: arch.numKVHeads
          ? `${arch.numKVHeads} KV heads${hd ? ` \u00D7 ${hd}d` : ''} (shared)`
          : 'Shared KV heads',
        type: 'projection',
      },
      {
        name: 'RoPE',
        detail: 'Rotary Pos Emb',
        type: 'operation',
      },
    ],
    rightPath: [
      {
        name: 'V Projection',
        detail: arch.numKVHeads
          ? `${arch.numKVHeads} KV heads${hd ? ` \u00D7 ${hd}d` : ''}`
          : 'Value heads',
        type: 'projection',
      },
    ],
    intermediateMergeBlocks: [],
    finalMergeBlocks: [
      {
        name: 'Grouped Attention',
        detail:
          arch.numHeads && arch.numKVHeads
            ? `${arch.numHeads}:${arch.numKVHeads} Q:KV ratio`
            : 'Shared KV groups',
        type: 'attention',
      },
      {
        name: 'Output Projection',
        detail: arch.hiddenSize ? `\u2192 ${arch.hiddenSize.toLocaleString()}` : undefined,
        type: 'projection',
      },
    ],
    leftLabel: 'Q',
    middleLabel: 'K',
    rightLabel: 'V',
  };
}

/**
 * Generate FFN/Expert sub-blocks based on model architecture.
 * Shows the SwiGLU feedforward structure used in modern LLMs.
 * Gate and Up projections are parallel paths — SiLU is applied only to gate,
 * then element-wise multiplied with the up projection output.
 */
export function getFFNSubBlocks(
  arch: ModelArchitecture,
  options?: { useDenseFFNDim?: boolean },
): SubBlockFlow {
  const ffnDim = options?.useDenseFFNDim && arch.denseFFNDim ? arch.denseFFNDim : arch.ffnDim;
  const hiddenSize = arch.hiddenSize;

  return {
    layout: 'parallel',
    leftPath: [
      {
        name: 'Gate Projection',
        detail: ffnDim ? `\u2192 ${ffnDim.toLocaleString()}` : undefined,
        type: 'projection',
      },
      {
        name: `${ffnGateActivationLabel(arch)} Activation`,
        detail: 'Applied to gate output',
        type: 'activation',
      },
    ],
    rightPath: [
      {
        name: 'Up Projection',
        detail: ffnDim ? `\u2192 ${ffnDim.toLocaleString()}` : undefined,
        type: 'projection',
      },
    ],
    mergeBlocks: [
      {
        name: '\u2297',
        circleSymbol: '\u00D7',
        type: 'operation',
      },
      {
        name: 'Down Projection',
        detail: hiddenSize ? `\u2192 ${hiddenSize.toLocaleString()}` : undefined,
        type: 'projection',
      },
    ],
  };
}

/**
 * Hybrid attention sub-blocks (DeepSeek V4-style CSA / HCA layers).
 *
 * Unlike a standard GQA layer, every hybrid attention layer fuses two KV
 * sources for each query: a local sliding-window branch (recent uncompressed
 * tokens) and a compressed-KV branch, combined by a shared-KV MQA with a
 * learnable attention sink. The compressed branch depends on the layer type —
 * CSA runs a lightning indexer (sparse top-k) over lightly compressed KV, while
 * HCA attends densely over heavily compressed KV. Rendering this as a flow makes
 * the sliding-window attention an explicit, visible block rather than a one-line
 * `window=N` annotation.
 */
export function getHybridAttentionSubBlocks(
  arch: ModelArchitecture,
  spec: AlternatingLayerSpec,
): SubBlockFlow {
  const win = spec.slidingWindow ?? arch.slidingWindow;
  const isSparse = /sparse/iu.test(spec.label);

  // Both branches are KV *sources* whose selected indices are unioned and fed to
  // a single shared-KV MQA softmax — they are not two attentions merged after
  // the fact. The local branch contributes the recent sliding-window tokens; the
  // compressed branch contributes selected long-range tokens. CSA lightly
  // compresses (1/4) then sparsely selects via the learned lightning indexer;
  // HCA compresses heavily (1/128) and keeps the few resulting entries.
  const localPath: ArchSubBlock[] = [
    {
      name: 'Sliding Window',
      detail: win ? `last ${win} tokens` : 'local KV',
      type: 'attention',
    },
  ];

  const compressedPath: ArchSubBlock[] = isSparse
    ? [
        { name: 'Token Compression', detail: '1 entry / 4 tokens', type: 'operation' },
        { name: 'Lightning Indexer', detail: 'sparse top-1024', type: 'attention' },
      ]
    : [{ name: 'Heavy Compression', detail: '1 entry / 128 tokens', type: 'attention' }];

  return {
    layout: 'parallel',
    leftLabel: 'Local',
    rightLabel: 'Compressed',
    leftPath: localPath,
    rightPath: compressedPath,
    // The union of both branches' indices is consumed by one MQA softmax that
    // carries a per-head learnable attention sink (a softmax-denominator bias,
    // not literal sink tokens) — hence the sink lives on the MQA block here.
    mergeBlocks: [
      {
        name: 'Shared-KV MQA + Sink',
        detail: arch.numHeads ? `${arch.numHeads} heads · ${arch.numKVHeads ?? 1} KV` : undefined,
        type: 'attention',
      },
      {
        name: 'Output Projection',
        detail: arch.hiddenSize ? `→ ${arch.hiddenSize.toLocaleString()}` : undefined,
        type: 'projection',
      },
    ],
  };
}
