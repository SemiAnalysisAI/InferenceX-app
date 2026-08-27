import { describe, expect, it } from 'vitest';

import { matchesSearch, normalizeSearchText, searchTokens } from '@/lib/search-match';

describe('normalizeSearchText', () => {
  it('lowercases and folds punctuation to single spaces', () => {
    expect(normalizeSearchText('B300 (vLLM)')).toBe('b300 vllm');
    expect(normalizeSearchText('GB200 NVL72 (Dynamo vLLM)')).toBe('gb200 nvl72 dynamo vllm');
    expect(normalizeSearchText('Cost per Million Total Tokens (Hyperscaler)')).toBe(
      'cost per million total tokens hyperscaler',
    );
  });

  it('treats dashes, slashes, and dots as separators', () => {
    expect(normalizeSearchText('DeepSeek-V4-Pro')).toBe('deepseek v4 pro');
    expect(normalizeSearchText('1k/1k')).toBe('1k 1k');
    expect(normalizeSearchText('Qwen3.8-Flash-Next')).toBe('qwen3 8 flash next');
  });

  it('preserves CJK characters', () => {
    expect(normalizeSearchText('芯片规格')).toBe('芯片规格');
    expect(normalizeSearchText('术语表 (MI300X)')).toBe('术语表 mi300x');
  });

  it('collapses to empty for punctuation-only input', () => {
    expect(normalizeSearchText(' ()-/ ')).toBe('');
  });
});

describe('searchTokens', () => {
  it('splits on whitespace after normalization', () => {
    expect(searchTokens('B300 vllm')).toEqual(['b300', 'vllm']);
    expect(searchTokens('  (b300)  ')).toEqual(['b300']);
  });

  it('returns no tokens for blank queries', () => {
    expect(searchTokens('')).toEqual([]);
    expect(searchTokens('   ')).toEqual([]);
  });
});

describe('matchesSearch', () => {
  it('matches parenthesized labels from a parenthesis-less query (#406)', () => {
    expect(matchesSearch('B300 vllm', 'B300 (vLLM)')).toBe(true);
    expect(matchesSearch('gb200 dynamo', 'GB200 NVL72 (Dynamo vLLM)')).toBe(true);
  });

  it('is order-independent across tokens', () => {
    expect(matchesSearch('vllm b300', 'B300 (vLLM)')).toBe(true);
  });

  it('requires every token to match', () => {
    expect(matchesSearch('b300 sglang', 'B300 (vLLM)')).toBe(false);
  });

  it('still supports plain substring matching', () => {
    expect(matchesSearch('nvl72', 'GB200 NVL72 (Dynamo vLLM)')).toBe(true);
    expect(matchesSearch('hyper', 'Cost per Million Total Tokens (Hyperscaler)')).toBe(true);
  });

  it('matches across multiple haystack fields', () => {
    expect(matchesSearch('throughput input', 'Input Token Throughput per GPU', 'Throughput')).toBe(
      true,
    );
    expect(matchesSearch('cost input', 'Input Token Throughput per GPU', 'Throughput')).toBe(false);
  });

  it('ignores null/undefined haystack fields', () => {
    expect(matchesSearch('b300', 'B300 (vLLM)', null, undefined)).toBe(true);
  });

  it('matches everything on empty or punctuation-only queries', () => {
    expect(matchesSearch('', 'anything')).toBe(true);
    expect(matchesSearch(' () ', 'anything')).toBe(true);
  });

  it('matches queries typed with punctuation against plain labels', () => {
    expect(matchesSearch('(b300)', 'B300 vLLM')).toBe(true);
    expect(matchesSearch('deepseek-v4', 'DeepSeek V4 Pro')).toBe(true);
  });
});
