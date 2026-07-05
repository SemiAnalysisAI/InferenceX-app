import { describe, it, expect } from 'vitest';

import { COMPARE_MODEL_ALIASES, COMPARE_MODEL_SLUGS } from '@/lib/compare-slug';

import {
  PRECISION_SLUG_ORDER,
  orderPrecisionPair,
  parsePrecisionCompareSlug,
  canonicalPrecisionCompareSlug,
  precisionDisplayLabel,
  parseSpecDecodeCompareSlug,
  canonicalSpecDecodeCompareSlug,
  specMethodDisplayLabel,
} from './compare-variant-slug';

const DEEPSEEK_R1 = COMPARE_MODEL_SLUGS.find((m) => m.slug === 'deepseek-r1')!;
const GLM_51 = COMPARE_MODEL_SLUGS.find((m) => m.slug === 'glm-5-1')!;

// ---------------------------------------------------------------------------
// PRECISION_SLUG_ORDER
// ---------------------------------------------------------------------------

describe('PRECISION_SLUG_ORDER', () => {
  it('has the expected tokens in ascending bit-width order', () => {
    expect(PRECISION_SLUG_ORDER).toEqual([
      'fp4',
      'nvfp4',
      'mxfp4',
      'int4',
      'fp4fp8',
      'fp8',
      'bf16',
    ]);
  });
});

// ---------------------------------------------------------------------------
// orderPrecisionPair
// ---------------------------------------------------------------------------

describe('orderPrecisionPair', () => {
  it('returns lower-index precision first', () => {
    expect(orderPrecisionPair('fp8', 'fp4')).toEqual(['fp4', 'fp8']);
    expect(orderPrecisionPair('fp4', 'fp8')).toEqual(['fp4', 'fp8']);
  });

  it('orders bf16 after fp8', () => {
    expect(orderPrecisionPair('bf16', 'fp8')).toEqual(['fp8', 'bf16']);
  });

  it('handles same-index tokens (identity)', () => {
    expect(orderPrecisionPair('fp8', 'fp8')).toEqual(['fp8', 'fp8']);
  });

  it('handles unknown tokens (sorted last)', () => {
    expect(orderPrecisionPair('fp8', 'unknown')).toEqual(['fp8', 'unknown']);
    expect(orderPrecisionPair('unknown', 'fp4')).toEqual(['fp4', 'unknown']);
  });
});

// ---------------------------------------------------------------------------
// parsePrecisionCompareSlug — canonical model prefix
// ---------------------------------------------------------------------------

describe('parsePrecisionCompareSlug — canonical model prefix', () => {
  it('parses a canonical model-prefixed slug', () => {
    const parsed = parsePrecisionCompareSlug('deepseek-r1-h100-fp8-vs-bf16');
    expect(parsed).toEqual({
      model: DEEPSEEK_R1,
      gpu: 'h100',
      precA: 'fp8',
      precB: 'bf16',
      isAliasModel: false,
    });
  });

  it('parses a model slug with internal hyphens (kimi-k26)', () => {
    const parsed = parsePrecisionCompareSlug('kimi-k26-h200-fp4-vs-fp8');
    expect(parsed?.model.slug).toBe('kimi-k26');
    expect(parsed?.gpu).toBe('h200');
    expect(parsed?.precA).toBe('fp4');
    expect(parsed?.precB).toBe('fp8');
  });

  it('parses a model slug with multiple hyphens (glm-5-1)', () => {
    const parsed = parsePrecisionCompareSlug('glm-5-1-gb200-int4-vs-fp8');
    expect(parsed?.model).toBe(GLM_51);
    expect(parsed?.gpu).toBe('gb200');
    expect(parsed?.precA).toBe('int4');
    expect(parsed?.precB).toBe('fp8');
  });

  it('preserves non-canonical precision order so caller can redirect', () => {
    const parsed = parsePrecisionCompareSlug('deepseek-r1-h100-bf16-vs-fp8');
    expect(parsed?.precA).toBe('bf16');
    expect(parsed?.precB).toBe('fp8');
  });

  it('lower-cases uppercase input', () => {
    const parsed = parsePrecisionCompareSlug('DEEPSEEK-R1-H100-FP8-VS-BF16');
    expect(parsed?.model).toBe(DEEPSEEK_R1);
    expect(parsed?.gpu).toBe('h100');
    expect(parsed?.precA).toBe('fp8');
    expect(parsed?.precB).toBe('bf16');
  });

  it('parses vendor-specific precision tokens (nvfp4, mxfp4)', () => {
    const parsed = parsePrecisionCompareSlug('deepseek-r1-h100-nvfp4-vs-fp8');
    expect(parsed?.precA).toBe('nvfp4');
    expect(parsed?.precB).toBe('fp8');
  });

  it('parses the fp4fp8 precision token', () => {
    const parsed = parsePrecisionCompareSlug('deepseek-r1-h100-fp4fp8-vs-bf16');
    expect(parsed?.precA).toBe('fp4fp8');
    expect(parsed?.precB).toBe('bf16');
  });
});

// ---------------------------------------------------------------------------
// parsePrecisionCompareSlug — alias model slugs
// ---------------------------------------------------------------------------

describe('parsePrecisionCompareSlug — alias model slugs', () => {
  it('resolves the deepseek alias to deepseek-r1 with isAliasModel=true', () => {
    const parsed = parsePrecisionCompareSlug('deepseek-h100-fp8-vs-bf16');
    expect(parsed?.model.slug).toBe('deepseek-r1');
    expect(parsed?.isAliasModel).toBe(true);
  });

  it('resolves the kimi alias to kimi-k26', () => {
    const parsed = parsePrecisionCompareSlug('kimi-h100-fp8-vs-bf16');
    expect(parsed?.model.slug).toBe('kimi-k26');
    expect(parsed?.isAliasModel).toBe(true);
  });

  it('resolves glm-5 to glm-5-1', () => {
    const parsed = parsePrecisionCompareSlug('glm-5-h100-fp8-vs-bf16');
    expect(parsed?.model.slug).toBe('glm-5-1');
    expect(parsed?.isAliasModel).toBe(true);
  });

  it('resolves every alias key in the alias map', () => {
    for (const [alias, canonical] of Object.entries(COMPARE_MODEL_ALIASES)) {
      const parsed = parsePrecisionCompareSlug(`${alias}-h100-fp8-vs-bf16`);
      expect(parsed, `alias ${alias} should resolve`).not.toBeNull();
      expect(parsed!.model.slug).toBe(canonical);
      expect(parsed!.isAliasModel).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// parsePrecisionCompareSlug — rejection cases
// ---------------------------------------------------------------------------

describe('parsePrecisionCompareSlug — rejection cases', () => {
  it('returns null for unknown GPU keys', () => {
    expect(parsePrecisionCompareSlug('deepseek-r1-a100-fp8-vs-bf16')).toBeNull();
  });

  it('returns null for unknown precision tokens', () => {
    expect(parsePrecisionCompareSlug('deepseek-r1-h100-fp16-vs-bf16')).toBeNull();
    expect(parsePrecisionCompareSlug('deepseek-r1-h100-fp8-vs-fp16')).toBeNull();
  });

  it('returns null when both precisions are the same', () => {
    expect(parsePrecisionCompareSlug('deepseek-r1-h100-fp8-vs-fp8')).toBeNull();
  });

  it('returns null for missing model prefix (no legacy bare form)', () => {
    expect(parsePrecisionCompareSlug('h100-fp8-vs-bf16')).toBeNull();
  });

  it('returns null for unknown model slugs', () => {
    expect(parsePrecisionCompareSlug('nonexistent-model-h100-fp8-vs-bf16')).toBeNull();
  });

  it('returns null for malformed slugs', () => {
    expect(parsePrecisionCompareSlug('')).toBeNull();
    expect(parsePrecisionCompareSlug('fp8-vs-bf16')).toBeNull();
    expect(parsePrecisionCompareSlug('deepseek-r1-h100-fp8')).toBeNull();
    expect(parsePrecisionCompareSlug('deepseek-r1-h100-fp8-and-bf16')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// canonicalPrecisionCompareSlug
// ---------------------------------------------------------------------------

describe('canonicalPrecisionCompareSlug', () => {
  it('returns precisions in PRECISION_SLUG_ORDER regardless of input order', () => {
    expect(canonicalPrecisionCompareSlug('deepseek-r1', 'h100', 'bf16', 'fp8')).toBe(
      'deepseek-r1-h100-fp8-vs-bf16',
    );
    expect(canonicalPrecisionCompareSlug('deepseek-r1', 'h100', 'fp8', 'bf16')).toBe(
      'deepseek-r1-h100-fp8-vs-bf16',
    );
  });

  it('handles multi-hyphen model slugs', () => {
    expect(canonicalPrecisionCompareSlug('glm-5-1', 'h100', 'fp4', 'fp8')).toBe(
      'glm-5-1-h100-fp4-vs-fp8',
    );
  });

  it('round-trips through parsePrecisionCompareSlug for every canonical model', () => {
    for (const model of COMPARE_MODEL_SLUGS) {
      const slug = canonicalPrecisionCompareSlug(model.slug, 'h100', 'fp8', 'bf16');
      const parsed = parsePrecisionCompareSlug(slug);
      expect(parsed, `round-trip for ${model.slug}`).not.toBeNull();
      expect(parsed!.model.slug).toBe(model.slug);
      expect(parsed!.gpu).toBe('h100');
      expect(parsed!.precA).toBe('fp8');
      expect(parsed!.precB).toBe('bf16');
      expect(parsed!.isAliasModel).toBe(false);
    }
  });

  it('round-trips all precision pairs through parse', () => {
    const precs = PRECISION_SLUG_ORDER;
    for (let i = 0; i < precs.length; i++) {
      for (let j = i + 1; j < precs.length; j++) {
        const slug = canonicalPrecisionCompareSlug('deepseek-r1', 'h100', precs[i], precs[j]);
        const parsed = parsePrecisionCompareSlug(slug);
        expect(parsed, `round-trip for ${precs[i]} vs ${precs[j]}`).not.toBeNull();
        expect(parsed!.precA).toBe(precs[i]);
        expect(parsed!.precB).toBe(precs[j]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// precisionDisplayLabel
// ---------------------------------------------------------------------------

describe('precisionDisplayLabel', () => {
  it('returns known Precision enum labels', () => {
    expect(precisionDisplayLabel('fp8')).toBe('FP8');
    expect(precisionDisplayLabel('bf16')).toBe('BF16');
    expect(precisionDisplayLabel('fp4')).toBe('FP4');
    expect(precisionDisplayLabel('int4')).toBe('INT4');
  });

  it('returns FP4+FP8 for fp4fp8', () => {
    expect(precisionDisplayLabel('fp4fp8')).toBe('FP4+FP8');
  });

  it('uppercases unknown precision tokens', () => {
    expect(precisionDisplayLabel('nvfp4')).toBe('NVFP4');
    expect(precisionDisplayLabel('mxfp4')).toBe('MXFP4');
  });
});

// ---------------------------------------------------------------------------
// parseSpecDecodeCompareSlug
// ---------------------------------------------------------------------------

describe('parseSpecDecodeCompareSlug — canonical form', () => {
  it('parses {model}-{gpu}-{precision}-{method}-vs-none', () => {
    const parsed = parseSpecDecodeCompareSlug('deepseek-r1-h100-bf16-mtp-vs-none');
    expect(parsed).toEqual({
      model: DEEPSEEK_R1,
      gpu: 'h100',
      precision: 'bf16',
      method: 'mtp',
      isAliasModel: false,
    });
  });

  it('parses multi-hyphen model slugs (glm-5-1) with precision', () => {
    const parsed = parseSpecDecodeCompareSlug('glm-5-1-h200-fp8-mtp-vs-none');
    expect(parsed?.model).toBe(GLM_51);
    expect(parsed?.gpu).toBe('h200');
    expect(parsed?.precision).toBe('fp8');
    expect(parsed?.method).toBe('mtp');
  });

  it('lower-cases uppercase input', () => {
    const parsed = parseSpecDecodeCompareSlug('DEEPSEEK-R1-H100-BF16-MTP-VS-NONE');
    expect(parsed?.model).toBe(DEEPSEEK_R1);
    expect(parsed?.precision).toBe('bf16');
    expect(parsed?.method).toBe('mtp');
  });

  it('parses various precision tokens', () => {
    for (const prec of ['fp4', 'nvfp4', 'mxfp4', 'int4', 'fp4fp8', 'fp8', 'bf16']) {
      const parsed = parseSpecDecodeCompareSlug(`deepseek-r1-h100-${prec}-mtp-vs-none`);
      expect(parsed, `precision ${prec}`).not.toBeNull();
      expect(parsed!.precision).toBe(prec);
    }
  });
});

describe('parseSpecDecodeCompareSlug — reversed form', () => {
  it('accepts {model}-{gpu}-{precision}-none-vs-{method} for redirect', () => {
    const parsed = parseSpecDecodeCompareSlug('deepseek-r1-h100-bf16-none-vs-mtp');
    expect(parsed?.model).toBe(DEEPSEEK_R1);
    expect(parsed?.gpu).toBe('h100');
    expect(parsed?.precision).toBe('bf16');
    expect(parsed?.method).toBe('mtp');
    expect(parsed?.isAliasModel).toBe(false);
  });

  it('handles multi-hyphen model in reversed form', () => {
    const parsed = parseSpecDecodeCompareSlug('glm-5-1-b200-fp8-none-vs-mtp');
    expect(parsed?.model).toBe(GLM_51);
    expect(parsed?.gpu).toBe('b200');
    expect(parsed?.precision).toBe('fp8');
    expect(parsed?.method).toBe('mtp');
  });
});

describe('parseSpecDecodeCompareSlug — alias models', () => {
  it('resolves the deepseek alias with isAliasModel=true', () => {
    const parsed = parseSpecDecodeCompareSlug('deepseek-h100-fp8-mtp-vs-none');
    expect(parsed?.model.slug).toBe('deepseek-r1');
    expect(parsed?.precision).toBe('fp8');
    expect(parsed?.isAliasModel).toBe(true);
  });

  it('resolves every alias key', () => {
    for (const [alias, canonical] of Object.entries(COMPARE_MODEL_ALIASES)) {
      const parsed = parseSpecDecodeCompareSlug(`${alias}-h100-fp8-mtp-vs-none`);
      expect(parsed, `alias ${alias} should resolve`).not.toBeNull();
      expect(parsed!.model.slug).toBe(canonical);
      expect(parsed!.precision).toBe('fp8');
      expect(parsed!.isAliasModel).toBe(true);
    }
  });
});

describe('parseSpecDecodeCompareSlug — rejection cases', () => {
  it('returns null for unknown GPU keys', () => {
    expect(parseSpecDecodeCompareSlug('deepseek-r1-a100-fp8-mtp-vs-none')).toBeNull();
  });

  it('returns null for unknown methods', () => {
    expect(parseSpecDecodeCompareSlug('deepseek-r1-h100-fp8-eagle-vs-none')).toBeNull();
  });

  it('returns null for none-vs-none (no active method)', () => {
    expect(parseSpecDecodeCompareSlug('deepseek-r1-h100-fp8-none-vs-none')).toBeNull();
  });

  it('returns null for missing model prefix', () => {
    expect(parseSpecDecodeCompareSlug('h100-fp8-mtp-vs-none')).toBeNull();
  });

  it('returns null for missing precision token', () => {
    // Old format without precision — no precision token between gpu and method.
    expect(parseSpecDecodeCompareSlug('deepseek-r1-h100-mtp-vs-none')).toBeNull();
  });

  it('returns null for bad precision token', () => {
    expect(parseSpecDecodeCompareSlug('deepseek-r1-h100-fp16-mtp-vs-none')).toBeNull();
  });

  it('returns null for malformed slugs', () => {
    expect(parseSpecDecodeCompareSlug('')).toBeNull();
    expect(parseSpecDecodeCompareSlug('mtp-vs-none')).toBeNull();
    expect(parseSpecDecodeCompareSlug('deepseek-r1-h100-fp8-mtp')).toBeNull();
    expect(parseSpecDecodeCompareSlug('deepseek-r1-h100-fp8-mtp-and-none')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// canonicalSpecDecodeCompareSlug
// ---------------------------------------------------------------------------

describe('canonicalSpecDecodeCompareSlug', () => {
  it('produces {model}-{gpu}-{precision}-{method}-vs-none', () => {
    expect(canonicalSpecDecodeCompareSlug('deepseek-r1', 'h100', 'bf16', 'mtp')).toBe(
      'deepseek-r1-h100-bf16-mtp-vs-none',
    );
  });

  it('round-trips through parseSpecDecodeCompareSlug for every canonical model', () => {
    for (const model of COMPARE_MODEL_SLUGS) {
      const slug = canonicalSpecDecodeCompareSlug(model.slug, 'h100', 'fp8', 'mtp');
      const parsed = parseSpecDecodeCompareSlug(slug);
      expect(parsed, `round-trip for ${model.slug}`).not.toBeNull();
      expect(parsed!.model.slug).toBe(model.slug);
      expect(parsed!.gpu).toBe('h100');
      expect(parsed!.precision).toBe('fp8');
      expect(parsed!.method).toBe('mtp');
      expect(parsed!.isAliasModel).toBe(false);
    }
  });

  it('round-trips all precision tokens through parse', () => {
    for (const prec of PRECISION_SLUG_ORDER) {
      const slug = canonicalSpecDecodeCompareSlug('deepseek-r1', 'h100', prec, 'mtp');
      const parsed = parseSpecDecodeCompareSlug(slug);
      expect(parsed, `round-trip for precision ${prec}`).not.toBeNull();
      expect(parsed!.precision).toBe(prec);
      expect(parsed!.method).toBe('mtp');
    }
  });
});

// ---------------------------------------------------------------------------
// specMethodDisplayLabel
// ---------------------------------------------------------------------------

describe('specMethodDisplayLabel', () => {
  it('returns Off for none', () => {
    expect(specMethodDisplayLabel(undefined, 'none')).toBe('Off');
    expect(specMethodDisplayLabel('DeepSeek-R1-0528', 'none')).toBe('Off');
  });

  it('returns M3 EAGLE for MiniMax-M3 mtp', () => {
    expect(specMethodDisplayLabel('MiniMax-M3', 'mtp')).toBe('M3 EAGLE');
  });

  it('returns MTP for non-MiniMax models', () => {
    expect(specMethodDisplayLabel('DeepSeek-V4-Pro', 'mtp')).toBe('MTP');
    expect(specMethodDisplayLabel(undefined, 'mtp')).toBe('MTP');
  });
});
