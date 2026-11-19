import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api/api';

import { resolveBenchmarkSeed } from './benchmark-seed';

const rows = [{ id: 1 }] as BenchmarkRow[];
const base = {
  scope: 'compare-pair:b200:h200',
  seedRows: rows,
  seedModel: 'DeepSeek-R1-0528',
  selectedModel: 'DeepSeek-R1-0528',
};

describe('resolveBenchmarkSeed', () => {
  it('keeps the caller scope when there is no seed', () => {
    expect(
      resolveBenchmarkSeed({
        scope: 'blog-pair:b200:h200',
        selectedModel: 'DeepSeek-R1-0528',
        selectedSequence: '8k/1k',
      }),
    ).toEqual({ scope: 'blog-pair:b200:h200' });
  });

  it('seeds a sequence-scoped key while the selection matches the seed', () => {
    expect(
      resolveBenchmarkSeed({ ...base, seedSequence: '8k/1k', selectedSequence: '8k/1k' }),
    ).toEqual({ rows, scope: 'compare-pair:b200:h200:8k/1k' });
  });

  it('gives seeds for different sequences different keys', () => {
    const agentic = resolveBenchmarkSeed({
      ...base,
      seedSequence: 'agentic-traces',
      selectedSequence: 'agentic-traces',
    });
    const fixed = resolveBenchmarkSeed({
      ...base,
      seedSequence: '8k/1k',
      selectedSequence: '8k/1k',
    });
    expect(agentic.scope).not.toBe(fixed.scope);
  });

  it('drops the seed and its scope once the reader picks another sequence', () => {
    expect(
      resolveBenchmarkSeed({ ...base, seedSequence: '8k/1k', selectedSequence: '1k/1k' }),
    ).toEqual({});
  });

  it('drops the seed when the reader picks another model', () => {
    expect(
      resolveBenchmarkSeed({
        ...base,
        seedSequence: '8k/1k',
        selectedModel: 'Kimi-K2.5',
        selectedSequence: '8k/1k',
      }),
    ).toEqual({});
  });

  it('treats a seed without a sequence as covering every sequence', () => {
    expect(resolveBenchmarkSeed({ ...base, selectedSequence: '1k/8k' })).toEqual({
      rows,
      scope: 'compare-pair:b200:h200',
    });
  });
});
