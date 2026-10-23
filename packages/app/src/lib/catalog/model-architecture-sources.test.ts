import { describe, expect, it } from 'vitest';
import { Model } from './data-mappings';
import fixtures from './fixtures/model-architecture-configs.json';
import { getModelArchitecture, getFFNSubBlocks } from './model-architectures';
import { getModelPage } from './model-pages';
const links = (raw: string) => (raw.match(/https?:\/\/[^\s)]+/gu) ?? []).sort();

describe('architecture parity with published checkpoint configs', () => {
  it.each(fixtures.models)(
    '$model matches its sourced checkpoint dimensions',
    ({ model, config }) => {
      const arch = getModelArchitecture(model as Model)!;
      expect(arch, model).toMatchObject({
        numLayers: config.num_hidden_layers,
        hiddenSize: config.hidden_size,
        numHeads: config.num_attention_heads,
        vocabSize: config.vocab_size,
        contextWindow: config.max_position_embeddings,
      });
      if ('head_dim' in config)
        expect(arch.headDim).toBe(model.startsWith('GLM-5') ? 256 : config.head_dim);
      const source = config as Record<string, unknown>;
      expect(arch.ffnDim).toBe(source.moe_intermediate_size ?? source.intermediate_size);
      if (arch.architectureType === 'moe') {
        const routed = source.n_routed_experts ?? source.num_local_experts ?? source.num_experts;
        const shared =
          source.n_shared_experts ??
          source.num_shared_experts ??
          (source.shared_expert_intermediate_size ? 1 : 0);
        expect(arch.numExperts).toBe(Number(routed) + Number(shared));
        expect(arch.activeExperts).toBe(source.num_experts_per_tok ?? source.num_experts_per_token);
        const dense = Array.isArray(source.moe_layer_freq)
          ? source.moe_layer_freq.filter((layer: number) => layer === 0).length
          : (source.first_k_dense_replace ?? 0);
        expect(arch.denseFFNLayers ?? 0).toBe(dense);
      }
    },
  );

  it('keeps prefill, decode and conditional memory separate for the CED model', () => {
    const arch = getModelArchitecture(Model.DeepSeek_V4_1_Flash)!;
    expect(arch).toMatchObject({
      totalParams: 552,
      activeParamsPrefill: 8,
      activeParams: 16,
      conditionalMemoryParams: 196,
    });
    expect(arch.encoderDecoder).toEqual({
      encoderLayers: 20,
      decoderLayers: 20,
      globalKVSource: 'final-encoder-hidden-states',
      encoderSlidingOnlyLayers: 2,
      decoderAttention: 'joint-local-swa-and-shared-global-kv',
    });
    expect(arch.encoderDecoder!.encoderLayers + arch.encoderDecoder!.decoderLayers).toBe(
      arch.numLayers,
    );
    const source = fixtures.models.find(({ model }) => model === arch.model)!.config;
    expect(arch.encoderDecoder!.encoderSlidingOnlyLayers).toBe(
      ('compress_ratios' in source ? (source.compress_ratios as number[]) : [])
        .slice(0, arch.encoderDecoder!.encoderLayers)
        .filter((ratio) => ratio === 0).length,
    );
    expect(arch.attentionLabel).toBe('CSA2');
    expect(arch.conditionalMemoryName).toBe('Engram');
  });

  it('does not project a K3 routed expert directly to the residual hidden size', () => {
    const arch = getModelArchitecture(Model.Kimi_K3)!;
    const routed = getFFNSubBlocks(arch);
    const dense = getFFNSubBlocks(arch, { useDenseFFNDim: true });
    expect(routed.layout).toBe('parallel');
    expect(dense.layout).toBe('parallel');
    if (routed.layout !== 'parallel' || dense.layout !== 'parallel')
      throw new Error('Expected FFN paths');
    expect(routed.mergeBlocks.at(-1)?.detail).toBe('→ 3,584');
    expect(dense.mergeBlocks.at(-1)?.detail).toBe('→ 7,168');
  });

  it.each([Model.GptOss, Model.MiniMax_M3, Model.MiniMax_M3_1_Flash])(
    '%s shows clipping, scaled gating and the linear bias in modified SwiGLU',
    (model) => {
      const flow = getFFNSubBlocks(getModelArchitecture(model)!);
      if (flow.layout !== 'parallel') throw new Error('Expected parallel paths');
      expect(flow.leftPath.map(({ name }) => name)).toEqual([
        'Gate Projection',
        'Clamp',
        'Scaled SiLU',
      ]);
      expect(flow.leftPath[1].detail).toBe('max = 7');
      expect(flow.leftPath[2].detail).toBe('α = 1.702');
      expect(flow.rightPath.map(({ name }) => name)).toEqual(['Up Projection', 'Clamp', '+1']);
      expect(flow.rightPath[1].detail).toBe('±7');
    },
  );

  it.each([Model.DeepSeek_V4_Pro, Model.DeepSeek_V4_1_Flash])(
    '%s clamps both projections before ordinary SiLU without the gpt-oss offset',
    (model) => {
      const flow = getFFNSubBlocks(getModelArchitecture(model)!);
      if (flow.layout !== 'parallel') throw new Error('Expected parallel paths');
      expect(flow.leftPath.map(({ name }) => name)).toEqual([
        'Gate Projection',
        'Clamp',
        'SiLU Activation',
      ]);
      expect(flow.leftPath[1].detail).toBe('max = 10');
      expect(flow.rightPath.map(({ name }) => name)).toEqual(['Up Projection', 'Clamp']);
      expect(flow.rightPath[1].detail).toBe('±10');
    },
  );

  it.each(['muse-spark-open', 'deepseek-v41-flash', 'minimax-m31-flash'])(
    '%s has an actual Chinese article with the same technical numbers and sources',
    (slug) => {
      const en = getModelPage(slug)!;
      const zh = getModelPage(slug, 'zh')!;
      expect(zh.contentLocale).toBe('zh');
      const protectedFacts: Record<string, string[]> = {
        'muse-spark-open': ['816B', '42B', '62', '8192', '202048', '4096'],
        'deepseek-v41-flash': ['552B', '196B', '8B', '16B', '5120', '2304'],
        'minimax-m31-flash': ['428B', '23B', '6144', '12288', '3072', '1.702'],
      };
      for (const fact of protectedFacts[slug]) {
        expect(en.raw).toContain(fact);
        expect(zh.raw).toContain(fact);
      }
      expect(links(zh.raw)).toEqual(links(en.raw));
    },
  );
});
