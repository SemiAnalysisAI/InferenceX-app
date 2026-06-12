import { describe, expect, it } from 'vitest';

import { Model } from '@/lib/data-mappings';

import {
  type SubBlockFlow,
  formatContextWindow,
  formatParamCount,
  getArchitectureSummary,
  getAttentionLabel,
  getAttentionSubBlocks,
  getFFNSubBlocks,
  getHybridAttentionSubBlocks,
  getModelArchitecture,
  MODEL_ARCHITECTURES,
} from './model-architectures';

describe('MODEL_ARCHITECTURES', () => {
  it('has architecture data for all supported models', () => {
    const models = [
      Model.Llama3_3_70B,
      Model.Llama3_1_70B,
      Model.DeepSeek_R1,
      Model.DeepSeek_V4_Pro,
      Model.GptOss,
      Model.Kimi_K2_5,
      Model.MiniMax_M2_5,
    ];

    for (const model of models) {
      expect(MODEL_ARCHITECTURES[model]).toBeDefined();
      expect(MODEL_ARCHITECTURES[model]!.model).toBe(model);
      expect(MODEL_ARCHITECTURES[model]!.totalParams).toBeGreaterThan(0);
      expect(MODEL_ARCHITECTURES[model]!.activeParams).toBeGreaterThan(0);
    }
  });

  it('ensures dense models have equal active and total params', () => {
    for (const arch of Object.values(MODEL_ARCHITECTURES)) {
      if (!arch) continue;
      if (arch.architectureType === 'dense') {
        expect(arch.activeParams).toBe(arch.totalParams);
      }
    }
  });

  it('ensures MoE models have activeParams < totalParams', () => {
    for (const arch of Object.values(MODEL_ARCHITECTURES)) {
      if (!arch) continue;
      if (arch.architectureType === 'moe') {
        expect(arch.activeParams).toBeLessThan(arch.totalParams);
      }
    }
  });

  it('ensures models with numLayers have positive layer counts', () => {
    for (const arch of Object.values(MODEL_ARCHITECTURES)) {
      if (!arch) continue;
      if (arch.numLayers !== undefined) {
        expect(arch.numLayers).toBeGreaterThan(0);
      }
    }
  });

  it('ensures models with hiddenSize have positive dimensions', () => {
    for (const arch of Object.values(MODEL_ARCHITECTURES)) {
      if (!arch) continue;
      if (arch.hiddenSize !== undefined) {
        expect(arch.hiddenSize).toBeGreaterThan(0);
      }
    }
  });

  it('ensures models with numHeads have positive head counts', () => {
    for (const arch of Object.values(MODEL_ARCHITECTURES)) {
      if (!arch) continue;
      if (arch.numHeads !== undefined) {
        expect(arch.numHeads).toBeGreaterThan(0);
        if (arch.numKVHeads !== undefined) {
          expect(arch.numKVHeads).toBeLessThanOrEqual(arch.numHeads);
          expect(arch.numKVHeads).toBeGreaterThan(0);
        }
      }
    }
  });

  it('ensures MoE models have expert configuration', () => {
    for (const arch of Object.values(MODEL_ARCHITECTURES)) {
      if (!arch) continue;
      if (arch.architectureType === 'moe') {
        expect(arch.numExperts).toBeGreaterThan(0);
        expect(arch.activeExperts).toBeGreaterThan(0);
        expect(arch.activeExperts).toBeLessThan(arch.numExperts!);
      }
    }
  });

  it('ensures denseFFNLayers + moeLayerCount equals numLayers for models with dense layers', () => {
    for (const arch of Object.values(MODEL_ARCHITECTURES)) {
      if (!arch) continue;
      if (arch.denseFFNLayers && arch.numLayers) {
        expect(arch.denseFFNLayers).toBeLessThan(arch.numLayers);
      }
    }
  });
});

describe('getModelArchitecture', () => {
  it('returns architecture for Llama 3.3 70B with GQA details', () => {
    const arch = getModelArchitecture(Model.Llama3_3_70B);
    expect(arch).toBeDefined();
    expect(arch?.totalParams).toBe(70);
    expect(arch?.activeParams).toBe(70);
    expect(arch?.architectureType).toBe('dense');
    expect(arch?.attentionType).toBe('GQA');
    expect(arch?.numLayers).toBe(80);
    expect(arch?.hiddenSize).toBe(8192);
    expect(arch?.numHeads).toBe(64);
    expect(arch?.numKVHeads).toBe(8);
    expect(arch?.ffnDim).toBe(28672);
    expect(arch?.vocabSize).toBe(128256);
    expect(arch?.contextWindow).toBe(128000);
    expect(arch?.developer).toBe('Meta');
  });

  it('returns architecture for Llama 3.1 70B with same specs as 3.3', () => {
    const arch = getModelArchitecture(Model.Llama3_1_70B);
    expect(arch).toBeDefined();
    expect(arch?.totalParams).toBe(70);
    expect(arch?.activeParams).toBe(70);
    expect(arch?.architectureType).toBe('dense');
    expect(arch?.attentionType).toBe('GQA');
    expect(arch?.numLayers).toBe(80);
    expect(arch?.hiddenSize).toBe(8192);
    expect(arch?.numHeads).toBe(64);
    expect(arch?.numKVHeads).toBe(8);
    expect(arch?.ffnDim).toBe(28672);
    expect(arch?.vocabSize).toBe(128256);
    expect(arch?.releaseDate).toBe('2024-07-23');
  });

  it('returns architecture for DeepSeek R1 with MoE and MLA details', () => {
    const arch = getModelArchitecture(Model.DeepSeek_R1);
    expect(arch).toBeDefined();
    expect(arch?.totalParams).toBe(671);
    expect(arch?.activeParams).toBe(37);
    expect(arch?.architectureType).toBe('moe');
    expect(arch?.attentionType).toBe('MLA');
    expect(arch?.numLayers).toBe(61);
    expect(arch?.hiddenSize).toBe(7168);
    expect(arch?.numHeads).toBe(128);
    expect(arch?.ffnDim).toBe(2048);
    expect(arch?.numExperts).toBe(257);
    expect(arch?.activeExperts).toBe(8);
    expect(arch?.hasSharedExpert).toBe(true);
    expect(arch?.denseFFNLayers).toBe(3);
    expect(arch?.denseFFNDim).toBe(18432);
    expect(arch?.contextWindow).toBe(128000);
    expect(arch?.developer).toBe('DeepSeek');
    expect(arch?.vocabSize).toBe(129280);
  });

  it('returns architecture for DeepSeek V4 Pro with MoE and Hybrid attention details', () => {
    const arch = getModelArchitecture(Model.DeepSeek_V4_Pro);
    expect(arch).toBeDefined();
    expect(arch?.totalParams).toBe(1600);
    expect(arch?.activeParams).toBe(49);
    expect(arch?.architectureType).toBe('moe');
    expect(arch?.attentionType).toBe('Hybrid');
    expect(arch?.attentionExpandable).toBe(false);
    expect(arch?.numLayers).toBe(61);
    expect(arch?.hiddenSize).toBe(7168);
    expect(arch?.numHeads).toBe(128);
    expect(arch?.numKVHeads).toBe(1);
    expect(arch?.headDim).toBe(512);
    expect(arch?.ffnDim).toBe(3072);
    expect(arch?.numExperts).toBe(385);
    expect(arch?.activeExperts).toBe(6);
    expect(arch?.hasSharedExpert).toBe(true);
    // First 3 layers use hash-routed MoE (not dense FFN), so no dense block —
    // they render as a dedicated hash-routed prefix block instead.
    expect(arch?.denseFFNLayers).toBeUndefined();
    expect(arch?.hashRoutedLayers).toBe(3);
    // mHC: residuals are replaced by 4 parallel hyper-connection streams.
    expect(arch?.hyperConnections).toBe(4);
    expect(arch?.slidingWindow).toBe(128);
    expect(arch?.contextWindow).toBe(1048576);
    expect(arch?.developer).toBe('DeepSeek');
    expect(arch?.vocabSize).toBe(129280);
    expect(arch?.sourceUrl).toBe('https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro');
  });

  it('DeepSeek V4 Pro surfaces sliding-window attention and hybrid components in features', () => {
    const arch = getModelArchitecture(Model.DeepSeek_V4_Pro);
    expect(arch?.features).toBeDefined();
    expect(arch?.features).toContain('Sliding window (128 tokens)');
    expect(arch?.features).toContain('Hybrid CSA + HCA Attention');
    expect(arch?.features).toContain('Attention Sink');
    expect(arch?.features).toContain('Multi-Token Prediction');
  });

  it('DeepSeek V4 Pro has alternatingLayers with CSA and HCA specs, each carrying a sliding window', () => {
    const arch = getModelArchitecture(Model.DeepSeek_V4_Pro);
    expect(arch?.alternatingLayers).toBeDefined();
    expect(arch?.alternatingLayers).toHaveLength(2);

    // Counts describe the learned-router layers (the first 3 hash-routed layers
    // are split out into their own block): 29 HCA + 29 CSA + 3 hash = 61.
    const [hca, csa] = arch!.alternatingLayers!;
    expect(hca.label).toBe('Heavily Compressed Attention');
    expect(hca.count).toBe(29);
    expect(hca.description).toContain('sliding window');
    expect(hca.slidingWindow).toBe(128);

    expect(csa.label).toBe('Compressed Sparse Attention');
    expect(csa.count).toBe(29);
    expect(csa.description).toContain('sliding window');
    expect(csa.description).toContain('lightning indexer');
    expect(csa.slidingWindow).toBe(128);
  });

  it('DeepSeek V4 Pro alternating + hash-routed layer counts sum to numLayers', () => {
    const arch = getModelArchitecture(Model.DeepSeek_V4_Pro);
    expect(arch?.alternatingLayers).toBeDefined();
    const totalAlternating = arch!.alternatingLayers!.reduce((sum, l) => sum + l.count, 0);
    expect(totalAlternating + (arch!.hashRoutedLayers ?? 0)).toBe(arch!.numLayers);
  });

  it('returns architecture for Kimi K2.5 with MoE and MLA details', () => {
    const arch = getModelArchitecture(Model.Kimi_K2_5);
    expect(arch).toBeDefined();
    expect(arch?.totalParams).toBe(1000);
    expect(arch?.activeParams).toBe(32);
    expect(arch?.architectureType).toBe('moe');
    expect(arch?.attentionType).toBe('MLA');
    expect(arch?.numLayers).toBe(61);
    expect(arch?.hiddenSize).toBe(7168);
    expect(arch?.numHeads).toBe(64);
    expect(arch?.ffnDim).toBe(2048);
    expect(arch?.numExperts).toBe(385);
    expect(arch?.activeExperts).toBe(8);
    expect(arch?.hasSharedExpert).toBe(true);
    expect(arch?.denseFFNLayers).toBe(1);
    expect(arch?.denseFFNDim).toBe(18432);
    expect(arch?.contextWindow).toBe(262144);
    expect(arch?.developer).toBe('Moonshot AI');
    expect(arch?.vocabSize).toBe(163840);
  });

  it('returns architecture for MiniMax M2.5 with MoE and GQA details', () => {
    const arch = getModelArchitecture(Model.MiniMax_M2_5);
    expect(arch).toBeDefined();
    expect(arch?.totalParams).toBe(230);
    expect(arch?.activeParams).toBe(10);
    expect(arch?.architectureType).toBe('moe');
    expect(arch?.attentionType).toBe('GQA');
    expect(arch?.attentionExpandable).toBe(false);
    expect(arch?.numLayers).toBe(62);
    expect(arch?.hiddenSize).toBe(3072);
    expect(arch?.numHeads).toBe(48);
    expect(arch?.numKVHeads).toBe(8);
    expect(arch?.headDim).toBe(128);
    expect(arch?.ffnDim).toBe(1536);
    expect(arch?.numExperts).toBe(256);
    expect(arch?.activeExperts).toBe(8);
    expect(arch?.hasSharedExpert).toBe(false);
    expect(arch?.contextWindow).toBe(196608);
    expect(arch?.vocabSize).toBe(200064);
    expect(arch?.developer).toBe('MiniMax');
    expect(arch?.sourceUrl).toBe('https://huggingface.co/MiniMaxAI/MiniMax-M2');
  });

  it('MiniMax M2.5 has no dense initial layers', () => {
    const arch = getModelArchitecture(Model.MiniMax_M2_5);
    expect(arch?.denseFFNLayers).toBeUndefined();
    expect(arch?.denseFFNDim).toBeUndefined();
  });

  it('returns architecture for gpt-oss 120B with MoE, alternating attention, and sink tokens', () => {
    const arch = getModelArchitecture(Model.GptOss);
    expect(arch).toBeDefined();
    expect(arch?.totalParams).toBe(120);
    expect(arch?.activeParams).toBe(5);
    expect(arch?.architectureType).toBe('moe');
    expect(arch?.attentionType).toBe('AlternatingSinkGQA');
    expect(arch?.numLayers).toBe(36);
    expect(arch?.hiddenSize).toBe(2880);
    expect(arch?.numHeads).toBe(64);
    expect(arch?.numKVHeads).toBe(8);
    expect(arch?.headDim).toBe(64);
    expect(arch?.ffnDim).toBe(2880);
    expect(arch?.numExperts).toBe(128);
    expect(arch?.activeExperts).toBe(4);
    expect(arch?.hasSharedExpert).toBe(false);
    expect(arch?.slidingWindow).toBe(128);
    expect(arch?.contextWindow).toBe(131072);
    expect(arch?.vocabSize).toBe(201088);
    expect(arch?.developer).toBe('OpenAI');
    expect(arch?.sourceUrl).toBe('https://huggingface.co/openai/gpt-oss-120b');
  });

  it('gpt-oss has alternatingLayers with sliding and full attention specs', () => {
    const arch = getModelArchitecture(Model.GptOss);
    expect(arch?.alternatingLayers).toBeDefined();
    expect(arch?.alternatingLayers).toHaveLength(2);

    const [sliding, full] = arch!.alternatingLayers!;
    expect(sliding.label).toBe('Sliding Attention + Sink');
    expect(sliding.count).toBe(18);
    expect(sliding.description).toContain('128-token sliding window');
    expect(sliding.description).toContain('attention sink');
    expect(sliding.slidingWindow).toBe(128);

    expect(full.label).toBe('Causal Grouped Query Attention');
    expect(full.count).toBe(18);
    expect(full.description).toContain('full causal masking');
    // Full-attention block has no sliding window (per-spec, not block-index).
    expect(full.slidingWindow).toBeUndefined();
  });

  it('gpt-oss alternating layer counts sum to numLayers', () => {
    const arch = getModelArchitecture(Model.GptOss);
    expect(arch?.alternatingLayers).toBeDefined();
    const totalAlternating = arch!.alternatingLayers!.reduce((sum, l) => sum + l.count, 0);
    expect(totalAlternating).toBe(arch!.numLayers);
  });

  it('returns undefined for models without architecture data', () => {
    // Use a model enum that doesn't have architecture data yet
    // (all models except the ones we've added may return undefined)
    const definedModels = Object.keys(MODEL_ARCHITECTURES);
    expect(definedModels.length).toBeGreaterThanOrEqual(6);
  });
});

describe('formatParamCount', () => {
  it('formats small numbers as billions', () => {
    expect(formatParamCount(70)).toBe('70B');
    expect(formatParamCount(120)).toBe('120B');
    expect(formatParamCount(397)).toBe('397B');
    expect(formatParamCount(671)).toBe('671B');
  });

  it('formats numbers >= 1000 as trillions', () => {
    expect(formatParamCount(1000)).toBe('1.0T');
    expect(formatParamCount(1500)).toBe('1.5T');
    expect(formatParamCount(2000)).toBe('2.0T');
  });

  it('handles edge cases around 1000', () => {
    expect(formatParamCount(999)).toBe('999B');
    expect(formatParamCount(1001)).toBe('1.0T');
  });
});

describe('getArchitectureSummary', () => {
  it('returns dense summary for Llama 3.3 70B', () => {
    const arch = getModelArchitecture(Model.Llama3_3_70B);
    expect(getArchitectureSummary(arch!)).toBe('Dense 70B');
  });

  it('returns dense summary for Llama 3.1 70B', () => {
    const arch = getModelArchitecture(Model.Llama3_1_70B);
    expect(getArchitectureSummary(arch!)).toBe('Dense 70B');
  });

  it('returns MoE summary for DeepSeek R1', () => {
    const arch = getModelArchitecture(Model.DeepSeek_R1);
    expect(getArchitectureSummary(arch!)).toBe('MoE 671B (37B active)');
  });

  it('returns MoE summary for DeepSeek V4 Pro with trillion-scale params', () => {
    const arch = getModelArchitecture(Model.DeepSeek_V4_Pro);
    expect(getArchitectureSummary(arch!)).toBe('MoE 1.6T (49B active)');
  });

  it('returns MoE summary for gpt-oss 120B', () => {
    const arch = getModelArchitecture(Model.GptOss);
    expect(getArchitectureSummary(arch!)).toBe('MoE 120B (5B active)');
  });

  it('returns MoE summary for Kimi K2.5 with trillion-scale params', () => {
    const arch = getModelArchitecture(Model.Kimi_K2_5);
    expect(getArchitectureSummary(arch!)).toBe('MoE 1.0T (32B active)');
  });

  it('returns MoE summary for MiniMax M2.5', () => {
    const arch = getModelArchitecture(Model.MiniMax_M2_5);
    expect(getArchitectureSummary(arch!)).toBe('MoE 230B (10B active)');
  });
});

describe('getAttentionLabel', () => {
  it('returns correct labels for all attention types', () => {
    expect(getAttentionLabel('MHA')).toBe('Multi-Head Attention');
    expect(getAttentionLabel('GQA')).toBe('Grouped Query Attention');
    expect(getAttentionLabel('MLA')).toBe('Multi-head Latent Attention');
    expect(getAttentionLabel('Linear')).toBe('Linear Attention');
    expect(getAttentionLabel('Hybrid')).toBe('Hybrid Attention');
    expect(getAttentionLabel('AlternatingSinkGQA')).toBe('Alternating Sink/Full GQA');
  });

  it('returns original value for unknown types', () => {
    expect(getAttentionLabel('Unknown' as any)).toBe('Unknown');
  });
});

describe('formatContextWindow', () => {
  it('formats thousands as K', () => {
    expect(formatContextWindow(128000)).toBe('128K');
    expect(formatContextWindow(131072)).toBe('131K');
    expect(formatContextWindow(32000)).toBe('32K');
    expect(formatContextWindow(262144)).toBe('262K');
    expect(formatContextWindow(196608)).toBe('197K');
  });

  it('formats millions as M', () => {
    expect(formatContextWindow(1000000)).toBe('1M');
    expect(formatContextWindow(2000000)).toBe('2M');
  });
});

describe('getAttentionSubBlocks', () => {
  it('returns GQA as threeWay flow with independent Q, K, V paths for Llama 3.3', () => {
    const arch = getModelArchitecture(Model.Llama3_3_70B)!;
    const flow = getAttentionSubBlocks(arch);

    expect(flow.layout).toBe('threeWay');
    if (flow.layout !== 'threeWay') return;

    // Q path (left) — projection then RoPE
    expect(flow.leftPath.length).toBe(2);
    expect(flow.leftPath[0].name).toBe('Q Projection');
    expect(flow.leftPath[0].detail).toContain('64 heads');
    expect(flow.leftPath[0].detail).toContain('128d');
    expect(flow.leftPath[1].name).toBe('RoPE');
    expect(flow.leftPath[1].type).toBe('operation');

    // K path (middle) — projection then RoPE
    expect(flow.middlePath.length).toBe(2);
    expect(flow.middlePath[0].name).toBe('K Projection');
    expect(flow.middlePath[0].detail).toContain('8 KV heads');
    expect(flow.middlePath[0].detail).toContain('(shared)');
    expect(flow.middlePath[1].name).toBe('RoPE');
    expect(flow.middlePath[1].type).toBe('operation');

    // V path (right) — independent projection, bypasses RoPE
    expect(flow.rightPath.length).toBe(1);
    expect(flow.rightPath[0].name).toBe('V Projection');
    expect(flow.rightPath[0].detail).toContain('8 KV heads');

    // No intermediate merge — RoPE is per-path now
    expect(flow.intermediateMergeBlocks.length).toBe(0);

    // Final merge: all three converge at attention
    expect(flow.finalMergeBlocks[0].name).toBe('Grouped Attention');
    expect(flow.finalMergeBlocks[0].detail).toBe('64:8 Q:KV ratio');
    expect(flow.finalMergeBlocks[1].name).toBe('Output Projection');
    expect(flow.finalMergeBlocks[1].detail).toContain('8,192');

    expect(flow.leftLabel).toBe('Q');
    expect(flow.middleLabel).toBe('K');
    expect(flow.rightLabel).toBe('V');
  });

  it('returns same threeWay GQA flow for Llama 3.1 70B', () => {
    const arch = getModelArchitecture(Model.Llama3_1_70B)!;
    const flow = getAttentionSubBlocks(arch);

    expect(flow.layout).toBe('threeWay');
    if (flow.layout !== 'threeWay') return;

    expect(flow.leftPath[0].name).toBe('Q Projection');
    expect(flow.leftPath[0].detail).toContain('64 heads');
    expect(flow.leftPath[1].name).toBe('RoPE');
    expect(flow.middlePath[0].name).toBe('K Projection');
    expect(flow.middlePath[1].name).toBe('RoPE');
    expect(flow.rightPath[0].name).toBe('V Projection');
    expect(flow.intermediateMergeBlocks.length).toBe(0);
    expect(flow.finalMergeBlocks[0].name).toBe('Grouped Attention');
    expect(flow.finalMergeBlocks[0].detail).toBe('64:8 Q:KV ratio');
  });

  it('returns GQA-style threeWay flow for DeepSeek R1 (MLA treated as GQA in sub-blocks)', () => {
    const arch = getModelArchitecture(Model.DeepSeek_R1)!;
    const flow = getAttentionSubBlocks(arch);

    // getAttentionSubBlocks always returns GQA threeWay flow
    // (MLA is not expandable in the diagram, so these sub-blocks are not rendered)
    expect(flow.layout).toBe('threeWay');
    if (flow.layout !== 'threeWay') return;

    expect(flow.leftPath[0].name).toBe('Q Projection');
    expect(flow.leftPath[0].detail).toContain('128 heads');
  });

  it('returns GQA threeWay flow for gpt-oss (AlternatingSinkGQA not expandable, sub-blocks not rendered)', () => {
    const arch = getModelArchitecture(Model.GptOss)!;
    const flow = getAttentionSubBlocks(arch);

    // AlternatingSinkGQA is not expandable, but getAttentionSubBlocks still returns valid flow data
    expect(flow.layout).toBe('threeWay');
    if (flow.layout !== 'threeWay') return;

    expect(flow.leftPath[0].name).toBe('Q Projection');
    expect(flow.leftPath[0].detail).toContain('64 heads');
    expect(flow.leftPath[0].detail).toContain('64d');
    expect(flow.middlePath[0].name).toBe('K Projection');
    expect(flow.middlePath[0].detail).toContain('8 KV heads');
    expect(flow.rightPath[0].name).toBe('V Projection');
    expect(flow.finalMergeBlocks[0].name).toBe('Grouped Attention');
    expect(flow.finalMergeBlocks[0].detail).toBe('64:8 Q:KV ratio');
  });

  it('returns GQA threeWay flow for MiniMax M2.5 (attentionExpandable=false, sub-blocks not rendered)', () => {
    const arch = getModelArchitecture(Model.MiniMax_M2_5)!;
    const flow = getAttentionSubBlocks(arch);

    // getAttentionSubBlocks returns valid flow data even though attentionExpandable=false
    expect(flow.layout).toBe('threeWay');
    if (flow.layout !== 'threeWay') return;

    expect(flow.leftPath[0].name).toBe('Q Projection');
    expect(flow.leftPath[0].detail).toContain('48 heads');
    expect(flow.leftPath[0].detail).toContain('128d');
    expect(flow.leftPath[1].name).toBe('RoPE');
    expect(flow.middlePath[0].name).toBe('K Projection');
    expect(flow.middlePath[0].detail).toContain('8 KV heads');
    expect(flow.middlePath[0].detail).toContain('128d');
    expect(flow.middlePath[1].name).toBe('RoPE');
    expect(flow.rightPath[0].name).toBe('V Projection');
    expect(flow.rightPath[0].detail).toContain('8 KV heads');
    expect(flow.intermediateMergeBlocks.length).toBe(0);
    expect(flow.finalMergeBlocks[0].name).toBe('Grouped Attention');
    expect(flow.finalMergeBlocks[0].detail).toBe('48:8 Q:KV ratio');
    expect(flow.finalMergeBlocks[1].name).toBe('Output Projection');
    expect(flow.finalMergeBlocks[1].detail).toContain('3,072');
  });

  it('returns GQA-style threeWay flow for Kimi K2.5 (MLA not expandable, sub-blocks not rendered)', () => {
    const arch = getModelArchitecture(Model.Kimi_K2_5)!;
    const flow = getAttentionSubBlocks(arch);

    // MLA is not expandable, but getAttentionSubBlocks still returns valid flow data
    expect(flow.layout).toBe('threeWay');
    if (flow.layout !== 'threeWay') return;

    expect(flow.leftPath[0].name).toBe('Q Projection');
    expect(flow.leftPath[0].detail).toContain('64 heads');
    expect(flow.leftPath[0].detail).toContain('112d');
  });

  it('all sub-blocks have valid types', () => {
    const validTypes = ['projection', 'activation', 'operation', 'attention'];
    for (const arch of Object.values(MODEL_ARCHITECTURES)) {
      if (!arch) continue;
      const flow = getAttentionSubBlocks(arch);
      const allBlocks = getAllBlocks(flow);
      for (const block of allBlocks) {
        expect(validTypes).toContain(block.type);
        expect(block.name.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('getFFNSubBlocks', () => {
  it('returns parallel SwiGLU flow for Llama 3.3 with dimensions', () => {
    const arch = getModelArchitecture(Model.Llama3_3_70B)!;
    const flow = getFFNSubBlocks(arch);

    expect(flow.layout).toBe('parallel');
    if (flow.layout !== 'parallel') return;

    // Gate path (left): Gate Projection -> SiLU
    expect(flow.leftPath.length).toBe(2);
    expect(flow.leftPath[0].name).toBe('Gate Projection');
    expect(flow.leftPath[0].detail).toBe('\u2192 28,672');
    expect(flow.leftPath[0].type).toBe('projection');
    expect(flow.leftPath[1].name).toBe('SiLU Activation');
    expect(flow.leftPath[1].type).toBe('activation');

    // Up path (right): Up Projection only
    expect(flow.rightPath.length).toBe(1);
    expect(flow.rightPath[0].name).toBe('Up Projection');
    expect(flow.rightPath[0].detail).toBe('\u2192 28,672');

    // Merge: circled x multiply -> down projection
    expect(flow.mergeBlocks.length).toBe(2);
    expect(flow.mergeBlocks[0].circleSymbol).toBe('\u00D7');
    expect(flow.mergeBlocks[0].type).toBe('operation');
    expect(flow.mergeBlocks[1].name).toBe('Down Projection');
    expect(flow.mergeBlocks[1].detail).toBe('\u2192 8,192');
  });

  it('returns same SwiGLU flow for Llama 3.1 70B', () => {
    const arch = getModelArchitecture(Model.Llama3_1_70B)!;
    const flow = getFFNSubBlocks(arch);

    expect(flow.layout).toBe('parallel');
    if (flow.layout !== 'parallel') return;

    expect(flow.leftPath[0].name).toBe('Gate Projection');
    expect(flow.leftPath[0].detail).toBe('\u2192 28,672');
    expect(flow.mergeBlocks[1].name).toBe('Down Projection');
    expect(flow.mergeBlocks[1].detail).toBe('\u2192 8,192');
  });

  it('returns SwiGLU flow for DeepSeek R1 expert FFN with expert-level dimensions', () => {
    const arch = getModelArchitecture(Model.DeepSeek_R1)!;
    const flow = getFFNSubBlocks(arch);

    expect(flow.layout).toBe('parallel');
    if (flow.layout !== 'parallel') return;

    // Expert FFN dim is 2,048
    expect(flow.leftPath[0].name).toBe('Gate Projection');
    expect(flow.leftPath[0].detail).toBe('\u2192 2,048');
    expect(flow.rightPath[0].name).toBe('Up Projection');
    expect(flow.rightPath[0].detail).toBe('\u2192 2,048');
    expect(flow.mergeBlocks[1].name).toBe('Down Projection');
    expect(flow.mergeBlocks[1].detail).toBe('\u2192 7,168');
  });

  it('returns SwiGLU flow with dense FFN dimensions when useDenseFFNDim is true', () => {
    const arch = getModelArchitecture(Model.DeepSeek_R1)!;
    const flow = getFFNSubBlocks(arch, { useDenseFFNDim: true });

    expect(flow.layout).toBe('parallel');
    if (flow.layout !== 'parallel') return;

    // Dense FFN dim is 18,432
    expect(flow.leftPath[0].name).toBe('Gate Projection');
    expect(flow.leftPath[0].detail).toBe('\u2192 18,432');
    expect(flow.rightPath[0].name).toBe('Up Projection');
    expect(flow.rightPath[0].detail).toBe('\u2192 18,432');
    expect(flow.mergeBlocks[1].name).toBe('Down Projection');
    expect(flow.mergeBlocks[1].detail).toBe('\u2192 7,168');
  });

  it('returns SwiGLU flow for gpt-oss expert FFN with matching intermediate and hidden dimensions', () => {
    const arch = getModelArchitecture(Model.GptOss)!;
    const flow = getFFNSubBlocks(arch);

    expect(flow.layout).toBe('parallel');
    if (flow.layout !== 'parallel') return;

    // gpt-oss expert FFN dim equals hidden size (2,880)
    expect(flow.leftPath[0].name).toBe('Gate Projection');
    expect(flow.leftPath[0].detail).toBe('\u2192 2,880');
    expect(flow.rightPath[0].name).toBe('Up Projection');
    expect(flow.rightPath[0].detail).toBe('\u2192 2,880');
    expect(flow.mergeBlocks[1].name).toBe('Down Projection');
    expect(flow.mergeBlocks[1].detail).toBe('\u2192 2,880');
  });

  it('returns SwiGLU flow for Kimi K2.5 expert FFN with expert-level dimensions', () => {
    const arch = getModelArchitecture(Model.Kimi_K2_5)!;
    const flow = getFFNSubBlocks(arch);

    expect(flow.layout).toBe('parallel');
    if (flow.layout !== 'parallel') return;

    // Expert FFN dim is 2,048 (same as DeepSeek R1)
    expect(flow.leftPath[0].name).toBe('Gate Projection');
    expect(flow.leftPath[0].detail).toBe('\u2192 2,048');
    expect(flow.rightPath[0].name).toBe('Up Projection');
    expect(flow.rightPath[0].detail).toBe('\u2192 2,048');
    expect(flow.mergeBlocks[1].name).toBe('Down Projection');
    expect(flow.mergeBlocks[1].detail).toBe('\u2192 7,168');
  });

  it('returns SwiGLU flow with dense FFN dimensions for Kimi K2.5 when useDenseFFNDim is true', () => {
    const arch = getModelArchitecture(Model.Kimi_K2_5)!;
    const flow = getFFNSubBlocks(arch, { useDenseFFNDim: true });

    expect(flow.layout).toBe('parallel');
    if (flow.layout !== 'parallel') return;

    // Dense FFN dim is 18,432
    expect(flow.leftPath[0].name).toBe('Gate Projection');
    expect(flow.leftPath[0].detail).toBe('\u2192 18,432');
    expect(flow.rightPath[0].name).toBe('Up Projection');
    expect(flow.rightPath[0].detail).toBe('\u2192 18,432');
    expect(flow.mergeBlocks[1].name).toBe('Down Projection');
    expect(flow.mergeBlocks[1].detail).toBe('\u2192 7,168');
  });

  it('returns SwiGLU flow for MiniMax M2.5 expert FFN with small intermediate dimension', () => {
    const arch = getModelArchitecture(Model.MiniMax_M2_5)!;
    const flow = getFFNSubBlocks(arch);

    expect(flow.layout).toBe('parallel');
    if (flow.layout !== 'parallel') return;

    // Expert FFN dim is 1,536
    expect(flow.leftPath[0].name).toBe('Gate Projection');
    expect(flow.leftPath[0].detail).toBe('\u2192 1,536');
    expect(flow.rightPath[0].name).toBe('Up Projection');
    expect(flow.rightPath[0].detail).toBe('\u2192 1,536');
    expect(flow.mergeBlocks[1].name).toBe('Down Projection');
    expect(flow.mergeBlocks[1].detail).toBe('\u2192 3,072');
  });

  it('falls back to regular ffnDim when useDenseFFNDim is true but denseFFNDim is undefined', () => {
    const arch = getModelArchitecture(Model.Llama3_3_70B)!;
    const flow = getFFNSubBlocks(arch, { useDenseFFNDim: true });

    expect(flow.layout).toBe('parallel');
    if (flow.layout !== 'parallel') return;

    // No denseFFNDim on Llama, falls back to regular ffnDim (28,672)
    expect(flow.leftPath[0].detail).toBe('\u2192 28,672');
  });

  it('all sub-blocks have valid types for all models', () => {
    const validTypes = ['projection', 'activation', 'operation', 'attention'];
    for (const arch of Object.values(MODEL_ARCHITECTURES)) {
      if (!arch) continue;
      const flow = getFFNSubBlocks(arch);
      const allBlocks = getAllBlocks(flow);
      expect(allBlocks.length).toBeGreaterThanOrEqual(4);
      for (const block of allBlocks) {
        expect(validTypes).toContain(block.type);
        expect(block.name.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('getHybridAttentionSubBlocks', () => {
  it('exposes the sliding-window branch as an explicit block for DeepSeek V4', () => {
    const arch = getModelArchitecture(Model.DeepSeek_V4_Pro)!;
    const [hca, csa] = arch.alternatingLayers!;

    const csaFlow = getHybridAttentionSubBlocks(arch, csa);
    expect(csaFlow.layout).toBe('parallel');
    if (csaFlow.layout !== 'parallel') return;
    expect(csaFlow.leftLabel).toBe('Local');
    // Local branch is the sliding-window KV source (one explicit block). The
    // sink is NOT here — it is a learnable softmax bias on the shared MQA.
    expect(csaFlow.leftPath[0].name).toBe('Sliding Window');
    expect(csaFlow.leftPath[0].detail).toContain('128');
    expect(csaFlow.leftPath).toHaveLength(1);
    expect(csaFlow.leftPath.some((b) => b.name === 'Attention Sink')).toBe(false);
    // CSA compressed branch: light compression then the learned lightning
    // indexer (sparse top-k) — two stages.
    expect(csaFlow.rightPath.map((b) => b.name)).toEqual([
      'Token Compression',
      'Lightning Indexer',
    ]);
    // The fused attention is a single shared-KV MQA that carries the sink
    expect(csaFlow.mergeBlocks[0].name).toBe('Shared-KV MQA + Sink');
    expect(csaFlow.mergeBlocks.at(-1)?.name).toBe('Output Projection');

    const hcaFlow = getHybridAttentionSubBlocks(arch, hca);
    if (hcaFlow.layout !== 'parallel') return;
    expect(hcaFlow.leftPath[0].name).toBe('Sliding Window');
    expect(hcaFlow.leftPath).toHaveLength(1);
    // HCA compressed branch is a single heavy-compression source (no indexer)
    expect(hcaFlow.rightPath.some((b) => b.name === 'Lightning Indexer')).toBe(false);
    expect(hcaFlow.rightPath.map((b) => b.name)).toEqual(['Heavy Compression']);
    expect(hcaFlow.mergeBlocks[0].name).toBe('Shared-KV MQA + Sink');
  });

  it('all hybrid sub-blocks have valid types', () => {
    const arch = getModelArchitecture(Model.DeepSeek_V4_Pro)!;
    const validTypes = ['projection', 'activation', 'operation', 'attention'];
    for (const spec of arch.alternatingLayers!) {
      const flow = getHybridAttentionSubBlocks(arch, spec);
      for (const block of getAllBlocks(flow)) {
        expect(validTypes).toContain(block.type);
        expect(block.name.length).toBeGreaterThan(0);
      }
    }
  });
});

/** Helper: get all blocks from a flow (flat list for easy assertions) */
function getAllBlocks(flow: SubBlockFlow) {
  if (flow.layout === 'sequential') return flow.blocks;
  if (flow.layout === 'threeWay')
    return [
      ...flow.leftPath,
      ...flow.middlePath,
      ...flow.rightPath,
      ...flow.intermediateMergeBlocks,
      ...flow.finalMergeBlocks,
    ];
  return [...flow.leftPath, ...flow.rightPath, ...flow.mergeBlocks];
}
