import { describe, expect, it } from 'vitest';

import { clampMetaDescription, META_TITLE_MAX } from '@/lib/seo/meta-text';

import { getAllGlossaryEntries, getGlossaryEntry } from './glossary';
import { getAllZhGlossaryEntries, getZhGlossaryEntry } from './glossary-zh';
import { glossaryMetaTitle, titleCaseGlossaryTerm } from './glossary-title';

describe('titleCaseGlossaryTerm', () => {
  it.each([
    ['Pareto frontier', 'Pareto Frontier'],
    ['Double buffering', 'Double Buffering'],
    ['Time to first token', 'Time to First Token'],
    ['Mixture of experts', 'Mixture of Experts'],
    ['Scale-up vs. scale-out networking', 'Scale-Up vs. Scale-Out Networking'],
    ['Apples-to-apples comparison', 'Apples-to-Apples Comparison'],
    ['KV cache DRAM P2P pooling', 'KV Cache DRAM P2P Pooling'],
    ['TensorCore (TPU)', 'TensorCore (TPU)'],
  ])('title-cases %s', (term, expected) => {
    expect(titleCaseGlossaryTerm(term)).toBe(expected);
  });

  it('leaves single-token names and identifiers untouched', () => {
    for (const term of ['llm-d', 'torch.compile', 'vLLM', 'All-reduce', 'NVFP4']) {
      expect(titleCaseGlossaryTerm(term)).toBe(term);
    }
  });
});

describe('glossaryMetaTitle', () => {
  it('capitalizes lowercase terms instead of echoing them', () => {
    expect(glossaryMetaTitle(getGlossaryEntry('pareto-frontier')!, 'en')).toBe(
      'What Is Pareto Frontier?',
    );
    expect(glossaryMetaTitle(getGlossaryEntry('double-buffering')!, 'en')).toBe(
      'What Is Double Buffering?',
    );
  });

  it('spells out acronym terms and appends one-token abbreviations', () => {
    expect(glossaryMetaTitle(getGlossaryEntry('gemm')!, 'en')).toBe(
      'What Is GEMM (General Matrix Multiply)?',
    );
    expect(glossaryMetaTitle(getGlossaryEntry('nvfp4')!, 'en')).toBe(
      'What Is NVFP4 (NVIDIA 4-Bit Floating Point)?',
    );
    expect(glossaryMetaTitle(getGlossaryEntry('time-to-first-token')!, 'en')).toBe(
      'What Is Time to First Token (TTFT)?',
    );
    // Multi-word abbreviations such as "PD disaggregation" are not acronyms.
    expect(glossaryMetaTitle(getGlossaryEntry('disaggregated-inference')!, 'en')).toBe(
      'What Is Disaggregated Inference?',
    );
  });

  it('drops a qualifier that would overflow the title budget', () => {
    expect(glossaryMetaTitle(getGlossaryEntry('nccl')!, 'en')).toBe('What Is NCCL?');
  });

  it('localizes the Chinese title without a space between Chinese characters', () => {
    expect(glossaryMetaTitle(getZhGlossaryEntry('gemm')!, 'zh')).toBe(
      '什么是 GEMM（通用矩阵乘法）？',
    );
    expect(glossaryMetaTitle(getZhGlossaryEntry('time-to-first-token')!, 'zh')).toBe(
      '什么是首 token 时间（TTFT）？',
    );
    expect(glossaryMetaTitle(getZhGlossaryEntry('pareto-frontier')!, 'zh')).toBe(
      '什么是 Pareto 前沿？',
    );
    expect(glossaryMetaTitle(getZhGlossaryEntry('xla')!, 'zh')).toBe(
      '什么是 XLA（加速线性代数）？',
    );
    // English expansions never leak into Chinese titles.
    for (const entry of getAllZhGlossaryEntries()) {
      if (entry.expansion)
        expect(entry.expansion, entry.slug).not.toBe(getGlossaryEntry(entry.slug)!.expansion);
    }
    // A translated term that already carries a parenthetical is not qualified twice.
    expect(glossaryMetaTitle(getZhGlossaryEntry('tpu')!, 'zh')).toBe(
      '什么是 TPU（张量处理单元）？',
    );
  });

  it('fits every English and Chinese entry within the title budget without an ellipsis', () => {
    for (const [entries, locale] of [
      [getAllGlossaryEntries(), 'en'],
      [getAllZhGlossaryEntries(), 'zh'],
    ] as const) {
      for (const entry of entries) {
        const title = glossaryMetaTitle(entry, locale);
        expect(title.length, entry.slug).toBeLessThanOrEqual(META_TITLE_MAX);
        expect(title, entry.slug).not.toContain('…');
      }
    }
  });
});

describe('double buffering snippet', () => {
  it('names multiple buffering in the meta description, not only the aliases', () => {
    expect(clampMetaDescription(getGlossaryEntry('double-buffering')!.definition, 'en')).toContain(
      'multiple buffering',
    );
    expect(
      clampMetaDescription(getZhGlossaryEntry('double-buffering')!.definition, 'zh'),
    ).toContain('多重缓冲');
  });
});
