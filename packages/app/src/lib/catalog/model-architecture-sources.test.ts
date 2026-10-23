import { describe, expect, it } from 'vitest';
import type { Model } from './data-mappings';
import fixtures from './fixtures/model-architecture-configs.json';
import { getModelArchitecture } from './model-architectures';

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
});
