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

export interface ArchitectureStage {
  label: string;
  labelZh: string;
  detail: string;
  detailZh: string;
}

export interface ModelArchitecture {
  model: Model;
  totalParams: number;
  activeParams: number;
  /** When prefill and decode activate different parts of a CED backbone. */
  activeParamsPrefill?: number;
  /** Conditional-memory parameters outside the vendor's backbone count. */
  conditionalMemoryParams?: number;
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
  denseLayerAttentionLabel?: string;
  ffnVariant?: string;
  ffnGateActivation?: string;
  ffnSwiGLUOAI?: boolean;
  ffnClamp?: number;
  routedExpertHiddenSize?: number;
  attentionLabel?: string;
  residualType?: 'AttnRes' | 'gated';
  /** Explicit stages for architectures a generic decoder block cannot represent. */
  diagramStages?: ArchitectureStage[];
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
    diagramStages: [
      {
        label: 'Perception encoders + token embedding',
        labelZh: '感知编码器与 token 嵌入',
        detail: 'Text, image, video and audio inputs',
        detailZh: '支持文本、图像、视频和音频输入',
      },
      {
        label: '62 MoE Transformer layers',
        labelZh: '62 层 MoE Transformer',
        detail: '46 sliding GQA (2048) + 16 full GQA',
        detailZh: '46 层滑动窗口 GQA（2048）与 16 层全局 GQA',
      },
      {
        label: 'Pooled MoE + learned residual gates',
        labelZh: 'Pooled MoE 与可学习残差门控',
        detail: 'Top-8 / 256 experts; 4096-dim latent',
        detailZh: '从 256 个 expert 中选取 top-8；潜在维度 4096',
      },
      {
        label: 'Text output head',
        labelZh: '文本输出头',
        detail: '816B total · 42B active · 1M context',
        detailZh: '总参数 816B；激活参数 42B；1M 上下文',
      },
    ],
  },
  [Model.DeepSeek_V4_1_Flash]: {
    model: Model.DeepSeek_V4_1_Flash,
    totalParams: 552,
    activeParams: 16,
    activeParamsPrefill: 8,
    conditionalMemoryParams: 196,
    architectureType: 'moe',
    attentionType: 'Hybrid',
    numLayers: 40,
    hiddenSize: 5120,
    numHeads: 64,
    numKVHeads: 1,
    headDim: 512,
    vocabSize: 129280,
    ffnDim: 2304,
    ffnClamp: 10,
    numExperts: 385,
    activeExperts: 6,
    hasSharedExpert: true,
    contextWindow: 1048576,
    hyperConnections: 4,
    slidingWindow: 128,
    developer: 'DeepSeek',
    sourceUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash',
    diagramStages: [
      {
        label: 'Vision encoder + token embedding',
        labelZh: '视觉编码器与 token 嵌入',
        detail: '552B backbone; separate 196B Engram memory',
        detailZh: '主干参数 552B；另有 196B Engram 条件记忆',
      },
      {
        label: '20-layer causal encoder',
        labelZh: '20 层因果编码器',
        detail: 'CSA2 + 128-token SWA; shared KV sources',
        detailZh: 'CSA2 与 128-token 滑动窗口；共享 KV 来源',
      },
      {
        label: '20-layer decoder',
        labelZh: '20 层解码器',
        detail: 'Global KV from final encoder states',
        detailZh: '全局 KV 由编码器最终隐藏状态投影得到',
      },
      {
        label: 'Prefill / decode activation',
        labelZh: 'Prefill 与 decode 激活参数',
        detail: '8B during prefill · 16B during decode',
        detailZh: 'Prefill 激活 8B；decode 激活 16B',
      },
      {
        label: 'Text output + DSpark draft',
        labelZh: '文本输出与 DSpark draft',
        detail: '1M context · single-pass mHC',
        detailZh: '1M 上下文；单次计算的 mHC',
      },
    ],
  },
  [Model.GLM_5]: {
    model: Model.GLM_5,
    totalParams: 744,
    activeParams: 40,
    architectureType: 'moe',
    attentionType: 'MLA',
    attentionLabel: 'DeepSeek Sparse Attention (DSA)',
    attentionExpandable: false,
    numLayers: 78,
    hiddenSize: 6144,
    numHeads: 64,
    headDim: 256,
    vocabSize: 154880,
    ffnDim: 2048,
    numExperts: 257,
    activeExperts: 8,
    hasSharedExpert: true,
    denseFFNLayers: 3,
    denseFFNDim: 12288,
    contextWindow: 202752,
    developer: 'Z.ai',
    sourceUrl: 'https://huggingface.co/zai-org/GLM-5.1',
    diagramStages: [
      {
        label: 'Token embedding',
        labelZh: 'Token 嵌入',
        detail: '154880 vocabulary · 6144 hidden',
        detailZh: '词表大小 154880；隐藏维度 6144',
      },
      {
        label: '3 dense + 75 MoE layers',
        labelZh: '3 个稠密层与 75 个 MoE 层',
        detail: 'Dense FFN 12288 · expert FFN 2048',
        detailZh: '稠密 FFN 中间维度 12288；expert FFN 2048',
      },
      {
        label: 'DeepSeek Sparse Attention (DSA)',
        labelZh: 'DeepSeek 稀疏注意力（DSA）',
        detail: '64 heads; 256-dim QK; 512-dim KV latent',
        detailZh: '64 个 head；QK 维度 256；KV 潜在维度 512',
      },
      {
        label: 'MoE routing',
        labelZh: 'MoE 路由',
        detail: 'Top-8 / 256 routed + 1 shared expert',
        detailZh: '从 256 个路由 expert 中选 top-8，另有 1 个共享 expert',
      },
    ],
  },
  [Model.GLM_5_2]: {
    model: Model.GLM_5_2,
    totalParams: 744,
    activeParams: 40,
    architectureType: 'moe',
    attentionType: 'MLA',
    attentionLabel: 'DeepSeek Sparse Attention (DSA)',
    attentionExpandable: false,
    numLayers: 78,
    hiddenSize: 6144,
    numHeads: 64,
    headDim: 256,
    vocabSize: 154880,
    ffnDim: 2048,
    numExperts: 257,
    activeExperts: 8,
    hasSharedExpert: true,
    denseFFNLayers: 3,
    denseFFNDim: 12288,
    contextWindow: 1048576,
    developer: 'Z.ai',
    sourceUrl: 'https://huggingface.co/zai-org/GLM-5.2',
    diagramStages: [
      {
        label: 'Token embedding',
        labelZh: 'Token 嵌入',
        detail: '154880 vocabulary · 6144 hidden',
        detailZh: '词表大小 154880；隐藏维度 6144',
      },
      {
        label: '3 dense + 75 MoE layers',
        labelZh: '3 个稠密层与 75 个 MoE 层',
        detail: 'Dense FFN 12288 · expert FFN 2048',
        detailZh: '稠密 FFN 中间维度 12288；expert FFN 2048',
      },
      {
        label: 'DeepSeek Sparse Attention (DSA)',
        labelZh: 'DeepSeek 稀疏注意力（DSA）',
        detail: '64 heads; 256-dim QK; 512-dim KV latent',
        detailZh: '64 个 head；QK 维度 256；KV 潜在维度 512',
      },
      {
        label: 'MoE routing',
        labelZh: 'MoE 路由',
        detail: 'Top-8 / 256 routed + 1 shared expert',
        detailZh: '从 256 个路由 expert 中选 top-8，另有 1 个共享 expert',
      },
      {
        label: 'IndexShare',
        labelZh: 'IndexShare',
        detail: '3 full indexers, then shared/shared/shared/full',
        detailZh: '前 3 层独立索引，之后按共享、共享、共享、独立排列',
      },
    ],
  },
  [Model.Qwen3_5]: {
    model: Model.Qwen3_5,
    totalParams: 397,
    activeParams: 17,
    architectureType: 'moe',
    attentionType: 'Hybrid',
    attentionExpandable: false,
    alternatingAttentionExpandable: false,
    numLayers: 60,
    hiddenSize: 4096,
    numHeads: 32,
    numKVHeads: 2,
    headDim: 256,
    vocabSize: 248320,
    ffnDim: 1024,
    contextWindow: 262144,
    developer: 'Alibaba (Qwen)',
    sourceUrl: 'https://huggingface.co/Qwen/Qwen3.5-397B-A17B',
    numExperts: 513,
    activeExperts: 10,
    hasSharedExpert: true,
    diagramStages: [
      {
        label: 'Vision encoder + token embedding',
        labelZh: '视觉编码器与 token 嵌入',
        detail: '397B total · 17B active',
        detailZh: '总参数 397B；激活参数 17B',
      },
      {
        label: '45 Gated DeltaNet layers',
        labelZh: '45 层 Gated DeltaNet',
        detail: '15 groups of 3 linear-attention layers',
        detailZh: '15 组，每组含 3 层线性注意力',
      },
      {
        label: '15 Gated Attention layers',
        labelZh: '15 层门控注意力',
        detail: '32 Q / 2 KV heads · head dim 256',
        detailZh: '32 个 Q head、2 个 KV head；head 维度 256',
      },
      {
        label: 'MoE FFN',
        labelZh: 'MoE FFN',
        detail: 'Top-10 / 512 routed + 1 shared; FFN 1024',
        detailZh: '512 个路由 expert 中选 top-10，另有 1 个共享；FFN 1024',
      },
    ],
  },
  [Model.Qwen3_8_Flash_Next]: {
    model: Model.Qwen3_8_Flash_Next,
    totalParams: 176,
    activeParams: 6,
    architectureType: 'moe',
    attentionType: 'Hybrid',
    attentionExpandable: false,
    alternatingAttentionExpandable: false,
    numLayers: 48,
    hiddenSize: 2560,
    numHeads: 24,
    numKVHeads: 2,
    headDim: 256,
    vocabSize: 248320,
    ffnDim: 640,
    contextWindow: 262144,
    developer: 'Alibaba (Qwen)',
    sourceUrl: 'https://huggingface.co/Qwen/Qwen3.8-Flash-Next-FP8',
    numExperts: 513,
    activeExperts: 10,
    hasSharedExpert: true,
    diagramStages: [
      {
        label: 'Vision encoder + token embedding',
        labelZh: '视觉编码器与 token 嵌入',
        detail: '176B total · 6B active',
        detailZh: '总参数 176B；激活参数 6B',
      },
      {
        label: '36 Gated DeltaNet layers',
        labelZh: '36 层 Gated DeltaNet',
        detail: '12 groups of 3 linear-attention layers',
        detailZh: '12 组，每组含 3 层线性注意力',
      },
      {
        label: '12 Qwen Sparse Attention (QSA) layers',
        labelZh: '12 层 Qwen 稀疏注意力（QSA）',
        detail: '24 Q / 2 KV heads · head dim 256',
        detailZh: '24 个 Q head、2 个 KV head；head 维度 256',
      },
      {
        label: 'MoE FFN',
        labelZh: 'MoE FFN',
        detail: 'Top-10 / 512 routed + 1 shared; FFN 640',
        detailZh: '512 个路由 expert 中选 top-10，另有 1 个共享；FFN 640',
      },
      {
        label: 'N-gram embedding + gated residual',
        labelZh: 'N-gram 嵌入与门控残差',
        detail: '125B main + 51B n-gram; separate 4B MTP',
        detailZh: '主模型 125B 加 n-gram 表 51B；另有 4B MTP',
      },
    ],
  },
  [Model.Qwen3_8_27B]: {
    model: Model.Qwen3_8_27B,
    totalParams: 27,
    activeParams: 27,
    architectureType: 'dense',
    attentionType: 'Hybrid',
    attentionExpandable: false,
    alternatingAttentionExpandable: false,
    numLayers: 64,
    hiddenSize: 5120,
    numHeads: 24,
    numKVHeads: 4,
    headDim: 256,
    vocabSize: 248320,
    ffnDim: 17408,
    contextWindow: 262144,
    developer: 'Alibaba (Qwen)',
    sourceUrl: 'https://huggingface.co/Qwen/Qwen3.8-27B',
    diagramStages: [
      {
        label: 'Vision encoder + token embedding',
        labelZh: '视觉编码器与 token 嵌入',
        detail: '27B total · 27B active',
        detailZh: '总参数 27B；激活参数 27B',
      },
      {
        label: '48 Gated DeltaNet layers',
        labelZh: '48 层 Gated DeltaNet',
        detail: '16 groups of 3 linear-attention layers',
        detailZh: '16 组，每组含 3 层线性注意力',
      },
      {
        label: '16 Gated Attention layers',
        labelZh: '16 层门控注意力',
        detail: '24 Q / 4 KV heads · head dim 256',
        detailZh: '24 个 Q head、4 个 KV head；head 维度 256',
      },
      {
        label: 'Dense FFN',
        labelZh: '稠密 FFN',
        detail: 'Intermediate dimension 17408',
        detailZh: '中间维度 17408',
      },
    ],
  },
  [Model.Qwen3_8_27B_Eager]: {
    model: Model.Qwen3_8_27B_Eager,
    totalParams: 27,
    activeParams: 27,
    architectureType: 'dense',
    attentionType: 'Hybrid',
    attentionExpandable: false,
    alternatingAttentionExpandable: false,
    numLayers: 64,
    hiddenSize: 5120,
    numHeads: 24,
    numKVHeads: 4,
    headDim: 256,
    vocabSize: 248320,
    ffnDim: 17408,
    contextWindow: 262144,
    developer: 'Alibaba (Qwen)',
    sourceUrl: 'https://huggingface.co/Qwen/Qwen3.8-27B',
    diagramStages: [
      {
        label: 'Vision encoder + token embedding',
        labelZh: '视觉编码器与 token 嵌入',
        detail: '27B total · 27B active',
        detailZh: '总参数 27B；激活参数 27B',
      },
      {
        label: '48 Gated DeltaNet layers',
        labelZh: '48 层 Gated DeltaNet',
        detail: '16 groups of 3 linear-attention layers',
        detailZh: '16 组，每组含 3 层线性注意力',
      },
      {
        label: '16 Gated Attention layers',
        labelZh: '16 层门控注意力',
        detail: '24 Q / 4 KV heads · head dim 256',
        detailZh: '24 个 Q head、4 个 KV head；head 维度 256',
      },
      {
        label: 'Dense FFN',
        labelZh: '稠密 FFN',
        detail: 'Intermediate dimension 17408',
        detailZh: '中间维度 17408',
      },
      {
        label: 'Same model, eager execution',
        labelZh: '相同模型，采用 eager 执行',
        detail: 'Same weights and architecture as Qwen3.8-27B',
        detailZh: '权重与架构均与 Qwen3.8-27B 相同',
      },
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
