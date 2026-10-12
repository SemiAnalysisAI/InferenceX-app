import { describe, it, expect } from 'vitest';
import { sanitizeModels } from '@semianalysisai/inferencex-db/proxytrace/shared/pricing';

describe('sanitizeModels', () => {
  it('preserves known model names', () => {
    const rows = [
      { model: 'claude-opus-4-6', tokens: 100 },
      { model: 'claude-sonnet-4-6', tokens: 200 },
    ];
    const result = sanitizeModels(rows);
    expect(result[0].model).toBe('claude-opus-4-6');
    expect(result[1].model).toBe('claude-sonnet-4-6');
  });

  it('labels unlisted model names other', () => {
    const rows = [{ model: 'secret-internal-model-v3', tokens: 100 }];
    const result = sanitizeModels(rows);
    expect(result[0].model).toBe('other');
  });

  it('passes through null models', () => {
    const rows = [{ model: null, tokens: 100 }];
    const result = sanitizeModels(rows);
    expect(result[0].model).toBeNull();
  });

  it('preserves other fields unchanged', () => {
    const rows = [{ model: 'claude-opus-4-6', tokens: 100, cost: 0.5 }];
    const result = sanitizeModels(rows);
    expect(result[0].tokens).toBe(100);
    expect(result[0].cost).toBe(0.5);
  });

  it('handles empty array', () => {
    expect(sanitizeModels([])).toEqual([]);
  });

  it('handles mixed known and unknown models', () => {
    const rows = [
      { model: 'claude-opus-4-6' },
      { model: 'unknown-model-xyz' },
      { model: null },
      { model: 'claude-haiku-4-5-20251001' },
    ];
    const result = sanitizeModels(rows);
    expect(result[0].model).toBe('claude-opus-4-6');
    expect(result[1].model).toBe('other');
    expect(result[2].model).toBeNull();
    expect(result[3].model).toBe('claude-haiku-4-5-20251001');
  });
});
