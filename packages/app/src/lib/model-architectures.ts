import { Model } from '@/lib/data-mappings';

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
   * Alternating layer type pattern (e.g., gpt-oss uses sliding_attention/full_attention).
   * Each entry describes one category of layer and how many of that type exist.
   */
  alternatingLayers?: AlternatingLayerSpec[];
  /** Sliding window size in tokens (for models using sliding/local attention) */
  slidingWindow?: number;
  /** Context window size (in tokens) */
  contextWindow?: number;
  /** Special architectural features */
  features?: string[];
  /** Release date (YYYY-MM-DD) */
  releaseDate?: string;
  /** Developer/Organization */
  developer?: string;
  /** Link to model card or paper */
  sourceUrl?: string;
  /** Override whether the attention block is expandable in diagrams. If not set, determined by attentionType. */
  attentionExpandable?: boolean;
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
 * - https://huggingface.co/moonshotai/Kimi-K2.5/blob/main/config.json
 * - https://huggingface.co/openai/gpt-oss-120b/blob/main/config.json
 * - https://huggingface.co/MiniMaxAI/MiniMax-M2/blob/main/config.json
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
    releaseDate: '2025-05-28',
    developer: 'DeepSeek',
    sourceUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-R1-0528',
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
    releaseDate: '2024-12-06',
    developer: 'Meta',
    sourceUrl: 'https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct',
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
    releaseDate: '2024-07-23',
    developer: 'Meta',
    sourceUrl: 'https://huggingface.co/meta-llama/Llama-3.1-70B-Instruct',
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
    releaseDate: '2025-06-13',
    developer: 'OpenAI',
    sourceUrl: 'https://huggingface.co/openai/gpt-oss-120b',
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
    releaseDate: '2026-01-27',
    developer: 'Moonshot AI',
    sourceUrl: 'https://huggingface.co/moonshotai/Kimi-K2.5',
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
    releaseDate: '2025-10-25',
    developer: 'MiniMax',
    sourceUrl: 'https://huggingface.co/MiniMaxAI/MiniMax-M2',
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

/**
 * Get attention type label with description
 */
export function getAttentionLabel(type: AttentionType): string {
  switch (type) {
    case 'MHA':
      return 'Multi-Head Attention';
    case 'GQA':
      return 'Grouped Query Attention';
    case 'MLA':
      return 'Multi-head Latent Attention';
    case 'Linear':
      return 'Linear Attention';
    case 'Hybrid':
      return 'Hybrid Attention';
    case 'AlternatingSinkGQA':
      return 'Alternating Sink/Full GQA';
    default:
      return type;
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
        name: 'SiLU Activation',
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
