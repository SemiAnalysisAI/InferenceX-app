import { describe, expect, it } from 'vitest';

import { planTcoVariantAdoption } from './tcoVariantAdoption';

const SOURCE = 'jalapeno_teacup';
const VARIANT = 'jalapeno_teacup_tco127';

describe('planTcoVariantAdoption', () => {
  it('adopts and selects a variant whose source curve is active', () => {
    expect(planTcoVariantAdoption(new Set([SOURCE, 'b200_trt']), [VARIANT])).toEqual({
      add: [VARIANT],
      adopt: [VARIANT],
    });
  });

  it('adopts without selecting when the source curve is hidden', () => {
    // The user deselected Jalapeño, so its re-priced curve must stay hidden —
    // but it is still marked adopted so it does not reappear on every render.
    expect(planTcoVariantAdoption(new Set(['b200_trt']), [VARIANT])).toEqual({
      add: [],
      adopt: [VARIANT],
    });
  });

  it('defers entirely while the selection is still empty', () => {
    // An empty set means the `i_active` restore / reconcile has not landed.
    // Adopting here would mark the variant handled against a selection that
    // does not exist yet and never retry — a shared tokens-per-$ link would
    // then open without the quoted-rate curve.
    expect(planTcoVariantAdoption(new Set(), [VARIANT])).toEqual({ add: [], adopt: [] });
  });

  it('retries successfully once the restored selection arrives', () => {
    expect(planTcoVariantAdoption(new Set(), [VARIANT]).adopt).toHaveLength(0);
    // Same candidate, now that the URL selection has been applied.
    expect(planTcoVariantAdoption(new Set([SOURCE]), [VARIANT])).toEqual({
      add: [VARIANT],
      adopt: [VARIANT],
    });
  });

  it('never re-adds a variant that is already selected', () => {
    expect(planTcoVariantAdoption(new Set([SOURCE, VARIANT]), [VARIANT])).toEqual({
      add: [],
      adopt: [VARIANT],
    });
  });

  it('ignores non-variant candidates', () => {
    expect(planTcoVariantAdoption(new Set([SOURCE]), ['b200_trt', SOURCE])).toEqual({
      add: [],
      adopt: [],
    });
  });

  it('returns nothing to do when there are no candidates', () => {
    expect(planTcoVariantAdoption(new Set([SOURCE]), [])).toEqual({ add: [], adopt: [] });
  });
});
