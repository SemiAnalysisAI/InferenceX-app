import { describe, expect, it } from 'vitest';

import { diagramText } from './diagram-copy';
import { architecture, measuredRoles, modelLayers } from './layers';

const MODELS = [
  'DeepSeek-R1-0528',
  'Kimi-K2.5',
  'Kimi-K3',
  'GLM-5',
  'DeepSeek-V4-Pro',
  'DeepSeek-V4-Flash',
  'Qwen3.5-397B-A17B',
  'MiniMax-M2.5',
  'MiniMax-M3',
  'gpt-oss-120b',
  'Unknown-model',
];

/** Terms engineers write in English, which the Chinese diagram keeps as is. */
const ENGLISH = [
  'Gated DeltaNet',
  'Kimi Delta Attention',
  'Lightning indexer',
  'Indexer wq_b',
  'MoE',
  'RMSNorm',
  'RMSNorm × σ(g)',
  'RoPE',
  'RoPE (k_pe)',
  'Norm + RoPE',
  'q/k Norm + RoPE',
  '× σ(gate)',
];

/** Module names (`q_proj`, `compressor.wkv + wgate`, `w1 (gate)`), `Top-512`, `SiLU × up`. */
const KEPT = [/^[a-z][\w.]*(?: [+/] [\w.]+)?(?: \((?:gate|up)\))?$/u, /^Top-\d+$/u, /^\S+ × up$/u];

/** Every block name, box label, hover note and op label the diagram draws for `model`. */
function diagramTexts(model: string): string[] {
  const texts = new Set<string>();
  for (const open of [new Set<string>(), new Set(['moe:fold'])])
    for (const block of modelLayers(
      architecture(model),
      measuredRoles(undefined, model),
      undefined,
      model,
      true,
      open,
    )) {
      texts.add(block.label);
      for (const n of block.nodes) {
        texts.add(n.label);
        if (n.title) texts.add(n.title);
      }
      for (const s of block.spans) texts.add(s.slot.label);
    }
  return [...texts];
}

describe('diagramText', () => {
  it('returns the English text unchanged on English pages', () => {
    expect(diagramText('Weighted combine', 'en')).toBe('Weighted combine');
  });

  it('fills in the numbers of generated labels', () => {
    expect(diagramText('Top-8 of 256', 'zh')).toBe('Top-8 / 256');
    expect(diagramText('MoE (256 experts, top-8 + shared)', 'zh')).toBe(
      'MoE（256 个专家，top-8 + 共享专家）',
    );
    expect(diagramText('Attention (MLA)', 'zh')).toBe('注意力（MLA）');
  });

  it('translates each box of a fused label', () => {
    expect(diagramText('Experts gate / up + Experts down', 'zh')).toBe(
      '专家 gate / up + 专家 down',
    );
  });

  it.each(MODELS)('has Chinese for every text the %s diagram draws', (model) => {
    const untranslated = diagramTexts(model).filter(
      (text) =>
        diagramText(text, 'zh') === text &&
        !ENGLISH.includes(text) &&
        !KEPT.some((re) => re.test(text)),
    );
    expect(untranslated).toEqual([]);
  });
});
