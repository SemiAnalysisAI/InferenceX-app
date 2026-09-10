import { describe, expect, it } from 'vitest';

import {
  FRAMEWORK_LABELS,
  HW_REGISTRY,
  stripTcoVariantSuffix,
  TCO_VARIANTS,
  tcoVariantForHwKey,
  tcoVariantKey,
  tcoVariantsForMetric,
} from '@semianalysisai/inferencex-constants';

import { getGpuSpecs, getHardwareConfig, getModelSortIndex } from '@/lib/constants';
import { getDisplayLabel } from '@/lib/utils';

const JALAPENO = TCO_VARIANTS.find((v) => v.id === 'jalapeno-1-27')!;
const SOURCE_KEY = 'jalapeno_teacup';
const VARIANT_KEY = 'jalapeno_teacup_tco127';

describe('TCO_VARIANTS registry', () => {
  it('quotes Jalapeño at $1.27/hr against the jalapeno registry chip', () => {
    expect(JALAPENO.baseGpuKey).toBe('jalapeno');
    expect(JALAPENO.costPerHour).toBe(1.27);
    expect(HW_REGISTRY[JALAPENO.baseGpuKey]).toBeDefined();
  });

  it('leaves HW_REGISTRY untouched — the modelled tiers still describe the chip', () => {
    expect(HW_REGISTRY.jalapeno.costh).toBe(1.47);
    expect(HW_REGISTRY.jalapeno.costr).toBe(1.79);
  });

  it('applies only to the tokens-per-$ hyperscaler metrics', () => {
    expect([...JALAPENO.applicableMetricKeys].toSorted()).toEqual([
      'y_inputTokensPerDollarH',
      'y_outputTokensPerDollarH',
      'y_tokensPerDollarH',
    ]);
  });

  it.each(['y_tokensPerDollarN', 'y_tokensPerDollarR', 'y_costh', 'y_tokensPerRmbH', 'y_tpPerGpu'])(
    'does not apply to %s',
    (metric) => {
      expect(tcoVariantsForMetric(metric)).toHaveLength(0);
    },
  );

  it('uses a suffix that cannot be confused with a framework part label', () => {
    for (const variant of TCO_VARIANTS) {
      expect(FRAMEWORK_LABELS[variant.hwKeySuffix]).toBeUndefined();
      expect(variant.hwKeySuffix).toMatch(/^[a-z0-9]+$/u);
    }
  });
});

describe('variant hwKey round-trip', () => {
  it('builds and detects the variant key', () => {
    expect(tcoVariantKey(SOURCE_KEY, JALAPENO)).toBe(VARIANT_KEY);
    expect(tcoVariantForHwKey(VARIANT_KEY)?.id).toBe(JALAPENO.id);
    expect(stripTcoVariantSuffix(VARIANT_KEY)).toBe(SOURCE_KEY);
  });

  it('does not treat the source key or another chip as a variant', () => {
    expect(tcoVariantForHwKey(SOURCE_KEY)).toBeNull();
    expect(tcoVariantForHwKey('b200_vllm_tco127')).toBeNull();
    expect(stripTcoVariantSuffix(SOURCE_KEY)).toBe(SOURCE_KEY);
  });
});

describe('variant key resolves as the real chip', () => {
  it('keeps the jalapeno registry specs, so power and the other tiers are unchanged', () => {
    expect(getGpuSpecs(VARIANT_KEY)).toEqual(getGpuSpecs(SOURCE_KEY));
  });

  it('sorts with its source chip', () => {
    expect(getModelSortIndex(VARIANT_KEY)).toBe(getModelSortIndex(SOURCE_KEY));
  });

  it('labels the curve with the quoted rate', () => {
    const config = getHardwareConfig(VARIANT_KEY);
    expect(getDisplayLabel(config)).toBe('Jalapeño (Teacup, $1.27/hr)');
    expect(config.tcoVariantId).toBe(JALAPENO.id);
    // The source series keeps its own label, so the two are distinguishable.
    expect(getDisplayLabel(getHardwareConfig(SOURCE_KEY))).toBe('Jalapeño (Teacup)');
  });

  it('keeps the label locale-invariant — chip, framework and rate are all English', () => {
    // Every token is a name or a USD unit, which stay English on /zh, so the
    // legend must not switch to fullwidth punctuation for this row while its
    // sibling `Jalapeño (Teacup)` row keeps ASCII parentheses.
    const config = getHardwareConfig(VARIANT_KEY);
    expect(getDisplayLabel(config)).toBe('Jalapeño (Teacup, $1.27/hr)');
    expect(getDisplayLabel(config)).not.toMatch(/[（）、]/u);
  });
});
