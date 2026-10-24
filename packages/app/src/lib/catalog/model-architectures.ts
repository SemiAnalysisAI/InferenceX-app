import { Model } from '@/lib/catalog/data-mappings';

export type ArchitectureType = 'dense' | 'moe';

export type AttentionType = 'MHA' | 'GQA' | 'MLA' | 'Linear' | 'Hybrid' | 'AlternatingSinkGQA';

export interface AlternatingLayerSpec {
  label: string;
  description: string;
  count: number;
  colorKey: 'attention' | 'ffn' | 'norm' | 'router' | 'expert';
  slidingWindow?: number;
  attentionShape?: string;
}

export interface ModelArchitecture {
  model: Model;
  totalParams: number;
  activeParams: number;
  /** When prefill and decode activate different parts of a CED backbone. */
  activeParamsPrefill?: number;
  /** Conditional-memory parameters outside the vendor's backbone count. */
  conditionalMemoryParams?: number;
  conditionalMemoryName?: string;
  architectureType: ArchitectureType;
  attentionType: AttentionType;
  numLayers?: number;
  hiddenSize?: number;
  numHeads?: number;
  numKVHeads?: number;
  headDim?: number;
  vocabSize?: number;
  ffnDim?: number;
  numExperts?: number;
  activeExperts?: number;
  hasSharedExpert?: boolean;
  denseFFNLayers?: number;
  denseFFNDim?: number;
  hashRoutedLayers?: number;
  alternatingLayers?: AlternatingLayerSpec[];
  slidingWindow?: number;
  hyperConnections?: number;
  contextWindow?: number;
  advertisedContextWindow?: number;
  features?: string[];
  featuresZh?: string[];
  developer?: string;
  sourceUrl?: string;
  attentionExpandable?: boolean;
  alternatingAttentionExpandable?: boolean;
  sharedExperts?: number;
  alternatingNote?: string;
  alternatingNoteZh?: string;
  denseLayerAttentionLabel?: string;
  ffnVariant?: string;
  ffnGateActivation?: string;
  ffnSwiGLUOAI?: boolean;
  ffnClamp?: number;
  routedExpertHiddenSize?: number;
  attentionLabel?: string;
  residualType?: 'AttnRes' | 'gated';
  /** Causal encoder followed by a decoder whose global KV comes from encoder output. */
  encoderDecoder?: {
    encoderLayers: number;
    decoderLayers: number;
    globalKVSource: 'final-encoder-hidden-states';
    encoderSlidingOnlyLayers: number;
    decoderAttention: 'joint-local-swa-and-shared-global-kv';
  };
}

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
    contextWindow: 163840,
    advertisedContextWindow: 128000,
    features: [
      'Multi-head Latent Attention',
      'Auxiliary-loss-free Load Balancing',
      'Multi-Token Prediction',
    ],
    developer: 'DeepSeek',
    sourceUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-R1-0528',
  },
  [Model.DeepSeek_V4_Pro]: {
    model: Model.DeepSeek_V4_Pro,
    totalParams: 1600,
    activeParams: 49,
    architectureType: 'moe',
    attentionType: 'Hybrid',
    attentionExpandable: false,
    numLayers: 61,
    hiddenSize: 7168,
    numHeads: 128,
    numKVHeads: 1,
    headDim: 512,
    vocabSize: 129280,
    ffnDim: 3072,
    ffnClamp: 10,
    numExperts: 385,
    activeExperts: 6,
    hasSharedExpert: true,
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
    hyperConnections: 4,
    contextWindow: 1048576,
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
    headDim: 128,
    vocabSize: 128256,
    ffnDim: 28672,
    contextWindow: 131072,
    features: ['Grouped Query Attention', 'RoPE'],
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
    headDim: 128,
    vocabSize: 128256,
    ffnDim: 28672,
    contextWindow: 131072,
    features: ['Grouped Query Attention', 'RoPE'],
    developer: 'Meta',
    sourceUrl: 'https://huggingface.co/meta-llama/Llama-3.1-70B-Instruct',
  },
  [Model.GptOss]: {
    model: Model.GptOss,
    totalParams: 116.83,
    activeParams: 5.13,
    ffnVariant: 'SwiGLU-OAI',
    ffnSwiGLUOAI: true,
    ffnClamp: 7,
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
        description: 'GQA with 128-token sliding window and a learned per-head attention sink bias',
        count: 18,
        colorKey: 'attention',
        slidingWindow: 128,
      },
      {
        label: 'Causal GQA + Sink',
        description: 'Full causal GQA with a learned per-head softmax sink bias',
        count: 18,
        colorKey: 'norm',
      },
    ],
    slidingWindow: 128,
    contextWindow: 131072,
    features: [
      'Alternating Sliding/Full Attention',
      'Learned per-head softmax sink',
      'YaRN RoPE (factor=32)',
      'MXFP4 Quantization',
    ],
    featuresZh: [
      '交替使用滑动窗口与全局注意力',
      '每个 head 的可学习 softmax sink',
      'YaRN RoPE（factor=32）',
      'MXFP4 量化',
    ],
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
    developer: 'Moonshot AI',
    sourceUrl: 'https://huggingface.co/moonshotai/Kimi-K2.5',
  },
  [Model.Kimi_K3]: {
    model: Model.Kimi_K3,
    totalParams: 2800,
    activeParams: 104,
    architectureType: 'moe',
    attentionType: 'Hybrid',
    attentionExpandable: false,
    alternatingAttentionExpandable: false,
    numLayers: 93,
    hiddenSize: 7168,
    numHeads: 96,
    vocabSize: 163840,
    ffnDim: 3072,
    numExperts: 898,
    sharedExperts: 2,
    activeExperts: 16,
    hasSharedExpert: true,
    denseFFNLayers: 1,
    denseFFNDim: 33792,
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
          'Multi-head Latent Attention (512-dim compressed KV latent, NoPE) with an output gate, placed at layers 4, 8, …, 92 and 93 to carry full-context recall.',
        count: 24,
        colorKey: 'norm',
      },
    ],
    alternatingNote: 'gated MLA at layers 4, 8, …, 92, 93',
    denseLayerAttentionLabel: 'Kimi Delta Attention (KDA)',
    ffnVariant: 'SiTU-GLU',
    ffnGateActivation: 'SiTU',
    routedExpertHiddenSize: 3584,
    residualType: 'AttnRes',
    contextWindow: 1048576,
    features: [
      'Kimi Delta Attention (KDA linear attention)',
      'Gated MLA (layers 4, 8, …, 92, 93; NoPE)',
      'Attention Residuals (AttnRes)',
      'Stable LatentMoE (3584-dim latent)',
      'MoE (896 routed + 2 shared experts, 16 active)',
      'SiTU-GLU Activation',
      'Native Multimodality (text/image/video)',
      'MXFP4 Quantization',
    ],
    developer: 'Moonshot AI',
    sourceUrl: 'https://huggingface.co/moonshotai/Kimi-K3',
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
      'Context: M2.5 196608 / M2.7 204800 tokens',
    ],
    featuresZh: [
      '带 QK 归一化的 GQA',
      'RoPE',
      '多 token 预测（3 个模块）',
      'FP8 量化',
      '上下文：M2.5 196608 / M2.7 204800 token',
    ],
    developer: 'MiniMax',
    sourceUrl: 'https://huggingface.co/MiniMaxAI/MiniMax-M2.5',
  },
  [Model.MiniMax_M3]: {
    model: Model.MiniMax_M3,
    totalParams: 428,
    activeParams: 23,
    architectureType: 'moe',
    attentionType: 'GQA',
    attentionLabel: 'MiniMax Sparse Attention (MSA)',
    attentionExpandable: false,
    numLayers: 60,
    hiddenSize: 6144,
    numHeads: 64,
    numKVHeads: 4,
    headDim: 128,
    vocabSize: 200064,
    ffnDim: 3072,
    numExperts: 129,
    activeExperts: 4,
    hasSharedExpert: true,
    denseFFNLayers: 3,
    denseFFNDim: 12288,
    denseLayerAttentionLabel: 'Grouped Query Attention',
    ffnVariant: 'SwiGLU-OAI',
    ffnSwiGLUOAI: true,
    ffnClamp: 7,
    contextWindow: 1048576,
    features: [
      'MiniMax Sparse Attention (MSA)',
      'GQA with QK Norm',
      'Partial RoPE (rotary factor 0.5)',
      'SwiGLU-OAI FFN',
      'Native Multimodality (text/image/video)',
      'MoE (128 routed + 1 shared experts, 4 active)',
    ],
    developer: 'MiniMax',
    sourceUrl: 'https://huggingface.co/MiniMaxAI/MiniMax-M3',
  },
  [Model.MiniMax_M3_1_Flash]: {
    model: Model.MiniMax_M3_1_Flash,
    totalParams: 428,
    activeParams: 23,
    architectureType: 'moe',
    attentionType: 'GQA',
    attentionLabel: 'MiniMax Sparse Attention (MSA)',
    attentionExpandable: false,
    numLayers: 60,
    hiddenSize: 6144,
    numHeads: 64,
    numKVHeads: 4,
    headDim: 128,
    vocabSize: 200064,
    ffnDim: 3072,
    numExperts: 129,
    activeExperts: 4,
    hasSharedExpert: true,
    denseFFNLayers: 3,
    denseFFNDim: 12288,
    denseLayerAttentionLabel: 'MiniMax Sparse Attention (MSA)',
    ffnVariant: 'SwiGLU-OAI',
    ffnSwiGLUOAI: true,
    ffnClamp: 7,
    contextWindow: 1048576,
    features: [
      'MiniMax Sparse Attention (MSA)',
      'GQA with QK Norm',
      'Partial RoPE (rotary factor 0.5)',
      'SwiGLU-OAI FFN',
      'Native Multimodality (text/image/video)',
      'MoE (128 routed + 1 shared experts, 4 active)',
      'NVFP4 Experts, MXFP8 Dense Layers',
      'Built-in DSpark Draft',
    ],
    featuresZh: [
      'MiniMax 稀疏注意力（MSA）',
      '带 QK 归一化的 GQA',
      '部分 RoPE（旋转比例 0.5）',
      'SwiGLU-OAI FFN',
      '原生支持文本、图像和视频输入',
      'MoE（128 路由专家 + 1 共享专家，top-4）',
      '专家层 NVFP4，稠密层 MXFP8',
      '内置 DSpark draft',
    ],
    developer: 'MiniMax',
    sourceUrl: 'https://huggingface.co/MiniMaxAI/MiniMax-M3.1-Flash',
  },
  [Model.Muse_Spark_Open]: {
    model: Model.Muse_Spark_Open,
    totalParams: 816,
    activeParams: 42,
    architectureType: 'moe',
    attentionType: 'GQA',
    numLayers: 62,
    hiddenSize: 8192,
    numHeads: 128,
    numKVHeads: 16,
    headDim: 64,
    vocabSize: 202048,
    ffnDim: 4096,
    numExperts: 256,
    activeExperts: 8,
    hasSharedExpert: false,
    routedExpertHiddenSize: 4096,
    contextWindow: 1048576,
    slidingWindow: 2048,
    residualType: 'gated',
    developer: 'Meta',
    sourceUrl: 'https://huggingface.co/meta-models/Muse-Spark-Open-816B-A42B',
    attentionExpandable: false,
    alternatingAttentionExpandable: false,
    alternatingLayers: [
      {
        label: 'Sliding GQA',
        description: '46 local attention layers; 2048-token sliding window.',
        count: 46,
        colorKey: 'attention',
        slidingWindow: 2048,
      },
      {
        label: 'Full GQA (NoPE)',
        description: 'Full attention at zero-based layer indices 1, 5, …, 61.',
        count: 16,
        colorKey: 'norm',
      },
    ],
    alternatingNote: 'full GQA: layers 1, 5, …, 61 (0-based)',
    alternatingNoteZh: '全局 GQA：第 1、5、…、61 层（从 0 计数）',
    features: [
      'Pooled MoE (4096-dim latent)',
      'Learned residual gates',
      'Native text/image/video/audio input',
    ],
    featuresZh: [
      'Pooled MoE（潜在维度 4096）',
      '可学习残差门控',
      '原生支持文本、图像、视频和音频输入',
    ],
  },
};

export function getModelArchitecture(model: Model): ModelArchitecture | undefined {
  return MODEL_ARCHITECTURES[model];
}

export function formatParamCount(params: number): string {
  if (params >= 1000) {
    return `${(params / 1000).toFixed(1)}T`;
  }
  return `${params}B`;
}

export function getArchitectureSummary(arch: ModelArchitecture): string {
  if (arch.architectureType === 'moe') {
    if (arch.activeParamsPrefill !== undefined) {
      return `MoE ${formatParamCount(arch.totalParams)} (${formatParamCount(arch.activeParamsPrefill)} prefill / ${formatParamCount(arch.activeParams)} decode active)`;
    }
    return `MoE ${formatParamCount(arch.totalParams)} (${formatParamCount(arch.activeParams)} active)`;
  }
  return `Dense ${formatParamCount(arch.totalParams)}`;
}

export function ffnVariantLabel(arch: ModelArchitecture): string {
  return arch.ffnVariant ?? 'SwiGLU';
}

export function ffnGateActivationLabel(arch: ModelArchitecture): string {
  return arch.ffnGateActivation ?? 'SiLU';
}

export function denseLayerAttentionLabel(arch: ModelArchitecture): string {
  return arch.denseLayerAttentionLabel ?? getAttentionLabel(arch.attentionType);
}

export function architectureAttentionLabel(arch: ModelArchitecture): string {
  return arch.attentionLabel ?? getAttentionLabel(arch.attentionType);
}

export function sharedExpertCount(arch: ModelArchitecture): number {
  if (!arch.hasSharedExpert) return 0;
  return arch.sharedExperts ?? 1;
}

export function expertRouterSummary(arch: ModelArchitecture): string {
  const shared = sharedExpertCount(arch);
  const routed = (arch.numExperts ?? 0) - shared;
  const sharedSuffix = shared > 0 ? ` + ${shared} shared` : '';
  return `Top-${arch.activeExperts} of ${routed} routed${sharedSuffix}`;
}

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

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(0)}M`;
  }
  return `${(tokens / 1000).toFixed(0)}K`;
}

export interface ArchSubBlock {
  name: string;
  detail?: string;
  type: 'projection' | 'activation' | 'operation' | 'attention';
  circleSymbol?: string;
}

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
      intermediateMergeBlocks: ArchSubBlock[];
      finalMergeBlocks: ArchSubBlock[];
      leftLabel?: string;
      middleLabel?: string;
      rightLabel?: string;
    };

export function getAttentionSubBlocks(arch: ModelArchitecture): SubBlockFlow {
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

export function getFFNSubBlocks(
  arch: ModelArchitecture,
  options?: { useDenseFFNDim?: boolean },
): SubBlockFlow {
  const ffnDim = options?.useDenseFFNDim && arch.denseFFNDim ? arch.denseFFNDim : arch.ffnDim;
  const hiddenSize = options?.useDenseFFNDim
    ? arch.hiddenSize
    : (arch.routedExpertHiddenSize ?? arch.hiddenSize);

  const gateBlocks: ArchSubBlock[] = [
    {
      name: 'Gate Projection',
      detail: ffnDim ? `→ ${ffnDim.toLocaleString()}` : undefined,
      type: 'projection',
    },
  ];
  const upBlocks: ArchSubBlock[] = [
    {
      name: 'Up Projection',
      detail: ffnDim ? `→ ${ffnDim.toLocaleString()}` : undefined,
      type: 'projection',
    },
  ];
  if (arch.ffnClamp !== undefined) {
    gateBlocks.push({ name: 'Clamp', detail: `max = ${arch.ffnClamp}`, type: 'operation' });
    upBlocks.push({ name: 'Clamp', detail: `±${arch.ffnClamp}`, type: 'operation' });
  }
  gateBlocks.push({
    name: arch.ffnSwiGLUOAI ? 'Scaled SiLU' : `${ffnGateActivationLabel(arch)} Activation`,
    detail: arch.ffnSwiGLUOAI ? 'α = 1.702' : 'Applied to gate output',
    type: 'activation',
  });
  if (arch.ffnSwiGLUOAI) upBlocks.push({ name: '+1', type: 'operation' });

  return {
    layout: 'parallel',
    leftPath: gateBlocks,
    rightPath: upBlocks,
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

export function getHybridAttentionSubBlocks(
  arch: ModelArchitecture,
  spec: AlternatingLayerSpec,
): SubBlockFlow {
  const win = spec.slidingWindow ?? arch.slidingWindow;
  const isSparse = /sparse/iu.test(spec.label);

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
