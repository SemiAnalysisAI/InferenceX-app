import { Model } from '@/lib/catalog/data-mappings';

export type ArchitectureType = 'dense' | 'moe';

export type AttentionType = 'MHA' | 'GQA' | 'MLA' | 'Linear' | 'Hybrid' | 'AlternatingSinkGQA';

export interface AlternatingLayerSpec {
  label: string;
  description: string;
  count: number;
  colorKey: 'attention' | 'ffn' | 'norm' | 'router' | 'expert';
  slidingWindow?: number;
}

export interface ModelArchitecture {
  model: Model;
  totalParams: number;
  activeParams: number;
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
  features?: string[];
  developer?: string;
  sourceUrl?: string;
  attentionExpandable?: boolean;
  alternatingAttentionExpandable?: boolean;
  sharedExperts?: number;
  alternatingNote?: string;
  denseLayerAttentionLabel?: string;
  ffnVariant?: string;
  ffnGateActivation?: string;
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
    contextWindow: 128000,
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
    vocabSize: 128256,
    ffnDim: 28672,
    contextWindow: 128000,
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
    vocabSize: 128256,
    ffnDim: 28672,
    contextWindow: 128000,
    features: ['Grouped Query Attention', 'RoPE'],
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
          'Multi-head Latent Attention (512-dim compressed KV latent, NoPE) with an output gate, placed every fourth layer to carry full-context recall.',
        count: 24,
        colorKey: 'norm',
      },
    ],
    alternatingNote: 'gated MLA every 4th layer',
    denseLayerAttentionLabel: 'Kimi Delta Attention (KDA)',
    ffnVariant: 'SiTU-GLU',
    ffnGateActivation: 'SiTU',
    contextWindow: 1048576,
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
  },
  [Model.MiniMax_M3]: {
    model: Model.MiniMax_M3,
    totalParams: 428,
    activeParams: 23,
    architectureType: 'moe',
    attentionType: 'GQA',
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
    contextWindow: 1048576,
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
