import { describe, expect, it } from 'vitest';

import { speculationFromServerLog } from './server-log-speculation';

describe('speculationFromServerLog', () => {
  it.each([
    [
      'vLLM with a separate drafter copied to local disk',
      'kimik3',
      "speculative_config=SpeculativeConfig(method='dspark', model='/data/models/Kimi-K3-DSpark', num_spec_tokens=7)",
      { spec_algorithm: 'dspark', spec_draft_model: 'Inferact/Kimi-K3-DSpark' },
    ],
    [
      'vLLM drafting from a directory inside the served checkpoint',
      'minimaxm31flash',
      "speculative_config=SpeculativeConfig(method='dspark', model='/model/dspark', num_spec_tokens=7)",
      { spec_algorithm: 'dspark', spec_draft_model: 'native' },
    ],
    [
      'SGLang naming the served checkpoint as its MTP drafter',
      'qwen3.8next',
      "'speculative_algorithm': 'EAGLE'\n'speculative_draft_model_path': 'nvidia/Qwen3.8-Flash-Next-NVFP4'",
      { spec_algorithm: 'mtp', spec_draft_model: 'native' },
    ],
    [
      'SGLang DFlash with a separate drafter repo',
      'musespark',
      "'speculative_algorithm': 'DFLASH'\n'speculative_draft_model_path': 'RadixArk/Muse-Spark-Open-DFlash2'",
      { spec_algorithm: 'dflash', spec_draft_model: 'RadixArk/Muse-Spark-Open-DFlash2' },
    ],
    [
      'TensorRT-LLM engine args with a local drafter copy',
      'musespark',
      "'speculative_config': {'attention_backend': 'VANILLA', 'decoding_type': 'DFlash', 'max_draft_len': 7, 'speculative_model': '/raid/common-models/muse-spark-open-dflash2'}",
      { spec_algorithm: 'dflash', spec_draft_model: 'RadixArk/Muse-Spark-Open-DFlash2' },
    ],
    [
      "TensorRT-LLM's EAGLE3 config for MiniMax-M3",
      'minimaxm3',
      "speculative_model=PosixPath('/data/models/MiniMax-M3-EAGLE3-GQA')\ndecoding_type='Eagle3'",
      { spec_algorithm: 'eagle3', spec_draft_model: 'Inferact/MiniMax-M3-EAGLE3-GQA' },
    ],
    [
      'ATOM loading a separate drafter after the target',
      'kimik3',
      "SpeculativeConfig(method='dspark', num_spec_tokens=4)\nLoading safetensors shards[moonshotai/Kimi-K3]\nLoading safetensors shards[Inferact/Kimi-K3-DSpark]",
      { spec_algorithm: 'dspark', spec_draft_model: 'Inferact/Kimi-K3-DSpark' },
    ],
    [
      "TileRT's MTP heads",
      'glm5.3',
      'num_mtp 3',
      { spec_algorithm: 'mtp', spec_draft_model: 'native' },
    ],
  ])('%s', (_, modelPrefix, log, expected) => {
    expect(speculationFromServerLog(log, modelPrefix)).toEqual(expected);
  });

  it.each([
    'speculative_config=None',
    "'speculative_algorithm': None\n'speculative_draft_model_path': None",
    'num_mtp 0',
    '',
  ])('reports nothing for a server that did not draft: %j', (log) => {
    expect(speculationFromServerLog(log, 'glm5.2')).toBeNull();
  });
});
