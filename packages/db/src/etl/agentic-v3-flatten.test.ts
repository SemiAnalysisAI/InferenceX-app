import { describe, expect, it } from 'vitest';

import {
  CACHE_VALIDITY_CONFLICT,
  CACHE_VALIDITY_UNKNOWN,
  cacheValidityColumns,
  flattenAgenticAggRow,
} from './agentic-v3-flatten';

const valid = { schema: 'atom-cache-validity/1', status: 'VALID_COMPLETE', pricing_eligible: true };
const notEligible = (code: number) => ({
  server_cache_pricing_eligible: 0,
  server_cache_validity_code: code,
});

describe('cacheValidityColumns', () => {
  it('adds no columns for legacy rows and non-ATOM adapters', () => {
    expect(cacheValidityColumns(undefined)).toBeNull();
    expect(cacheValidityColumns(null)).toBeNull();
  });

  it('encodes eligible and ineligible well-formed blocks', () => {
    expect(cacheValidityColumns(valid)).toEqual({
      server_cache_pricing_eligible: 1,
      server_cache_validity_code: 1,
    });
    expect(
      cacheValidityColumns({ ...valid, status: 'WINDOW_UNRESOLVED', pricing_eligible: false }),
    ).toEqual(notEligible(13));
  });

  it.each([
    ['a string', 'VALID_COMPLETE'],
    ['an array', [valid]],
    ['a block without a flag', { schema: valid.schema, status: valid.status }],
    ['a string boolean', { ...valid, pricing_eligible: 'true' }],
    ['an unknown status', { ...valid, status: 'MOSTLY_VALID' }],
    ['an unknown schema', { ...valid, schema: 'atom-cache-validity/0' }],
  ])('records %s as unknown and not eligible', (_, value) => {
    expect(cacheValidityColumns(value)).toEqual(notEligible(CACHE_VALIDITY_UNKNOWN));
  });

  it.each([
    ['eligible with an unresolved status', { ...valid, status: 'WINDOW_UNRESOLVED' }],
    ['not eligible with a complete status', { ...valid, pricing_eligible: false }],
  ])('records a flag %s as a conflict', (_, value) => {
    expect(cacheValidityColumns(value)).toEqual(notEligible(CACHE_VALIDITY_CONFLICT));
  });
});

describe('flattenAgenticAggRow cache validity', () => {
  it('flattens the validity block next to the cache rates', () => {
    const flat = flattenAgenticAggRow({
      request_metrics: {},
      server_metrics: { cache: { gpu_cache_hit_rate: 0.6 }, cache_validity: valid },
    });
    expect(flat.server_gpu_cache_hit_rate).toBe(0.6);
    expect(flat.server_cache_pricing_eligible).toBe(1);
    expect(flat.server_cache_validity_code).toBe(1);
  });

  it('leaves a row whose adapter emitted no validity without validity columns', () => {
    const flat = flattenAgenticAggRow({
      request_metrics: {},
      server_metrics: { cache_validity: null },
    });
    expect('server_cache_pricing_eligible' in flat).toBe(false);
  });
});
