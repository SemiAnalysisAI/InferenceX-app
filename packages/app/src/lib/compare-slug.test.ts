import { describe, it, expect } from 'vitest';

import {
  allCanonicalComparePairs,
  allCanonicalCompareSlugs,
  canonicalCompareSlug,
  compareDisplayLabel,
  compareModelDisplayLabel,
  COMPARE_MODEL_ALIASES,
  COMPARE_MODEL_SLUGS,
  getCompareModelBySlug,
  LEGACY_BARE_DEFAULT_MODEL_SLUG,
  parseCompareSlug,
} from './compare-slug';

const DEEPSEEK_R1 = COMPARE_MODEL_SLUGS.find((m) => m.slug === 'deepseek-r1')!;
const KIMI_K26 = COMPARE_MODEL_SLUGS.find((m) => m.slug === 'kimi-k26')!;
const GLM_51 = COMPARE_MODEL_SLUGS.find((m) => m.slug === 'glm-5-1')!;

describe('parseCompareSlug — new model-prefixed form', () => {
  it('parses a canonical model-prefixed slug', () => {
    const parsed = parseCompareSlug('deepseek-r1-h100-vs-h200');
    expect(parsed).toEqual({
      model: DEEPSEEK_R1,
      a: 'h100',
      b: 'h200',
      isLegacyBareSlug: false,
      isAliasModel: false,
    });
  });

  it('parses a model slug with internal hyphens (kimi-k26)', () => {
    const parsed = parseCompareSlug('kimi-k26-mi300x-vs-mi355x');
    expect(parsed?.model.slug).toBe('kimi-k26');
    expect(parsed?.a).toBe('mi300x');
    expect(parsed?.b).toBe('mi355x');
  });

  it('parses a model slug with multiple hyphens (glm-5-1)', () => {
    const parsed = parseCompareSlug('glm-5-1-h100-vs-gb200');
    expect(parsed?.model).toBe(GLM_51);
    expect(parsed?.a).toBe('h100');
    expect(parsed?.b).toBe('gb200');
  });

  it('preserves non-canonical GPU order so caller can redirect', () => {
    const parsed = parseCompareSlug('kimi-k26-h200-vs-h100');
    expect(parsed?.a).toBe('h200');
    expect(parsed?.b).toBe('h100');
  });

  it('lower-cases uppercase input', () => {
    const parsed = parseCompareSlug('KIMI-K26-H100-VS-H200');
    expect(parsed?.model).toBe(KIMI_K26);
    expect(parsed?.a).toBe('h100');
    expect(parsed?.b).toBe('h200');
  });

  it('returns null for unknown model slugs', () => {
    expect(parseCompareSlug('nonexistent-model-h100-vs-h200')).toBeNull();
    expect(parseCompareSlug('foo-h100-vs-h200')).toBeNull();
  });
});

describe('parseCompareSlug — alias model slugs', () => {
  it('resolves the deepseek alias to deepseek-r1 with isAliasModel=true', () => {
    const parsed = parseCompareSlug('deepseek-h100-vs-h200');
    expect(parsed?.model.slug).toBe('deepseek-r1');
    expect(parsed?.isAliasModel).toBe(true);
    expect(parsed?.isLegacyBareSlug).toBe(false);
  });

  it('resolves the kimi alias to kimi-k26', () => {
    const parsed = parseCompareSlug('kimi-h100-vs-h200');
    expect(parsed?.model.slug).toBe('kimi-k26');
    expect(parsed?.isAliasModel).toBe(true);
  });

  it('resolves the kimi-k25 older-version alias to kimi-k26', () => {
    const parsed = parseCompareSlug('kimi-k25-h100-vs-h200');
    expect(parsed?.model.slug).toBe('kimi-k26');
    expect(parsed?.isAliasModel).toBe(true);
  });

  it('resolves the glm-5 same-architecture alias to glm-5-1', () => {
    const parsed = parseCompareSlug('glm-5-h100-vs-h200');
    expect(parsed?.model.slug).toBe('glm-5-1');
    expect(parsed?.isAliasModel).toBe(true);
  });

  it('resolves every alias key in the alias map', () => {
    for (const [alias, canonical] of Object.entries(COMPARE_MODEL_ALIASES)) {
      const parsed = parseCompareSlug(`${alias}-h100-vs-h200`);
      expect(parsed, `alias ${alias} should resolve`).not.toBeNull();
      expect(parsed!.model.slug).toBe(canonical);
      expect(parsed!.isAliasModel).toBe(true);
    }
  });
});

describe('parseCompareSlug — legacy bare slug (PR #351 backward compat)', () => {
  it('parses a bare GPU pair as the legacy default model', () => {
    const parsed = parseCompareSlug('h100-vs-h200');
    expect(parsed?.model.slug).toBe(LEGACY_BARE_DEFAULT_MODEL_SLUG);
    expect(parsed?.a).toBe('h100');
    expect(parsed?.b).toBe('h200');
    expect(parsed?.isLegacyBareSlug).toBe(true);
    expect(parsed?.isAliasModel).toBe(false);
  });

  it('handles the bare uppercase form (PR #351 case-insensitive)', () => {
    const parsed = parseCompareSlug('H100-VS-H200');
    expect(parsed?.model.slug).toBe(LEGACY_BARE_DEFAULT_MODEL_SLUG);
    expect(parsed?.isLegacyBareSlug).toBe(true);
  });

  it('handles reversed bare slugs (PR #351 redirected reversed → canonical)', () => {
    const parsed = parseCompareSlug('h200-vs-h100');
    expect(parsed?.a).toBe('h200');
    expect(parsed?.b).toBe('h100');
    expect(parsed?.isLegacyBareSlug).toBe(true);
  });

  it('handles AMD GPU pairs', () => {
    const parsed = parseCompareSlug('mi300x-vs-mi325x');
    expect(parsed?.a).toBe('mi300x');
    expect(parsed?.b).toBe('mi325x');
    expect(parsed?.isLegacyBareSlug).toBe(true);
  });
});

describe('parseCompareSlug — rejection cases', () => {
  it('returns null for unknown GPU keys', () => {
    expect(parseCompareSlug('a100-vs-h100')).toBeNull();
    expect(parseCompareSlug('deepseek-r1-a100-vs-h100')).toBeNull();
  });

  it('returns null when both sides are the same GPU', () => {
    expect(parseCompareSlug('h100-vs-h100')).toBeNull();
    expect(parseCompareSlug('deepseek-r1-h100-vs-h100')).toBeNull();
  });

  it('returns null for malformed slugs', () => {
    expect(parseCompareSlug('h100')).toBeNull();
    expect(parseCompareSlug('')).toBeNull();
    expect(parseCompareSlug('-vs-h100')).toBeNull();
    expect(parseCompareSlug('h100-vs-')).toBeNull();
    expect(parseCompareSlug('h100-and-h200')).toBeNull();
  });

  it('returns null when the prefix is non-empty but contains no GPU key', () => {
    expect(parseCompareSlug('deepseek-r1-notagpu-vs-h100')).toBeNull();
  });
});

describe('canonicalCompareSlug', () => {
  it('returns alphabetical GPU order regardless of input order', () => {
    expect(canonicalCompareSlug('deepseek-r1', 'h200', 'h100')).toBe('deepseek-r1-h100-vs-h200');
    expect(canonicalCompareSlug('deepseek-r1', 'h100', 'h200')).toBe('deepseek-r1-h100-vs-h200');
  });

  it('handles cross-vendor pairs', () => {
    expect(canonicalCompareSlug('kimi-k26', 'mi300x', 'h100')).toBe('kimi-k26-h100-vs-mi300x');
  });

  it('handles multi-hyphen model slugs', () => {
    expect(canonicalCompareSlug('glm-5-1', 'h100', 'h200')).toBe('glm-5-1-h100-vs-h200');
  });

  it('round-trips through parseCompareSlug for every canonical model', () => {
    for (const model of COMPARE_MODEL_SLUGS) {
      const slug = canonicalCompareSlug(model.slug, 'h100', 'h200');
      const parsed = parseCompareSlug(slug);
      expect(parsed?.model.slug, `round-trip for ${model.slug}`).toBe(model.slug);
      expect(parsed?.a).toBe('h100');
      expect(parsed?.b).toBe('h200');
      expect(parsed?.isLegacyBareSlug).toBe(false);
      expect(parsed?.isAliasModel).toBe(false);
    }
  });
});

describe('allCanonicalComparePairs', () => {
  it('produces no duplicates and no self-pairs', () => {
    const pairs = allCanonicalComparePairs();
    const seen = new Set<string>();
    for (const { a, b } of pairs) {
      expect(a).not.toBe(b);
      expect(a < b).toBe(true);
      const key = `${a}|${b}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('count = n*(n-1)/2', () => {
    const pairs = allCanonicalComparePairs();
    const seenKeys = new Set<string>();
    for (const { a, b } of pairs) {
      seenKeys.add(a);
      seenKeys.add(b);
    }
    const n = seenKeys.size;
    expect(pairs.length).toBe((n * (n - 1)) / 2);
  });
});

describe('allCanonicalCompareSlugs', () => {
  it('produces (models × pairs) distinct entries', () => {
    const slugs = allCanonicalCompareSlugs();
    const pairCount = allCanonicalComparePairs().length;
    expect(slugs.length).toBe(COMPARE_MODEL_SLUGS.length * pairCount);
    const unique = new Set(slugs.map((s) => `${s.modelSlug}|${s.a}|${s.b}`));
    expect(unique.size).toBe(slugs.length);
  });

  it('every emitted slug round-trips through parseCompareSlug', () => {
    for (const { modelSlug, a, b } of allCanonicalCompareSlugs()) {
      const slug = canonicalCompareSlug(modelSlug, a, b);
      const parsed = parseCompareSlug(slug);
      expect(parsed, `slug ${slug} should parse`).not.toBeNull();
      expect(parsed!.model.slug).toBe(modelSlug);
      expect(parsed!.a).toBe(a);
      expect(parsed!.b).toBe(b);
      expect(parsed!.isLegacyBareSlug).toBe(false);
      expect(parsed!.isAliasModel).toBe(false);
    }
  });
});

describe('compareDisplayLabel', () => {
  it('uses HW_REGISTRY labels', () => {
    expect(compareDisplayLabel('h100', 'h200')).toBe('H100 vs H200');
    expect(compareDisplayLabel('gb200', 'mi355x')).toBe('GB200 NVL72 vs MI355X');
  });
});

describe('compareModelDisplayLabel', () => {
  it('prepends the model label to the GPU pair label', () => {
    expect(compareModelDisplayLabel(DEEPSEEK_R1, 'h100', 'h200')).toBe(
      'DeepSeek R1 — H100 vs H200',
    );
    expect(compareModelDisplayLabel(KIMI_K26, 'gb200', 'mi355x')).toBe(
      'Kimi K2.5/K2.6 — GB200 NVL72 vs MI355X',
    );
  });
});

describe('getCompareModelBySlug', () => {
  it('returns canonical models for canonical slugs', () => {
    expect(getCompareModelBySlug('deepseek-r1')).toBe(DEEPSEEK_R1);
    expect(getCompareModelBySlug('kimi-k26')).toBe(KIMI_K26);
  });

  it('resolves alias slugs to their canonical model', () => {
    expect(getCompareModelBySlug('deepseek')).toBe(DEEPSEEK_R1);
    expect(getCompareModelBySlug('kimi')).toBe(KIMI_K26);
    expect(getCompareModelBySlug('kimi-k25')).toBe(KIMI_K26);
    expect(getCompareModelBySlug('glm-5')).toBe(GLM_51);
  });

  it('returns null for unknown slugs', () => {
    expect(getCompareModelBySlug('nonexistent')).toBeNull();
  });
});
